import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DATA_ROOT = process.env.LEADFLOW_DATA_DIR
  ? path.resolve(process.env.LEADFLOW_DATA_DIR)
  : path.join(process.cwd(), "data");
const CONFIG_DIR = path.join(DATA_ROOT, "ai-config");
const KEY_FILE = path.join(CONFIG_DIR, ".local-key");
const PROVIDERS_FILE = path.join(CONFIG_DIR, "providers.enc.json");
const ALGORITHM = "aes-256-gcm";

async function ensureDirectory() {
  await mkdir(CONFIG_DIR, { recursive: true });
}

async function getLocalKey() {
  await ensureDirectory();
  try {
    const stored = (await readFile(KEY_FILE, "utf8")).trim();
    const key = Buffer.from(stored, "hex");
    if (key.length !== 32) throw new Error("invalid-key-length");
    return key;
  } catch (error) {
    if (error?.code && error.code !== "ENOENT") {
      throw new Error("Não foi possível ler a chave local das configurações de IA.");
    }
    const key = randomBytes(32);
    await writeFile(KEY_FILE, key.toString("hex"), { encoding: "utf8", mode: 0o600 });
    try { await chmod(KEY_FILE, 0o600); } catch {}
    return key;
  }
}

async function encryptJson(value) {
  const key = await getLocalKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    version: 1,
    algorithm: ALGORITHM,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: encrypted.toString("base64"),
  };
}

async function decryptJson(payload) {
  if (!payload || payload.version !== 1 || payload.algorithm !== ALGORITHM) {
    throw new Error("Formato das configurações de IA não reconhecido.");
  }
  const key = await getLocalKey();
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(payload.iv, "base64"));
  decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.data, "base64")),
    decipher.final(),
  ]);
  return JSON.parse(decrypted.toString("utf8"));
}

export async function loadProviders() {
  await ensureDirectory();
  try {
    const raw = await readFile(PROVIDERS_FILE, "utf8");
    const providers = await decryptJson(JSON.parse(raw));
    return Array.isArray(providers) ? providers : [];
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    if (error instanceof SyntaxError) throw new Error("O arquivo de configurações de IA está corrompido.");
    throw error;
  }
}

export async function saveProviders(providers) {
  await ensureDirectory();
  const encrypted = await encryptJson(providers);
  await writeFile(PROVIDERS_FILE, JSON.stringify(encrypted, null, 2), { encoding: "utf8", mode: 0o600 });
  try { await chmod(PROVIDERS_FILE, 0o600); } catch {}
}

export function newProviderId() {
  return randomUUID();
}

export function maskSecret(secret) {
  if (!secret) return "";
  const value = String(secret);
  if (value.length <= 8) return "••••••••";
  return value.slice(0, 3) + "••••••••" + value.slice(-4);
}

export function toPublicProvider(provider) {
  const { apiKey, ...safe } = provider;
  return {
    ...safe,
    hasApiKey: Boolean(apiKey),
    apiKeyMasked: maskSecret(apiKey),
  };
}
