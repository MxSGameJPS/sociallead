import { ProfessionalRegistryProvider } from "./base-provider.js";

/**
 * Provider real baseado na API pública do ConsultaCRM.
 *
 * Endpoint:
 *   https://www.consultacrm.com.br/api/index.php?tipo=TIPO&q=BUSCA&chave=CHAVE&destino=xml
 *
 * A chave da API deve estar em `process.env.CONSULTA_CRM_API_KEY`.
 *
 * Tipos suportados pela API (parâmetro `tipo`):
 *   CRM, CRO, CRP, CREA, CAU, CRN
 * (OAB é intencionalmente excluído deste projeto.)
 */

const API_URL = "https://www.consultacrm.com.br/api/index.php";
const REQUEST_TIMEOUT_MS = 15000;

// Mapeia o conselho interno para o parâmetro `tipo` aceito pela API.
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
      throw new Error("CONSULTA_CRM_API_KEY não configurada.");
    }
    if (!this.tipo) {
      // Conselho não suportado por esta API.
      const err = new Error("Conselho não suportado pela API ConsultaCRM.");
      err.code = "UNSUPPORTED_COUNCIL";
      throw err;
    }

    // A API aceita busca por nome ou por número do registro.
    const query = (filters.registration || filters.name || "").trim();
    if (!query) {
      const err = new Error("Informe nome ou número do registro para buscar.");
      err.code = "MISSING_QUERY";
      throw err;
    }

    const params = new URLSearchParams({
      tipo: this.tipo,
      q: query,
      chave: apiKey,
      destino: "xml"
    });

    const url = `${API_URL}?${params.toString()}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let xml;
    try {
      const res = await fetch(url, {
        method: "GET",
        signal: controller.signal,
        headers: { Accept: "application/xml, text/xml" }
      });
      if (!res.ok) {
        throw new Error(`API respondeu com status ${res.status}`);
      }
      // A API responde em ISO-8859-1 (latin1); decodifica corretamente
      // para preservar acentuação (ex.: "CLÍNICA MÉDICA").
      const buffer = await res.arrayBuffer();
      xml = new TextDecoder("iso-8859-1").decode(buffer);
    } finally {
      clearTimeout(timeout);
    }

    // Verifica status/mensagem de erro retornados pela própria API.
    const statusMatch = xml.match(/<status>([\s\S]*?)<\/status>/i);
    if (statusMatch && statusMatch[1].trim().toLowerCase() === "false") {
      const msgMatch = xml.match(/<mensagem>([\s\S]*?)<\/mensagem>/i);
      const msg = msgMatch ? stripCdata(msgMatch[1]).trim() : "";
      const err = new Error(msg || "Consulta não autorizada pela API.");
      err.code = "API_ERROR";
      throw err;
    }

    const items = parseXmlItems(xml);
    const limit = filters.limit || 10;

    const records = items
      .map((item) => this.normalize(item))
      .filter((r) => r.name || r.registration);

    return this.applyFilters(records, filters).slice(0, limit);
  }

  applyFilters(results, filters) {
    return results.filter((r) => {
      if (filters.state && r.state && r.state !== filters.state) {
        return false;
      }
      if (
        filters.city &&
        r.city &&
        !r.city.toLowerCase().includes(filters.city.toLowerCase())
      ) {
        return false;
      }
      if (
        filters.specialty &&
        r.specialty &&
        !r.specialty.toLowerCase().includes(filters.specialty.toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }

  normalize(rawItem) {
    // Mapeamento conforme a estrutura real da API ConsultaCRM.
    const name = rawItem.nome || rawItem.name || "";
    const registration = rawItem.numero || rawItem.registro || "";
    const status = rawItem.situacao || rawItem.status || "";
    // Na API, a especialidade vem no campo "profissao".
    const specialty = rawItem.profissao || rawItem.especialidade || "";
    const state = (rawItem.uf || rawItem.estado || "").toUpperCase();
    const city = rawItem.cidade || rawItem.municipio || "";
    const sourceUrl = rawItem.link || "https://www.consultacrm.com.br/";

    return this.buildRecord({
      id: rawItem.uid || undefined,
      name,
      registration,
      council: this.council,
      status,
      specialty,
      email: "",
      whatsapp: "",
      phone: "",
      city,
      state,
      website: "",
      instagram: "",
      facebook: "",
      linkedin: "",
      sourceUrl,
      checkedAt: new Date().toISOString()
    });
  }
}

/**
 * Parser XML minimalista para extrair os itens de profissionais.
 * Evita dependências externas. Procura blocos repetidos e extrai
 * pares tag/valor simples.
 */
export function parseXmlItems(xml) {
  if (!xml || typeof xml !== "string") return [];

  // Tenta localizar blocos que representem um registro.
  // A API usa elementos repetidos (ex.: <item>, <resultado>, <profissional>).
  const blockRegex =
    /<(item|resultado|profissional|registro|medico|record)[^>]*>([\s\S]*?)<\/\1>/gi;

  const items = [];
  let match;
  while ((match = blockRegex.exec(xml)) !== null) {
    const inner = match[2];
    const fields = {};
    const fieldRegex = /<([a-zA-Z0-9_]+)>([\s\S]*?)<\/\1>/g;
    let fieldMatch;
    while ((fieldMatch = fieldRegex.exec(inner)) !== null) {
      const key = fieldMatch[1].toLowerCase();
      const value = decodeXmlEntities(stripCdata(fieldMatch[2])).trim();
      fields[key] = value;
    }
    if (Object.keys(fields).length > 0) {
      items.push(fields);
    }
  }

  return items;
}

function stripCdata(value) {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}

function decodeXmlEntities(value) {
  const entities = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'"
  };
  return value.replace(/&(#\d+|#x[0-9a-fA-F]+|[a-zA-Z]+);/g, (full, code) => {
    if (code[0] === "#") {
      const num =
        code[1] === "x" || code[1] === "X"
          ? parseInt(code.slice(2), 16)
          : parseInt(code.slice(1), 10);
      return Number.isNaN(num) ? full : String.fromCodePoint(num);
    }
    return Object.prototype.hasOwnProperty.call(entities, code)
      ? entities[code]
      : full;
  });
}
