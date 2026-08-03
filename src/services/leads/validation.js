import { LANDING, STAGE_IDS } from "./stages.js";

const GRADES = new Set(["A", "B", "C", "D"]);
const LANDING_STATUSES = new Set(Object.keys(LANDING));
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "sim", "yes", "y"].includes(normalized)) return true;
    if (["false", "0", "não", "nao", "no", "n"].includes(normalized)) return false;
  }
  return fallback;
}

export function normalizeInteger(value, { field = "valor", nullable = false, min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if ((value === null || value === undefined || value === "") && nullable) return null;
  const parsed = Number.parseInt(String(value ?? 0).replace(/[^\d-]/g, ""), 10);
  if (!Number.isFinite(parsed)) {
    if (nullable) return null;
    throw new Error(`${field} inválido.`);
  }
  if (parsed < min || parsed > max) {
    throw new Error(`${field} deve estar entre ${min} e ${max}.`);
  }
  return parsed;
}

export function validateStage(stage) {
  if (!STAGE_IDS.includes(stage)) throw new Error(`Estágio inválido: ${stage}.`);
  return stage;
}

export function validateGrade(grade) {
  const normalized = String(grade || "").trim().toUpperCase();
  if (!GRADES.has(normalized)) throw new Error(`Nota inválida: ${grade}.`);
  return normalized;
}

export function validateLandingStatus(status) {
  if (!LANDING_STATUSES.has(status)) throw new Error(`Status de landing inválido: ${status}.`);
  return status;
}

export function normalizeFollowUpDate(value) {
  if (value === null || value === undefined || value === "") return null;
  const normalized = String(value).trim();
  if (!ISO_DATE.test(normalized)) throw new Error("A data do follow-up deve usar o formato AAAA-MM-DD.");

  const [year, month, day] = normalized.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  const isValid = parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;

  if (!isValid) throw new Error("Data de follow-up inválida.");
  return normalized;
}

export function validateLeadData(data, { isPatch = false } = {}) {
  const validated = { ...data };

  if (!isPatch || "name" in validated) {
    const name = String(validated.name || "").trim();
    if (!name) throw new Error("O nome do lead é obrigatório.");
    validated.name = name.slice(0, 240);
  }

  if ("stage" in validated) validated.stage = validateStage(validated.stage);
  if ("grade" in validated) validated.grade = validateGrade(validated.grade);
  if ("landingStatus" in validated) validated.landingStatus = validateLandingStatus(validated.landingStatus);
  if ("followUpAt" in validated) validated.followUpAt = normalizeFollowUpDate(validated.followUpAt);
  if ("weakSite" in validated) validated.weakSite = normalizeBoolean(validated.weakSite, true);
  if ("score" in validated) validated.score = normalizeInteger(validated.score, { field: "Score", min: 0, max: 100 });
  if ("proposalValue" in validated) validated.proposalValue = normalizeInteger(validated.proposalValue, { field: "Valor da proposta", min: 0 });
  if ("followers" in validated) validated.followers = normalizeInteger(validated.followers, { field: "Seguidores", nullable: true, min: 0 });

  if ("externalId" in validated && validated.externalId !== null) {
    const externalId = String(validated.externalId || "").trim();
    validated.externalId = externalId || null;
  }

  return validated;
}
