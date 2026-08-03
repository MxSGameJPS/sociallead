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
  const deterministic = { emails: [], phones: [], whatsapp: [], registrations: [], socialLinks: [] };

  for (const url of sourceUrls) {
    try {
      const result = await fetchPublicSource(url);
      mergeUnique(deterministic.emails, extractEmails(result.raw));
      mergeUnique(deterministic.phones, extractPhones(result.raw));
      mergeUnique(deterministic.whatsapp, extractWhatsapp(result.raw));
      mergeUnique(deterministic.registrations, extractRegistrations(result.raw));
      mergeUnique(deterministic.socialLinks, extractSocialLinks(result.raw));

      if (result.text.length < MIN_USEFUL_TEXT || isBlockedSocialPage(url, result.text)) {
        failures.push({ url, error: "conteúdo bloqueado, genérico ou insuficiente para análise" });
        continue;
      }
      sources.push({ url, text: result.text.slice(0, MAX_TEXT_PER_SOURCE) });
    } catch (error) {
      failures.push({ url, error: error.message });
    }
  }

  // Sites próprios normalmente concentram os contatos em páginas internas.
  if (lead.website) {
    const internalUrls = buildLikelyInternalPages(lead.website);
    for (const url of internalUrls) {
      if (sourceUrls.includes(url)) continue;
      try {
        const result = await fetchPublicSource(url);
        mergeUnique(deterministic.emails, extractEmails(result.raw));
        mergeUnique(deterministic.phones, extractPhones(result.raw));
        mergeUnique(deterministic.whatsapp, extractWhatsapp(result.raw));
        mergeUnique(deterministic.registrations, extractRegistrations(result.raw));
        mergeUnique(deterministic.socialLinks, extractSocialLinks(result.raw));
        if (result.text.length >= MIN_USEFUL_TEXT) sources.push({ url, text: result.text.slice(0, MAX_TEXT_PER_SOURCE) });
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
  const dossier = parseDossier(rawContent);
  if (!dossier) {
    return NextResponse.json({
      error: "A IA respondeu, mas não retornou um JSON de dossiê válido.",
      hint: "A resposta real foi incluída em details para diagnóstico.",
      details: stringifyForDebug(rawContent).slice(0, 3000)
    }, { status: 502 });
  }

  const now = new Date().toISOString();
  const registration = clean(dossier.registration) || firstValue(deterministic.registrations) || lead.registration || "";
  const leadName = clean(dossier.leadName) || firstValue(dossier.professionalNames) || lead.name || lead.businessName || "";
  const email = clean(dossier.primaryEmail) || firstValue(dossier.emails) || firstValue(deterministic.emails) || lead.email || "";
  const whatsapp = clean(dossier.primaryWhatsapp) || clean(dossier.whatsapp) || firstValue(deterministic.whatsapp) || lead.whatsapp || "";
  const phone = clean(dossier.primaryPhone) || firstValue(dossier.phones) || firstValue(deterministic.phones) || lead.phone || "";
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
      analyzedSources: sources.map((source) => source.url),
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
      { role: "system", content: "Você é um analista de inteligência comercial. Responda exclusivamente com um objeto JSON válido, sem markdown ou texto adicional. Não invente informações." },
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
    method: "POST", cache: "no-store", signal: AbortSignal.timeout(120000),
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body)
  });
}

function getAssistantContent(payload) {
  const message = payload?.choices?.[0]?.message;
  if (!message) return payload;
  if (message.parsed && typeof message.parsed === "object") return message.parsed;
  if (message.content && typeof message.content === "object") return message.content;
  if (Array.isArray(message.content)) return message.content.map((part) => part?.text || part?.content || "").filter(Boolean).join("\n");
  if (message.tool_calls?.[0]?.function?.arguments) return message.tool_calls[0].function.arguments;
  return message.content || message.reasoning_content || "";
}

function parseDossier(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  const text = stripCodeFence(String(value || ""));
  if (!text) return null;
  for (const candidate of [text, extractFirstJsonObject(text)].filter(Boolean)) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch {}
  }
  return null;
}

