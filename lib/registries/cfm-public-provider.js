import { ProfessionalRegistryProvider } from "./base-provider.js";

const PORTAL_URL = "https://portal.cfm.org.br/busca-medicos";
const API_URL =
  "https://portal.cfm.org.br/api_rest.php/api/v2/medicos/buscar_medicos";
const REQUEST_TIMEOUT_MS = 30000;

/**
 * Provider da busca pública oficial do Conselho Federal de Medicina.
 *
 * Esta fonte é usada somente para CRM. Ela retorna resultados múltiplos,
 * total da consulta, posição do registro e informações de formação.
 *
 * O payload foi isolado em `buildPayload` para facilitar ajustes caso o portal
 * altere o contrato. Não utiliza chave paga nem o crédito da InfoSimples.
 */
export class CfmPublicProvider extends ProfessionalRegistryProvider {
  constructor() {
    super("CRM");
    this.isMock = false;
    this.source = "cfm-public";
  }

  async search(filters) {
    const state = String(filters.state || "").trim().toUpperCase();
    const page = Math.max(1, Number.parseInt(filters.page, 10) || 1);
    const limit = Math.min(Math.max(Number(filters.limit) || 20, 1), 100);

    if (!state && !filters.name && !filters.registration && !filters.specialty) {
      const error = new Error(
        "Informe ao menos UF, nome, CRM ou especialidade para consultar o CFM."
      );
      error.code = "MISSING_QUERY";
      throw error;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      // O portal trabalha com sessão PHP. Inicializamos a sessão antes do POST
      // e reutilizamos o cookie quando ele for fornecido.
      const portalResponse = await fetch(PORTAL_URL, {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "User-Agent": browserUserAgent()
        }
      });

      const cookie = extractSessionCookie(portalResponse.headers.get("set-cookie"));
      const payload = buildPayload(filters, page, limit);

      const headers = {
        Accept: "application/json",
        "Content-Type": "application/json; charset=UTF-8",
        Origin: "https://portal.cfm.org.br",
        Referer: PORTAL_URL,
        "User-Agent": browserUserAgent()
      };

      if (cookie) headers.Cookie = cookie;
      if (process.env.CFM_X_PINGARUNER) {
        headers["X-PINGARUNER"] = process.env.CFM_X_PINGARUNER;
      }

      const response = await fetch(API_URL, {
        method: "POST",
        cache: "no-store",
        signal: controller.signal,
        headers,
        body: JSON.stringify(payload)
      });

      const rawText = await response.text();
      let body;
      try {
        body = JSON.parse(rawText);
      } catch {
        const error = new Error("O portal do CFM retornou uma resposta inválida.");
        error.code = "CFM_INVALID_RESPONSE";
        error.details = rawText.slice(0, 500);
        throw error;
      }

      if (!response.ok || body?.status !== "sucesso") {
        const error = new Error(
          body?.mensagem || body?.message || `CFM respondeu com status ${response.status}.`
        );
        error.code = "CFM_API_ERROR";
        error.details = body;
        throw error;
      }

      const rawRecords = Array.isArray(body?.dados) ? body.dados : [];
      const results = rawRecords
        .map((item) => this.normalize(item))
        .filter((item) => item.name || item.registration)
        .slice(0, limit);

      const total = rawRecords.length
        ? Number.parseInt(rawRecords[0]?.COUNT, 10) || results.length
        : 0;

      return {
        results,
        meta: {
          source: this.source,
          total,
          page,
          limit,
          hasMore: page * limit < total
        }
      };
    } catch (error) {
      if (error?.name === "AbortError") {
        const timeoutError = new Error("A consulta ao portal do CFM excedeu o tempo limite.");
        timeoutError.code = "CFM_TIMEOUT";
        throw timeoutError;
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  normalize(raw) {
    const state = String(raw?.SG_UF || "").toUpperCase();
    const registration = String(raw?.NU_CRM || raw?.NU_CRM_NATURAL || "").trim();

    return this.buildRecord({
      id: `CRM-${state}-${registration}`,
      name: cleanText(raw?.NM_MEDICO),
      registration,
      council: "CRM",
      status: cleanText(raw?.SITUACAO),
      specialty: normalizeSpecialty(raw?.ESPECIALIDADE),
      city: "",
      state,
      sourceUrl: PORTAL_URL,
      checkedAt: new Date().toISOString(),
      socialName: cleanText(raw?.NM_SOCIAL),
      registrationDate: cleanText(raw?.DT_INSCRICAO),
      registrationType: cleanText(raw?.TIPO_INSCRICAO),
      registrationTypeCode: cleanText(raw?.IN_TIPO_INSCRICAO),
      statusCode: cleanText(raw?.COD_SITUACAO),
      firstRegistrationDate: cleanText(raw?.PRIM_INSCRICAO_UF),
      graduationInstitution: cleanText(raw?.NM_INSTITUICAO_GRADUACAO),
      graduationYear: cleanText(raw?.DT_GRADUACAO),
      foreignGraduationInstitution: cleanText(
        raw?.NM_FACULDADE_ESTRANGEIRA_GRADUACAO
      ),
      hasPostGraduation: String(raw?.HAS_POS_GRADUACAO || "0") === "1",
      resultPosition: Number.parseInt(raw?.RNUM, 10) || null,
      securityHash: cleanText(raw?.SECURITYHASH)
    });
  }
}

export function buildPayload(filters, page = 1, limit = 20) {
  return {
    uf: String(filters.state || "").trim().toUpperCase(),
    municipio: String(filters.city || "").trim(),
    nome: String(filters.name || "").trim(),
    crm: String(filters.registration || "").trim(),
    especialidade: String(filters.specialty || "").trim(),
    area_atuacao: String(filters.practiceArea || "").trim(),
    situacao: String(filters.status || "").trim(),
    tipo_inscricao: String(filters.registrationType || "").trim(),
    pagina: page,
    page,
    limite: limit,
    limit
  };
}

function normalizeSpecialty(value) {
  return cleanText(value)
    .replace(/^&+/, "")
    .replace(/&+/g, ", ")
    .replace(/\s+,/g, ",")
    .trim();
}

function cleanText(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function extractSessionCookie(setCookie) {
  if (!setCookie) return "";
  const match = setCookie.match(/PHPSESSID=[^;]+/i);
  return match ? match[0] : "";
}

function browserUserAgent() {
  return (
    process.env.CFM_USER_AGENT ||
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36"
  );
}
