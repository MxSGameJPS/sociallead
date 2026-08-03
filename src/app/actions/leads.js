"use server";
import { revalidatePath } from "next/cache";
import * as repo from "../../repositories/leadRepository.js";
import { parseLeads } from "../../services/imports/parseLeads.js";

const MAX_IMPORT_SIZE = 5_000_000;
const CLEAR_CONFIRMATION = "APAGAR";

function refresh() {
  revalidatePath("/dashboard");
  revalidatePath("/leads");
  revalidatePath("/crm");
  revalidatePath("/consultoria");
  revalidatePath("/agendamentos");
  revalidatePath("/cobrancas");
}

export async function createLeadAction(data) { const r = await repo.createLead(data); refresh(); return r; }
export async function updateLeadAction(id, patch) { const r = await repo.updateLead(id, patch); refresh(); return r; }
export async function deleteLeadAction(id) { await repo.deleteLead(id); refresh(); }
export async function deleteLeadsAction(ids) { const r = await repo.deleteLeads(ids); refresh(); return r; }
export async function moveStageAction(id, stage) { await repo.moveStage(id, stage); refresh(); }
export async function setLandingAction(id, status) { await repo.setLanding(id, status); refresh(); }
export async function setGradeAction(id, grade) { await repo.setGrade(id, grade); refresh(); }
export async function setFollowUpAction(id, date) { await repo.setFollowUp(id, date); refresh(); }
export async function setProposalValueAction(id, value) { await repo.setProposalValue(id, value); refresh(); }
export async function setNotesAction(id, notes) { await repo.setNotes(id, notes); refresh(); }

export async function clearAllAction(confirmation) {
  if (confirmation !== CLEAR_CONFIRMATION) {
    throw new Error("Confirmação inválida. Nenhum lead foi apagado.");
  }
  await repo.clearAll();
  refresh();
}

export async function importTextAction(text, fname) {
  if (typeof text !== "string" || !text.trim()) throw new Error("O arquivo está vazio.");
  if (text.length > MAX_IMPORT_SIZE) throw new Error("O arquivo excede o limite local de 5 MB.");

  const arr = parseLeads(text, fname);
  if (!arr.length) throw new Error("Nenhum lead reconhecido no arquivo.");

  const coverage = arr.reduce((acc, lead) => {
    if (lead.whatsapp) acc.withWhatsapp++;
    if (lead.phone) acc.withPhone++;
    if (lead.email) acc.withEmail++;
    if (lead.instagram) acc.withInstagram++;
    if (!lead.whatsapp && !lead.phone && !lead.email && !lead.instagram) acc.withoutContact++;
    return acc;
  }, { withWhatsapp: 0, withPhone: 0, withEmail: 0, withInstagram: 0, withoutContact: 0 });

  const res = await repo.importLeads(arr);
  refresh();
  return { ...res, recognized: arr.length, coverage };
}
