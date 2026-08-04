import { notFound } from "next/navigation";
import { getLead } from "../../../repositories/leadRepository.js";
import { getLeadWorkspace } from "../../../services/workspaces/leadWorkspaceStore.js";
import { getLeadEnrichment } from "../../../services/leads/leadEnrichmentStore.js";
import { getProfessionalProfile } from "../../../services/profile/profileStore.js";
import { listConsultingAssets } from "../../../services/consulting/assetStore.js";
import { resolveProfessionalCouncil } from "../../../services/professions/professionalCouncils.js";
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

  const profession = enrichment.profession || lead.segment || "";
  const council = resolveProfessionalCouncil({
    profession,
    segment: lead.segment,
    council: enrichment.council,
  });

  const hydratedLead = {
    ...lead,
    name: enrichment.name || lead.name,
    profession,
    council,
    registration: enrichment.registration || "",
    email: enrichment.email || lead.email || "",
    whatsapp: enrichment.whatsapp || lead.whatsapp || "",
    city: enrichment.city || lead.city || "",
    state: enrichment.state || lead.location || "",
    validationTag: enrichment.validationTag || "AGUARDANDO ANÁLISE",
  };

  const hydratedWorkspace = {
    ...workspace,
    consulting: {
      ...workspace.consulting,
      contactEnrichment: enrichment,
      council,
      registration: enrichment.registration || "",
    },
  };

  return <UnifiedLeadWorkspace lead={hydratedLead} workspace={hydratedWorkspace} profile={profile} assets={assets} />;
}
