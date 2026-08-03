import { notFound } from "next/navigation";
import { getLead } from "../../../repositories/leadRepository.js";
import { getLeadWorkspace } from "../../../services/workspaces/leadWorkspaceStore.js";
import { getProfessionalProfile } from "../../../services/profile/profileStore.js";
import { resolveCommercialTrack } from "../../../services/leads/commercialTrack.js";
import CommercialTrackSelector from "../../../components/CommercialTrackSelector/CommercialTrackSelector.jsx";
import LeadWorkspace from "../../../components/LeadWorkspace/LeadWorkspace.jsx";

export const dynamic = "force-dynamic";

export default async function LeadDetailPage({ params }) {
  const { id } = await params;
  const lead = await getLead(id);
  if (!lead) notFound();

  const [workspace, profile] = await Promise.all([
    getLeadWorkspace(lead.id),
    getProfessionalProfile(),
  ]);
  const commercialTrack = resolveCommercialTrack(lead, workspace);

  return <>
    <CommercialTrackSelector leadId={lead.id} grade={lead.grade} initialTrack={commercialTrack} />
    <LeadWorkspace initialLead={lead} initialWorkspace={{ ...workspace, commercialTrack }} initialProfile={profile} />
  </>;
}
