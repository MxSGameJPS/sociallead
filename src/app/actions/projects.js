"use server";

import { revalidatePath } from "next/cache";
import { getLead, setLanding } from "../../repositories/leadRepository.js";
import { createSiteProject, deleteSiteProject } from "../../services/projects/projectStore.js";
import { generateSiteFolder } from "../../services/projects/siteGeneratorV2.js";

export async function createSiteProjectAction(input = {}) {
  const mode = ["lead", "describe", "google"].includes(input.mode) ? input.mode : "lead";
  let lead = null;

  if (mode === "lead") {
    lead = await getLead(String(input.leadId || ""));
    if (!lead) throw new Error("Selecione um lead existente.");
  }

  const name = lead?.name || String(input.name || "").trim();
  if (!name) throw new Error("Informe o nome do negócio.");

  const leadDescription = [
    lead?.problem,
    lead?.offer,
    lead?.bio,
    lead?.instagram ? `Instagram do negócio: ${lead.instagram}` : "",
  ].filter(Boolean).join("\n");

  const generated = await generateSiteFolder({
    name,
    segment: lead?.segment || input.segment,
    city: lead?.city || lead?.location || input.city,
    address: lead?.address || "",
    phone: lead?.phone || lead?.whatsapp || "",
    placeId: lead?.externalId || "",
    mapsLink: lead?.mapsLink || (mode === "google" ? input.source : ""),
    existingWebsite: lead?.site || "",
    instagram: lead?.instagram || "",
    rating: lead?.googleRating || "",
    reviews: lead?.googleReviews || "",
    description: mode === "lead" ? leadDescription : input.source,
    template: input.template,
  });

  const project = await createSiteProject({
    leadId: lead?.id || null,
    name,
    segment: lead?.segment || input.segment,
    city: lead?.city || lead?.location || input.city,
    mode,
    source: mode === "lead" ? (lead?.instagram || lead?.site || lead?.mapsLink || lead?.problem || "Dados do CRM") : input.source,
    template: input.template,
    status: "ready",
    folderPath: generated.folderPath,
    aiUsed: generated.aiUsed,
    warning: generated.warning,
    imageCount: generated.imageCount,
  });

  if (lead) await setLanding(lead.id, "done");
  revalidatePath("/projetos");
  revalidatePath("/criar-site");
  if (lead) revalidatePath(`/crm/${lead.id}`);
  return project;
}

export async function deleteSiteProjectAction(id) {
  const project = await deleteSiteProject(String(id || ""));
  revalidatePath("/projetos");
  revalidatePath("/criar-site");
  if (project.leadId) revalidatePath(`/crm/${project.leadId}`);
  return { id: project.id };
}
