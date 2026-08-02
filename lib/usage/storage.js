import { promises as fs } from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const USAGE_FILE = path.join(DATA_DIR, "api-usage.json");

const DEFAULT_USAGE = {
  consultaCrm: {
    monthlyLimit: 100,
    used: 0,
    month: currentMonth()
  },
  infosimples: {
    initialCredit: 100,
    spent: 0,
    remaining: 100
  }
};

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

async function ensureFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(USAGE_FILE);
  } catch {
    await fs.writeFile(USAGE_FILE, JSON.stringify(DEFAULT_USAGE, null, 2), "utf-8");
  }
}

export async function readUsage() {
  await ensureFile();
  try {
    const raw = await fs.readFile(USAGE_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    const month = currentMonth();

    if (!parsed.consultaCrm || parsed.consultaCrm.month !== month) {
      parsed.consultaCrm = {
        monthlyLimit: parsed.consultaCrm?.monthlyLimit || 100,
        used: 0,
        month
      };
      await writeUsage(parsed);
    }

    return parsed;
  } catch {
    return structuredClone(DEFAULT_USAGE);
  }
}

export async function writeUsage(usage) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(USAGE_FILE, JSON.stringify(usage, null, 2), "utf-8");
}

export async function assertConsultaCrmAvailable() {
  const usage = await readUsage();
  if (usage.consultaCrm.used >= usage.consultaCrm.monthlyLimit) {
    const error = new Error("Limite mensal da API ConsultaCRM atingido.");
    error.code = "CONSULTA_CRM_LIMIT_REACHED";
    throw error;
  }
  return usage;
}

export async function recordConsultaCrmCall() {
  const usage = await readUsage();
  usage.consultaCrm.used += 1;
  await writeUsage(usage);
  return usage.consultaCrm;
}

export async function assertInfosimplesCredit(estimatedPrice = 0.24) {
  const usage = await readUsage();
  if (usage.infosimples.remaining < estimatedPrice) {
    const error = new Error("Crédito da InfoSimples insuficiente.");
    error.code = "INFOSIMPLES_CREDIT_EXHAUSTED";
    throw error;
  }
  return usage;
}

export async function recordInfosimplesCharge(price = 0, billable = false) {
  const usage = await readUsage();
  if (billable && Number.isFinite(Number(price))) {
    const amount = Number(price);
    usage.infosimples.spent = Number((usage.infosimples.spent + amount).toFixed(5));
    usage.infosimples.remaining = Number(
      Math.max(0, usage.infosimples.initialCredit - usage.infosimples.spent).toFixed(5)
    );
    await writeUsage(usage);
  }
  return usage.infosimples;
}
