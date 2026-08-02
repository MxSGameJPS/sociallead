import { MockProvider } from "./mock-provider.js";

/**
 * CorenProvider — Conselho Regional de Enfermagem.
 *
 * Preparado para integração real com a fonte oficial autorizada.
 * Enquanto não há integração, utiliza dados simulados (MockProvider).
 */
export class CorenProvider extends MockProvider {
  constructor() {
    super("Coren");
  }
}