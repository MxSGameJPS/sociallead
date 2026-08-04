import fs from "node:fs/promises";
import path from "node:path";
import { normalizeConsultingStage } from "../consulting/stages.js";
import { validateCommercialTrack } from "../leads/commercialTrack.js";

const WORKSPACE_DIR = path.join(process.cwd(), "data", "lead-workspaces");
const CONSULTING_STATUSES = new Set([
  "pending", "analyzing", "ready", "reviewed", "sent", "interested",
  "payment_pending", "paid", "delivered", "converted", "lost",
]);

const DEFAULT_WORKSPACE = Object.freeze({
  commercialTrack: "auto",
  callScript: "",
  whatsappMessage: "",
  emailSubject: "",
  emailMessage: "",
  previewUrl: "",
  appointment: { type: "Reunião", time: "09:00", notes: "", status: "pending" },
  sale: {
    paymentTerms: "", meetingNotes: "", outcome: "open", projectValue: 0,
    paymentMethod: "Pix", installments: 1, paidInstallments: 0, amountPaid: 0,
    firstDueDate: "", paymentStatus: "pending",
  },
  consulting: {
    stage: "novo", status: "pending", websiteUrl: "", instagramUrl: "", instagramNotes: "",
    auditSnapshot: "", overallScore: 0, executiveSummary: "", visualSummary: "", report: "",
    whatsappMessage: "", priceCents: 5000, paymentStatus: "pending", soldAt: "", deliveredAt: "",
    lastAnalyzedAt: "", lastContactAt: "", diagnosisProviderName: "", diagnosisModel: "",
    reportProviderName: "", reportModel: "", diagnosisAiUsed: false, reportAiUsed: false, warning: "",
  },
});

function safeLeadId(value) {
  const id = String(value || "").trim();
  if (!/^[a-zA-Z0-9_-]{4,160}$/.test(id)) throw new Error("Identificador do profissional inválido.");
  return id;
}
function cleanText(value, max = 6000) { return String(value ?? "").replace(/\u0000/g, "").slice(0, max); }
function cleanUrl(value) {
  const raw = cleanText(value, 1000).trim();
  if (!raw) return "";
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try { const parsed = new URL(candidate); return ["http:", "https:"].includes(parsed.protocol) ? parsed.toString() : ""; } catch { return ""; }
}
function cleanInteger(value, fallback = 0, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const number = Number.parseInt(String(value ?? "").replace(/[^\d-]/g, ""), 10);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}
function cleanDate(value) { const date = String(value || "").trim(); return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : ""; }
function cleanTimestamp(value) { const raw = String(value || "").trim(); if (!raw) return ""; const date = new Date(raw); return Number.isNaN(date.getTime()) ? "" : date.toISOString(); }
function cleanBoolean(value) { return value === true || value === "true" || value === 1 || value === "1"; }
function normalizeConsultingStatus(value, paymentStatus) {
  const raw = String(value || "").trim();
  if (raw === "sold") return "paid";
  if (CONSULTING_STATUSES.has(raw)) return raw;
  if (paymentStatus === "paid") return "paid";
  return DEFAULT_WORKSPACE.consulting.status;
}

