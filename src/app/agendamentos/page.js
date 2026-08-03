import { listLeads } from "../../repositories/leadRepository.js";
import { listAppointments } from "../../services/appointments/appointmentStore.js";
import { listLeadWorkspaces } from "../../services/workspaces/leadWorkspaceStore.js";
import AppointmentsList from "../../components/AppointmentsList/AppointmentsList.jsx";

export const dynamic = "force-dynamic";

export default async function AppointmentsPage() {
  const [leads, storedAppointments, workspaces] = await Promise.all([listLeads(), listAppointments(), listLeadWorkspaces()]);
  const leadById = new Map(leads.map(lead => [lead.id, lead]));
  const workspaceByLead = new Map(workspaces.map(item => [item.leadId, item.workspace]));

  const appointments = storedAppointments
    .map(appointment => ({ appointment, lead: leadById.get(appointment.leadId), storage: "store" }))
    .filter(item => item.lead);

  const storedLeadDates = new Set(appointments.map(item => `${item.lead.id}|${item.appointment.date}`));
  for (const lead of leads) {
    if (!lead.followUpAt || storedLeadDates.has(`${lead.id}|${lead.followUpAt}`)) continue;
    const workspace = workspaceByLead.get(lead.id) || {};
    appointments.push({
      lead,
      storage: "legacy",
      appointment: {
        id: `legacy_${lead.id}`,
        leadId: lead.id,
        date: lead.followUpAt,
        time: workspace.appointment?.time || "09:00",
        type: workspace.appointment?.type || "Follow-up",
        notes: workspace.appointment?.notes || "",
        status: workspace.appointment?.status || "pending",
      },
    });
  }

  appointments.sort((a, b) => `${a.appointment.date} ${a.appointment.time}`.localeCompare(`${b.appointment.date} ${b.appointment.time}`));
  return <AppointmentsList appointments={appointments} leads={leads} />;
}
