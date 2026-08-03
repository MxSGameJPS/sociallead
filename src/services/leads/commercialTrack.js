export const COMMERCIAL_TRACKS = Object.freeze([
  { id: "auto", label: "Automático pela nota" },
  { id: "projects", label: "Projetos e prévias" },
  { id: "consulting", label: "Consultoria" },
  { id: "both", label: "Consultoria + projetos" },
  { id: "archived", label: "Arquivado" },
]);

export const COMMERCIAL_TRACK_IDS = Object.freeze(COMMERCIAL_TRACKS.map(item => item.id));

export function validateCommercialTrack(value) {
  const track = String(value || "auto").trim();
  if (!COMMERCIAL_TRACK_IDS.includes(track)) throw new Error("Tipo de oportunidade inválido.");
  return track;
}

export function resolveCommercialTrack(lead = {}, workspace = {}) {
  const stored = COMMERCIAL_TRACK_IDS.includes(workspace?.commercialTrack)
    ? workspace.commercialTrack
    : "auto";
  if (stored !== "auto") return stored;
  return ["A", "B"].includes(String(lead.grade || "").toUpperCase()) ? "projects" : "consulting";
}

export function trackIncludes(track, target) {
  const value = validateCommercialTrack(track);
  if (value === "archived" || value === "auto") return false;
  if (value === "both") return target === "projects" || target === "consulting";
  return value === target;
}
