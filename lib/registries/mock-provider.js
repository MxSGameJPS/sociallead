import { ProfessionalRegistryProvider } from "./base-provider.js";
import mockData from "../../data/mock-professionals.json";

/**
 * Provider Mock (placeholder de desenvolvimento).
 *
 * Não gera nenhum dado simulado ou inventado. Apenas repassa registros
 * eventualmente presentes em `data/mock-professionals.json` (por padrão vazio),
 * já normalizados e filtrados. Isso mantém a arquitetura preparada para
 * conectores reais sem nunca produzir informações fictícias.
 */
export class MockProvider extends ProfessionalRegistryProvider {
  constructor(council) {
    super(council);
    // Sinaliza que este conselho ainda não possui integração real.
    this.isMock = true;
  }

  async search(filters) {
    const limit = filters.limit || 10;

    const source = Array.isArray(mockData) ? mockData : [];

    const records = source
      .filter(
        (item) =>
          !item.council ||
          item.council.toLowerCase() === (filters.council || "").toLowerCase()
      )
      .map((item) => this.normalize({ ...item, council: filters.council }));

    return this.applyFilters(records, filters).slice(0, limit);
  }

  applyFilters(results, filters) {
    return results.filter((r) => {
      if (
        filters.name &&
        !r.name.toLowerCase().includes(filters.name.toLowerCase())
      ) {
        return false;
      }
      if (
        filters.registration &&
        !r.registration.includes(filters.registration)
      ) {
        return false;
      }
      if (
        filters.city &&
        r.city &&
        !r.city.toLowerCase().includes(filters.city.toLowerCase())
      ) {
        return false;
      }
      if (filters.state && r.state && r.state !== filters.state) {
        return false;
      }
      if (
        filters.specialty &&
        r.specialty &&
        !r.specialty.toLowerCase().includes(filters.specialty.toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }

  normalize(rawItem) {
    return this.buildRecord(rawItem);
  }
}