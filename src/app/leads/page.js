import { listLeads } from "../../repositories/leadRepository.js";
import LeadList from "../../components/LeadList/LeadList.jsx";

export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  const leads = await listLeads();
  return <LeadList initialLeads={leads} />;
}
