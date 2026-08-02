import { NextResponse } from "next/server";
import {
  supportsInfosimples,
  validateWithInfosimples
} from "../../../../lib/registries/infosimples-provider.js";
import { saveLeads } from "../../../../lib/leads/storage.js";

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  const council = String(body.council || "").toUpperCase();
  if (!supportsInfosimples(council)) {
    return NextResponse.json(
      { error: "Este conselho não possui validação InfoSimples configurada." },
      { status: 400 }
    );
  }

  try {
    const result = await validateWithInfosimples({
      council,
      registration: body.registration || "",
      state: body.state || "",
      name: body.name || ""
    });

    let saved = { added: 0, updated: 0, total: 0 };
    if (result.records.length > 0) {
      saved = await saveLeads(result.records, "infosimples");
    }

    return NextResponse.json({
      ...result,
      saved
    });
  } catch (error) {
    const status = [
      "MISSING_QUERY",
      "UNSUPPORTED_INFOSIMPLES_COUNCIL",
      "INFOSIMPLES_CREDIT_EXHAUSTED"
    ].includes(error?.code)
      ? 400
      : 502;

    return NextResponse.json(
      {
        error: error?.message || "Não foi possível validar o registro.",
        code: error?.code || "VALIDATION_ERROR",
        billing: error?.billing || undefined
      },
      { status }
    );
  }
}
