import { prisma } from "../lib/prisma.js";
import { getSupabaseAdmin, isSupabaseConfigured, throwSupabaseError } from "../lib/supabaseAdmin.js";
import { keyOf } from "../services/imports/parseLeads.js";
import { todayStr } from "../services/leads/format.js";
import {
  normalizeBoolean,
  normalizeFollowUpDate,
  normalizeInteger,
  validateGrade,
  validateLandingStatus,
  validateLeadData,
  validateStage,
} from "../services/leads/validation.js";

const ALLOWED = ["externalId", "source", "name", "segment", "city", "location", "address", "score", "grade", "phone", "whatsapp", "email", "instagram", "site", "weakSite", "googleRating", "googleReviews", "followers", "problem", "offer", "approach", "nextAction", "reason", "mapsLink", "bio", "stage", "notes", "proposalValue", "landingStatus", "followUpAt"];
const PRESERVE_WHEN_EMPTY = ["phone", "whatsapp", "email", "instagram", "site", "address", "mapsLink", "googleRating", "googleReviews", "bio"];
const SUPABASE_COLUMNS = {
  externalId: "external_id",
  source: "source",
  name: "name",
  segment: "segment",
  city: "city",
  location: "location",
  address: "address",
  score: "score",
  grade: "grade",
  phone: "phone",
  whatsapp: "whatsapp",
  email: "email",
  instagram: "instagram",
  site: "site",
  weakSite: "weak_site",
  googleRating: "google_rating",
  googleReviews: "google_reviews",
  followers: "followers",
  problem: "problem",
  offer: "offer",
  approach: "approach",
  nextAction: "next_action",
  reason: "reason",
  mapsLink: "maps_link",
  bio: "bio",
  stage: "stage",
  notes: "notes",
  proposalValue: "proposal_value",
  landingStatus: "landing_status",
  followUpAt: "follow_up_at",
};

function pickLeadData(o, isPatch = false) {
  const d = {};
  for (const k of ALLOWED) {
    if (!(k in o)) continue;
    let v = o[k];
    if (k === "weakSite") v = normalizeBoolean(v, true);
    else if (k === "score") v = normalizeInteger(v, { field: "Score", min: 0, max: 100 });
    else if (k === "proposalValue") v = normalizeInteger(v, { field: "Valor da proposta", min: 0 });
    else if (k === "followers") v = normalizeInteger(v, { field: "Seguidores", nullable: true, min: 0 });
    d[k] = v;
  }

  if (!isPatch) {
    if (d.externalId == null && o.id) d.externalId = String(o.id);
    if (!d.name) d.name = o.name || "(sem nome)";
    if (d.grade == null) d.grade = o.grade || "D";
    if (d.stage == null) d.stage = "novo";
    if (d.landingStatus == null) d.landingStatus = "none";
    if (d.notes == null) d.notes = "";
    if (d.proposalValue == null) d.proposalValue = 0;
    if (d.score == null) d.score = 0;
    if (d.weakSite == null) d.weakSite = true;
  }

  return validateLeadData(d, { isPatch });
}

function preserveExistingEnrichment(data, existing) {
  const merged = { ...data };
  for (const field of PRESERVE_WHEN_EMPTY) {
    if ((merged[field] === null || merged[field] === undefined || merged[field] === "") && existing[field]) {
      merged[field] = existing[field];
    }
  }
  if (!data.site && existing.site) merged.weakSite = existing.weakSite;
  return merged;
}

function toSupabaseRow(data) {
  const row = {};
  for (const [field, column] of Object.entries(SUPABASE_COLUMNS)) {
    if (field in data) row[column] = data[field];
  }
  return row;
}

function fromSupabaseRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    externalId: row.external_id,
    source: row.source,
    name: row.name,
    segment: row.segment,
    city: row.city,
    location: row.location,
    address: row.address,
    score: Number(row.score || 0),
    grade: row.grade,
    phone: row.phone,
    whatsapp: row.whatsapp,
    email: row.email,
    instagram: row.instagram,
    site: row.site,
    weakSite: Boolean(row.weak_site),
    googleRating: row.google_rating == null ? null : Number(row.google_rating),
    googleReviews: row.google_reviews == null ? null : Number(row.google_reviews),
    followers: row.followers == null ? null : Number(row.followers),
    problem: row.problem,
    offer: row.offer,
    approach: row.approach,
    nextAction: row.next_action,
    reason: row.reason,
    mapsLink: row.maps_link,
    bio: row.bio,
    stage: row.stage,
    notes: row.notes || "",
    proposalValue: Number(row.proposal_value || 0),
    landingStatus: row.landing_status,
    followUpAt: row.follow_up_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listSupabaseLeads() {
  const supabase = getSupabaseAdmin();
  const pageSize = 1000;
  const rows = [];

  for (let start = 0; ; start += pageSize) {
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .order("score", { ascending: false })
      .order("created_at", { ascending: false })
      .range(start, start + pageSize - 1);
    throwSupabaseError(error, "Não foi possível listar os leads");
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }

  return rows.map(fromSupabaseRow);
}

