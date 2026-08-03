"use server";

import { revalidatePath } from "next/cache";
import * as repo from "../../repositories/leadRepository.js";
import { generateConsultingAudit } from "../../services/ai/consultingAuditService.js";
import { auditWebsite } from "../../services/consulting/siteAuditService.js";
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
  const id = String(leadId || ""), lead = await repo.getLead(id);
  if (!lead) throw new Error("Lead não encontrado.");
  return lead;
}
export async function saveConsultingWorkspaceAction(leadId, patch = {}) {
  const lead = await requireLead(leadId), saved = await saveLeadWorkspace(lead.id, { consulting: patch || {} });
  refresh(lead.id);
  return saved.consulting;
}
export async function setCommercialTrackAction(leadId, track) {
  const lead = await requireLead(leadId), value = validateCommercialTrack(track), saved = await saveLeadWorkspace(lead.id, { commercialTrack: value });
  refresh(lead.id);
  return { commercialTrack: saved.commercialTrack };
}
export async function moveConsultingStageAction(leadId, stage, status = "") {
  const patch = { stage: validateConsultingStage(stage) };
  if (status) patch.status = String(status);
  return saveConsultingWorkspaceAction(leadId, patch);
}
export async function uploadConsultingImagesAction(formData) {
  const leadId = String(formData?.get?.("leadId") || ""), lead = await requireLead(leadId), assets = await saveUploadedConsultingImages(lead.id, formData.getAll("images"));
  await saveLeadWorkspace(lead.id, { commercialTrack: "consulting" });
  refresh(lead.id);
  return assets;
}
export async function deleteConsultingImageAction(leadId, assetId) {
  const lead = await requireLead(leadId), assets = await deleteConsultingAsset(lead.id, assetId);
  refresh(lead.id);
  return assets;
}
export async function generateConsultingAuditAction(payload = {}) {
  const lead = await requireLead(payload.leadId);
  const [profile, workspace] = await Promise.all([getProfessionalProfile(), getLeadWorkspace(lead.id)]);
  const websiteUrl = payload.websiteUrl || workspace.consulting.websiteUrl || lead.site || "", instagramUrl = payload.instagramUrl || workspace.consulting.instagramUrl || lead.instagram || "", instagramNotes = payload.instagramNotes || workspace.consulting.instagramNotes || "", priceCents = payload.priceCents ?? workspace.consulting.priceCents;
  await saveLeadWorkspace(lead.id, { commercialTrack: workspace.commercialTrack === "both" ? "both" : "consulting", consulting: { status: "analyzing", stage: "novo", websiteUrl, instagramUrl, instagramNotes, priceCents } });
  let websiteAudit = null, screenshotWarning = "";
  if (websiteUrl) {
    try {
      websiteAudit = await auditWebsite(websiteUrl);
      try { await captureWebsiteScreenshots(lead.id, websiteAudit.url || websiteUrl); }
      catch (error) { screenshotWarning = `As capturas automáticas não foram atualizadas: ${error.message}`; }
    } catch (error) { websiteAudit = { error: error.message, requestedUrl: websiteUrl }; }
  }
  const images = await readConsultingImagesForAI(lead.id);
  const result = await generateConsultingAudit({ lead, profile, websiteAudit, websiteUrl, instagramUrl, instagramNotes, priceCents, providerId: payload.providerId || undefined, images, screenshotWarning });
  return { ...result, assets: await listConsultingAssets(lead.id) };
}
export async function promoteConsultingLeadAction(leadId) {
  const lead = await requireLead(leadId);
  await repo.moveStage(lead.id, "novo");
  await saveLeadWorkspace(lead.id, { commercialTrack: "both", consulting: { stage: "cliente", status: "converted", deliveredAt: new Date().toISOString() } });
  refresh(lead.id);
  return { id: lead.id, commercialTrack: "both", stage: "novo" };
}
