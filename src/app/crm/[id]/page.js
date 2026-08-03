import { notFound } from "next/navigation";
import { getLead } from "../../../repositories/leadRepository.js";
import { getLeadWorkspace } from "../../../services/workspaces/leadWorkspaceStore.js";
import { getLeadEnrichment } from "../../../services/leads/leadEnrichmentStore.js";
import { getProfessionalProfile } from "../../../services/profile/profileStore.js";
import { listConsultingAssets } from "../../../services/consulting/assetStore.js";
import UnifiedLeadWorkspace from "../../../components/UnifiedLeadWorkspace/UnifiedLeadWorkspace.jsx";

export const dynamic = "force-dynamic";

export default async function LeadDetailPage({ params }) {
  const { id } = await params;
  const lead = await getLead(id);
  if (!lead) notFound();

  const [workspace, enrichment, profile, assets] = await Promise.all([
    getLeadWorkspace(lead.id),
    getLeadEnrichment(lead.id),
    getProfessionalProfile(),
    listConsultingAssets(lead.id),
  ]);

  const hydratedWorkspace = {
    ...workspace,
    consulting: {
      ...workspace.consulting,
      contactEnrichment: enrichment,
      council: enrichment.council || "",
      registration: enrichment.registration || "",
    },
  };

  return <UnifiedLeadWorkspace lead={lead} workspace={hydratedWorkspace} profile={profile} assets={assets} />;
}
