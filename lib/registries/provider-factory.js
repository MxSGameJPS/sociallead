import { MockProvider } from "./mock-provider.js";
import {
  ConsultaCrmProvider,
  CONSULTA_CRM_TYPE_MAP
} from "./consulta-crm-provider.js";
import { CfmPublicProvider } from "./cfm-public-provider.js";

/**
 * Resolve o provider correspondente ao conselho informado.
 * CRM usa a busca pública oficial do CFM. Os demais conselhos compatíveis
 * continuam usando ConsultaCRM como fonte auxiliar até receberem conectores
 * oficiais próprios.
 */
export function getRegistryProvider(council) {
  const key = (council || "").toUpperCase();

  if (key === "OAB") {
    return new MockProvider(council);
  }

  if (key === "CRM") {
    return new CfmPublicProvider();
  }

  if (CONSULTA_CRM_TYPE_MAP[key]) {
    return new ConsultaCrmProvider(council);
  }

  return new MockProvider(council);
}
