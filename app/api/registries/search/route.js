import { NextResponse } from "next/server";
import { validateSearchFilters } from "../../../../lib/security/validation.js";
import { getRegistryProvider } from "../../../../lib/registries/provider-factory.js";
import {
  supportsInfosimples,
  validateWithInfosimples
} from "../../../../lib/registries/infosimples-provider.js";
import { saveLeads } from "../../../../lib/leads/storage.js";
import { readUsage } from "../../../../lib/usage/storage.js";

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  const { valid, errors, filters } = validateSearchFilters(body);
  if (!valid) {
    return NextResponse.json(
      { error: errors[0] || "Filtros inválidos." },
      { status: 400 }
    );
  }

  try {
    const council = String(filters.council || "").toUpperCase();
    const useOfficialCfm = council === "CRM";
    const useInfosimples = !useOfficialCfm && shouldUseInfosimples(filters);

    let results = [];
    let billing = null;
    let sourceUsed = "consultacrm";
    let service = null;
    let meta = null;

    if (useOfficialCfm) {
      const provider = getRegistryProvider("CRM");
      const response = await provider.search(filters);
      results = Array.isArray(response) ? response : response.results || [];
      meta = Array.isArray(response) ? null : response.meta || null;
      sourceUsed = "cfm-public";
      service = "portal.cfm.org.br/api/v2/medicos/buscar_medicos";
    } else if (useInfosimples) {
      const response = await validateWithInfosimples({
        council: filters.council,
        registration: filters.registration,
        state: filters.state,
        name: filters.name
      });

      results = response.records.slice(0, filters.limit);
      billing = response.billing;
      service = response.service;
      sourceUsed = "infosimples";
    } else {
      const provider = getRegistryProvider(filters.council);
      const response = await provider.search(filters);
      results = Array.isArray(response) ? response : response.results || [];
      meta = Array.isArray(response) ? null : response.meta || null;
    }

    let saved = { added: 0, updated: 0, total: 0 };
    try {
      saved = await saveLeads(results, sourceUsed);
    } catch {
      // A falha local de persistência não invalida a resposta da fonte externa.
    }

    const usage = await readUsage();

    return NextResponse.json({
      results,
      sourceUsed,
      service,
      billing,
      meta,
      total: meta?.total ?? results.length,
      returned: results.length,
      saved,
      usage,
      filters
    });
  } catch (error) {
    if (error?.code === "MISSING_QUERY") {
      return NextResponse.json(
        { error: error.message || "Informe dados suficientes para a consulta." },
        { status: 400 }
      );
    }

    if (error?.code === "UNSUPPORTED_CITY_FILTER") {
      return NextResponse.json(
        {
          error:
            "A fonte selecionada ainda não permite filtrar este conselho diretamente por cidade."
        },
        { status: 400 }
      );
    }

    if (error?.code === "CONSULTA_CRM_LIMIT_REACHED") {
      return NextResponse.json(
        {
          error: "A cota mensal de 100 consultas da API ConsultaCRM foi atingida.",
          code: error.code
        },
        { status: 429 }
      );
    }

    if (error?.code === "INFOSIMPLES_CREDIT_EXHAUSTED") {
      return NextResponse.json(
        {
          error: "O saldo local de crédito da InfoSimples foi atingido.",
          code: error.code
        },
        { status: 402 }
      );
    }

    if (error?.code === "INFOSIMPLES_API_ERROR") {
      return NextResponse.json(
        {
          error: error.message || "A InfoSimples não conseguiu processar a consulta.",
          code: error.code,
          billing: error.billing || null
        },
        { status: 502 }
      );
    }

    if (
      error?.code === "CFM_API_ERROR" ||
      error?.code === "CFM_INVALID_RESPONSE" ||
      error?.code === "CFM_TIMEOUT"
    ) {
      return NextResponse.json(
        {
          error: error.message || "O portal oficial do CFM não respondeu à consulta.",
          code: error.code,
          details: error.details || null
        },
        { status: 502 }
      );
    }

    if (
      error?.code === "UNSUPPORTED_COUNCIL" ||
      error?.code === "UNSUPPORTED_INFOSIMPLES_COUNCIL"
    ) {
      return NextResponse.json(
        {
          error: "Este conselho ainda não possui uma fonte automática compatível.",
          pendingIntegration: true
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      { error: "Não foi possível consultar este conselho agora." },
      { status: 502 }
    );
  }
}

function shouldUseInfosimples(filters) {
  if (!supportsInfosimples(filters.council)) return false;

  const council = String(filters.council || "").toUpperCase();
  const hasRegistration = Boolean(String(filters.registration || "").trim());
  const hasName = Boolean(String(filters.name || "").trim());
  const hasState = Boolean(String(filters.state || "").trim());

  if (council === "CRO") return hasRegistration && hasState;
  if (council === "CRC") return hasRegistration;

  return hasRegistration || hasName;
}
