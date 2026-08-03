import {
  assertInfosimplesCredit,
  recordInfosimplesCharge
} from "../usage/storage.js";

const API_BASE = "https://api.infosimples.com/api/v2/consultas";
const REQUEST_TIMEOUT_MS = 60000;

// Cada serviço possui parâmetros, formato de resposta e preço próprios.
const SERVICE_MAP = {
  CRM: { service: "cfm/cadastro", estimatedPrice: 0.24 },
  CRO: { service: "cro/cadastro", estimatedPrice: 0.24 },
  CRP: { service: "cfp/cadastro", estimatedPrice: 0.24 },
  CRMV: { service: "cfmv/cadastro", estimatedPrice: 0.24 },
  CRC: { service: "cfc/cadastro", estimatedPrice: 0.2 },
  CRF: { service: "cff/cadastro", estimatedPrice: 0.2 }
};

export function supportsInfosimples(council) {
  return Boolean(SERVICE_MAP[(council || "").toUpperCase()]);
}

export async function validateWithInfosimples({ council, registration, state, name, city, specialty }) {
  const token = process.env.INFOSIMPLES_TOKEN;
  if (!token) {
    const error = new Error("INFOSIMPLES_TOKEN não configurado.");
    error.code = "MISSING_INFOSIMPLES_TOKEN";
    throw error;
  }

  const normalizedCouncil = (council || "").toUpperCase();
  const config = SERVICE_MAP[normalizedCouncil];
  if (!config) {
    const error = new Error("Conselho não suportado pela InfoSimples neste MVP.");
    error.code = "UNSUPPORTED_INFOSIMPLES_COUNCIL";
    throw error;
  }

  validateRequiredFilters(normalizedCouncil, { registration, state, name, city, specialty });
  await assertInfosimplesCredit(config.estimatedPrice);

  // O OpenAPI oficial da InfoSimples declara token e parâmetros do serviço
  // como query parameters. Enviar esses valores no corpo faz a API tratá-los
  // como inválidos ou ausentes.
  const params = new URLSearchParams({ token });
  appendServiceParameters(params, normalizedCouncil, {
    registration,
    state,
    name,
    city,
    specialty
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let payload;
  try {
    const response = await fetch(
      `${API_BASE}/${config.service}?${params.toString()}`,
      {
        method: "POST",
        signal: controller.signal,
        cache: "no-store",
        headers: { Accept: "application/json" }
      }
    );

    if (!response.ok) {
      throw new Error(`InfoSimples respondeu com status ${response.status}.`);
    }

    payload = await response.json();
  } finally {
    clearTimeout(timeout);
  }

  // A InfoSimples cobra por processamento da requisição, não por item retornado.
  // O próprio header informa se houve cobrança e o preço real da chamada.
  const billable = Boolean(payload?.header?.billable);
  const price = Number(payload?.header?.price || 0);
  await recordInfosimplesCharge(price, billable);

  if (payload?.code !== 200) {
    const error = new Error(payload?.code_message || "Falha na consulta InfoSimples.");
    error.code = "INFOSIMPLES_API_ERROR";
    error.details = Array.isArray(payload?.errors) ? payload.errors : [];
    error.billing = { billable, price };
    throw error;
  }

  const rawRecords = extractRecords(payload.data, normalizedCouncil);
  const records = rawRecords
    .map((item) => normalizeRecord(item, normalizedCouncil, state))
    .filter((item) => item.name || item.registration);

  return {
    records,
    dataCount: Number(payload.data_count || rawRecords.length || 0),
    billing: { billable, price },
    header: payload.header || {},
    service: config.service
  };
}

function validateRequiredFilters(council, filters) {
  const registration = String(filters.registration || "").trim();
  const state = String(filters.state || "").trim();
  const name = String(filters.name || "").trim();
  const city = String(filters.city || "").trim();
  const specialty = String(filters.specialty || "").trim();

  if (council === "CRO" && (!registration || !state)) {
    const error = new Error("Para consultar CRO, informe número da inscrição e UF.");
    error.code = "MISSING_QUERY";
    throw error;
  }

  if (council === "CRC" && !registration) {
    const error = new Error("Para consultar CRC, informe o número do registro.");
    error.code = "MISSING_QUERY";
    throw error;
  }

  if (council === "CRF" && (!state || !city || !specialty)) {
    const error = new Error("Para consultar CRF, informe UF, município e categoria.");
    error.code = "MISSING_QUERY";
    throw error;
  }

  if (!registration && !name && council !== "CRF") {
    const error = new Error("Informe registro ou nome para validar.");
    error.code = "MISSING_QUERY";
    throw error;
  }
}

function appendServiceParameters(params, council, filters) {
  const registration = String(filters.registration || "").trim();
  const state = String(filters.state || "").trim().toUpperCase();
  const name = String(filters.name || "").trim();
  const city = String(filters.city || "").trim();
  const specialty = String(filters.specialty || "").trim().toLowerCase();

  switch (council) {
    case "CRM":
      if (registration) params.set("inscricao", registration);
      if (name) params.set("nome", name);
      if (state) params.set("uf", state);
      break;
    case "CRO":
      params.set("inscricao", registration);
      params.set("uf", state);
      break;
    case "CRP":
      if (registration) params.set("registro", registration);
      if (name) params.set("nome", name);
      if (state) params.set("uf", state);
      break;
    case "CRMV":
      params.set("query", registration || name);
      if (state) params.set("uf", state);
      break;
    case "CRC":
      params.set("numero_registro", registration);
      params.set("pagina", "1");
      break;
    case "CRF":
      params.set("uf", state);
      params.set("municipio", city);
      params.set("categoria", specialty || "farmaceutico");
      if (registration) params.set("crf", registration);
      if (name) params.set("nome", name);
      break;
    default:
      break;
  }
}

function extractRecords(data, council) {
  const list = Array.isArray(data) ? data : [];
  const nestedKeys = {
    CRP: "resultados",
    CRMV: "resultados",
    CRF: "resultado"
  };
  const nestedKey = nestedKeys[council];
  if (!nestedKey) return list;

  return list.flatMap((item) => {
    const nested = item?.[nestedKey];
    if (Array.isArray(nested)) return nested;
    return item && typeof item === "object" ? [item] : [];
  });
}

function normalizeRecord(raw, council, fallbackState) {
  const registration = firstValue(raw, [
    "inscricao",
    "registro",
    "numero_registro",
    "crf",
    "crc"
  ]);
  const state = String(
    firstValue(raw, ["uf", "endereco_uf", "inscricao_uf"]) || fallbackState || ""
  ).toUpperCase();
  const specialties = raw?.especialidade_lista || raw?.especialidades || raw?.especialidade;

  return {
    id: `${council}-${state}-${registration || firstValue(raw, ["nome"])}`,
    name: firstValue(raw, ["nome", "nome_razao_social", "razao_social"]),
    registration,
    council,
    status: firstValue(raw, ["situacao", "situacao_detalhe"]),
    specialty: Array.isArray(specialties)
      ? specialties.map(stringifySpecialty).filter(Boolean).join(", ")
      : stringifySpecialty(specialties),
    email: firstValue(raw, ["email"]),
    whatsapp: "",
    phone: firstValue(raw, ["telefone", "telefones_comerciais"]),
    city: firstValue(raw, ["endereco_cidade", "municipio", "cidade_comercial"]),
    state,
    website: firstValue(raw, ["site"]),
    instagram: "",
    facebook: "",
    linkedin: "",
    sourceUrl: "https://infosimples.com/consultas/",
    checkedAt: new Date().toISOString(),
    validationProvider: "infosimples"
  };
}

function firstValue(object, keys) {
  for (const key of keys) {
    const value = object?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return "";
}

function stringifySpecialty(value) {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "object") {
    return String(value.nome || value.especialidade || value.descricao || "").trim();
  }
  return String(value).trim();
}
