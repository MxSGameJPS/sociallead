"use server";

import { revalidatePath } from "next/cache";
import { getLead, setFollowUp } from "../../repositories/leadRepository.js";
import { createAppointment, deleteAppointment, updateAppointmentStatus } from "../../services/appointments/appointmentStore.js";
import { saveLeadWorkspace } from "../../services/workspaces/leadWorkspaceStore.js";

function refresh(leadId) {
  revalidatePath("/agendamentos");
  revalidatePath("/dashboard");
  revalidatePath("/crm");
  if (leadId) revalidatePath(`/crm/${leadId}`);
}

export async function createAppointmentAction(input = {}) {
  const lead = await getLead(String(input.leadId || ""));
  if (!lead) throw new Error("Selecione um lead válido.");

  const appointment = await createAppointment({
    leadId: lead.id,
    type: input.type,
    date: input.date,
    time: input.time,
    notes: input.notes,
    status: "pending",
  });

  await setFollowUp(lead.id, appointment.date);
  await saveLeadWorkspace(lead.id, {
    appointment: {
      type: appointment.type,
      time: appointment.time,
      notes: appointment.notes,
      status: appointment.status,
    },
  });
  refresh(lead.id);
  return appointment;
}

export async function updateAppointmentStatusAction(id, status) {
  const appointment = await updateAppointmentStatus(String(id || ""), String(status || ""));
  refresh(appointment.leadId);
  return appointment;
}

export async function deleteAppointmentAction(id) {
  await deleteAppointment(String(id || ""));
  refresh();
}
