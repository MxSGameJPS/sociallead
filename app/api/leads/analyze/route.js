import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { readLeads } from "../../../../lib/leads/storage.js";

const SETTINGS_FILE = path.join(process.cwd(), "data", "settings.json");
const LEADS_FILE = path.join(process.cwd(), "data", "leads.json");
const MAX_HTML_LENGTH = 160000;
const MAX_TEXT_PER_SOURCE = 42000;
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
    return NextResponse.json({ error: "Informe ao menos um site ou link público para análise." }, { status: 400 });
  }

  let settings;
  try {
    settings = JSON.parse(await fs.readFile(SETTINGS_FILE, "utf-8"));
  } catch {
    return NextResponse.json({ error: "Configure e salve a IA antes de gerar o dossiê." }, { status: 400 });
  }

  const apiKey = settings.apiKey || settings.key || settings.token || "";
  const baseUrl = String(settings.baseUrl || settings.url || "http://localhost:20128/v1").replace(/\/$/, "");
  const temperature = Number(settings.temperature ?? 0.3);
  let model = String(settings.model || "").trim();

  if (!apiKey || !baseUrl) {
    return NextResponse.json({ error: "A configuração da IA está incompleta. Informe a chave e a URL base." }, { status: 400 });
  }

  if (!model) {
    try {
      model = await resolveFirstModel(baseUrl, apiKey);
    } catch (error) {
      return NextResponse.json({ error: `A conexão está configurada, mas nenhum modelo foi informado e não foi possível detectá-lo automaticamente: ${error.message}` }, { status: 400 });
    }
  }

  const sources = [];
  const failures = [];
  const deterministic = {
    emails: [],
    phones: [],
    whatsapp: [],
    registrations: [],
    socialLinks: [],
    services: [],
    specialties: []
  };

  for (const url of sourceUrls) {
    try {
      const result = await fetchPublicSource(url);
      mergeFindings(deterministic, result);

      if (result.text.length < MIN_USEFUL_TEXT || isBlockedSocialPage(url, result.text)) {
        failures.push({ url, error: "conteúdo bloqueado, genérico ou insuficiente para análise" });
        continue;
      }
      sources.push({ url, text: result.text.slice(0, MAX_TEXT_PER_SOURCE) });
    } catch (error) {
      failures.push({ url, error: error.message });
    }
  }

  if (lead.website) {
    const internalUrls = buildLikelyInternalPages(lead.website);
    for (const url of internalUrls) {
      if (sourceUrls.includes(url)) continue;
      try {
        const result = await fetchPublicSource(url);
        mergeFindings(deterministic, result);
        if (result.text.length >= MIN_USEFUL_TEXT) {
          sources.push({ url, text: result.text.slice(0, MAX_TEXT_PER_SOURCE) });
        }
      } catch {
        // páginas internas são tentativas auxiliares
      }
    }
  }

  if (!sources.length && !hasDeterministicData(deterministic)) {
    return NextResponse.json({
      error: "Os links foram recebidos, mas nenhum conteúdo útil pôde ser lido. Instagram e Facebook frequentemente bloqueiam acesso automatizado.",
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
  const parsedDossier = parseDossier(rawContent);
  if (!parsedDossier) {
    return NextResponse.json({
      error: "A IA respondeu, mas não retornou um JSON de dossiê válido.",
      hint: "A resposta real foi incluída em details para diagnóstico.",
      details: stringifyForDebug(rawContent).slice(0, 3000)
    }, { status: 502 });
  }

  const dossier = normalizeDossier(parsedDossier, deterministic, lead);
  const now = new Date().toISOString();
  const registration = clean(dossier.registration) || firstValue(deterministic.registrations) || lead.registration || "";
  const leadName = clean(dossier.leadName) || firstValue(dossier.professionalNames) || lead.name || lead.businessName || "";
  const email = chooseBestEmail(dossier.primaryEmail, dossier.emails, deterministic.emails, lead.email);
  const whatsapp = clean(dossier.primaryWhatsapp) || clean(dossier.whatsapp) || firstValue(deterministic.whatsapp) || lead.whatsapp || "";
  const phone = clean(dossier.primaryPhone) || firstValue(dossier.phones) || chooseBestPhone(deterministic.phones, lead.phone) || "";
  const city = clean(dossier.city) || lead.city || "";
  const state = clean(dossier.state).toUpperCase() || lead.state || "";

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
    instagram: clean(dossier.instagram) || findSocial(deterministic.socialLinks, "instagram.com") || lead.instagram || "",
    facebook: clean(dossier.facebook) || findSocial(deterministic.socialLinks, "facebook.com") || lead.facebook || "",
    linkedin: clean(dossier.linkedin) || findSocial(deterministic.socialLinks, "linkedin.com") || lead.linkedin || "",
    analysisLinks: sourceUrls,
    dossierStatus: "COMPLETED",
    registryStatus: registration ? "FOUND_ON_WEBSITE" : "NOT_FOUND",
    contactCompleteness: calculateCompleteness({ name: leadName, email, whatsapp, city, state }),
    dossier: {
      ...(lead.dossier || {}),
      ...dossier,
      deterministicFindings: deterministic,
      analyzedSources: unique(sources.map((source) => source.url)),
      inaccessibleSources: failures,
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

function mergeFindings(deterministic, result) {
  mergeUnique(deterministic.emails, extractEmails(result.raw));
  mergeUnique(deterministic.phones, extractPhones(result.raw));
  mergeUnique(deterministic.whatsapp, extractWhatsapp(result.raw));
  mergeUnique(deterministic.registrations, extractRegistrations(result.raw));
  mergeUnique(deterministic.socialLinks, extractSocialLinks(result.raw));
  mergeUnique(deterministic.services, extractServices(result.raw, result.text));
  mergeUnique(deterministic.specialties, extractSpecialties(result.text));
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
    temperature: Number.isFinite(temperature) ? temperature : 0.3,
    messages: [
      {
        role: "system",
        content: "Você é um analista de inteligência comercial. Leia todo o conteúdo fornecido, especialmente títulos, serviços, áreas de atuação e contatos. Responda exclusivamente com um objeto JSON válido, sem markdown ou texto adicional. Não invente informações."
      },
      { role: "user", content: prompt }
    ]
  };

  let response = await callChat(baseUrl, apiKey, { ...commonBody, response_format: { type: "json_object" } });
  if (!response.ok && [400, 404, 422].includes(response.status)) {
    response = await callChat(baseUrl, apiKey, commonBody);
  }
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
  if (Array.isArray(message?.content)) {
    return message.content.map((part) => part?.text || part?.content || "").filter(Boolean).join("\n");
  }
  if (message?.content) return message.content;
  if (message?.tool_calls?.[0]?.function?.arguments) return message.tool_calls[0].function.arguments;
  if (message?.reasoning_content) return message.reasoning_content;

  const alternatives = [
    payload?.output_text,
    payload?.response,
    payload?.result,
    payload?.data?.content,
    payload?.data?.output,
    payload?.data?.response,
    payload?.output?.[0]?.content?.[0]?.text
  ];
  return alternatives.find((value) => value !== undefined && value !== null && value !== "") || "";
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
  const keys = [
    "leadName", "primaryEmail", "primaryWhatsapp", "summary", "professionalNames",
    "services", "specialties", "emails", "phones", "registration", "opportunities"
  ];
  return keys.some((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function normalizeDossier(value, deterministic, lead) {
  const dossier = value && typeof value === "object" ? value : {};
  const services = unique([
    ...toStringArray(dossier.services),
    ...toStringArray(deterministic.services),
    ...toStringArray(lead.dossier?.services)
  ]);
  const specialties = unique([
    ...toStringArray(dossier.specialties),
    ...toStringArray(deterministic.specialties),
    ...toStringArray(lead.dossier?.specialties)
  ]);

  return {
    ...dossier,
    leadName: clean(dossier.leadName),
    primaryEmail: clean(dossier.primaryEmail),
    primaryWhatsapp: clean(dossier.primaryWhatsapp),
    primaryPhone: clean(dossier.primaryPhone),
    professionalNames: toStringArray(dossier.professionalNames),
    emails: unique([...toStringArray(dossier.emails), ...deterministic.emails]),
    phones: unique([...toStringArray(dossier.phones), ...deterministic.phones]),
    teamMembers: toStringArray(dossier.teamMembers),
    opportunities: toStringArray(dossier.opportunities),
    warnings: toStringArray(dossier.warnings),
    services,
    specialties,
    summary: clean(dossier.summary) || buildFallbackSummary(lead, services, specialties),
    confidence: normalizeConfidence(dossier.confidence)
  };
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
  const sourceText = sources
    .map((source, index) => `\nFONTE ${index + 1}: ${source.url}\n${source.text}`)
    .join("\n");

  return `Analise todas as fontes públicas e crie ou atualize um dossiê comercial completo.

OBJETIVOS OBRIGATÓRIOS:
1. Identificar nome do responsável ou profissional principal.
2. Identificar e-mail, WhatsApp, telefone, cidade e UF.
3. Localizar registro profissional e conselho, sem inventar.
4. LISTAR TODOS OS SERVIÇOS, SOLUÇÕES E ÁREAS DE ATUAÇÃO visíveis no site. Leia títulos, cards, menus e descrições. Não deixe services vazio quando a fonte contiver uma seção de serviços.
5. Identificar equipe, especialidades e oportunidades comerciais.

DADOS CONHECIDOS:
${JSON.stringify({
    name: lead.name,
    businessName: lead.businessName,
    website: lead.website,
    phone: lead.phone,
    address: lead.formattedAddress,
    city: lead.city,
    state: lead.state,
    probableCouncil: lead.council,
    niche: lead.specialty,
    previousDossier: lead.dossier || null
  })}

EXTRAÇÃO DETERMINÍSTICA DO HTML — valide e aproveite estes dados:
${JSON.stringify(deterministic)}

FONTES LIDAS:
${sourceText}

FONTES BLOQUEADAS OU INACESSÍVEIS:
${JSON.stringify(failures)}

Retorne SOMENTE JSON válido neste formato:
{"leadName":"","primaryEmail":"","primaryWhatsapp":"","primaryPhone":"","city":"","state":"","summary":"","professionalNames":[],"council":"","registration":"","registrationEvidence":"","specialties":[],"services":[],"emails":[],"phones":[],"whatsapp":"","instagram":"","facebook":"","linkedin":"","teamMembers":[],"companyName":"","cnpj":"","opportunities":[],"warnings":[],"confidence":0}

Não invente informações. Em services, use nomes claros e individuais, por exemplo: "Projetos", "Execução de obras", "Direção técnica de obras".`;
}

function buildLikelyInternalPages(website) {
  try {
    const base = new URL(website);
    return [
      "servicos", "serviços", "solucoes", "soluções", "areas-de-atuacao", "projetos",
      "contato", "fale-conosco", "sobre", "quem-somos", "equipe", "profissionais", "unidade"
    ].map((slug) => new URL(`/${encodeURI(slug)}`, base.origin).toString());
  } catch {
    return [];
  }
}

function extractEmails(raw) {
  return unique((String(raw).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [])
    .filter((email) => !/example|sentry|wixpress|cloudflare|noreply|no-reply/i.test(email)));
}

function extractPhones(raw) {
  return unique((String(raw).match(/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?9?\d{4}[-.\s]?\d{4}/g) || [])
    .map(cleanPhone)
    .filter(isPlausibleBrazilianPhone));
}

function extractWhatsapp(raw) {
  const text = String(raw);
  const links = [...text.matchAll(/(?:wa\.me\/|api\.whatsapp\.com\/send\?phone=|whatsapp[^\d]{0,40})(\d{10,13})/gi)]
    .map((match) => cleanPhone(match[1]))
    .filter(isPlausibleBrazilianPhone);
  return unique(links);
}

function extractRegistrations(raw) {
  return unique((String(raw).match(/\b(?:OAB|CRM|CRO|CREA|CRP|CRC|CRN|CRF|COREN|CREFITO|CAU)[\s:/.-]*(?:[A-Z]{2}[\s:/.-]*)?\d{3,8}(?:[-/]\d+)?\b/gi) || [])
    .map((value) => value.replace(/\s+/g, " ").trim()));
}

function extractSocialLinks(raw) {
  return unique((String(raw).match(/https?:\\?\/\\?\/(?:www\.)?(?:instagram|facebook|linkedin)\.com[^"'<>\s\\]*/gi) || [])
    .map((value) => value.replace(/\\/g, "")));
}

function extractServices(raw, pageText) {
  const html = String(raw || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
  const candidates = [];
  const tagPattern = /<(?:h1|h2|h3|h4|h5|h6|strong|b|article|figcaption)[^>]*>([\s\S]*?)<\/(?:h1|h2|h3|h4|h5|h6|strong|b|article|figcaption)>/gi;
  for (const match of html.matchAll(tagPattern)) {
    const value = cleanLabel(htmlToText(match[1]));
    if (isServiceLabel(value)) candidates.push(value);
  }

  const knownPatterns = [
    /projetos?/gi,
    /execu[cç][aã]o de obras?/gi,
    /dire[cç][aã]o t[eé]cnica de obras?/gi,
    /licen[cç]as? do corpo de bombeiros?/gi,
    /legaliza[cç][aã]o de obras?/gi,
    /laudo(?:s)? para reforma/gi,
    /regulariza[cç][aã]o de obras?/gi,
    /consultoria(?:s)?(?: em engenharia)?/gi,
    /engenharia civil/gi,
    /projeto(?:s)? estrutural(?:is)?/gi,
    /projeto(?:s)? el[eé]trico(?:s)?/gi,
    /projeto(?:s)? hidr[aá]ulico(?:s)?/gi,
    /preven[cç][aã]o contra inc[eê]ndio/gi
  ];
  const text = String(pageText || "");
  for (const pattern of knownPatterns) {
    for (const match of text.matchAll(pattern)) candidates.push(cleanLabel(match[0]));
  }
  return unique(candidates).slice(0, 40);
}

function extractSpecialties(pageText) {
  const text = String(pageText || "");
  const patterns = [
    /engenharia civil/gi,
    /engenharia estrutural/gi,
    /engenharia el[eé]trica/gi,
    /engenharia hidr[aá]ulica/gi,
    /seguran[cç]a contra inc[eê]ndio/gi,
    /dire[cç][aã]o t[eé]cnica/gi,
    /gest[aã]o de obras/gi,
    /arquitetura/gi
  ];
  return unique(patterns.flatMap((pattern) => [...text.matchAll(pattern)].map((match) => cleanLabel(match[0]))));
}

function isServiceLabel(value) {
  if (!value || value.length < 3 || value.length > 90) return false;
  if (/^(servi[cç]os?|saiba mais|or[cç]amento|contato|in[ií]cio|home|menu)$/i.test(value)) return false;
  return /projeto|obra|engenharia|dire[cç][aã]o|licen[cç]a|legaliza|laudo|consultoria|regulariza|reforma|inspe[cç][aã]o|execu[cç][aã]o|vistoria|assessoria/i.test(value);
}

function cleanLabel(value) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  return normalized
    .toLocaleLowerCase("pt-BR")
    .replace(/(^|\s)\S/g, (letter) => letter.toLocaleUpperCase("pt-BR"));
}

function isBlockedSocialPage(url, text) {
  if (!/instagram\.com|facebook\.com/i.test(url)) return false;
  return /faça login|log in|crie uma conta|browser is not supported|conteúdo não está disponível/i.test(text) || text.length < 500;
}

function chooseBestEmail(primary, aiEmails, deterministicEmails, previous) {
  const candidates = unique([
    clean(primary),
    ...toStringArray(aiEmails),
    ...toStringArray(deterministicEmails),
    clean(previous)
  ]);
  return candidates.find((email) => !/^lgpd@|^privacidade@|^noreply@|^no-reply@/i.test(email)) || candidates[0] || "";
}

function chooseBestPhone(phones, previous) {
  const candidates = unique([...toStringArray(phones), clean(previous)]).filter(isPlausibleBrazilianPhone);
  return candidates[0] || "";
}

function isPlausibleBrazilianPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  const local = digits.startsWith("55") && digits.length > 11 ? digits.slice(2) : digits;
  if (![10, 11].includes(local.length)) return false;
  if (/^(\d)\1+$/.test(local)) return false;
  const ddd = Number(local.slice(0, 2));
  return ddd >= 11 && ddd <= 99;
}

function buildFallbackSummary(lead, services, specialties) {
  const name = lead.businessName || lead.name || "O lead";
  if (services.length) return `${name} oferece ${services.slice(0, 6).join(", ")}.`;
  if (specialties.length) return `${name} atua em ${specialties.slice(0, 6).join(", ")}.`;
  return "Dossiê concluído com os dados públicos disponíveis.";
}

function normalizeConfidence(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
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
  return String(value || "").replace(/[^\d+]/g, "");
}
function findSocial(values, domain) {
  return (values || []).find((value) => value.includes(domain)) || "";
}
function normalizeLinks(value) {
  const list = Array.isArray(value) ? value : String(value || "").split(/[\n,]/);
  return unique(list.map((item) => normalizeUrl(item)).filter(Boolean));
}
function normalizeUrl(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
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
function calculateCompleteness({ name, email, whatsapp, city, state }) {
  const fields = [name, email, whatsapp, city, state];
  return Math.round((fields.filter(Boolean).length / fields.length) * 100);
}
