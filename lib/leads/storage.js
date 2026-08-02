import { promises as fs } from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const LEADS_FILE = path.join(DATA_DIR, "leads.json");

async function ensureFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(LEADS_FILE);
  } catch {
    await fs.writeFile(LEADS_FILE, "[]", "utf-8");
  }
}

export async function readLeads() {
  await ensureFile();
  try {
    const raw = await fs.readFile(LEADS_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Faz upsert dos profissionais coletados.
 * A identidade principal é conselho + UF + registro. Quando o registro não
 * existe, usa conselho + UF + nome como fallback.
 */
export async function saveLeads(newLeads, source = "unknown") {
  if (!Array.isArray(newLeads) || newLeads.length === 0) {
    const current = await readLeads();
    return { added: 0, updated: 0, total: current.length };
  }

  const existing = await readLeads();
  const index = new Map(existing.map((lead, position) => [leadKey(lead), position]));
  const now = new Date().toISOString();
  let added = 0;
  let updated = 0;

  for (const lead of newLeads) {
    const key = leadKey(lead);
    const position = index.get(key);

    if (position === undefined) {
      const stored = {
        ...lead,
        firstSeenAt: now,
        lastSeenAt: now,
        sources: [source]
      };
      existing.push(stored);
      index.set(key, existing.length - 1);
      added += 1;
      continue;
    }

    const current = existing[position];
    existing[position] = {
      ...current,
      ...removeEmptyValues(lead),
      firstSeenAt: current.firstSeenAt || current.savedAt || now,
      lastSeenAt: now,
      sources: Array.from(new Set([...(current.sources || []), source]))
    };
    updated += 1;
  }

  await fs.writeFile(LEADS_FILE, JSON.stringify(existing, null, 2), "utf-8");
  return { added, updated, total: existing.length };
}

function removeEmptyValues(value) {
  return Object.fromEntries(
    Object.entries(value || {}).filter(([, fieldValue]) => {
      if (fieldValue === null || fieldValue === undefined || fieldValue === "") return false;
      if (Array.isArray(fieldValue) && fieldValue.length === 0) return false;
      return true;
    })
  );
}

function leadKey(lead) {
  const council = normalize(lead.council);
  const state = normalize(lead.state);
  const registration = normalize(lead.registration);
  const name = normalize(lead.name);
  return registration
    ? `${council}|${state}|registration:${registration}`
    : `${council}|${state}|name:${name}`;
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}
