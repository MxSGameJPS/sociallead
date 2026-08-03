import { NextResponse } from "next/server";
import { CfmPublicProvider } from "../../../../lib/registries/cfm-public-provider.js";
import { saveLeads } from "../../../../lib/leads/storage.js";

const MAX_IMPORT_ITEMS = 5000;

export async function POST(request) {
  let payload;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "O arquivo não contém um JSON válido." },
      { status: 400 }
    );
  }

  const rawItems = extractItems(payload);

  if (!rawItems) {
    return NextResponse.json(
      {
        error:
          "Formato não reconhecido. Importe a resposta do CFM contendo o campo 'dados' ou uma lista de registros."
      },
      { status: 400 }
    );
  }

  if (rawItems.length === 0) {
    return NextResponse.json(
      { error: "O JSON não possui registros para importar." },
      { status: 400 }
    );
  }

  if (rawItems.length > MAX_IMPORT_ITEMS) {
    return NextResponse.json(
      { error: `O limite por importação é de ${MAX_IMPORT_ITEMS} registros.` },
      { status: 413 }
    );
  }

  const provider = new CfmPublicProvider();
  const results = rawItems
    .map((item) => provider.normalize(item))
    .filter((item) => item.name || item.registration);

  if (results.length === 0) {
    return NextResponse.json(
      { error: "Nenhum registro profissional válido foi identificado no JSON." },
      { status: 400 }
    );
  }

  const saved = await saveLeads(results, "cfm-json-import");

  return NextResponse.json({
    results,
    sourceUsed: "cfm-json-import",
    imported: results.length,
    ignored: rawItems.length - results.length,
    saved,
    total: results.length,
    returned: results.length
  });
}

function extractItems(payload) {
  if (Array.isArray(payload)) {
    if (payload.length === 1 && Array.isArray(payload[0]?.dados)) {
      return payload[0].dados;
    }
    return payload;
  }

  if (!payload || typeof payload !== "object") return null;
  if (Array.isArray(payload.dados)) return payload.dados;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.results)) return payload.results;

  return null;
}
