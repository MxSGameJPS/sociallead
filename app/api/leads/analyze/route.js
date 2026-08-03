import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { readLeads } from "../../../../lib/leads/storage.js";

const SETTINGS_FILE = path.join(process.cwd(), "data", "settings.json");
const LEADS_FILE = path.join(process.cwd(), "data", "leads.json");
const MAX_HTML_LENGTH = 180000;
const MAX_TEXT_PER_SOURCE = 50000;
const MAX_EXTRA_LINKS = 8;
const MIN_USEFUL_TEXT = 180;

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  const leadId = String(body?.leadId || "").trim();
  if (!leadId) return NextResponse.json({ error: "Lead não informado." }, { status: 400 });

  const extraLinks = normalizeLinks(body?.links).slice(0, MAX_EXTRA_LINKS);
  const leads = await readLeads();
  const index = leads.findIndex((lead) => String(lead.id) === leadId);
  if (index < 0) return NextResponse.json({ error: "Lead não encontrado." }, { status: 404 });

  const lead = leads[index];
  const sourceUrls = normalizeLinks([lead.website, ...(lead.analysisLinks || []), ...extraLinks]);
  if (!sourceUrls.length) {
    return NextResponse.json({ error: "Informe ao menos um site ou link público válido para análise." }, { status: 400 });
  }

  let settings;
  try {
    settings = JSON.parse(await fs.readFile(SETTINGS_FILE, "utf-8"));
  } catch {
    return NextResponse.json({ error: "Configure e salve a IA antes de gerar o dossiê." }, { status: 400 });
  }

  const apiKey = settings.apiKey || settings.key || settings.token || "";
  const baseUrl = String(settings.baseUrl || settings.url || "http://localhost:20128/v1").replace(/\/$/, "");
  const temperature = Number(settings.temperature ?? 0.2);
  let model = String(settings.model || "").trim();

  if (!apiKey || !baseUrl) {
    return NextResponse.json({ error: "A configuração da IA está incompleta. Informe a chave e a URL base." }, { status: 400 });
  }

  if (!model) {
    try {
      model = await resolveFirstModel(baseUrl, apiKey);
    } catch (error) {
      return NextResponse.json({ error: `Nenhum modelo foi informado e a detecção automática falhou: ${error.message}` }, { status: 400 });
    }
  }

  const sources = [];
  const failures = [];
  const deterministic = emptyFindings();
  const attempted = new Set();

  for (const url of sourceUrls) {
    await collectSource(url, sources, failures, deterministic, attempted);
  }

  if (lead.website) {
    for (const url of buildLikelyInternalPages(lead.website)) {
      await collectSource(url, sources, failures, deterministic, attempted, true);
    }
  }

  if (!sources.length && !hasDeterministicData(deterministic)) {
    return NextResponse.json({
      error: "Nenhum conteúdo útil pôde ser lido nos links informados.",
      details: failures
    }, { status: 502 });
  }

  const prompt = buildPrompt(lead, sources, failures, deterministic);
  let aiPayload;
  try {
    aiPayload = await requestDossier({ baseUrl, apiKey, model, temperature, prompt });
  } catch (error) {
    return NextResponse.json({ error: `Falha ao consultar a IA: ${error.message}` }, { status: 502 });
  }

  const rawContent = getAssistantContent(aiPayload);
  const parsed = parseDossier(rawContent);
  const dossier = normalizeDossier(parsed || {}, deterministic, lead);
  const semanticScore = getSemanticScore(dossier);
  const hasUsefulDeterministicData = hasDeterministicData(deterministic);

  if (!parsed && !hasUsefulDeterministicData) {
    return NextResponse.json({
      error: "A IA não retornou um dossiê válido.",
      details: stringifyForDebug(rawContent).slice(0, 4000)
    }, { status: 502 });
  }

  const now = new Date().toISOString();
  const registration = chooseRegistration(dossier.registration, deterministic.registrations, lead.registration);
  const leadName = chooseLeadName(dossier, lead);
  const email = chooseBestEmail(dossier.primaryEmail, dossier.emails, deterministic.emails, lead.email);
  const whatsapp = chooseBestWhatsapp(dossier.primaryWhatsapp, dossier.whatsapp, deterministic.whatsapp, lead.whatsapp);
  const phone = chooseBestPhone(dossier.primaryPhone, dossier.phones, deterministic.phones, lead.phone, whatsapp);
  const city = clean(dossier.city) || lead.city || "";
  const state = normalizeState(dossier.state) || lead.state || "";
  const dossierStatus = semanticScore >= 2 ? "COMPLETED" : "PARTIAL";

  const updatedLead = {
    ...lead,
    name: leadName,
    registration,
    council: clean(dossier.council) || lead.council || "",
    email,
    whatsapp,
    phone,
    city,
    state,
    instagram: chooseSocial(dossier.instagram, deterministic.socialLinks, "instagram.com", lead.instagram),
    facebook: chooseSocial(dossier.facebook, deterministic.socialLinks, "facebook.com", lead.facebook),
    linkedin: chooseSocial(dossier.linkedin, deterministic.socialLinks, "linkedin.com", lead.linkedin),
    analysisLinks: sourceUrls,
    dossierStatus,
    registryStatus: registration ? "FOUND_ON_WEBSITE" : "NOT_FOUND",
    contactCompleteness: calculateCompleteness({ name: leadName, email, whatsapp, city, state }),
    dossier: {
      ...(lead.dossier || {}),
      ...dossier,
      deterministicFindings: deterministic,
      analyzedSources: unique(sources.map((source) => source.url)),
      inaccessibleSources: failures,
      semanticScore,
      rawAiPreview: stringifyForDebug(rawContent).slice(0, 2500),
      generatedAt: now,
      modelUsed: model
    },
    dossierGeneratedAt: now,
    lastSeenAt: now
  };

  leads[index] = updatedLead;
  await fs.writeFile(LEADS_FILE, JSON.stringify(leads, null, 2), "utf-8");
  return NextResponse.json({ lead: updatedLead, dossier: updatedLead.dossier });
}

