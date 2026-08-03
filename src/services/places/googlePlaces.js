const GOOGLE_PLACES_ENDPOINT = "https://places.googleapis.com/v1/places:searchText";

const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.nationalPhoneNumber",
  "places.websiteUri",
  "places.rating",
  "places.userRatingCount",
  "places.googleMapsUri",
  "nextPageToken",
].join(",");

const COUNTRY_NAMES = {
  BR: "Brasil",
  PT: "Portugal",
  AO: "Angola",
  MZ: "Moçambique",
};

const WEBSITE_GROUPS = [
  { label: "Instagram", weak: true, hosts: ["instagram.com"] },
  { label: "Facebook", weak: true, hosts: ["facebook.com", "fb.com"] },
  { label: "Link na bio", weak: true, hosts: ["linktr.ee", "beacons.ai", "bio.site", "meulink.bio.br", "campsite.bio", "taplink.cc"] },
  { label: "Delivery / marketplace", weak: true, hosts: ["ifood.com.br", "deliverymuch.com.br", "aiqfome.com", "rappi.com.br", "saipos.com", "99app.com"] },
  { label: "Cardápio digital", weak: true, hosts: ["goomer.app", "mandarpedido.com", "leadsfood.app", "cardapio.menu", "menudino.com", "anota.ai"] },
  { label: "Página em plataforma", weak: true, hosts: ["gamma.site", "wixsite.com", "wordpress.com", "sites.google.com", "blogspot.com"] },
];

