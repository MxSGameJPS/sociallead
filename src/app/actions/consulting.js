"use server";

import { revalidatePath } from "next/cache";
import * as repo from "../../repositories/leadRepository.js";
import { generateConsultingAudit } from "../../services/ai/consultingAuditService.js";
import { auditWebsite } from "../../services/consulting/siteAuditService.js";
import { enrichLeadContacts } from "../../services/consulting/contactEnrichmentService.js";
import { captureWebsiteScreenshots } from "../../services/consulting/screenshotService.js";
import { deleteConsultingAsset, listConsultingAssets, readConsultingImagesForAI, saveUploadedConsultingImages } from "../../services/consulting/assetStore.js";
import { validateConsultingStage } from "../../services/consulting/stages.js";
import { validateCommercialTrack } from "../../services/leads/commercialTrack.js";
import { getProfessionalProfile } from "../../services/profile/profileStore.js";
import { getLeadWorkspace, saveLeadWorkspace } from "../../services/workspaces/leadWorkspaceStore.js";

function refresh(leadId) {
  revalidatePath("/consultoria");
  revalidatePath(`/consultoria/${leadId}`);
  revalidatePath("/crm");
  revalidatePath(`/crm/${leadId}`);
  revalidatePath("/dashboard");
  revalidatePath("/cobrancas");
}

async function requireLead(leadId) {
  const id = String(leadId || "");
  const lead = await repo.getLead(id);
  if (!lead) throw new Error("Lead não encontrado.");
  return lead;
}

function clean(value, max = 500) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function buildLeadContactPatch(lead, enrichment) {
  const patch = {};
  const name = clean(enrichment?.name, 180);
  const email = clean(enrichment?.email, 320).toLowerCase();
  const whatsapp = clean(enrichment?.whatsapp, 30).replace(/\D/g, "");
  const phone = clean(enrichment?.phone, 30).replace(/\D/g, "");
  const city = clean(enrichment?.city, 120);
  const state = clean(enrichment?.state, 2).toUpperCase();

  if (name && (!lead.name || lead.name === "(sem nome)" || name.length > lead.name.length)) patch.name = name;
  if (email) patch.email = email;
  if (whatsapp) patch.whatsapp = whatsapp;
  if (phone && !lead.phone) patch.phone = phone;
  if (city) patch.city = city;
  if (state) patch.location = state;
  return patch;
}

export async function saveConsultingWorkspaceAction(leadId, patch = {}) {
  const lead = await requireLead(leadId);
  const saved = await saveLeadWorkspace(lead.id, { consulting: patch || {} });
  refresh(lead.id);
  return saved.consulting;
}

export async function enrichLeadDataAction(payload = {}) {
  const lead = await requireLead(payload.leadId);
  const workspace = await getLeadWorkspace(lead.id);
  const websiteUrl = clean(payload.websiteUrl || workspace.consulting.websiteUrl || lead.site || "", 1200);
  const instagramUrl = clean(payload.instagramUrl || workspace.consulting.instagramUrl || lead.instagram || "", 1200);
  const instagramNotes = clean(payload.instagramNotes || workspace.consulting.instagramNotes || "", 12000);

  if (!websiteUrl && !instagramNotes) {
    throw new Error("Informe o site ou cole informações públicas para a IA analisar.");
  }

  const enrichment = await enrichLeadContacts({
    lead,
    websiteUrl,
    instagramUrl,
    instagramNotes,
    providerId: payload.providerId || undefined,
  });

  const leadPatch = buildLeadContactPatch(lead, enrichment);
  if (Object.keys(leadPatch).length) await repo.updateLead(lead.id, leadPatch);

  const savedWorkspace = await saveLeadWorkspace(lead.id, {
    consulting: {
      websiteUrl,
      instagramUrl,
      instagramNotes,
      contactEnrichment: enrichment,
      council: enrichment.council || "",
      registration: enrichment.registration || "",
      lastAnalyzedAt: new Date().toISOString(),
      status: "ready",
    },
  });

  const updatedLead = await repo.getLead(lead.id);
  refresh(lead.id);

  return {
    lead: updatedLead || { ...lead, ...leadPatch },
    enrichment: {
      ...enrichment,
      profession: clean(updatedLead?.segment || lead.segment || "", 180),
    },
    consulting: savedWorkspace.consulting,
  };
}

