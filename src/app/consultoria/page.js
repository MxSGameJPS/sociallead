import { listLeads } from "../../repositories/leadRepository.js";
import { getLeadWorkspace } from "../../services/workspaces/leadWorkspaceStore.js";
import { resolveCommercialTrack, trackIncludes } from "../../services/leads/commercialTrack.js";
import ConsultingBoard from "../../components/ConsultingBoard/ConsultingBoard.jsx";

export const dynamic = "force-dynamic";

export default async function ConsultingPage() {
  const leads = await listLeads();
  const workspaces = await Promise.all(leads.map(lead => getLeadWorkspace(lead.id)));
  const consultingLeads = leads.map((lead, index) => ({
    ...lead,
    commercialTrack: resolveCommercialTrack(lead, workspaces[index]),
    consulting: workspaces[index].consulting,
  })).filter(lead => trackIncludes(lead.commercialTrack, "consulting"));
  return <ConsultingBoard initialLeads={consultingLeads} />;
}