function emptyFindings() {
  return {
    emails: [],
    phones: [],
    whatsapp: [],
    registrations: [],
    socialLinks: [],
    services: [],
    specialties: []
  };
}

async function collectSource(url, sources, failures, deterministic, attempted, optional = false) {
  if (!url || attempted.has(url)) return;
  attempted.add(url);
  try {
    const result = await fetchPublicSource(url);
    mergeFindings(deterministic, result);
    if (result.text.length < MIN_USEFUL_TEXT || isBlockedSocialPage(url, result.text)) {
      if (!optional) failures.push({ url, error: "conteúdo bloqueado, genérico ou insuficiente" });
      return;
    }
    sources.push({ url, text: result.text.slice(0, MAX_TEXT_PER_SOURCE) });
  } catch (error) {
    if (!optional) failures.push({ url, error: error.message });
  }
}

function mergeFindings(target, result) {
  mergeUnique(target.emails, extractEmails(result.raw, result.text));
  mergeUnique(target.phones, extractPhones(result.raw, result.text));
  mergeUnique(target.whatsapp, extractWhatsapp(result.raw));
  mergeUnique(target.registrations, extractRegistrations(result.text));
  mergeUnique(target.socialLinks, extractSocialLinks(result.raw));
  mergeUnique(target.services, extractServices(result.raw, result.text));
  mergeUnique(target.specialties, extractSpecialties(result.text));
}

async function fetchPublicSource(url) {
  const response = await fetch(url, {
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(25000),
    headers: {
      Accept: "text/html,application/xhtml+xml,text/plain",
      "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.7",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36"
    }
  });
  if (!response.ok) throw new Error(`status ${response.status}`);
  const raw = (await response.text()).slice(0, MAX_HTML_LENGTH);
  return { raw, text: htmlToText(raw) };
}

async function requestDossier({ baseUrl, apiKey, model, temperature, prompt }) {
  const commonBody = {
    model,
    temperature: Number.isFinite(temperature) ? temperature : 0.2,
    messages: [
      {
        role: "system",
        content: "Você é um analista de inteligência comercial. Extraia dados somente das fontes fornecidas. Responda apenas com JSON válido, sem markdown. Não invente informações."
      },
      { role: "user", content: prompt }
    ]
  };

  let response = await callChat(baseUrl, apiKey, { ...commonBody, response_format: { type: "json_object" } });
  if (!response.ok && [400, 404, 422].includes(response.status)) response = await callChat(baseUrl, apiKey, commonBody);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || `IA respondeu com status ${response.status}.`);
  return payload;
}