export async function setCommercialTrackAction(leadId, track) {
  const lead = await requireLead(leadId);
  const value = validateCommercialTrack(track);
  const saved = await saveLeadWorkspace(lead.id, { commercialTrack: value });
  refresh(lead.id);
  return { commercialTrack: saved.commercialTrack };
}

export async function moveConsultingStageAction(leadId, stage, status = "") {
  const patch = { stage: validateConsultingStage(stage) };
  if (status) patch.status = String(status);
  return saveConsultingWorkspaceAction(leadId, patch);
}

export async function uploadConsultingImagesAction(formData) {
  const leadId = String(formData?.get?.("leadId") || "");
  const lead = await requireLead(leadId);
  const assets = await saveUploadedConsultingImages(lead.id, formData.getAll("images"));
  await saveLeadWorkspace(lead.id, { commercialTrack: "consulting" });
  refresh(lead.id);
  return assets;
}

export async function deleteConsultingImageAction(leadId, assetId) {
  const lead = await requireLead(leadId);
  const assets = await deleteConsultingAsset(lead.id, assetId);
  refresh(lead.id);
  return assets;
}

export async function generateConsultingAuditAction(payload = {}) {
  const lead = await requireLead(payload.leadId);
  const [profile, workspace] = await Promise.all([getProfessionalProfile(), getLeadWorkspace(lead.id)]);
  const websiteUrl = payload.websiteUrl || workspace.consulting.websiteUrl || lead.site || "";
  const instagramUrl = payload.instagramUrl || workspace.consulting.instagramUrl || lead.instagram || "";
  const instagramNotes = payload.instagramNotes || workspace.consulting.instagramNotes || "";
  const priceCents = payload.priceCents ?? workspace.consulting.priceCents;

  await saveLeadWorkspace(lead.id, {
    commercialTrack: workspace.commercialTrack === "both" ? "both" : "consulting",
    consulting: { status: "analyzing", stage: "novo", websiteUrl, instagramUrl, instagramNotes, priceCents },
  });

  let websiteAudit = null;
  let screenshotWarning = "";
  if (websiteUrl) {
    try {
      websiteAudit = await auditWebsite(websiteUrl);
      try {
        await captureWebsiteScreenshots(lead.id, websiteAudit.url || websiteUrl);
      } catch (error) {
        screenshotWarning = `As capturas automáticas não foram atualizadas: ${error.message}`;
      }
    } catch (error) {
      websiteAudit = { error: error.message, requestedUrl: websiteUrl };
    }
  }

  let contactEnrichment = null;
  try {
    contactEnrichment = await enrichLeadContacts({ lead, websiteUrl, instagramUrl, instagramNotes, providerId: payload.providerId || undefined });
    const leadPatch = buildLeadContactPatch(lead, contactEnrichment);
    if (Object.keys(leadPatch).length) await repo.updateLead(lead.id, leadPatch);
    await saveLeadWorkspace(lead.id, { consulting: { contactEnrichment, council: contactEnrichment.council || "", registration: contactEnrichment.registration || "" } });
  } catch (error) {
    contactEnrichment = {
      name: lead.name || "",
      email: lead.email || "",
      whatsapp: lead.whatsapp || "",
      phone: lead.phone || "",
      city: lead.city || "",
      state: lead.location || "",
      council: workspace.consulting.council || "",
      registration: workspace.consulting.registration || "",
      confidence: 0,
      evidence: [],
      sources: [],
      inaccessibleSources: [],
      warning: clean(error.message, 500),
    };
  }

  const refreshedLead = await repo.getLead(lead.id);
  const images = await readConsultingImagesForAI(lead.id);
  const result = await generateConsultingAudit({ lead: refreshedLead || lead, profile, websiteAudit, websiteUrl, instagramUrl, instagramNotes, priceCents, providerId: payload.providerId || undefined, images, screenshotWarning });

  refresh(lead.id);
  return { ...result, contactEnrichment, lead: refreshedLead || lead, assets: await listConsultingAssets(lead.id) };
}

export async function promoteConsultingLeadAction(leadId) {
  const lead = await requireLead(leadId);
  await repo.moveStage(lead.id, "novo");
  await saveLeadWorkspace(lead.id, { commercialTrack: "both", consulting: { stage: "cliente", status: "converted", deliveredAt: new Date().toISOString() } });
  refresh(lead.id);
  return { id: lead.id, commercialTrack: "both", stage: "novo" };
}
