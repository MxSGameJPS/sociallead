import { promises as fs } from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const LEADS_FILE = path.join(DATA_DIR, "leads.json");

async function ensureFile() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.access(LEADS_FILE);
  } catch {
    await fs.writeFile(LEADS_FILE, "[]", "utf-8");
  }
}

/**
 * Lê todos os leads salvos internamente.
 */
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
 * Persiste os leads de uma busca, evitando duplicatas.
 * A identidade de um lead é dada por council + registration + name + state.
 */
export async function saveLeads(newLeads) {
  if (!Array.isArray(newLeads) || newLeads.length === 0) {
    return { added: 0, total: 0 };
  }

  const existing = await readLeads();
  const index = new Map(existing.map((lead) => [leadKey(lead), lead]));

  let added = 0;
  for (const lead of newLeads) {
    const key = leadKey(lead);
    if (!index.has(key)) {
      const stored = {
        ...lead,
        savedAt: new Date().toISOString()
      };
      index.set(key, stored);
      existing.push(stored);
      added += 1;
    }
  }

  await fs.writeFile(LEADS_FILE, JSON.stringify(existing, null, 2), "utf-8");
  return { added, total: existing.length };
}

function leadKey(lead) {
  return [
    (lead.council || "").toLowerCase(),
    (lead.registration || "").toLowerCase(),
    (lead.name || "").toLowerCase(),
    (lead.state || "").toLowerCase()
  ].join("|");
}