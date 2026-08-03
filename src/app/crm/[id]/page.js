import { notFound } from "next/navigation";
import { getLead } from "../../../repositories/leadRepository.js";
import { getLeadWorkspace } from "../../../services/workspaces/leadWorkspaceStore.js";
import { getProfessionalProfile } from "../../../services/profile/profileStore.js";
import { listConsultingAssets } from "../../../services/consulting/assetStore.js";
import UnifiedLeadWorkspace from "../../../components/UnifiedLeadWorkspace/UnifiedLeadWorkspace.jsx";

export const dynamic = "force-dynamic";

export default async function LeadDetailPage({ params }) {
  const { id } = await params;
  const lead = await getLead(id);
  if (!lead) notFound();

  const [workspace, profile, assets] = await Promise.all([
    getLeadWorkspace(lead.id),
    getProfessionalProfile(),
    listConsultingAssets(lead.id),
  ]);

  return <UnifiedLeadWorkspace lead={lead} workspace={workspace} profile={profile} assets={assets} />;
}
