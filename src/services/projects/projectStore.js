import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";

const PROJECT_DIR = path.join(process.cwd(), "data", "projects");
const GENERATED_ROOT = path.resolve(process.cwd(), "generated-sites");
const DELETABLE_STATUSES = new Set(["draft", "building"]);

function clean(value, max = 3000) {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max);
}

function normalizeProject(input = {}) {
  return {
    id: clean(input.id, 120),
    leadId: clean(input.leadId, 160) || null,
    name: clean(input.name, 220) || "Projeto sem nome",
    segment: clean(input.segment, 140) || null,
    city: clean(input.city, 140) || null,
    mode: ["lead", "describe", "google"].includes(input.mode) ? input.mode : "lead",
    source: clean(input.source, 3000) || null,
    template: clean(input.template, 120) || "institutional",
    status: ["draft", "building", "ready", "sent", "approved", "published"].includes(input.status) ? input.status : "draft",
    folderPath: clean(input.folderPath, 500) || null,
    aiUsed: Boolean(input.aiUsed),
    warning: clean(input.warning, 1600) || null,
    imageCount: Number.isFinite(Number(input.imageCount)) ? Math.max(0, Number(input.imageCount)) : 0,
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: input.updatedAt || new Date().toISOString(),
  };
}

function fileForProject(id) {
  const safe = clean(id, 120);
  if (!/^[a-zA-Z0-9_-]+$/.test(safe)) throw new Error("Identificador de projeto inválido.");
  return path.join(PROJECT_DIR, `${safe}.json`);
}

async function readSiteProject(id) {
  try {
    const raw = await fs.readFile(fileForProject(id), "utf8");
    return normalizeProject(JSON.parse(raw));
  } catch (error) {
    if (error?.code === "ENOENT") throw new Error("Projeto não encontrado.");
    if (error instanceof SyntaxError) throw new Error("O arquivo deste projeto está corrompido.");
    throw error;
  }
}

function resolveGeneratedFolder(folderPath) {
  if (!folderPath) return null;
  const target = path.resolve(process.cwd(), folderPath);
  const insideGeneratedRoot = target.startsWith(`${GENERATED_ROOT}${path.sep}`);
  if (!insideGeneratedRoot || target === GENERATED_ROOT) {
    throw new Error("A pasta do projeto está fora do diretório permitido.");
  }
  return target;
}

export async function createSiteProject(input = {}) {
  const now = new Date().toISOString();
  const project = normalizeProject({
    ...input,
    id: `prj_${Date.now()}_${randomBytes(3).toString("hex")}`,
    createdAt: now,
    updatedAt: now,
  });

  await fs.mkdir(PROJECT_DIR, { recursive: true });
  await fs.writeFile(fileForProject(project.id), JSON.stringify(project, null, 2), "utf8");
  return project;
}

export async function deleteSiteProject(id) {
  const project = await readSiteProject(id);
  if (!DELETABLE_STATUSES.has(project.status)) {
    throw new Error("Somente projetos em rascunho ou em construção podem ser excluídos por esta ação.");
  }

  const generatedFolder = resolveGeneratedFolder(project.folderPath);
  if (generatedFolder) await fs.rm(generatedFolder, { recursive: true, force: true });
  await fs.unlink(fileForProject(project.id));
  return project;
}

export async function listSiteProjects() {
  try {
    const names = await fs.readdir(PROJECT_DIR);
    const projects = await Promise.all(names.filter(name => name.endsWith(".json")).map(async name => {
      const raw = await fs.readFile(path.join(PROJECT_DIR, name), "utf8");
      return normalizeProject(JSON.parse(raw));
    }));
    return projects.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}
