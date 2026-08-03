import { ProfessionalRegistryProvider } from "./base-provider.js";
import {
  assertConsultaCrmAvailable,
  recordConsultaCrmCall
} from "../usage/storage.js";

const API_URL = "https://www.consultacrm.com.br/api/index.php";
const REQUEST_TIMEOUT_MS = 15000;

export const CONSULTA_CRM_TYPE_MAP = {
  CRM: "crm",
  CRO: "cro",
  CRP: "crp",
  CREA: "crea",
  CRC: null,
  COREN: null,
  CRF: null,
  CREFITO: null,
  CREF: null,
  CRMV: null,
  CAU: "cau",
  CRN: "crn"
};

export class ConsultaCrmProvider extends ProfessionalRegistryProvider {
  constructor(council) {
    super(council);
    this.isMock = false;
    this.requestedCouncil = (council || "").toUpperCase();
    this.tipo = CONSULTA_CRM_TYPE_MAP[this.requestedCouncil] || null;
  }

  async search(filters) {
    const apiKey = process.env.CONSULTA_CRM_API_KEY;
    if (!apiKey) {
      const error = new Error("CONSULTA_CRM_API_KEY não configurada.");
      error.code = "MISSING_CONSULTA_CRM_KEY";
      throw error;
    }

    if (!this.tipo) {
      const error = new Error("Conselho não suportado pela API ConsultaCRM.");
      error.code = "UNSUPPORTED_COUNCIL";
      throw error;
    }

    if (filters.city) {
      const error = new Error("A API ConsultaCRM não oferece filtro por cidade.");
      error.code = "UNSUPPORTED_CITY_FILTER";
      throw error;
    }

    const query = (filters.registration || filters.name || filters.specialty || "").trim();
    const state = (filters.state || "").trim().toUpperCase();

    // Para prospecção, o usuário normalmente não conhece nome nem registro.
    // Assim, permitimos a descoberta apenas por UF. Exigimos pelo menos UF ou
    // um termo livre para evitar uma consulta nacional totalmente aberta.
    if (!query && !state) {
      const error = new Error("Informe ao menos uma UF ou um termo de busca.");
      error.code = "MISSING_QUERY";
      throw error;
    }

    await assertConsultaCrmAvailable();

    const params = new URLSearchParams({
      tipo: this.tipo,
      uf: state,
      q: query,
      chave: apiKey,
      destino: "xml"
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let xml;
    try {
      const response = await fetch(`${API_URL}?${params.toString()}`, {
        method: "GET",
        signal: controller.signal,
        cache: "no-store",
        headers: { Accept: "application/xml, text/xml, */*" }
      });

      if (!response.ok) {
        throw new Error(`API respondeu com status ${response.status}`);
      }

      const buffer = await response.arrayBuffer();
      xml = new TextDecoder("iso-8859-1").decode(buffer);
    } finally {
      clearTimeout(timeout);
    }

    const statusMatch = xml.match(/<status>([\s\S]*?)<\/status>/i);
    if (statusMatch && statusMatch[1].trim().toLowerCase() === "false") {
      const messageMatch = xml.match(/<mensagem>([\s\S]*?)<\/mensagem>/i);
      const message = messageMatch ? stripCdata(messageMatch[1]).trim() : "";
      const error = new Error(message || "Consulta não autorizada pela API.");
      error.code = "API_ERROR";
      throw error;
    }

    await recordConsultaCrmCall();

    const items = parseXmlItems(xml);
    const limit = Math.min(Number(filters.limit) || 30, 30);

    const records = items
      .filter((item) => {
        const returnedCouncil = String(item.tipo || item.conselho || "").toUpperCase();
        // Nunca classifica um registro usando apenas o conselho escolhido na tela.
        // Se a fonte não declarar o tipo ou declarar outro conselho, descarta.
        return returnedCouncil === this.requestedCouncil;
      })
      .map((item) => this.normalize(item))
      .filter((record) => record.name || record.registration);

    return this.applyFilters(records, filters).slice(0, limit);
  }

  applyFilters(results, filters) {
    const requestedState = (filters.state || "").toUpperCase();
    const requestedSpecialty = (filters.specialty || "").toLowerCase();

    return results.filter((record) => {
      if (requestedState && record.state !== requestedState) return false;

      if (
        requestedSpecialty &&
        !record.specialty.toLowerCase().includes(requestedSpecialty)
      ) {
        return false;
      }

      return true;
    });
  }

  normalize(rawItem) {
    const returnedCouncil = String(rawItem.tipo || rawItem.conselho || "").toUpperCase();

    return this.buildRecord({
      id: rawItem.uid || undefined,
      name: rawItem.nome || rawItem.name || "",
      registration: rawItem.numero || rawItem.registro || "",
      council: returnedCouncil,
      status: rawItem.situacao || rawItem.status || "",
      specialty: rawItem.profissao || rawItem.especialidade || "",
      email: "",
      whatsapp: "",
      phone: "",
      city: rawItem.cidade || rawItem.municipio || "",
      state: (rawItem.uf || rawItem.estado || "").toUpperCase(),
      website: "",
      instagram: "",
      facebook: "",
      linkedin: "",
      sourceUrl: rawItem.link || "https://www.consultacrm.com.br/",
      checkedAt: new Date().toISOString()
    });
  }
}

export function parseXmlItems(xml) {
  if (!xml || typeof xml !== "string") return [];

  const blockRegex =
    /<(item|resultado|profissional|registro|medico|record)[^>]*>([\s\S]*?)<\/\1>/gi;
  const items = [];
  let match;

  while ((match = blockRegex.exec(xml)) !== null) {
    const fields = {};
    const fieldRegex = /<([a-zA-Z0-9_]+)>([\s\S]*?)<\/\1>/g;
    let fieldMatch;

    while ((fieldMatch = fieldRegex.exec(match[2])) !== null) {
      fields[fieldMatch[1].toLowerCase()] = decodeXmlEntities(
        stripCdata(fieldMatch[2])
      ).trim();
    }

    if (Object.keys(fields).length > 0) items.push(fields);
  }

  return items;
}

function stripCdata(value) {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}

function decodeXmlEntities(value) {
  const entities = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
  return value.replace(/&(#\d+|#x[0-9a-fA-F]+|[a-zA-Z]+);/g, (full, code) => {
    if (code[0] === "#") {
      const number = code[1]?.toLowerCase() === "x"
        ? parseInt(code.slice(2), 16)
        : parseInt(code.slice(1), 10);
      return Number.isNaN(number) ? full : String.fromCodePoint(number);
    }
    return Object.prototype.hasOwnProperty.call(entities, code) ? entities[code] : full;
  });
}
