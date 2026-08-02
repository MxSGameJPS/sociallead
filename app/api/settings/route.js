import { NextResponse } from "next/server";
import { validateSettings } from "../../../lib/security/validation.js";
import {
  readSettings,
  readPublicSettings,
  writeSettings
} from "../../../lib/settings/storage.js";

export async function GET() {
  try {
    const settings = await readPublicSettings();
    return NextResponse.json({ settings });
  } catch (err) {
    return NextResponse.json(
      { error: "Não foi possível carregar as configurações." },
      { status: 500 }
    );
  }
}

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

  const { valid, errors, settings } = validateSettings(body);
  if (!valid) {
    return NextResponse.json(
      { error: errors[0] || "Configurações inválidas." },
      { status: 400 }
    );
  }

  try {
    // Se o campo apiKey vier vazio, preservar a chave existente.
    if (!settings.apiKey) {
      const current = await readSettings();
      settings.apiKey = current.apiKey || "";
    }

    await writeSettings(settings);

    // Nunca retornar a chave ao navegador.
    const publicSettings = await readPublicSettings();
    return NextResponse.json({
      settings: publicSettings,
      message: "Configurações salvas com sucesso."
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Não foi possível salvar as configurações." },
      { status: 500 }
    );
  }
}