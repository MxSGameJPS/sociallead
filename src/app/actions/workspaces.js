"use server";

import { revalidatePath } from "next/cache";
import { getLead } from "../../repositories/leadRepository.js";
import { saveLeadWorkspace } from "../../services/workspaces/leadWorkspaceStore.js";

export async function saveLeadWorkspaceAction(leadId, patch) {
  const lead = await getLead(String(leadId || ""));
  if (!lead) throw new Error("Lead não encontrado.");

  const saved = await saveLeadWorkspace(lead.id, patch || {});
  revalidatePath(`/crm/${lead.id}`);
  revalidatePath("/agendamentos");
  revalidatePath("/cobrancas");
  return saved;
}
