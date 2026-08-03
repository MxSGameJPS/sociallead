import { listLeads } from "../../repositories/leadRepository.js";
import { listLeadWorkspaces } from "../../services/workspaces/leadWorkspaceStore.js";
import BillingBoard from "../../components/BillingBoard/BillingBoard.jsx";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const [leads, workspaces] = await Promise.all([listLeads(), listLeadWorkspaces()]);
  const workspaceByLead = new Map(workspaces.map(item => [item.leadId, item.workspace]));
  const clients = leads
    .filter(lead => lead.stage === "ganho")
    .map(lead => ({ lead, workspace: workspaceByLead.get(lead.id) || null }))
    .sort((a, b) => a.lead.name.localeCompare(b.lead.name, "pt-BR"));

  return <BillingBoard clients={clients} />;
}
