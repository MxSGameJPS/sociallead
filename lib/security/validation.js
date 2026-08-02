import { COUNCILS, UFS, MAX_RESULTS_OPTIONS } from "../constants.js";

const MAX_TEXT_LENGTH = 120;

function sanitizeText(value) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, MAX_TEXT_LENGTH);
}

export function validateSearchFilters(input) {
  const errors = [];
  const raw = input && typeof input === "object" ? input : {};

  const council = sanitizeText(raw.council);
  if (!council) {
    errors.push("O órgão profissional é obrigatório.");
  } else if (!COUNCILS.some((c) => c.toLowerCase() === council.toLowerCase())) {
    errors.push("Órgão profissional inválido.");
  }

  let state = sanitizeText(raw.state).toUpperCase();
  if (state && !UFS.includes(state)) {
    errors.push("Estado (UF) inválido.");
    state = "";
  }

  const city = sanitizeText(raw.city);
  const name = sanitizeText(raw.name);
  const registration = sanitizeText(raw.registration).replace(/[^\w.\-\/]/g, "");
  const specialty = sanitizeText(raw.specialty);

  let limit = Number.parseInt(raw.limit, 10);
  if (!MAX_RESULTS_OPTIONS.includes(limit)) {
    limit = MAX_RESULTS_OPTIONS[0];
  }

  const normalizedCouncil =
    COUNCILS.find((c) => c.toLowerCase() === council.toLowerCase()) || council;

  return {
    valid: errors.length === 0,
    errors,
    filters: {
      council: normalizedCouncil,
      state,
      city,
      name,
      registration,
      specialty,
      limit
    }
  };
}

export function validateSettings(input) {
  const errors = [];
  const raw = input && typeof input === "object" ? input : {};

  const allowedProviders = ["google", "openai", "anthropic", "openrouter", "other"];
  const provider = sanitizeText(raw.provider) || "google";
  if (!allowedProviders.includes(provider)) {
    errors.push("Provedor de IA inválido.");
  }

  const apiKey = typeof raw.apiKey === "string" ? raw.apiKey.trim().slice(0, 500) : "";
  const model = sanitizeText(raw.model);
  const baseUrl = typeof raw.baseUrl === "string" ? raw.baseUrl.trim().slice(0, 300) : "";

  if (baseUrl && !/^https?:\/\//i.test(baseUrl)) {
    errors.push("A URL base deve iniciar com http:// ou https://.");
  }

  let temperature = Number.parseFloat(raw.temperature);
  if (Number.isNaN(temperature)) temperature = 0.3;
  if (temperature < 0) temperature = 0;
  if (temperature > 1) temperature = 1;

  return {
    valid: errors.length === 0,
    errors,
    settings: {
      provider,
      apiKey,
      model,
      baseUrl,
      temperature
    }
  };
}