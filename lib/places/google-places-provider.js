const PLACES_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";

const DEFAULT_FIELDS = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.primaryType",
  "places.types",
  "places.websiteUri",
  "places.nationalPhoneNumber",
  "places.businessStatus",
  "places.googleMapsUri",
  "places.rating",
  "places.userRatingCount"
].join(",");

export async function searchGooglePlaces({ query, city, state, limit = 20 }) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    const error = new Error("GOOGLE_PLACES_API_KEY não configurada.");
    error.code = "MISSING_GOOGLE_PLACES_KEY";
    throw error;
  }

  const textQuery = [query, city, state, "Brasil"].filter(Boolean).join(" em ");
  if (!String(query || "").trim() || !String(city || state || "").trim()) {
    const error = new Error("Informe a profissão e ao menos cidade ou estado.");
    error.code = "MISSING_QUERY";
    throw error;
  }

  const response = await fetch(PLACES_SEARCH_URL, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": process.env.GOOGLE_PLACES_FIELDS || DEFAULT_FIELDS
    },
    body: JSON.stringify({
      textQuery,
      languageCode: process.env.GOOGLE_PLACES_LANGUAGE || "pt-BR",
      regionCode: process.env.GOOGLE_PLACES_REGION || "BR",
      pageSize: Math.min(Math.max(Number(limit) || 20, 1), 20)
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      payload?.error?.message || `Google Places respondeu com status ${response.status}.`
    );
    error.code = "GOOGLE_PLACES_API_ERROR";
    error.details = payload;
    throw error;
  }

  const records = (payload.places || []).map((place) => normalizePlace(place, { query, city, state }));
  return { records, nextPageToken: payload.nextPageToken || "", textQuery };
}

function normalizePlace(place, context) {
  const placeId = String(place.id || "").trim();
  const name = place.displayName?.text || "";
  return {
    id: `PLACE-${placeId}`,
    name,
    businessName: name,
    registration: "",
    council: inferCouncil(context.query),
    status: place.businessStatus || "",
    specialty: String(context.query || "").trim(),
    email: "",
    whatsapp: "",
    phone: place.nationalPhoneNumber || "",
    city: context.city || "",
    state: String(context.state || "").toUpperCase(),
    website: place.websiteUri || "",
    instagram: "",
    facebook: "",
    linkedin: "",
    sourceUrl: place.googleMapsUri || "",
    checkedAt: new Date().toISOString(),
    placeId,
    formattedAddress: place.formattedAddress || "",
    latitude: place.location?.latitude ?? null,
    longitude: place.location?.longitude ?? null,
    primaryType: place.primaryType || "",
    placeTypes: Array.isArray(place.types) ? place.types : [],
    rating: Number(place.rating || 0),
    reviewCount: Number(place.userRatingCount || 0),
    googleMapsUrl: place.googleMapsUri || "",
    dossierStatus: "DISCOVERED",
    registryStatus: "PENDING",
    discoveredBy: "google-places",
    searchQuery: context.query || ""
  };
}

function inferCouncil(query) {
  const text = String(query || "").toLowerCase();
  if (text.includes("advog")) return "OAB";
  if (text.includes("engenhe") || text.includes("engenharia")) return "CREA";
  if (text.includes("médic") || text.includes("medic")) return "CRM";
  if (text.includes("dent") || text.includes("odont")) return "CRO";
  if (text.includes("psic")) return "CRP";
  if (text.includes("nutri")) return "CRN";
  if (text.includes("contador") || text.includes("contáb")) return "CRC";
  if (text.includes("farmac")) return "CRF";
  return "";
}
