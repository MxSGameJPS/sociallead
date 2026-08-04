import fs from "node:fs/promises";
import path from "node:path";

const PROFILE_FILE = path.join(process.cwd(), "data", "profile.json");
const EMPTY_PROFILE = {
  id: "default",
  name: "",
  professionalName: "",
  brandName: "",
  profession: "Advogado",
  oabNumber: "",
  oabState: "",
  specialty: "",
  city: "",
  state: "",
  whatsapp: "",
  site: "",
  email: "",
  instagram: "",
  professionalBio: "",
  thesisName: "",
  thesisSummary: "",
  thesisDetails: "",
  eligibleProfessions: "",
  relatedCouncils: "",
  eligibilityContext: "",
  requiredDocuments: "",
  relevantPeriod: "",
  callToAction: "",
  prohibitedClaims: "",
  mandatoryDisclaimer: "",
};

function clean(value, max = 500) {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max);
}

function normalizeUrl(value) {
  const raw = clean(value, 1000);
  if (!raw) return "";
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(candidate);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.toString() : "";
  } catch {
    throw new Error("Informe uma URL válida.");
  }
}

function normalizeProfile(input = {}) {
  const profile = {
    id: "default",
    name: clean(input.name, 180),
    professionalName: clean(input.professionalName, 180),
    brandName: clean(input.brandName, 180),
    profession: clean(input.profession || "Advogado", 180),
    oabNumber: clean(input.oabNumber, 80),
    oabState: clean(input.oabState, 2).toUpperCase(),
    specialty: clean(input.specialty, 180),
    city: clean(input.city, 120),
    state: clean(input.state, 2).toUpperCase(),
    whatsapp: clean(input.whatsapp, 60),
    site: input.site ? normalizeUrl(input.site) : "",
    email: clean(input.email, 320).toLowerCase(),
    instagram: clean(input.instagram, 500),
    professionalBio: clean(input.professionalBio, 3000),
    thesisName: clean(input.thesisName, 220),
    thesisSummary: clean(input.thesisSummary, 3000),
    thesisDetails: clean(input.thesisDetails, 12000),
    eligibleProfessions: clean(input.eligibleProfessions, 3000),
    relatedCouncils: clean(input.relatedCouncils, 1500),
    eligibilityContext: clean(input.eligibilityContext, 5000),
    requiredDocuments: clean(input.requiredDocuments, 4000),
    relevantPeriod: clean(input.relevantPeriod, 1200),
    callToAction: clean(input.callToAction, 1500),
    prohibitedClaims: clean(input.prohibitedClaims, 4000),
    mandatoryDisclaimer: clean(input.mandatoryDisclaimer, 3000),
  };

  if (profile.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)) {
    throw new Error("Informe um e-mail válido.");
  }
  return profile;
}

export async function getProfessionalProfile() {
  try {
    const raw = await fs.readFile(PROFILE_FILE, "utf8");
    return normalizeProfile({ ...EMPTY_PROFILE, ...JSON.parse(raw) });
  } catch (error) {
    if (error?.code === "ENOENT") return { ...EMPTY_PROFILE };
    if (error instanceof SyntaxError) throw new Error("O arquivo local do perfil está corrompido.");
    throw error;
  }
}

export async function saveProfessionalProfile(input = {}) {
  const profile = normalizeProfile(input);
  await fs.mkdir(path.dirname(PROFILE_FILE), { recursive: true });
  const temporary = `${PROFILE_FILE}.${process.pid}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(profile, null, 2), "utf8");
  await fs.rename(temporary, PROFILE_FILE);
  return profile;
}
