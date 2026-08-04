const RULES = [
  { council: "OAB", terms: ["advogado", "advogada"] },
  { council: "CRO", terms: ["dentista", "cirurgiao dentista", "odontologo", "odontologista"] },
  { council: "CRM", terms: ["medico", "medica"] },
  { council: "CRMV", terms: ["medico veterinario", "medica veterinaria", "veterinario", "veterinaria"] },
  { council: "CREA", terms: ["engenheiro", "engenheira", "agronomo", "agronoma"] },
  { council: "CAU", terms: ["arquiteto", "arquiteta", "urbanista"] },
  { council: "CRP", terms: ["psicologo", "psicologa"] },
  { council: "CREFITO", terms: ["fisioterapeuta", "terapeuta ocupacional"] },
  { council: "CREFONO", terms: ["fonoaudiologo", "fonoaudiologa"] },
  { council: "COREN", terms: ["enfermeiro", "enfermeira", "tecnico em enfermagem", "tecnica em enfermagem"] },
  { council: "CRF", terms: ["farmaceutico", "farmaceutica"] },
  { council: "CRN", terms: ["nutricionista"] },
  { council: "CRBM", terms: ["biomedico", "biomedica"] },
  { council: "CRBio", terms: ["biologo", "biologa"] },
  { council: "CRESS", terms: ["assistente social"] },
  { council: "CRA", terms: ["administrador", "administradora"] },
  { council: "CRC", terms: ["contador", "contadora", "contabilista"] },
  { council: "CORECON", terms: ["economista"] },
  { council: "CRECI", terms: ["corretor de imoveis", "corretora de imoveis"] },
  { council: "CREF", terms: ["profissional de educacao fisica", "educador fisico", "educadora fisica", "personal trainer"] },
  { council: "CRQ", terms: ["quimico", "quimica"] },
  { council: "CFTA", terms: ["tecnico agricola", "tecnica agricola"] },
  { council: "CFT", terms: ["tecnico industrial", "tecnica industrial"] },
];

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function inferProfessionalCouncil(profession) {
  const normalized = normalize(profession);
  if (!normalized) return "";

  // Regras mais específicas devem prevalecer sobre termos genéricos.
  const ordered = [...RULES].sort((a, b) => {
    const aLength = Math.max(...a.terms.map(term => term.length));
    const bLength = Math.max(...b.terms.map(term => term.length));
    return bLength - aLength;
  });

  return ordered.find(rule => rule.terms.some(term => normalized.includes(term)))?.council || "";
}

export function resolveProfessionalCouncil({ profession, segment, council } = {}) {
  return String(council || "").trim().toUpperCase() || inferProfessionalCouncil(profession || segment);
}
