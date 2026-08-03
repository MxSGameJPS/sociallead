import { NextResponse } from "next/server";
import { readLeads } from "../../../lib/leads/storage.js";

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
