import { ProfessionalRegistryProvider } from "./base-provider.js";
import {
  assertConsultaCrmAvailable,
  recordConsultaCrmCall
} from "../usage/storage.js";

/**
 * Provider real baseado na API ConsultaCRM.
 *
 * Endpoint:
 *   https://www.consultacrm.com.br/api/index.php?tipo=TIPO&uf=UF&q=BUSCA&chave=CHAVE&destino=xml
 *
 * A chave da API deve estar em `process.env.CONSULTA_CRM_API_KEY`.
 * Cada requisição válida consome uma consulta da cota mensal local configurada.
 */

const API_URL = "https://www.consultacrm.com.br/api/index.php";
const REQUEST_TIMEOUT_MS = 15000;

export const CONSULTA_CRM_TYPE_MAP = {
  CRM: "CRM",
  CRO: "CRO",
  CRP: "CRP",
  CREA: "CREA",
  CRC: null,
  COREN: null,
  CRF: null,
  CREFITO: null,
  CREF: null,
  CRMV: null,
  CAU: "CAU",
  CRN: "CRN"
};

export class ConsultaCrmProvider extends ProfessionalRegistryProvider {
  constructor(council) {
    super(council);
    this.isMock = false;
    this.tipo = CONSULTA_CRM_TYPE_MAP[(council || "").toUpperCase()] || null;
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

    const query = (filters.registration || filters.name || filters.specialty || "").trim();
    const state = (filters.state || "").trim().toUpperCase();

    // A API permite busca vazia, mas exigimos ao menos UF ou termo para evitar
    // desperdício da cota mensal com consultas muito amplas.
    if (!query && !state) {
      const error = new Error("Informe uma UF, nome, registro ou especialidade.");
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

    // Só contabiliza depois de uma resposta válida da própria API.
    await recordConsultaCrmCall();

    const items = parseXmlItems(xml);
    const limit = Math.min(Number(filters.limit) || 30, 30);
    const records = items
      .map((item) => this.normalize(item))
      .filter((record) => record.name || record.registration);

    return this.applyFilters(records, filters).slice(0, limit);
  }

  applyFilters(results, filters) {
    return results.filter((record) => {
      if (filters.state && record.state && record.state !== filters.state) return false;
      if (
        filters.city &&
        record.city &&
        !record.city.toLowerCase().includes(filters.city.toLowerCase())
      ) return false;
      if (
        filters.specialty &&
        record.specialty &&
        !record.specialty.toLowerCase().includes(filters.specialty.toLowerCase())
      ) return false;
      return true;
    });
  }

  normalize(rawItem) {
    return this.buildRecord({
      id: rawItem.uid || undefined,
      name: rawItem.nome || rawItem.name || "",
      registration: rawItem.numero || rawItem.registro || "",
      council: this.council,
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
