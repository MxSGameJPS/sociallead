import fs from "node:fs/promises";
import path from "node:path";
import { getSupabaseAdmin, isSupabaseConfigured, throwSupabaseError } from "../../lib/supabaseAdmin.js";

const PROFILE_FILE = path.join(process.cwd(), "data", "profile.json");
const EMPTY_PROFILE = {
  id: "default",
  name: "",
  brandName: "",
  profession: "",
  whatsapp: "",
  site: "",
  email: "",
  instagram: "",
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
    brandName: clean(input.brandName ?? input.brand_name, 180),
    profession: clean(input.profession, 180),
    whatsapp: clean(input.whatsapp, 60),
    site: input.site ? normalizeUrl(input.site) : "",
    email: clean(input.email, 320).toLowerCase(),
    instagram: clean(input.instagram, 500),
  };

  if (profile.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)) {
    throw new Error("Informe um e-mail válido.");
  }
  return profile;
}

function fromSupabase(row) {
  if (!row) return { ...EMPTY_PROFILE };
  return normalizeProfile({
    name: row.name,
    brandName: row.brand_name,
    profession: row.profession,
    whatsapp: row.whatsapp,
    site: row.site,
    email: row.email,
    instagram: row.instagram,
  });
}

export async function getProfessionalProfile() {
  if (isSupabaseConfigured()) {
    const { data, error } = await getSupabaseAdmin().from("app_profile").select("*").eq("id", "default").maybeSingle();
    throwSupabaseError(error, "Não foi possível carregar o perfil");
    return fromSupabase(data);
  }

  try {
    const raw = await fs.readFile(PROFILE_FILE, "utf8");
    return normalizeProfile(JSON.parse(raw));
  } catch (error) {
    if (error?.code === "ENOENT") return { ...EMPTY_PROFILE };
    if (error instanceof SyntaxError) throw new Error("O arquivo local do perfil está corrompido.");
    throw error;
  }
}

export async function saveProfessionalProfile(input = {}) {
  const profile = normalizeProfile(input);

  if (isSupabaseConfigured()) {
    const { data, error } = await getSupabaseAdmin().from("app_profile").upsert({
      id: "default",
      name: profile.name,
      brand_name: profile.brandName,
      profession: profile.profession,
      whatsapp: profile.whatsapp,
      site: profile.site,
      email: profile.email,
      instagram: profile.instagram,
    }, { onConflict: "id" }).select("*").single();
    throwSupabaseError(error, "Não foi possível salvar o perfil");
    return fromSupabase(data);
  }

  await fs.mkdir(path.dirname(PROFILE_FILE), { recursive: true });
  await fs.writeFile(PROFILE_FILE, JSON.stringify(profile, null, 2), "utf8");
  return profile;
}
