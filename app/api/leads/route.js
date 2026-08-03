import { NextResponse } from "next/server";
import { readLeads, saveLeads } from "../../../lib/leads/storage.js";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = String(searchParams.get("q") || "").trim().toLowerCase();
    const council = String(searchParams.get("council") || "").trim().toUpperCase();
    const state = String(searchParams.get("state") || "").trim().toUpperCase();
    const leads = await readLeads();

    const filtered = leads.filter((lead) => {
      if (council && String(lead.council || "").toUpperCase() !== council) return false;
      if (state && String(lead.state || "").toUpperCase() !== state) return false;
      if (query) {
        const haystack = [lead.name, lead.businessName, lead.specialty, lead.city, lead.website, lead.phone]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });

    return NextResponse.json({ leads: filtered, total: filtered.length });
  } catch {
    return NextResponse.json({ error: "Não foi possível carregar os leads salvos." }, { status: 500 });
  }
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  const leads = Array.isArray(body?.leads) ? body.leads : [];
  if (!leads.length) {
    return NextResponse.json({ error: "Selecione ao menos um lead para adicionar ao CRM." }, { status: 400 });
  }

  if (leads.length > 5000) {
    return NextResponse.json({ error: "O limite por operação é de 5.000 leads." }, { status: 400 });
  }

  try {
    const source = String(body?.source || "manual-selection").trim() || "manual-selection";
    const saved = await saveLeads(leads, source);
    return NextResponse.json({
      success: true,
      added: saved.added,
      updated: saved.updated,
      total: saved.total
    });
  } catch {
    return NextResponse.json({ error: "Não foi possível adicionar os leads selecionados ao CRM." }, { status: 500 });
  }
}
