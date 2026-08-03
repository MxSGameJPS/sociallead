import { listLeads } from "../../repositories/leadRepository.js";
import { getLeadWorkspace } from "../../services/workspaces/leadWorkspaceStore.js";
import { resolveCommercialTrack, trackIncludes } from "../../services/leads/commercialTrack.js";
import CommercialHub from "../../components/CommercialHub/CommercialHub.jsx";

export const dynamic = "force-dynamic";

export default async function CRMPage() {
  const leads = await listLeads();
  const workspaces = await Promise.all(leads.map(lead => getLeadWorkspace(lead.id)));

  const enriched = leads.map((lead, index) => ({
    ...lead,
    commercialTrack: resolveCommercialTrack(lead, workspaces[index]),
    consulting: workspaces[index].consulting,
  }));

  const crmLeads = enriched.filter(lead => trackIncludes(lead.commercialTrack, "projects"));
  const consultingLeads = enriched.filter(lead => trackIncludes(lead.commercialTrack, "consulting"));

  return <CommercialHub crmLeads={crmLeads} consultingLeads={consultingLeads} />;
}
