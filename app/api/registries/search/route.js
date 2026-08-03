import { NextResponse } from "next/server";
import { validateSearchFilters } from "../../../../lib/security/validation.js";
import { getRegistryProvider } from "../../../../lib/registries/provider-factory.js";
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

  const provider = getRegistryProvider(filters.council);

  try {
    const results = await provider.search(filters);
    let saved = { added: 0, updated: 0, total: 0 };

    try {
      saved = await saveLeads(results, "consultacrm");
    } catch {
      // A falha local de persistência não invalida a resposta da fonte externa.
    }

    const usage = await readUsage();

    return NextResponse.json({
      results,
      isMock: Boolean(provider.isMock),
      pendingIntegration: Boolean(provider.isMock) && results.length === 0,
      total: results.length,
      saved,
      usage,
      filters
    });
  } catch (error) {
    if (error?.code === "MISSING_QUERY") {
      return NextResponse.json(
        { error: "Informe ao menos uma UF ou um termo de busca." },
        { status: 400 }
      );
    }

    if (error?.code === "UNSUPPORTED_CITY_FILTER") {
      return NextResponse.json(
        {
          error:
            "A fonte ConsultaCRM não permite filtrar por cidade. Use a UF e, opcionalmente, nome, registro ou especialidade."
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

    if (error?.code === "UNSUPPORTED_COUNCIL") {
      return NextResponse.json(
        {
          error: "Este conselho ainda não possui integração automática de consulta.",
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
