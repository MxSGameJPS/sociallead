import { readConsultingAsset } from "../../../../../../services/consulting/assetStore.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request, { params }) {
  const { leadId, filename } = await params;
  try {
    const item = await readConsultingAsset(leadId, filename);
    if (!item) return new Response("Imagem não encontrada.", { status: 404 });
    return new Response(item.buffer, {
      status: 200,
      headers: {
        "Content-Type": item.mimeType,
        "Content-Length": String(item.buffer.length),
        "Cache-Control": "private, max-age=60",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Imagem inválida.", { status: 400 });
  }
}
