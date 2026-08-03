/**
 * Interface comum para todos os conectores de conselhos profissionais.
 * Cada provider deve implementar `search` e `normalize`.
 */
export class ProfessionalRegistryProvider {
  constructor(council) {
    this.council = council || "";
    this.isMock = false;
  }

  async search(filters) {
    throw new Error("Método search não implementado");
  }

  normalize(rawItem) {
    throw new Error("Método normalize não implementado");
  }

  /**
   * Garante que os campos comuns existam e preserva campos adicionais
   * fornecidos por cada fonte oficial.
   */
  buildRecord(partial = {}) {
    return {
      ...partial,
      id: partial.id || cryptoRandomId(),
      name: partial.name || "",
      registration: partial.registration || "",
      council: partial.council || this.council || "",
      status: partial.status || "",
      specialty: partial.specialty || "",
      email: partial.email || "",
      whatsapp: partial.whatsapp || "",
      phone: partial.phone || "",
      city: partial.city || "",
      state: partial.state || "",
      website: partial.website || "",
      instagram: partial.instagram || "",
      facebook: partial.facebook || "",
      linkedin: partial.linkedin || "",
      sourceUrl: partial.sourceUrl || "",
      checkedAt: partial.checkedAt || new Date().toISOString()
    };
  }
}

export function cryptoRandomId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}
