import { NextResponse } from "next/server";
import { readLeads } from "../../../lib/leads/storage.js";

/**
 * Retorna todos os leads salvos internamente pela aplicação.
 */
export async function GET() {
  try {
    const leads = await readLeads();
    return NextResponse.json({ leads, total: leads.length });
  } catch {
    return NextResponse.json(
      { error: "Não foi possível carregar os leads salvos." },
      { status: 500 }
    );
  }
}