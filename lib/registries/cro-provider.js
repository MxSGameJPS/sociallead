import { MockProvider } from "./mock-provider.js";

/**
 * CROProvider — Conselho Regional de Odontologia.
 *
 * Preparado para integração real com a fonte oficial autorizada.
 * Enquanto não há integração, utiliza dados simulados (MockProvider).
 */
export class CROProvider extends MockProvider {
  constructor() {
    super("CRO");
  }
}