import {
  assertInfosimplesCredit,
  recordInfosimplesCharge
} from "../usage/storage.js";

const API_BASE = "https://api.infosimples.com/api/v2/consultas";
const REQUEST_TIMEOUT_MS = 60000;

const SERVICE_MAP = {
  CRM: "cfm/cadastro",
  CRO: "cfo/cadastro",
  CRP: "cfp/cadastro",
  CRMV: "cfmv/cadastro",
  CRC: "cfc/cadastro",
  CRF: "cff/cadastro"
};

export function supportsInfosimples(council) {
  return Boolean(SERVICE_MAP[(council || "").toUpperCase()]);
}

export async function validateWithInfosimples({ council, registration, state, name }) {
  const token = process.env.INFOSIMPLES_TOKEN;
  if (!token) {
    const error = new Error("INFOSIMPLES_TOKEN não configurado.");
    error.code = "MISSING_INFOSIMPLES_TOKEN";
    throw error;
  }

  const normalizedCouncil = (council || "").toUpperCase();
  const service = SERVICE_MAP[normalizedCouncil];
  if (!service) {
    const error = new Error("Conselho não suportado pela InfoSimples neste MVP.");
    error.code = "UNSUPPORTED_INFOSIMPLES_COUNCIL";
    throw error;
  }

  if (!registration && !name) {
    const error = new Error("Informe registro ou nome para validar.");
    error.code = "MISSING_QUERY";
    throw error;
  }

  // Conselhos profissionais com preço final usual de R$ 0,24.
  await assertInfosimplesCredit(0.24);

  const body = new URLSearchParams({
    token,
    timeout: "60",
    ignore_site_receipt: "1"
  });

  if (registration) body.set("inscricao", String(registration).trim());
  if (name) body.set("nome", String(name).trim());
  if (state) body.set("uf", String(state).trim().toUpperCase());

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let payload;
  try {
    const response = await fetch(`${API_BASE}/${service}`, {
      method: "POST",
      signal: controller.signal,
      cache: "no-store",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });

    if (!response.ok) {
      throw new Error(`InfoSimples respondeu com status ${response.status}.`);
    }

    payload = await response.json();
  } finally {
    clearTimeout(timeout);
  }

  const billable = Boolean(payload?.header?.billable);
  const price = Number(payload?.header?.price || 0);
  await recordInfosimplesCharge(price, billable);

  if (payload?.code !== 200) {
    const error = new Error(payload?.code_message || "Falha na consulta InfoSimples.");
    error.code = "INFOSIMPLES_API_ERROR";
    error.details = Array.isArray(payload?.errors) ? payload.errors : [];
    throw error;
  }

  return {
    data: Array.isArray(payload.data) ? payload.data : [],
    dataCount: Number(payload.data_count || 0),
    billing: { billable, price },
    header: payload.header || {},
    service
  };
}
