import { NextResponse } from "next/server";
import { readUsage } from "../../../lib/usage/storage.js";

export async function GET() {
  try {
    const usage = await readUsage();
    return NextResponse.json({ usage });
  } catch {
    return NextResponse.json(
      { error: "Não foi possível carregar o consumo das APIs." },
      { status: 500 }
    );
  }
}
