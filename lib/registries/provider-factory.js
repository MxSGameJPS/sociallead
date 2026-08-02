import { MockProvider } from "./mock-provider.js";
import {
  ConsultaCrmProvider,
  CONSULTA_CRM_TYPE_MAP
} from "./consulta-crm-provider.js";

/**
 * Resolve o provider correspondente ao conselho informado.
 *
 * Conselhos suportados pela API ConsultaCRM (CRM, CRO, CRP, CREA, CAU, CRN)
 * usam o provider real. OAB é intencionalmente excluído. Os demais conselhos
 * ainda não possuem integração e usam o MockProvider (que não gera dados
 * fictícios — retorna vazio enquanto não houver conector real).
 */
export function getRegistryProvider(council) {
  const key = (council || "").toUpperCase();

  // OAB não é integrado neste projeto.
  if (key === "OAB") {
    return new MockProvider(council);
  }

  // Conselhos suportados pela API ConsultaCRM.
  if (CONSULTA_CRM_TYPE_MAP[key]) {
    return new ConsultaCrmProvider(council);
  }

  return new MockProvider(council);
}