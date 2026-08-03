import { redirect } from "next/navigation";

export default async function ConsultingDetailPage({ params }) {
  const { id } = await params;
  redirect(`/crm/${id}`);
}
