import { listLeads } from "../../repositories/leadRepository.js";
import SiteCreatorStart from "../../components/SiteCreatorStart/SiteCreatorStart.jsx";

export const dynamic = "force-dynamic";

export default async function CreateSitePage({ searchParams }) {
  const params = await searchParams;
  const leads = await listLeads();
  return <SiteCreatorStart leads={leads} initialLeadId={String(params?.lead || "")} />;
}