function clean(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function hostFromUrl(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function classifyWebsite(url) {
  const normalized = clean(url);
  if (!normalized) return { type: "Sem presença encontrada", weak: true, hasOwnSite: false };

  const host = hostFromUrl(normalized);
  const group = WEBSITE_GROUPS.find(item => item.hosts.some(domain => host === domain || host.endsWith(`.${domain}`)));
  if (group) return { type: group.label, weak: group.weak, hasOwnSite: false };
  return { type: "Site próprio", weak: false, hasOwnSite: true };
}

export function normalizePhoneDigits(phone, country = "BR") {
  let digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return null;
  if (country === "BR") {
    if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
    else if ((digits.length !== 12 && digits.length !== 13) || !digits.startsWith("55")) return null;
  }
  return digits;
}

export function isPossibleWhatsApp(phone, country = "BR") {
  const digits = normalizePhoneDigits(phone, country);
  if (!digits) return false;
  if (country !== "BR") return false;
  return /^55\d{2}9\d{8}$/.test(digits);
}

function scorePlace({ phone, address, rating, reviews, presence, country }) {
  let score = 10;
  if (!presence.hasOwnSite && presence.type === "Sem presença encontrada") score += 42;
  else if (presence.weak) score += 32;
  else score += 6;

  if (isPossibleWhatsApp(phone, country)) score += 22;
  else if (phone) score += 10;
  if (address) score += 5;
  if (Number(rating) >= 4.5) score += 9;
  else if (Number(rating) >= 4) score += 5;
  if (Number(reviews) >= 500) score += 8;
  else if (Number(reviews) >= 100) score += 4;
  return Math.min(100, score);
}

function gradeFromOpportunityScore(score) {
  if (score >= 80) return "A";
  if (score >= 60) return "B";
  if (score >= 40) return "C";
  return "D";
}

function opportunityText(presence) {
  if (presence.type === "Sem presença encontrada") return "Não possui presença digital encontrada — oportunidade para oferecer um site do zero.";
  if (presence.hasOwnSite) return "Possui site próprio. Avalie qualidade, velocidade, SEO e conversão antes da abordagem.";
  return `Usa apenas ${presence.type.toLowerCase()} — oportunidade para oferecer um site próprio.`;
}

export function normalizeGooglePlace(place, filters) {
  const phone = clean(place.nationalPhoneNumber);
  const site = clean(place.websiteUri);
  const address = clean(place.formattedAddress);
  const presence = classifyWebsite(site);
  const rating = Number.isFinite(Number(place.rating)) ? Number(place.rating) : null;
  const reviews = Number.isFinite(Number(place.userRatingCount)) ? Number(place.userRatingCount) : null;
  const score = scorePlace({ phone, address, rating, reviews, presence, country: filters.country });

  return {
    externalId: clean(place.id),
    placeId: clean(place.id),
    source: "Google Places",
    name: clean(place.displayName?.text) || "Estabelecimento sem nome",
    segment: clean(filters.category),
    city: clean(filters.city),
    location: clean(filters.state),
    address,
    phone,
    whatsapp: null,
    site,
    instagram: presence.type === "Instagram" ? site : null,
    weakSite: presence.weak,
    googleRating: rating === null ? null : String(rating),
    googleReviews: reviews === null ? null : String(reviews),
    mapsLink: clean(place.googleMapsUri),
    score,
    grade: gradeFromOpportunityScore(score),
    stage: "novo",
    problem: opportunityText(presence),
    reason: `Encontrado automaticamente no Google Places. Presença: ${presence.type}.`,
    offer: presence.hasOwnSite ? "Auditoria e reformulação de site" : "Site profissional próprio",
    presenceType: presence.type,
    hasOwnSite: presence.hasOwnSite,
    possibleWhatsApp: isPossibleWhatsApp(phone, filters.country),
  };
}

function validateFilters(input = {}) {
  const country = String(input.country || "BR").trim().toUpperCase();
  const state = String(input.state || "").trim().toUpperCase();
  const city = String(input.city || "").trim();
  const neighborhood = String(input.neighborhood || "").trim();
  const category = String(input.category || "").trim();
  const count = Number.parseInt(input.count, 10) || 20;

  if (!COUNTRY_NAMES[country]) throw new Error("País não suportado nesta versão.");
  if (!state) throw new Error("Selecione ou informe o estado/região.");
  if (!city) throw new Error("Informe a cidade.");
  if (!category) throw new Error("Selecione o nicho.");
  if (![20, 40, 60].includes(count)) throw new Error("A quantidade deve ser 20, 40 ou 60.");

  return { country, state, city: city.slice(0, 120), neighborhood: neighborhood.slice(0, 120), category: category.slice(0, 120), count };
}

function buildTextQuery(filters) {
  const neighborhood = filters.neighborhood ? ` no bairro ${filters.neighborhood}` : "";
  return `${filters.category}${neighborhood} em ${filters.city}, ${filters.state}, ${COUNTRY_NAMES[filters.country]}`;
}

async function readGoogleError(response) {
  try {
    const payload = await response.json();
    return payload?.error?.message || `Google Places respondeu com HTTP ${response.status}.`;
  } catch {
    return `Google Places respondeu com HTTP ${response.status}.`;
  }
}

export async function searchGooglePlaces(input, { fetchImpl = fetch } = {}) {
  const filters = validateFilters(input);
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_PLACES_API_KEY não foi encontrada no .env.local. Reinicie o servidor após adicionar a variável.");

  const textQuery = buildTextQuery(filters);
  const collected = [];
  const seen = new Set();
  let pageToken = null;

  for (let page = 0; page < 3 && collected.length < filters.count; page++) {
    const body = {
      textQuery,
      pageSize: Math.min(20, filters.count - collected.length),
      languageCode: "pt-BR",
      regionCode: filters.country,
      ...(pageToken ? { pageToken } : {}),
    };

    const response = await fetchImpl(GOOGLE_PLACES_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    if (!response.ok) throw new Error(await readGoogleError(response));
    const payload = await response.json();

    for (const place of payload.places || []) {
      if (!place?.id || seen.has(place.id)) continue;
      seen.add(place.id);
      collected.push(normalizeGooglePlace(place, filters));
      if (collected.length >= filters.count) break;
    }

    pageToken = payload.nextPageToken || null;
    if (!pageToken) break;
  }

  return {
    results: collected,
    count: collected.length,
    query: textQuery,
    filters,
  };
}
