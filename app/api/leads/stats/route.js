import { NextResponse } from "next/server";
import { readLeads } from "../../../../lib/leads/storage.js";

export async function GET() {
  try {
    const leads = await readLeads();
    const today = new Date().toISOString().slice(0, 10);
    const councils = new Set();
    const states = new Set();
    let newToday = 0;
    let lastUpdatedAt = null;

    for (const lead of leads) {
      const council = String(lead?.council || "").trim().toUpperCase();
      const state = String(lead?.state || "").trim().toUpperCase();
      if (council) councils.add(council);
      if (state) states.add(state);

      const firstSeenAt = String(lead?.firstSeenAt || lead?.savedAt || "");
      if (firstSeenAt.slice(0, 10) === today) newToday += 1;

      const candidate = lead?.lastSeenAt || lead?.checkedAt || lead?.firstSeenAt || lead?.savedAt;
      if (candidate && (!lastUpdatedAt || new Date(candidate) > new Date(lastUpdatedAt))) {
        lastUpdatedAt = candidate;
      }
    }

    return NextResponse.json({
      total: leads.length,
      newToday,
      councils: councils.size,
      states: states.size,
      lastUpdatedAt
    });
  } catch {
    return NextResponse.json(
      { error: "Não foi possível carregar as estatísticas da base local." },
      { status: 500 }
    );
  }
}
