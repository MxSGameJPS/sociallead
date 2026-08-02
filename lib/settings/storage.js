import { promises as fs } from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const SETTINGS_PATH = path.join(DATA_DIR, "settings.json");

const DEFAULT_SETTINGS = {
  provider: "google",
  apiKey: "",
  model: "gemini-2.5-flash",
  baseUrl: "",
  temperature: 0.3
};

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

/**
 * Lê as configurações do arquivo local (apenas no servidor).
 * Retorna os valores padrão caso o arquivo não exista.
 */
export async function readSettings() {
  try {
    const content = await fs.readFile(SETTINGS_PATH, "utf-8");
    const parsed = JSON.parse(content);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch (err) {
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Salva as configurações no arquivo local (apenas no servidor).
 */
export async function writeSettings(settings) {
  await ensureDataDir();
  const merged = { ...DEFAULT_SETTINGS, ...settings };
  await fs.writeFile(SETTINGS_PATH, JSON.stringify(merged, null, 2), "utf-8");
  return merged;
}

/**
 * Retorna as configurações SEM a chave da API, seguras para
 * envio ao navegador. Indica apenas se há uma chave configurada.
 */
export async function readPublicSettings() {
  const settings = await readSettings();
  const { apiKey, ...rest } = settings;
  return {
    ...rest,
    hasApiKey: Boolean(apiKey)
  };
}