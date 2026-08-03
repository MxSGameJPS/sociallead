import { notFound } from "next/navigation";
import { getLead } from "../../../repositories/leadRepository.js";
import { getLeadWorkspace } from "../../../services/workspaces/leadWorkspaceStore.js";
import { getProfessionalProfile } from "../../../services/profile/profileStore.js";
import { listConsultingAssets } from "../../../services/consulting/assetStore.js";
import { resolveCommercialTrack } from "../../../services/leads/commercialTrack.js";
import ConsultingWorkspace from "../../../components/ConsultingWorkspace/ConsultingWorkspace.jsx";

export const dynamic = "force-dynamic";

export default async function ConsultingDetailPage({ params }) {
  const { id } = await params;
  const lead = await getLead(id);
  if (!lead) notFound();
  const [workspace, profile, assets] = await Promise.all([
    getLeadWorkspace(lead.id),
    getProfessionalProfile(),
    listConsultingAssets(lead.id),
  ]);
  return <ConsultingWorkspace
    initialLead={lead}
    initialWorkspace={{ ...workspace, commercialTrack: resolveCommercialTrack(lead, workspace) }}
    initialProfile={profile}
    initialAssets={assets}
  />;
}
