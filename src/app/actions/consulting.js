"use server";

import { revalidatePath } from "next/cache";
import * as repo from "../../repositories/leadRepository.js";
import { enrichLeadContacts } from "../../services/consulting/contactEnrichmentService.js";
import { deleteConsultingAsset, listConsultingAssets, saveUploadedConsultingImages } from "../../services/consulting/assetStore.js";
import { validateConsultingStage } from "../../services/consulting/stages.js";
import { validateCommercialTrack } from "../../services/leads/commercialTrack.js";
import { saveLeadEnrichment } from "../../services/leads/leadEnrichmentStore.js";
import { getLeadWorkspace, saveLeadWorkspace } from "../../services/workspaces/leadWorkspaceStore.js";

function refresh(leadId) {
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
  const profession = clean(enrichment?.profession, 180);
  const email = clean(enrichment?.email, 320).toLowerCase();
  const whatsapp = clean(enrichment?.whatsapp, 30).replace(/\D/g, "");
  const phone = clean(enrichment?.phone, 30).replace(/\D/g, "");
  const city = clean(enrichment?.city, 120);
  const state = clean(enrichment?.state, 2).toUpperCase();

  if (name && (!lead.name || lead.name === "(sem nome)" || name.length > lead.name.length)) patch.name = name;
  if (profession) patch.segment = profession;
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

  if (!websiteUrl && !instagramNotes) throw new Error("Informe o site ou cole informações públicas para a IA analisar.");

  await saveLeadWorkspace(lead.id, { consulting: { websiteUrl, instagramUrl, instagramNotes } });

  const enrichment = await enrichLeadContacts({
    lead,
    websiteUrl,
    instagramUrl,
    instagramNotes,
    providerId: payload.providerId || undefined,
  });

  const savedEnrichment = await saveLeadEnrichment(lead.id, enrichment);
  const leadPatch = buildLeadContactPatch(lead, savedEnrichment);
  if (Object.keys(leadPatch).length) await repo.updateLead(lead.id, leadPatch);

  const updatedLead = await repo.getLead(lead.id);
  refresh(lead.id);
  return { lead: updatedLead || { ...lead, ...leadPatch }, enrichment: savedEnrichment };
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
  const result = await enrichLeadDataAction(payload);
  return {
    lead: result.lead,
    contactEnrichment: result.enrichment,
    assets: await listConsultingAssets(payload.leadId),
  };
}

export async function promoteConsultingLeadAction(leadId) {
  const lead = await requireLead(leadId);
  await repo.moveStage(lead.id, "novo");
  refresh(lead.id);
  return { id: lead.id, stage: "novo" };
}
