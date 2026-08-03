import { listLeads } from "../../repositories/leadRepository.js";
import { listLeadEnrichments } from "../../services/leads/leadEnrichmentStore.js";
import CRMExportBoard from "../../components/CRMExportBoard/CRMExportBoard.jsx";

export const dynamic = "force-dynamic";

export default async function CRMPage() {
  const [leads, enrichments] = await Promise.all([
    listLeads(),
    listLeadEnrichments(),
  ]);

  const enrichedLeads = leads.map(lead => {
    const enrichment = enrichments[lead.id] || {};
    return {
      ...lead,
      name: enrichment.name || lead.name,
      profession: enrichment.profession || lead.segment || "",
      registration: enrichment.registration || "",
      council: enrichment.council || "",
      email: enrichment.email || lead.email || "",
      whatsapp: enrichment.whatsapp || lead.whatsapp || "",
      city: enrichment.city || lead.city || "",
      state: enrichment.state || lead.location || "",
      validationTag: enrichment.validationTag || "AGUARDANDO ANÁLISE",
      enrichmentUpdatedAt: enrichment.updatedAt || "",
      enrichmentConfidence: Number(enrichment.confidence || 0),
    };
  });

  return <CRMExportBoard initialLeads={enrichedLeads} />;
}