function callChat(baseUrl, apiKey, body) {
  return fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    cache: "no-store",
    signal: AbortSignal.timeout(120000),
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body)
  });
}

function getAssistantContent(payload) {
  const message = payload?.choices?.[0]?.message;
  if (message?.parsed && typeof message.parsed === "object") return message.parsed;
  if (message?.tool_calls?.[0]?.function?.arguments) return message.tool_calls[0].function.arguments;
  if (Array.isArray(message?.content)) {
    return message.content.map((part) => part?.text || part?.content || "").filter(Boolean).join("\n");
  }
  if (message?.content !== undefined) return message.content;
  if (message?.reasoning_content) return message.reasoning_content;
  return payload?.output_text || payload?.response || payload?.result || payload?.data?.content || payload?.data?.output || "";
}

function parseDossier(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const unwrapped = unwrapDossier(value);
    return isDossierLike(unwrapped) ? unwrapped : null;
  }
  const text = stripCodeFence(String(value || ""));
  if (!text) return null;
  for (const candidate of [text, extractFirstJsonObject(text)].filter(Boolean)) {
    try {
      const parsed = unwrapDossier(JSON.parse(candidate));
      if (isDossierLike(parsed)) return parsed;
    } catch {
      // tenta o próximo formato
    }
  }
  return null;
}

function unwrapDossier(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  for (const key of ["dossier", "data", "result", "response", "output"]) {
    const nested = value[key];
    if (nested && typeof nested === "object" && !Array.isArray(nested) && isDossierLike(nested)) return nested;
  }
  return value;
}

