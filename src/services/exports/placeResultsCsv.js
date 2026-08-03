const HEADERS = [
  "Nome da empresa",
  "Segmento",
  "Cidade",
  "Estado / região",
  "País",
  "Bairro pesquisado",
  "Telefone",
  "Possível WhatsApp",
  "Endereço",
  "Nota no Google",
  "Avaliações no Google",
  "Presença digital",
  "Site / presença",
  "Site próprio",
  "Score",
  "Nota comercial",
  "Problema / oportunidade",
  "Oferta recomendada",
  "Google Maps",
  "Place ID",
  "Fonte",
];

function safeSpreadsheetValue(value) {
  const text = String(value ?? "").replace(/\r?\n/g, " ").trim();
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function csvCell(value) {
  const text = safeSpreadsheetValue(value).replace(/"/g, '""');
  return `"${text}"`;
}

export function buildPlacesCsv(items = [], filters = {}) {
  if (!Array.isArray(items) || !items.length) throw new Error("Não existem leads para exportar.");

  const rows = items.map(item => [
    item.name,
    item.segment || filters.category,
    item.city || filters.city,
    item.location || filters.state,
    item.country || filters.country,
    filters.neighborhood,
    item.phone,
    item.possibleWhatsApp ? "Sim — não confirmado" : "Não",
    item.address,
    item.googleRating,
    item.googleReviews,
    item.presenceType,
    item.site,
    item.hasOwnSite ? "Sim" : "Não",
    item.score,
    item.grade,
    item.problem,
    item.offer,
    item.mapsLink,
    item.placeId || item.externalId,
    "Google Places",
  ]);

  return "\uFEFF" + [HEADERS, ...rows].map(row => row.map(csvCell).join(";")).join("\r\n");
}

function slug(value, fallback) {
  return String(value || fallback)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 55) || fallback;
}

export function placesCsvFilename(filters = {}, scope = "todos", date = new Date()) {
  const day = date.toISOString().slice(0, 10);
  const category = slug(filters.category, "leads");
  const city = slug(filters.city, "cidade");
  const suffix = scope === "selecionados" ? "selecionados" : "todos";
  return `leadflow_${category}_${city}_${suffix}_${day}.csv`;
}
