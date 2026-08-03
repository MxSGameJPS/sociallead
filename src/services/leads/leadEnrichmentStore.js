import fs from "node:fs/promises";
import path from "node:path";

const DIR = path.join(process.cwd(), "data", "lead-enrichment");
const VALIDATION_TAGS = new Set(["VALIDADO", "FALTA REGISTRO", "FALTA EMAIL", "NÃO VALIDADO"]);

function safeId(value) {
  const id = String(value || "").trim();
  if (!/^[a-zA-Z0-9_-]{4,160}$/.test(id)) throw new Error("Identificador do lead inválido.");
  return id;
}

function clean(value, max = 1000) {
  return String(value ?? "").replace(/\u0000/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}

export function validationTagFor(input = {}) {
  const hasEmail = Boolean(clean(input.email, 320));
  const hasRegistration = Boolean(clean(input.registration, 100));
  if (hasEmail && hasRegistration) return "VALIDADO";
  if (hasEmail) return "FALTA REGISTRO";
  if (hasRegistration) return "FALTA EMAIL";
  return "NÃO VALIDADO";
}

function normalize(input = {}) {
  const normalized = {
    name: clean(input.name, 180),
    profession: clean(input.profession, 180),
    email: clean(input.email, 320).toLowerCase(),
    whatsapp: clean(input.whatsapp, 30).replace(/\D/g, ""),
    phone: clean(input.phone, 30).replace(/\D/g, ""),
    city: clean(input.city, 120),
    state: clean(input.state, 2).toUpperCase(),
    council: clean(input.council, 30).toUpperCase(),
    registration: clean(input.registration, 100).toUpperCase(),
    confidence: Math.max(0, Math.min(100, Number.parseInt(input.confidence || 0, 10) || 0)),
    evidence: Array.isArray(input.evidence) ? input.evidence.map(item => clean(item, 400)).filter(Boolean).slice(0, 20) : [],
    sources: Array.isArray(input.sources) ? input.sources.map(item => clean(item, 1200)).filter(Boolean).slice(0, 30) : [],
    inaccessibleSources: Array.isArray(input.inaccessibleSources)
      ? input.inaccessibleSources.map(item => ({ url: clean(item?.url, 1200), error: clean(item?.error, 400) })).filter(item => item.url).slice(0, 20)
      : [],
    ai: input.ai && typeof input.ai === "object" ? {
      used: Boolean(input.ai.used),
      providerName: clean(input.ai.providerName, 180),
      model: clean(input.ai.model, 180),
      warning: clean(input.ai.warning, 600),
    } : {},
    updatedAt: new Date().toISOString(),
  };
  const requestedTag = clean(input.validationTag, 40).toUpperCase();
  normalized.validationTag = VALIDATION_TAGS.has(requestedTag) ? requestedTag : validationTagFor(normalized);
  return normalized;
}

function fileFor(leadId) {
  return path.join(DIR, `${safeId(leadId)}.json`);
}

export async function getLeadEnrichment(leadId) {
  try {
    const raw = await fs.readFile(fileFor(leadId), "utf8");
    return normalize(JSON.parse(raw));
  } catch (error) {
    if (error?.code === "ENOENT" || error instanceof SyntaxError) return normalize({});
    throw error;
  }
}

export async function saveLeadEnrichment(leadId, data = {}) {
  const id = safeId(leadId);
  const current = await getLeadEnrichment(id);
  const saved = normalize({ ...current, ...data, validationTag: validationTagFor({ ...current, ...data }) });
  await fs.mkdir(DIR, { recursive: true });
  const target = fileFor(id);
  const temporary = `${target}.${process.pid}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(saved, null, 2), "utf8");
  await fs.rename(temporary, target);
  return saved;
}

export async function listLeadEnrichments() {
  try {
    const files = await fs.readdir(DIR);
    const entries = await Promise.all(files.filter(name => name.endsWith(".json")).map(async name => {
      const leadId = name.slice(0, -5);
      return [leadId, await getLeadEnrichment(leadId)];
    }));
    return Object.fromEntries(entries);
  } catch (error) {
    if (error?.code === "ENOENT") return {};
    throw error;
  }
}