function isDossierLike(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return ["leadName", "summary", "services", "specialties", "emails", "phones", "registration", "opportunities", "professionalNames"]
    .some((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function normalizeDossier(value, deterministic, lead) {
  const dossier = value && typeof value === "object" ? value : {};
  const services = unique([...toStringArray(dossier.services), ...deterministic.services, ...toStringArray(lead.dossier?.services)]);
  const specialties = unique([...toStringArray(dossier.specialties), ...deterministic.specialties, ...toStringArray(lead.dossier?.specialties)]);
  const emails = unique([...toStringArray(dossier.emails), ...deterministic.emails]).filter(isValidEmail);
  const phones = unique([...toStringArray(dossier.phones), ...deterministic.phones]).filter(isPlausibleBrazilianPhone);

  return {
    ...dossier,
    leadName: clean(dossier.leadName),
    primaryEmail: isValidEmail(dossier.primaryEmail) ? clean(dossier.primaryEmail) : "",
    primaryWhatsapp: isPlausibleBrazilianPhone(dossier.primaryWhatsapp) ? cleanPhone(dossier.primaryWhatsapp) : "",
    primaryPhone: isPlausibleBrazilianPhone(dossier.primaryPhone) ? cleanPhone(dossier.primaryPhone) : "",
    professionalNames: toStringArray(dossier.professionalNames),
    emails,
    phones,
    teamMembers: toStringArray(dossier.teamMembers),
    opportunities: toStringArray(dossier.opportunities),
    warnings: toStringArray(dossier.warnings),
    services,
    specialties,
    summary: clean(dossier.summary) || buildFallbackSummary(lead, services, specialties),
    confidence: normalizeConfidence(dossier.confidence)
  };
}

function getSemanticScore(dossier) {
  let score = 0;
  if (clean(dossier.summary)) score += 1;
  if (toStringArray(dossier.services).length) score += 1;
  if (toStringArray(dossier.specialties).length) score += 1;
  if (toStringArray(dossier.professionalNames).length || toStringArray(dossier.teamMembers).length) score += 1;
  if (toStringArray(dossier.opportunities).length) score += 1;
  return score;
}

async function resolveFirstModel(baseUrl, apiKey) {
  const response = await fetch(`${baseUrl}/models`, {
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || `endpoint /models respondeu com status ${response.status}`);
  const model = payload?.data?.find((item) => item?.id)?.id || payload?.models?.find((item) => item?.id)?.id || "";
  if (!model) throw new Error("nenhum modelo foi retornado pelo endpoint /models");
  return model;
}

function buildPrompt(lead, sources, failures, deterministic) {
  const sourceText = sources.map((source, index) => `\nFONTE ${index + 1}: ${source.url}\n${source.text}`).join("\n");
  return `Crie um dossiê comercial completo usando somente os dados fornecidos.

OBRIGATÓRIO:
- listar todos os serviços, soluções e áreas de atuação encontrados em títulos, cards, menus e textos;
- identificar contatos reais, ignorando arquivos, placeholders, IDs e números de scripts;
- identificar profissional responsável, equipe e registro profissional somente quando houver evidência;
- apontar oportunidades comerciais reais.

DADOS JÁ CONHECIDOS:
${JSON.stringify({ name: lead.name, businessName: lead.businessName, website: lead.website, phone: lead.phone, city: lead.city, state: lead.state, probableCouncil: lead.council, niche: lead.specialty })}

DADOS EXTRAÍDOS DO HTML:
${JSON.stringify(deterministic)}

FONTES LIDAS:
${sourceText}

FONTES INACESSÍVEIS:
${JSON.stringify(failures)}

Retorne apenas:
{"leadName":"","primaryEmail":"","primaryWhatsapp":"","primaryPhone":"","city":"","state":"","summary":"","professionalNames":[],"council":"","registration":"","registrationEvidence":"","specialties":[],"services":[],"emails":[],"phones":[],"whatsapp":"","instagram":"","facebook":"","linkedin":"","teamMembers":[],"companyName":"","cnpj":"","opportunities":[],"warnings":[],"confidence":0}`;
}

function buildLikelyInternalPages(website) {
  try {
    const base = new URL(website);
    return ["servicos", "solucoes", "areas-de-atuacao", "projetos", "contato", "fale-conosco", "sobre", "quem-somos", "equipe", "profissionais"]
      .map((slug) => new URL(`/${slug}`, base.origin).toString());
  } catch {
    return [];
  }
}

function extractEmails(raw, visibleText) {
  const hrefEmails = [...String(raw).matchAll(/mailto:([^?"'<>\s]+)/gi)].map((match) => decodeURIComponent(match[1]));
  const textEmails = String(visibleText || "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  return unique([...hrefEmails, ...textEmails].map((email) => email.toLowerCase()).filter(isValidEmail));
}

function isValidEmail(value) {
  const email = clean(value).toLowerCase();
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email)) return false;
  if (/\.(?:jpg|jpeg|png|webp|gif|svg|css|js|woff2?|ttf|ico|pdf)$/i.test(email)) return false;
  if (/^(?:seu|teste|exemplo|email|nome)@/i.test(email)) return false;
  if (/@(?:example|teste|exemplo)\./i.test(email)) return false;
  return true;
}

function extractPhones(raw, visibleText) {
  const hrefPhones = [...String(raw).matchAll(/href=["']tel:([^"']+)/gi)].map((match) => cleanPhone(match[1]));
  const formatted = String(visibleText || "").match(/(?:\+?55\s*)?\(?\d{2}\)?\s*(?:9\s*)?\d{4}[-.\s]\d{4}/g) || [];
  return unique([...hrefPhones, ...formatted.map(cleanPhone)].filter(isPlausibleBrazilianPhone));
}

function extractWhatsapp(raw) {
  const matches = [...String(raw).matchAll(/(?:wa\.me\/|api\.whatsapp\.com\/send\?(?:[^"'<>\s]*&)?phone=)(\+?\d{10,13})/gi)]
    .map((match) => cleanPhone(match[1]));
  return unique(matches.filter(isPlausibleBrazilianPhone));
}

function extractRegistrations(text) {
  return unique((String(text).match(/\b(?:OAB|CRM|CRO|CREA|CRP|CRC|CRN|CRF|COREN|CREFITO|CAU)[\s:/.-]*(?:[A-Z]{2}[\s:/.-]*)?\d{3,10}(?:[-/]\d+)?\b/gi) || [])
    .map((value) => value.replace(/\s+/g, " ").trim()));
}

function extractSocialLinks(raw) {
  const candidates = String(raw).match(/https?:\\?\/\\?\/(?:www\.)?(?:instagram|facebook|linkedin)\.com[^"'<>\s\\]*/gi) || [];
  return unique(candidates.map((value) => value.replace(/\\/g, "")).filter(isValidSocialUrl));
}

function isValidSocialUrl(value) {
  try {
    const url = new URL(value);
    if (!/instagram\.com|facebook\.com|linkedin\.com/i.test(url.hostname)) return false;
    if (!url.pathname || url.pathname === "/") return false;
    if (/\.\.\.|\/brand\/|\/login|\/share|\/dialog|\/plugins|instagram\.com\/whatsapp/i.test(url.href)) return false;
    return true;
  } catch {
    return false;
  }
}

function extractServices(raw, text) {
  const html = String(raw || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
  const candidates = [];
  const tags = /<(?:h1|h2|h3|h4|h5|h6|strong|b|article|figcaption)[^>]*>([\s\S]*?)<\/(?:h1|h2|h3|h4|h5|h6|strong|b|article|figcaption)>/gi;
  for (const match of html.matchAll(tags)) {
    const label = cleanLabel(htmlToText(match[1]));
    if (isServiceLabel(label)) candidates.push(label);
  }
  const patterns = [
    /consultoria(?: especializada)?/gi,
    /laudos? t[eé]cnicos?/gi,
    /estudos? de qualidade de energia/gi,
    /projetos? el[eé]tricos?(?: industriais?| comerciais?)?/gi,
    /execu[cç][aã]o de sistemas? el[eé]tricos?/gi,
    /prote[cç][aã]o contra descargas atmosf[eé]ricas/gi,
    /\bSPDA\b/g,
    /manuten[cç][aã]o de m[eé]dia tens[aã]o/gi,
    /cabines? prim[aá]rias?/gi,
    /redes? de m[eé]dia tens[aã]o/gi,
    /energia solar fotovoltaica/gi,
    /efici[eê]ncia energ[eé]tica/gi,
    /projetos?/gi,
    /execu[cç][aã]o de obras?/gi,
    /dire[cç][aã]o t[eé]cnica de obras?/gi,
    /licen[cç]as? do corpo de bombeiros?/gi,
    /legaliza[cç][aã]o de obras?/gi,
    /laudo(?:s)? para reforma/gi
  ];
  for (const pattern of patterns) for (const match of String(text || "").matchAll(pattern)) candidates.push(cleanLabel(match[0]));
  return unique(candidates).slice(0, 50);
}

function extractSpecialties(text) {
  const patterns = [
    /engenharia civil/gi,
    /engenharia estrutural/gi,
    /engenharia el[eé]trica/gi,
    /energia solar(?: fotovoltaica)?/gi,
    /sistemas? el[eé]tricos? industriais?/gi,
    /qualidade de energia/gi,
    /efici[eê]ncia energ[eé]tica/gi,
    /seguran[cç]a contra inc[eê]ndio/gi,
    /arquitetura/gi
  ];
  return unique(patterns.flatMap((pattern) => [...String(text || "").matchAll(pattern)].map((match) => cleanLabel(match[0]))));
}

function isServiceLabel(value) {
  if (!value || value.length < 3 || value.length > 100) return false;
  if (/^(servi[cç]os?|saiba mais|or[cç]amento|contato|in[ií]cio|home|menu)$/i.test(value)) return false;
  return /projeto|obra|engenharia|energia|sistema|dire[cç][aã]o|licen[cç]a|legaliza|laudo|consultoria|manuten[cç][aã]o|execu[cç][aã]o|efici[eê]ncia|cabine|rede|SPDA/i.test(value);
}

function chooseBestEmail(primary, aiEmails, deterministicEmails, previous) {
  const candidates = unique([clean(primary), ...toStringArray(aiEmails), ...deterministicEmails, clean(previous)]).filter(isValidEmail);
  return candidates.find((email) => !/^(?:lgpd|privacidade|dpo|noreply|no-reply)@/i.test(email)) || candidates[0] || "";
}

function chooseBestWhatsapp(primary, fallback, deterministic, previous) {
  const candidates = unique([primary, fallback, ...deterministic, previous].map(cleanPhone)).filter(isPlausibleBrazilianPhone);
  return candidates[0] || "";
}

function chooseBestPhone(primary, aiPhones, deterministicPhones, previous, whatsapp) {
  const candidates = unique([primary, ...toStringArray(aiPhones), ...deterministicPhones, previous].map(cleanPhone)).filter(isPlausibleBrazilianPhone);
  return candidates.find((phone) => phone !== whatsapp) || candidates[0] || "";
}

function chooseRegistration(primary, deterministic, previous) {
  return clean(primary) || firstValue(deterministic) || clean(previous);
}

function chooseLeadName(dossier, lead) {
  return clean(dossier.leadName) || firstValue(dossier.professionalNames) || lead.name || lead.businessName || "";
}

function chooseSocial(primary, candidates, domain, previous) {
  if (isValidSocialUrl(primary)) return primary;
  const found = (candidates || []).find((value) => value.includes(domain) && isValidSocialUrl(value));
  return found || (isValidSocialUrl(previous) ? previous : "");
}

function isPlausibleBrazilianPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  const local = digits.startsWith("55") && digits.length >= 12 ? digits.slice(2) : digits;
  if (![10, 11].includes(local.length)) return false;
  if (/^(\d)\1+$/.test(local)) return false;
  const ddd = Number(local.slice(0, 2));
  if (ddd < 11 || ddd > 99) return false;
  const subscriber = local.slice(2);
  return subscriber.length === 8 || (subscriber.length === 9 && subscriber.startsWith("9"));
}

function normalizeLinks(value) {
  const list = Array.isArray(value) ? value : String(value || "").split(/[\n,]/);
  return unique(list.map(normalizeUrl).filter(Boolean));
}

function normalizeUrl(value) {
  const text = String(value || "").trim();
  if (!text || /\s/.test(text)) return "";
  const candidate = /^https?:\/\//i.test(text) ? text : /^(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:[/:?#].*)?$/i.test(text) ? `https://${text}` : "";
  if (!candidate) return "";
  try {
    const url = new URL(candidate);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    if (!url.hostname.includes(".")) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function extractFirstJsonObject(text) {
  const start = text.indexOf("{");
  if (start < 0) return "";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}" && --depth === 0) return text.slice(start, index + 1);
  }
  return "";
}

function isBlockedSocialPage(url, text) {
  if (!/instagram\.com|facebook\.com/i.test(url)) return false;
  return /faça login|log in|crie uma conta|browser is not supported|conteúdo não está disponível/i.test(text) || text.length < 500;
}

function buildFallbackSummary(lead, services, specialties) {
  const name = lead.businessName || lead.name || "O lead";
  if (services.length) return `${name} oferece ${services.slice(0, 8).join(", ")}.`;
  if (specialties.length) return `${name} atua em ${specialties.slice(0, 6).join(", ")}.`;
  return "Dados públicos coletados, mas a análise semântica ficou incompleta.";
}

function hasDeterministicData(data) {
  return Object.values(data).some((value) => Array.isArray(value) && value.length);
}
function mergeUnique(target, values) {
  for (const value of values) if (value && !target.includes(value)) target.push(value);
}
function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}
function toStringArray(value) {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}
function cleanPhone(value) {
  return String(value || "").replace(/\D/g, "");
}
function cleanLabel(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toLocaleLowerCase("pt-BR").replace(/(^|\s)\S/g, (letter) => letter.toLocaleUpperCase("pt-BR"));
}
function htmlToText(html) {
  return decodeHtmlEntities(String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}
function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}
function stripCodeFence(value) {
  return String(value || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}
function stringifyForDebug(value) {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}
function firstValue(value) {
  return Array.isArray(value) && value.length ? clean(value[0]) : "";
}
function clean(value) {
  return String(value || "").trim();
}
function normalizeState(value) {
  const state = clean(value).toUpperCase();
  return /^[A-Z]{2}$/.test(state) ? state : "";
}
function normalizeConfidence(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 0;
}
function calculateCompleteness({ name, email, whatsapp, city, state }) {
  const fields = [name, email, whatsapp, city, state];
  return Math.round((fields.filter(Boolean).length / fields.length) * 100);
}
