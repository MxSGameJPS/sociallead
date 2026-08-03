import { MockProvider } from "./mock-provider.js";
import { CfmPublicProvider } from "./cfm-public-provider.js";

/**
 * Resolve o provider oficial correspondente ao conselho informado.
 * CRM usa a busca pública oficial do CFM. Os demais conselhos permanecem
 * sem integração até que uma fonte pública oficial e adequada seja encontrada.
 */
export function getRegistryProvider(council) {
  const key = String(council || "").toUpperCase();

  if (key === "CRM") {
    return new CfmPublicProvider();
  }

  const provider = new MockProvider(council);
  provider.unsupported = true;
  return provider;
}
