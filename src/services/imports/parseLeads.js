import { waNorm, autoScore, gradeFromScore } from "../leads/scoring.js";
import { regionFromPhone, cityFromText, UNKNOWN_LOC } from "../leads/location.js";
import { defaultLanding } from "../leads/recommend.js";

export function decodeSmart(buf) {
  let txt = new TextDecoder("utf-8", { fatal: false }).decode(buf);
  if (txt.indexOf("\uFFFD") >= 0) { try { txt = new TextDecoder("windows-1252").decode(buf); } catch (e) {} }
  if (txt.charCodeAt(0) === 0xFEFF) txt = txt.slice(1);
  return txt;
}
export function parseCSV(text) {
  const rows = []; let i = 0, field = "", row = [], q = false;
  while (i < text.length) { const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c; }
    else { if (c === '"') q = true; else if (c === ",") { row.push(field); field = ""; } else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; } else if (c === "\r") {} else field += c; }
    i++; }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}
function pick(o, keys) { for (const k of keys) { for (const ok in o) { if (ok.toLowerCase().trim() === k.toLowerCase()) { const v = o[ok]; if (v != null && String(v).trim() !== "") return String(v).trim(); } } } return null; }
function cleanVal(v) { if (v == null) return null; const s = String(v).trim(); if (!s || /^(não encontrado|nao encontrado|n\/a|none|-)$/i.test(s)) return null; return s; }
export function normalizeRow(o) {
  const name = pick(o, ["Nome da empresa", "nome", "name", "username", "empresa", "cliente"]);
  if (!name) return null;
  const src = pick(o, ["source", "fonte"]) || (pick(o, ["username", "followers", "biography"]) ? "Instagram" : pick(o, ["Nota no Google", "Link direto Google Maps"]) ? "Google Maps" : "Importado");
  const phone = cleanVal(pick(o, ["Telefone", "phone", "phone_number", "celular", "fone"]));
  const whats = cleanVal(pick(o, ["WhatsApp", "whats"]));
  let score = pick(o, ["Pontuação", "Score (0-100)", "score", "pontuacao", "nota"]); score = score != null ? parseInt(String(score).replace(/\D/g, ""), 10) : null; if (isNaN(score)) score = null;
  let grade = pick(o, ["Classificação", "Qualificação", "grade", "classificacao", "qualificacao"]); grade = grade ? grade.trim()[0].toUpperCase() : null; if (grade && !"ABCD".includes(grade)) grade = null;
  const ig = cleanVal(pick(o, ["instagram", "Instagram"])); const user = pick(o, ["username"]);
  let fw = pick(o, ["followers", "seguidores"]); fw = fw != null ? parseInt(String(fw).replace(/\D/g, ""), 10) : null; if (isNaN(fw)) fw = null;
  const site = cleanVal(pick(o, ["Site", "site", "website", "url"]));
  const possui = (pick(o, ["Possui site?"]) || "").toLowerCase(); const qual = (pick(o, ["Qualidade do site"]) || "").toLowerCase();
  const weak = !site || /fora do ar/.test((site || "").toLowerCase()) || /sem|subdom/.test(possui) || /fraca|ruim/.test(qual) || src === "Instagram";
  const bioRaw = cleanVal(pick(o, ["biography", "bio"]));
  const cityCol = cleanVal(pick(o, ["Cidade", "city", "cidade"]));
  const explicitLoc = cleanVal(pick(o, ["location", "localização", "localizacao", "local"]));
  const wa = waNorm(whats || phone);
  const cityGuess = cityCol || cityFromText(bioRaw) || cityFromText(name);
  const location = explicitLoc || cityGuess || regionFromPhone(wa || phone) || UNKNOWN_LOC;
  const l = { id: "imp_" + Math.random().toString(36).slice(2, 11), source: src, name,
    segment: cleanVal(pick(o, ["Segmento", "segment", "segmento", "categoria"])),
    city: cityGuess, location,
    address: cleanVal(pick(o, ["Endereço", "address", "endereco"])),
    phone, whatsapp: wa, email: cleanVal(pick(o, ["email", "e-mail"])),
    instagram: ig ? (/^https?:/.test(ig) ? ig : "https://instagram.com/" + ig.replace(/^@/, "")) : (user ? "https://instagram.com/" + user : null),
    site, weakSite: !!weak, googleRating: cleanVal(pick(o, ["Nota no Google", "rating"])), googleReviews: cleanVal(pick(o, ["Quantidade de avaliações", "reviews", "avaliacoes"])),
    followers: fw, problem: cleanVal(pick(o, ["Principal problema identificado", "Sinais observados", "problema", "sinais"])),
    offer: cleanVal(pick(o, ["Serviço recomendado", "Oferta recomendada", "oferta", "servico"])),
    approach: cleanVal(pick(o, ["Sugestão de abordagem personalizada", "abordagem"])),
    nextAction: cleanVal(pick(o, ["Próxima ação", "proxima acao", "next"])), reason: cleanVal(pick(o, ["Motivo da classificação", "motivo"])),
    mapsLink: cleanVal(pick(o, ["Link direto Google Maps", "maps"])), bio: bioRaw,
    stage: "novo", notes: "", proposalValue: 0 };
  if (l.bio && l.bio.length > 160) l.bio = l.bio.slice(0, 157) + "…";
  if (score == null) score = autoScore(l);
  l.score = score; l.grade = grade || gradeFromScore(score);
  l.landingStatus = defaultLanding(l);
  return l;
}
export function keyOf(l) { return ((l.name || "") + "|" + (l.whatsapp || l.email || l.mapsLink || l.city || "")).toLowerCase().replace(/\s+/g, " ").trim(); }
export function parseLeads(text, fname) {
  let incoming = [];
  if (/\.json$/i.test(fname || "") || text.trim()[0] === "[" || text.trim()[0] === "{") {
    let j = JSON.parse(text); if (!Array.isArray(j)) j = j.leads || [j]; incoming = j.map(normalizeRow).filter(Boolean);
  } else {
    const rows = parseCSV(text); if (rows.length < 2) return []; const head = rows[0];
    incoming = rows.slice(1).filter(r => r.some(c => c && c.trim())).map(r => { const o = {}; head.forEach((h, i) => o[h] = r[i]); return normalizeRow(o); }).filter(Boolean);
  }
  return incoming;
}
export function parseLeadsFromBuffer(buf, fname) { return parseLeads(decodeSmart(buf), fname); }