async function updateSupabaseLead(id, patch) {
  const { data, error } = await getSupabaseAdmin()
    .from("leads")
    .update(toSupabaseRow(patch))
    .eq("id", id)
    .select("*")
    .single();
  throwSupabaseError(error, "Não foi possível atualizar o lead");
  return fromSupabaseRow(data);
}

export async function listLeads() {
  if (isSupabaseConfigured()) return listSupabaseLeads();
  return prisma.lead.findMany({ orderBy: [{ score: "desc" }, { createdAt: "desc" }] });
}

export async function getLead(id) {
  if (!isSupabaseConfigured()) return prisma.lead.findUnique({ where: { id } });
  const { data, error } = await getSupabaseAdmin().from("leads").select("*").eq("id", id).maybeSingle();
  throwSupabaseError(error, "Não foi possível carregar o lead");
  return fromSupabaseRow(data);
}

export async function createLead(data) {
  const prepared = pickLeadData(data, false);
  if (!isSupabaseConfigured()) return prisma.lead.create({ data: prepared });
  const { data: created, error } = await getSupabaseAdmin()
    .from("leads")
    .insert(toSupabaseRow(prepared))
    .select("*")
    .single();
  throwSupabaseError(error, "Não foi possível criar o lead");
  return fromSupabaseRow(created);
}

export async function updateLead(id, patch) {
  const prepared = pickLeadData(patch, true);
  if (!isSupabaseConfigured()) return prisma.lead.update({ where: { id }, data: prepared });
  return updateSupabaseLead(id, prepared);
}

export async function deleteLead(id) {
  if (!isSupabaseConfigured()) return prisma.lead.delete({ where: { id } });
  const { data, error } = await getSupabaseAdmin().from("leads").delete().eq("id", id).select("*").single();
  throwSupabaseError(error, "Não foi possível excluir o lead");
  return fromSupabaseRow(data);
}

export async function deleteLeads(ids) {
  if (!Array.isArray(ids)) throw new Error("A exclusão em massa deve receber uma lista de leads.");

  const uniqueIds = [...new Set(ids
    .filter(id => typeof id === "string")
    .map(id => id.trim())
    .filter(Boolean))];

  if (!uniqueIds.length) return { count: 0 };
  if (!isSupabaseConfigured()) return prisma.lead.deleteMany({ where: { id: { in: uniqueIds } } });

  const { count, error } = await getSupabaseAdmin()
    .from("leads")
    .delete({ count: "exact" })
    .in("id", uniqueIds);
  throwSupabaseError(error, "Não foi possível excluir os leads selecionados");
  return { count: count || 0 };
}

export async function clearAll() {
  if (!isSupabaseConfigured()) return prisma.lead.deleteMany({});
  const { count, error } = await getSupabaseAdmin()
    .from("leads")
    .delete({ count: "exact" })
    .neq("id", "");
  throwSupabaseError(error, "Não foi possível limpar os leads");
  return { count: count || 0 };
}

export async function moveStage(id, stage) {
  const value = validateStage(stage);
  if (!isSupabaseConfigured()) return prisma.lead.update({ where: { id }, data: { stage: value } });
  return updateSupabaseLead(id, { stage: value });
}

export async function setLanding(id, landingStatus) {
  const value = validateLandingStatus(landingStatus);
  if (!isSupabaseConfigured()) return prisma.lead.update({ where: { id }, data: { landingStatus: value } });
  return updateSupabaseLead(id, { landingStatus: value });
}

export async function setGrade(id, grade) {
  const value = validateGrade(grade);
  if (!isSupabaseConfigured()) return prisma.lead.update({ where: { id }, data: { grade: value } });
  return updateSupabaseLead(id, { grade: value });
}

export async function setFollowUp(id, followUpAt) {
  const value = normalizeFollowUpDate(followUpAt);
  if (!isSupabaseConfigured()) return prisma.lead.update({ where: { id }, data: { followUpAt: value } });
  return updateSupabaseLead(id, { followUpAt: value });
}

export async function setProposalValue(id, proposalValue) {
  const value = normalizeInteger(proposalValue, { field: "Valor da proposta", min: 0 });
  if (!isSupabaseConfigured()) {
    return prisma.lead.update({ where: { id }, data: { proposalValue: value } });
  }
  return updateSupabaseLead(id, { proposalValue: value });
}

export async function setNotes(id, notes) {
  const value = String(notes || "");
  if (!isSupabaseConfigured()) return prisma.lead.update({ where: { id }, data: { notes: value } });
  return updateSupabaseLead(id, { notes: value });
}

