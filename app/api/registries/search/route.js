import { NextResponse } from "next/server";
import { validateSearchFilters } from "../../../../lib/security/validation.js";
import { getRegistryProvider } from "../../../../lib/registries/provider-factory.js";
import { saveLeads } from "../../../../lib/leads/storage.js";

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch (err) {
    return NextResponse.json(
      { error: "Requisição inválida." },
      { status: 400 }
    );
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

    // Persiste os leads encontrados internamente (sem bloquear a resposta em erro).
    let saved = { added: 0, total: 0 };
    try {
      saved = await saveLeads(results);
    } catch {
      // Falha ao persistir não deve interromper a busca.
    }

    return NextResponse.json({
      results,
      isMock: Boolean(provider.isMock),
      // Conselhos sem integração real ainda não possuem consulta automática.
      pendingIntegration: Boolean(provider.isMock) && results.length === 0,
      total: results.length,
      saved,
      filters
    });
  } catch (err) {
    // Mensagens específicas e seguras (sem stack trace).
    if (err && err.code === "MISSING_QUERY") {
      return NextResponse.json(
        {
          error:
            "Informe o nome ou o número do registro para consultar este conselho."
        },
        { status: 400 }
      );
    }
    if (err && err.code === "UNSUPPORTED_COUNCIL") {
      return NextResponse.json(
        {
          error:
            "Este conselho ainda não possui integração automática de consulta.",
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