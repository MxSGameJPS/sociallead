import { NextResponse } from "next/server";
import { validateSearchFilters } from "../../../../lib/security/validation.js";
import { getRegistryProvider } from "../../../../lib/registries/provider-factory.js";
import { saveLeads } from "../../../../lib/leads/storage.js";

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
    const provider = getRegistryProvider(filters.council);

    if (provider.unsupported) {
      return NextResponse.json({
        error: "Este conselho ainda não possui uma fonte oficial integrada.",
        pendingIntegration: true,
        results: [],
        total: 0,
        returned: 0,
        filters
      });
    }

    const response = await provider.search(filters);
    const results = Array.isArray(response) ? response : response.results || [];
    const meta = Array.isArray(response) ? null : response.meta || null;
    const sourceUsed = response?.source || "cfm-public";

    let saved = { added: 0, updated: 0, total: 0 };
    try {
      saved = await saveLeads(results, sourceUsed);
    } catch {
      // A falha local de persistência não invalida a resposta da fonte externa.
    }

    return NextResponse.json({
      results,
      sourceUsed,
      service: "portal.cfm.org.br/api_rest.php/api/v2/medicos/buscar_medicos",
      meta,
      total: meta?.total ?? results.length,
      returned: results.length,
      saved,
      filters
    });
  } catch (error) {
    if (error?.code === "MISSING_QUERY") {
      return NextResponse.json(
        { error: error.message || "Informe dados suficientes para a consulta." },
        { status: 400 }
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

    return NextResponse.json(
      { error: "Não foi possível consultar este conselho agora." },
      { status: 502 }
    );
  }
}
