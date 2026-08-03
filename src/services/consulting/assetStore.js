import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = path.join(process.cwd(), "data", "consulting-assets");
const MAX_FILE_BYTES = 5_000_000;
const MAX_UPLOADS = 8;
const ALLOWED_MIME = new Map([
  ["image/png", ".png"],
  ["image/jpeg", ".jpg"],
  ["image/webp", ".webp"],
]);

function safeLeadId(value) {
  const id = String(value || "").trim();
  if (!/^[a-zA-Z0-9_-]{4,160}$/.test(id)) throw new Error("Identificador do lead inválido.");
  return id;
}

function safeFilename(value) {
  const name = path.basename(String(value || ""));
  if (!/^[a-zA-Z0-9._-]{3,220}$/.test(name)) throw new Error("Nome de arquivo inválido.");
  return name;
}

function dirForLead(leadId) { return path.join(ROOT, safeLeadId(leadId)); }
function metadataFile(leadId) { return path.join(dirForLead(leadId), "assets.json"); }
function publicAsset(asset, leadId) {
  return { ...asset, url: `/api/consultoria/assets/${encodeURIComponent(safeLeadId(leadId))}/${encodeURIComponent(asset.filename)}` };
}

async function readMetadata(leadId) {
  try {
    const parsed = JSON.parse(await fs.readFile(metadataFile(leadId), "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error?.code === "ENOENT" || error instanceof SyntaxError) return [];
    throw error;
  }
}

async function writeMetadata(leadId, assets) {
  const directory = dirForLead(leadId);
  await fs.mkdir(directory, { recursive: true });
  const target = metadataFile(leadId);
  const temporary = `${target}.${process.pid}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(assets, null, 2), "utf8");
  await fs.rename(temporary, target);
}

export async function listConsultingAssets(leadId) {
  const assets = await readMetadata(leadId);
  return assets.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0)).map(asset => publicAsset(asset, leadId));
}

async function saveBuffer(leadId, { buffer, mimeType, kind, label, replaceKind = false }) {
  const id = safeLeadId(leadId);
  const extension = ALLOWED_MIME.get(mimeType);
  if (!extension) throw new Error("Formato de imagem não permitido. Use PNG, JPG ou WebP.");
  if (!buffer?.length || buffer.length > MAX_FILE_BYTES) throw new Error("Cada imagem deve possuir no máximo 5 MB.");
  let assets = await readMetadata(id);
  if (replaceKind) {
    const replaced = assets.filter(item => item.kind === kind);
    await Promise.all(replaced.map(item => fs.rm(path.join(dirForLead(id), item.filename), { force: true })));
    assets = assets.filter(item => item.kind !== kind);
  }
  const filename = `${kind}-${Date.now()}-${crypto.randomBytes(5).toString("hex")}${extension}`;
  const asset = { id: crypto.randomUUID(), filename, mimeType, size: buffer.length, kind: String(kind || "instagram"), label: String(label || "Imagem").slice(0, 180), createdAt: new Date().toISOString() };
  const directory = dirForLead(id);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, filename), buffer);
  assets.push(asset);
  await writeMetadata(id, assets);
  return publicAsset(asset, id);
}

export async function saveUploadedConsultingImages(leadId, files = []) {
  const incoming = Array.from(files || []).filter(file => file && typeof file.arrayBuffer === "function");
  if (!incoming.length) return listConsultingAssets(leadId);
  if (incoming.length > MAX_UPLOADS) throw new Error(`Envie no máximo ${MAX_UPLOADS} imagens por vez.`);
  for (const file of incoming) {
    const mimeType = String(file.type || "").toLowerCase();
    if (!ALLOWED_MIME.has(mimeType)) throw new Error(`O arquivo ${file.name || "selecionado"} não é PNG, JPG ou WebP.`);
    if (Number(file.size || 0) > MAX_FILE_BYTES) throw new Error(`O arquivo ${file.name || "selecionado"} excede 5 MB.`);
    await saveBuffer(leadId, { buffer: Buffer.from(await file.arrayBuffer()), mimeType, kind: "instagram", label: file.name || "Print do Instagram" });
  }
  return listConsultingAssets(leadId);
}

export async function saveGeneratedScreenshot(leadId, { buffer, kind, label }) {
  if (!["site-desktop", "site-mobile"].includes(kind)) throw new Error("Tipo de captura automática inválido.");
  return saveBuffer(leadId, { buffer, mimeType: "image/jpeg", kind, label, replaceKind: true });
}

export async function deleteConsultingAsset(leadId, assetId) {
  const id = safeLeadId(leadId);
  const assets = await readMetadata(id);
  const target = assets.find(item => item.id === String(assetId || ""));
  if (!target) return listConsultingAssets(id);
  await fs.rm(path.join(dirForLead(id), safeFilename(target.filename)), { force: true });
  await writeMetadata(id, assets.filter(item => item.id !== target.id));
  return listConsultingAssets(id);
}

export async function readConsultingAsset(leadId, filename) {
  const id = safeLeadId(leadId);
  const safe = safeFilename(filename);
  const assets = await readMetadata(id);
  const asset = assets.find(item => item.filename === safe);
  if (!asset) return null;
  const buffer = await fs.readFile(path.join(dirForLead(id), safe));
  return { buffer, mimeType: asset.mimeType, asset: publicAsset(asset, id) };
}

export async function readConsultingImagesForAI(leadId, { maxImages = 6, maxTotalBytes = 12_000_000 } = {}) {
  const id = safeLeadId(leadId);
  const assets = await readMetadata(id);
  const priority = { "site-desktop": 0, "site-mobile": 1, instagram: 2 };
  const ordered = [...assets].sort((a, b) => (priority[a.kind] ?? 9) - (priority[b.kind] ?? 9) || new Date(b.createdAt) - new Date(a.createdAt));
  const output = [];
  let total = 0;
  for (const asset of ordered) {
    if (output.length >= maxImages || total + Number(asset.size || 0) > maxTotalBytes) continue;
    try {
      const buffer = await fs.readFile(path.join(dirForLead(id), safeFilename(asset.filename)));
      total += buffer.length;
      output.push({ label: asset.label || asset.kind, kind: asset.kind, dataUrl: `data:${asset.mimeType};base64,${buffer.toString("base64")}` });
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  return output;
}