// Importa deduplicando primeiro por externalId e depois por nome + contato.
// Com Supabase, as operações são sequenciais para preservar enriquecimentos já salvos.
export async function importLeads(incoming) {
  if (!Array.isArray(incoming)) throw new Error("A importação deve receber uma lista de leads.");

  if (!isSupabaseConfigured()) {
    return prisma.$transaction(async tx => {
      const existing = await tx.lead.findMany();
      const byKey = new Map(existing.map(l => [keyOf(l), l]));
      const byExternalId = new Map(existing.filter(l => l.externalId).map(l => [l.externalId, l]));
      let added = 0, updated = 0;

      for (const raw of incoming) {
        const data = pickLeadData(raw, false);
        const k = keyOf(data);
        const ex = (data.externalId && byExternalId.get(data.externalId)) || byKey.get(k);

        if (ex) {
          delete data.externalId;
          const merged = preserveExistingEnrichment(data, ex);
          const saved = await tx.lead.update({
            where: { id: ex.id },
            data: {
              ...merged,
              stage: ex.stage,
              notes: ex.notes,
              proposalValue: ex.proposalValue,
              landingStatus: ex.landingStatus,
              followUpAt: ex.followUpAt,
            },
          });
          byKey.set(keyOf(saved), saved);
          if (saved.externalId) byExternalId.set(saved.externalId, saved);
          updated++;
        } else {
          const created = await tx.lead.create({ data });
          byKey.set(keyOf(created), created);
          if (created.externalId) byExternalId.set(created.externalId, created);
          added++;
        }
      }

      const total = await tx.lead.count();
      return { added, updated, total };
    });
  }

  const existing = await listSupabaseLeads();
  const byKey = new Map(existing.map(l => [keyOf(l), l]));
  const byExternalId = new Map(existing.filter(l => l.externalId).map(l => [l.externalId, l]));
  let added = 0, updated = 0;

  for (const raw of incoming) {
    const data = pickLeadData(raw, false);
    const k = keyOf(data);
    const ex = (data.externalId && byExternalId.get(data.externalId)) || byKey.get(k);

    if (ex) {
      delete data.externalId;
      const merged = preserveExistingEnrichment(data, ex);
      const saved = await updateSupabaseLead(ex.id, {
        ...merged,
        stage: ex.stage,
        notes: ex.notes,
        proposalValue: ex.proposalValue,
        landingStatus: ex.landingStatus,
        followUpAt: ex.followUpAt,
      });
      byKey.set(keyOf(saved), saved);
      if (saved.externalId) byExternalId.set(saved.externalId, saved);
      updated++;
    } else {
      const { data: createdRow, error } = await getSupabaseAdmin()
        .from("leads")
        .insert(toSupabaseRow(data))
        .select("*")
        .single();
      throwSupabaseError(error, `Não foi possível importar o lead ${data.name}`);
      const created = fromSupabaseRow(createdRow);
      byKey.set(keyOf(created), created);
      if (created.externalId) byExternalId.set(created.externalId, created);
      added++;
    }
  }

  return { added, updated, total: byKey.size };
}

export async function stats() {
  const leads = await listLeads();
  const today = todayStr();
  const s = {
    total: leads.length,
    byGrade: {},
    bySource: {},
    byStage: {},
    withWhatsapp: 0,
    withPhone: 0,
    withoutContact: 0,
    landingTodo: 0,
    followupDue: 0,
    followupTotal: 0,
    active: 0,
    won: 0,
    lost: 0,
    pipeline: 0,
    closed: 0,
  };
  const ACTIVE = ["contatado", "sem_resposta", "com_resposta", "proposta", "proposta_rejeitada", "negociacao"];
  const PIPE = ["proposta", "proposta_rejeitada", "negociacao"];

  for (const l of leads) {
    s.byGrade[l.grade] = (s.byGrade[l.grade] || 0) + 1;
    s.byStage[l.stage] = (s.byStage[l.stage] || 0) + 1;
    if (l.source) s.bySource[l.source] = (s.bySource[l.source] || 0) + 1;
    if (l.whatsapp) s.withWhatsapp++;
    if (l.phone) s.withPhone++;
    if (!l.whatsapp && !l.phone && !l.email && !l.instagram) s.withoutContact++;
    if (l.landingStatus === "todo") s.landingTodo++;
    if (l.followUpAt) s.followupTotal++;
    if (l.followUpAt && l.followUpAt <= today && l.stage !== "ganho" && l.stage !== "perdido") s.followupDue++;
    if (ACTIVE.includes(l.stage)) s.active++;
    if (l.stage === "perdido") s.lost++;
    if (l.stage === "ganho") { s.won++; s.closed += (l.proposalValue || 0); }
    if (PIPE.includes(l.stage)) s.pipeline += (l.proposalValue || 0);
  }

  return s;
}
