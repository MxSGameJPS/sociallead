import { NextResponse } from "next/server";
import { searchGooglePlaces } from "../../../../lib/places/google-places-provider.js";
import { saveLeads } from "../../../../lib/leads/storage.js";

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  try {
    const response = await searchGooglePlaces({
      query: String(body.query || "").trim(),
      city: String(body.city || "").trim(),
      state: String(body.state || "").trim().toUpperCase(),
      limit: Number(body.limit) || 20
    });

    const saved = await saveLeads(response.records, "google-places");

    return NextResponse.json({
      results: response.records,
      sourceUsed: "google-places",
      total: response.records.length,
      saved,
      nextPageToken: response.nextPageToken,
      textQuery: response.textQuery
    });
  } catch (error) {
    const status = error?.code === "MISSING_QUERY" ? 400 : error?.code === "MISSING_GOOGLE_PLACES_KEY" ? 503 : 502;
    return NextResponse.json(
      {
        error: error?.message || "Não foi possível consultar o Google Places.",
        code: error?.code || "GOOGLE_PLACES_ERROR",
        details: error?.details || null
      },
      { status }
    );
  }
}
