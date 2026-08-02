import { NextResponse } from "next/server";
import { validateSettings } from "../../../../lib/security/validation.js";
import { readSettings } from "../../../../lib/settings/storage.js";
import { testAIConnection } from "../../../../lib/ai/client.js";

export async function POST(request) {
  let body = {};
  try {
    body = await request.json();
  } catch (err) {
    body = {};
  }

  try {
    // Configurações persistidas (fonte da chave da API).
    const stored = await readSettings();

    // Permite testar com valores informados no formulário sem persistir,
    // mas a chave só é usada no servidor e nunca retornada.
    const { settings } = validateSettings({
      provider: body.provider ?? stored.provider,
      apiKey: body.apiKey ? body.apiKey : stored.apiKey,
      model: body.model ?? stored.model,
      baseUrl: body.baseUrl ?? stored.baseUrl,
      temperature:
        body.temperature !== undefined ? body.temperature : stored.temperature
    });

    const result = await testAIConnection(settings);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: "Não foi possível conectar ao provedor." },
      { status: 500 }
    );
  }
}