function extractFirstJsonObject(text) {
  const start = text.indexOf("{");
  if (start < 0) return "";
  let depth = 0, inString = false, escaped = false;
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
  const response = await fetch(`${baseUrl}/models`, { cache: "no-store", signal: AbortSignal.timeout(20000), headers: { Authorization: `Bearer ${apiKey}` } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || `endpoint /models respondeu com status ${response.status}`);
  const model = payload?.data?.find((item) => item?.id)?.id || payload?.models?.find((item) => item?.id)?.id || "";
  if (!model) throw new Error("nenhum modelo foi retornado pelo endpoint /models");
  return model;
}

function buildPrompt(lead, sources, failures, deterministic) {
  const sourceText = sources.map((source, index) => `\nFONTE ${index + 1}: ${source.url}\n${source.text}`).join("\n");
  return `Analise as fontes públicas e crie/atualize um dossiê comercial. PRIORIDADE: nome do responsável, e-mail, WhatsApp, cidade/UF e registro profissional.\n\nDADOS CONHECIDOS:\n${JSON.stringify({ name: lead.name, businessName: lead.businessName, website: lead.website, phone: lead.phone, address: lead.formattedAddress, city: lead.city, state: lead.state, probableCouncil: lead.council, niche: lead.specialty, previousDossier: lead.dossier || null })}\n\nEXTRAÇÃO DETERMINÍSTICA (use como evidência, sem inventar):\n${JSON.stringify(deterministic)}\n\nFONTES LIDAS:${sourceText}\n\nFONTES BLOQUEADAS/INACESSÍVEIS:\n${JSON.stringify(failures)}\n\nRetorne SOMENTE JSON válido com: {"leadName":"","primaryEmail":"","primaryWhatsapp":"","primaryPhone":"","city":"","state":"","summary":"","professionalNames":[],"council":"","registration":"","registrationEvidence":"","specialties":[],"services":[],"emails":[],"phones":[],"whatsapp":"","instagram":"","facebook":"","linkedin":"","teamMembers":[],"companyName":"","cnpj":"","opportunities":[],"warnings":[],"confidence":0}. Não invente informações.`;
}

function buildLikelyInternalPages(website) {
  try {
    const base = new URL(website);
    return ["contato", "fale-conosco", "sobre", "quem-somos", "equipe", "profissionais", "unidade", "sorocaba-centro"]
      .map((slug) => new URL(`/${slug}`, base.origin).toString());
  } catch { return []; }
}

function extractEmails(raw) {
  return unique((String(raw).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).filter((email) => !/example|sentry|wixpress|cloudflare/i.test(email)));
}
function extractPhones(raw) {
  return unique((String(raw).match(/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?9?\d{4}[-.\s]?\d{4}/g) || []).map(cleanPhone).filter((v) => v.replace(/\D/g, "").length >= 10));
}
function extractWhatsapp(raw) {
  const text = String(raw);
  const links = [...text.matchAll(/(?:wa\.me\/|api\.whatsapp\.com\/send\?phone=|whatsapp[^\d]{0,40})(\d{10,13})/gi)].map((m) => cleanPhone(m[1]));
  return unique(links);
}
function extractRegistrations(raw) {
  return unique((String(raw).match(/\b(?:OAB|CRM|CRO|CREA|CRP|CRC|CRN|CRF|COREN|CREFITO|CAU)[\s:/.-]*(?:[A-Z]{2}[\s:/.-]*)?\d{3,8}(?:[-/]\d+)?\b/gi) || []).map((v) => v.replace(/\s+/g, " ").trim()));
}
function extractSocialLinks(raw) {
  return unique((String(raw).match(/https?:\\?\/\\?\/(?:www\.)?(?:instagram|facebook|linkedin)\.com[^"'<>\s\\]*/gi) || []).map((v) => v.replace(/\\/g, "")));
}
function isBlockedSocialPage(url, text) {
  if (!/instagram\.com|facebook\.com/i.test(url)) return false;
  return /faça login|log in|crie uma conta|browser is not supported|conteúdo não está disponível/i.test(text) || text.length < 500;
}
function hasDeterministicData(data) { return Object.values(data).some((value) => Array.isArray(value) && value.length); }
function mergeUnique(target, values) { for (const value of values) if (value && !target.includes(value)) target.push(value); }
function unique(values) { return Array.from(new Set(values.filter(Boolean))); }
function cleanPhone(value) { return String(value || "").replace(/[^\d+]/g, ""); }
function findSocial(values, domain) { return (values || []).find((value) => value.includes(domain)) || ""; }
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
  } catch { return ""; }
}
function htmlToText(html) {
  return String(html || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<svg[\s\S]*?<\/svg>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/\s+/g, " ").trim();
}
function stripCodeFence(value) { return String(value || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim(); }
function stringifyForDebug(value) { return typeof value === "string" ? value : JSON.stringify(value, null, 2); }
function firstValue(value) { return Array.isArray(value) && value.length ? clean(value[0]) : ""; }
function clean(value) { return String(value || "").trim(); }
function calculateCompleteness({ name, email, whatsapp, city, state }) {
  const fields = [name, email, whatsapp, city, state];
  return Math.round((fields.filter(Boolean).length / fields.length) * 100);
}
