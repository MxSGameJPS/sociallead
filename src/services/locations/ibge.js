const IBGE_BASE_URL = "https://servicodados.ibge.gov.br/api/v1/localidades";

const STATE_IDS = {
  AC: 12, AL: 27, AP: 16, AM: 13, BA: 29, CE: 23, DF: 53, ES: 32, GO: 52,
  MA: 21, MT: 51, MS: 50, MG: 31, PA: 15, PB: 25, PR: 41, PE: 26, PI: 22,
  RJ: 33, RN: 24, RS: 43, RO: 11, RR: 14, SC: 42, SP: 35, SE: 28, TO: 17,
};

export function getIbgeStateId(state) {
  const normalized = String(state || "").trim().toUpperCase();
  const id = STATE_IDS[normalized];
  if (!id) throw new Error("Estado brasileiro inválido.");
  return id;
}

export function normalizeIbgeCities(payload) {
  if (!Array.isArray(payload)) return [];
  return [...new Set(payload
    .map(item => String(item?.nome || "").trim())
    .filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export async function listIbgeCities(state, { fetchImpl = fetch } = {}) {
  const stateId = getIbgeStateId(state);
  const response = await fetchImpl(`${IBGE_BASE_URL}/estados/${stateId}/municipios?orderBy=nome`, {
    headers: { Accept: "application/json" },
    next: { revalidate: 604800 },
  });

  if (!response.ok) throw new Error(`IBGE respondeu com HTTP ${response.status}.`);
  const payload = await response.json();
  const cities = normalizeIbgeCities(payload);
  if (!cities.length) throw new Error("Nenhuma cidade foi retornada pelo IBGE para este estado.");
  return cities;
}
