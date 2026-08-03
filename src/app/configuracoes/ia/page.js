import AISettings from "../../../components/AISettings/AISettings.jsx";
import { listProvidersPublic } from "../../../services/ai/providerService.js";

export const dynamic = "force-dynamic";

export default async function AISettingsPage() {
  let providers = [];
  let error = "";
  try {
    providers = await listProvidersPublic();
  } catch (cause) {
    error = "Erro ao carregar as configurações de IA: " + cause.message;
  }
  return <AISettings initialProviders={providers} initialError={error} />;
}