function normalizeWorkspace(input = {}) {
  const appointment = input.appointment && typeof input.appointment === "object" ? input.appointment : {};
  const sale = input.sale && typeof input.sale === "object" ? input.sale : {};
  const consulting = input.consulting && typeof input.consulting === "object" ? input.consulting : {};
  const installments = cleanInteger(sale.installments, 1, 1, 120);
  const paidInstallments = cleanInteger(sale.paidInstallments, 0, 0, installments);
  const projectValue = cleanInteger(sale.projectValue, 0, 0);
  const amountPaid = cleanInteger(sale.amountPaid, 0, 0, projectValue || Number.MAX_SAFE_INTEGER);
  let commercialTrack = "auto";
  try { commercialTrack = validateCommercialTrack(input.commercialTrack || "auto"); } catch {}
  const status = normalizeConsultingStatus(consulting.status, consulting.paymentStatus);

  return {
    commercialTrack,
    callScript: cleanText(input.callScript, 12_000),
    whatsappMessage: cleanText(input.whatsappMessage, 8_000),
    emailSubject: cleanText(input.emailSubject, 300),
    emailMessage: cleanText(input.emailMessage, 20_000),
    previewUrl: cleanUrl(input.previewUrl),
    appointment: {
      type: cleanText(appointment.type || "Reunião", 80),
      time: /^\d{2}:\d{2}$/.test(String(appointment.time || "")) ? String(appointment.time) : "09:00",
      notes: cleanText(appointment.notes, 2000),
      status: ["pending", "completed", "cancelled"].includes(appointment.status) ? appointment.status : "pending",
    },
    sale: {
      paymentTerms: cleanText(sale.paymentTerms, 1000), meetingNotes: cleanText(sale.meetingNotes, 5000),
      outcome: ["open", "won", "lost"].includes(sale.outcome) ? sale.outcome : "open", projectValue,
      paymentMethod: cleanText(sale.paymentMethod || "Pix", 80), installments, paidInstallments, amountPaid,
      firstDueDate: cleanDate(sale.firstDueDate),
      paymentStatus: ["pending", "partial", "paid", "overdue"].includes(sale.paymentStatus) ? sale.paymentStatus : "pending",
    },
    consulting: {
      stage: normalizeConsultingStage(consulting.stage), status, websiteUrl: cleanUrl(consulting.websiteUrl),
      instagramUrl: cleanUrl(consulting.instagramUrl), instagramNotes: cleanText(consulting.instagramNotes, 10_000),
      auditSnapshot: cleanText(consulting.auditSnapshot, 80_000), overallScore: cleanInteger(consulting.overallScore, 0, 0, 100),
      executiveSummary: cleanText(consulting.executiveSummary, 5000), visualSummary: cleanText(consulting.visualSummary, 6000),
      report: cleanText(consulting.report, 50_000), whatsappMessage: cleanText(consulting.whatsappMessage, 5000),
      priceCents: cleanInteger(consulting.priceCents, 5000, 0, 10_000_000),
      paymentStatus: ["pending", "paid", "refunded"].includes(consulting.paymentStatus) ? consulting.paymentStatus : "pending",
      soldAt: cleanTimestamp(consulting.soldAt), deliveredAt: cleanTimestamp(consulting.deliveredAt),
      lastAnalyzedAt: cleanTimestamp(consulting.lastAnalyzedAt), lastContactAt: cleanTimestamp(consulting.lastContactAt),
      diagnosisProviderName: cleanText(consulting.diagnosisProviderName || consulting.providerName, 180),
      diagnosisModel: cleanText(consulting.diagnosisModel || consulting.model, 180),
      reportProviderName: cleanText(consulting.reportProviderName, 180), reportModel: cleanText(consulting.reportModel, 180),
      diagnosisAiUsed: cleanBoolean(consulting.diagnosisAiUsed), reportAiUsed: cleanBoolean(consulting.reportAiUsed),
      warning: cleanText(consulting.warning, 2500),
    },
    updatedAt: input.updatedAt || null,
  };
}

function fileForLead(leadId) { return path.join(WORKSPACE_DIR, `${safeLeadId(leadId)}.json`); }
export async function getLeadWorkspace(leadId) {
  try { return normalizeWorkspace(JSON.parse(await fs.readFile(fileForLead(leadId), "utf8"))); }
  catch (error) {
    if (error?.code === "ENOENT" || error instanceof SyntaxError) return normalizeWorkspace(DEFAULT_WORKSPACE);
    throw error;
  }
}
export async function saveLeadWorkspace(leadId, patch = {}) {
  const id = safeLeadId(leadId);
  const current = await getLeadWorkspace(id);
  const merged = normalizeWorkspace({
    ...current, ...patch,
    appointment: { ...current.appointment, ...(patch.appointment || {}) },
    sale: { ...current.sale, ...(patch.sale || {}) },
    consulting: { ...current.consulting, ...(patch.consulting || {}) },
    updatedAt: new Date().toISOString(),
  });
  await fs.mkdir(WORKSPACE_DIR, { recursive: true });
  const target = fileForLead(id); const temporary = `${target}.${process.pid}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(merged, null, 2), "utf8"); await fs.rename(temporary, target);
  return merged;
}
export async function listLeadWorkspaces() {
  try {
    const names = await fs.readdir(WORKSPACE_DIR);
    return Promise.all(names.filter(name => name.endsWith(".json")).map(async name => ({ leadId: name.slice(0, -5), workspace: await getLeadWorkspace(name.slice(0, -5)) })));
  } catch (error) { if (error?.code === "ENOENT") return []; throw error; }
}
