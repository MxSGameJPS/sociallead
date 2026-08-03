import { generateWithDefaultProvider, generateWithProvider } from "../ai/providerService.js";
import { renderWebsiteContent } from "./screenshotService.js";
import { assertPublicWebsiteUrl, normalizeWebsiteUrl } from "./siteAuditService.js";

const REQUEST_TIMEOUT_MS = 15000;
const MAX_HTML_BYTES = 1200000;
const MAX_PAGES = 6;
const INTERNAL_PATH_HINTS = /(contato|contact|sobre|quem-somos|equipe|profissionais|servicos|serviços|atendimento|especialidades|especializacoes|especializações)/i;
const FILE_EMAIL_ENDINGS = /\.(?:png|jpe?g|gif|webp|svg|css|js|woff2?|ttf|ico|pdf)$/i;
const PLACEHOLDER_EMAILS = /^(?:seu|email|teste|exemplo|contato)@(?:email|exemplo|teste)\./i;

function clean(value, max = 1000) {
  return String(value ?? "").replace(/\u0000/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}

function unique(values, limit = 20) {
  return [...new Set(values.filter(Boolean))].slice(0, limit);
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeEmail(value) {
  const email = clean(value, 320).replace(/^mailto:/i, "").split(/[?#]/)[0].toLowerCase();
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email)) return "";
  if (FILE_EMAIL_ENDINGS.test(email) || PLACEHOLDER_EMAILS.test(email)) return "";
  return email;
}

function normalizePhone(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("55") && digits.length >= 12 && digits.length <= 13) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return "";
}

function isMobile(value) {
  const digits = normalizePhone(value);
  const local = digits.startsWith("55") ? digits.slice(2) : digits;
  return /^\d{2}9\d{8}$/.test(local);
}

function extractRegistration(text) {
  const patterns = [
    { council: "OAB", regex: /\bOAB\s*(?:\/|-)?\s*([A-Z]{2})?\s*(?:n[ºo°.]?\s*)?(\d{3,8})\b/gi },
    { council: "CRM", regex: /\bCRM\s*(?:\/|-)?\s*([A-Z]{2})?\s*(?:n[ºo°.]?\s*)?(\d{3,8})\b/gi },
    { council: "CRO", regex: /\bCRO\s*(?:\/|-)?\s*([A-Z]{2})?\s*(?:n[ºo°.]?\s*)?(\d{3,8})\b/gi },
    { council: "CREA", regex: /\bCREA\s*(?:\/|-)?\s*([A-Z]{2})?\s*(?:n[ºo°.]?\s*)?([A-Z0-9.-]{4,20})\b/gi },
    { council: "CAU", regex: /\bCAU\s*(?:\/|-)?\s*([A-Z]{2})?\s*(?:n[ºo°.]?\s*)?([A-Z0-9.-]{4,20})\b/gi },
    { council: "CRC", regex: /\bCRC\s*(?:\/|-)?\s*([A-Z]{2})?\s*(?:n[ºo°.]?\s*)?([A-Z0-9.-]{4,20})\b/gi },
    { council: "CRP", regex: /\bCRP\s*(?:\/|-)?\s*([A-Z]{2}|\d{2})?\s*(?:n[ºo°.]?\s*)?(\d{3,8})\b/gi },
    { council: "COREN", regex: /\bCOREN\s*(?:\/|-)?\s*([A-Z]{2})?\s*(?:n[ºo°.]?\s*)?(\d{3,9})\b/gi },
    { council: "CREFITO", regex: /\bCREFITO\s*(?:\/|-)?\s*(\d{1,2})?\s*(?:n[ºo°.]?\s*)?([A-Z0-9.-]{3,20})\b/gi },
  ];
  for (const item of patterns) {
    const match = item.regex.exec(text);
    if (match) {
      const region = clean(match[1], 8).toUpperCase();
      const number = clean(match[2], 30).toUpperCase();
      return { council: item.council, registration: [region, number].filter(Boolean).join(" ") };
    }
  }
  return { council: "", registration: "" };
}

function inferProfession(text) {
  const candidates = [
    [/(advogada?|escritório de advocacia|direito\b)/i, "Advogada"],
    [/(médica?|medicina|crm\b)/i, "Médica"],
    [/(dentista|odontóloga?|odontologia|cro\b)/i, "Dentista"],
    [/(psicóloga?|psicologia|crp\b)/i, "Psicóloga"],
    [/(engenheira?|engenharia|crea\b)/i, "Engenheira"],
    [/(arquiteta?|arquitetura|cau\b)/i, "Arquiteta"],
    [/(contadora?|contabilidade|crc\b)/i, "Contadora"],
    [/(fisioterapeuta|fisioterapia|crefito\b)/i, "Fisioterapeuta"],
    [/(enfermeira?|enfermagem|coren\b)/i, "Enfermeira"],
    [/(nutricionista|nutrição|nutricao|crn\b)/i, "Nutricionista"],
  ];
  return candidates.find(([pattern]) => pattern.test(text))?.[1] || "";
}

function extractDeterministic(html, pageUrl, suppliedVisibleText = "") {
  const source = String(html || "");
  const visibleText = clean(suppliedVisibleText || stripHtml(source), 250000);
  const emails = [];
  for (const match of source.matchAll(/mailto:([^"'<>\s]+)/gi)) emails.push(normalizeEmail(match[1]));
  for (const match of visibleText.matchAll(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)) emails.push(normalizeEmail(match[0]));

  const whatsapp = [];
  const phones = [];
  for (const match of source.matchAll(/(?:wa\.me\/|api\.whatsapp\.com\/send\?[^"']*phone=|whatsapp:)(\+?\d[\d\s().-]{8,18})/gi)) whatsapp.push(normalizePhone(match[1]));
  for (const match of source.matchAll(/href=["']tel:([^"']+)/gi)) phones.push(normalizePhone(match[1]));
  for (const match of visibleText.matchAll(/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)9?\d{4}[-.\s]?\d{4}/g)) phones.push(normalizePhone(match[0]));

  const links = [];
  for (const match of source.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)) {
    try {
      const url = new URL(match[1], pageUrl);
      if (url.origin === new URL(pageUrl).origin && INTERNAL_PATH_HINTS.test(`${url.pathname}${url.hash}`)) links.push(url.toString());
    } catch {}
  }

  return {
    text: visibleText.slice(0, 50000),
    emails: unique(emails, 12),
    whatsapp: unique(whatsapp, 8),
    phones: unique(phones, 12),
    registrations: [extractRegistration(visibleText)].filter(item => item.registration),
    profession: inferProfession(visibleText),
    links: unique(links, 12),
  };
}

async function fetchHtml(urlInput) {
  const url = await assertPublicWebsiteUrl(normalizeWebsiteUrl(urlInput));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal,
      headers: { "user-agent": "LeadFlow/3.1 (+contact enrichment)", accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const type = response.headers.get("content-type") || "";
    if (!/text\/html|application\/xhtml\+xml/i.test(type)) throw new Error("conteúdo não HTML");
    const declared = Number(response.headers.get("content-length") || 0);
    if (declared > MAX_HTML_BYTES) throw new Error("página muito grande");
    const html = (await response.text()).slice(0, MAX_HTML_BYTES);
    return { html, url: response.url || url.toString() };
  } finally {
    clearTimeout(timeout);
  }
}

function needsBrowserRendering(extracted) {
  return extracted.text.length < 1000 || (!extracted.emails.length && !extracted.registrations.length);
}

async function extractPage(urlInput, allowBrowser = false) {
  const page = await fetchHtml(urlInput);
  let extracted = extractDeterministic(page.html, page.url);
  let rendered = false;

  if (allowBrowser && needsBrowserRendering(extracted)) {
    try {
      const browserPage = await renderWebsiteContent(urlInput);
      const renderedExtraction = extractDeterministic(browserPage.html, browserPage.url, browserPage.visibleText);
      extracted = {
        text: renderedExtraction.text.length > extracted.text.length ? renderedExtraction.text : extracted.text,
        emails: unique([...renderedExtraction.emails, ...extracted.emails], 12),
        whatsapp: unique([...renderedExtraction.whatsapp, ...extracted.whatsapp], 8),
        phones: unique([...renderedExtraction.phones, ...extracted.phones], 12),
        registrations: unique([...renderedExtraction.registrations, ...extracted.registrations].map(item => JSON.stringify(item)), 8).map(item => JSON.parse(item)),
        profession: renderedExtraction.profession || extracted.profession,
        links: unique([...renderedExtraction.links, ...extracted.links], 12),
      };
      page.url = browserPage.url || page.url;
      rendered = true;
    } catch (error) {
      extracted.renderWarning = clean(error.message, 500);
    }
  }

  return { url: page.url, ...extracted, rendered };
}

function parseAiJson(raw) {
  const cleaned = String(raw || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { return null; }
}

function chooseEmail(values) {
  return unique(values.map(normalizeEmail), 20).sort((a, b) => {
    const penalty = value => /^(lgpd|privacidade|privacy|noreply|no-reply|suporte)@/i.test(value) ? 10 : 0;
    return penalty(a) - penalty(b);
  })[0] || "";
}

export async function enrichLeadContacts({ lead = {}, websiteUrl = "", instagramUrl = "", instagramNotes = "", providerId } = {}) {
  const pages = [];
  const errors = [];
  const queued = websiteUrl ? [websiteUrl] : [];
  const visited = new Set();

  while (queued.length && pages.length < MAX_PAGES) {
    const target = queued.shift();
    let normalized;
    try { normalized = normalizeWebsiteUrl(target).toString(); } catch { continue; }
    if (visited.has(normalized)) continue;
    visited.add(normalized);
    try {
      const page = await extractPage(target, pages.length === 0);
      pages.push(page);
      if (page.renderWarning) errors.push({ url: page.url, error: `Renderização dinâmica: ${page.renderWarning}` });
      for (const link of page.links) if (!visited.has(link) && queued.length + pages.length < MAX_PAGES * 2) queued.push(link);
    } catch (error) {
      errors.push({ url: normalized, error: clean(error.message, 300) });
    }
  }

  const deterministicEmails = pages.flatMap(page => page.emails);
  const deterministicWhatsapp = pages.flatMap(page => page.whatsapp);
  const deterministicPhones = pages.flatMap(page => page.phones);
  const deterministicRegistrations = pages.flatMap(page => page.registrations);
  const deterministicProfession = pages.map(page => page.profession).find(Boolean) || "";
  const context = pages.map(page => `FONTE: ${page.url}${page.rendered ? " (conteúdo renderizado no navegador)" : ""}\n${page.text}`).join("\n\n").slice(0, 90000);

  let ai = {};
  let aiMeta = { used: false, providerName: "", model: "", warning: "" };
  if (context || instagramNotes) {
    try {
      const request = {
        systemPrompt: "Você extrai dados profissionais e comerciais de fontes públicas. Use apenas fatos presentes no conteúdo. Não invente. Responda somente JSON válido.",
        prompt: [
          "Localize os dados essenciais do lead e um registro profissional quando houver prova explícita.",
          "Prioridade: nome, profissão, email, whatsapp, cidade e estado. Registro profissional é complementar.",
          "Retorne exatamente este objeto:",
          '{"name":"","profession":"","email":"","whatsapp":"","city":"","state":"","council":"","registration":"","confidence":0,"evidence":[]}',
          "Regras: WhatsApp apenas números com DDI; estado com 2 letras; não use email de imagem/arquivo; não presuma registro; evidence deve conter trechos curtos das fontes.",
          `LEAD ATUAL: ${JSON.stringify({ name: lead.name, profession: lead.segment, email: lead.email, whatsapp: lead.whatsapp, phone: lead.phone, city: lead.city, state: lead.location, address: lead.address })}`,
          `SITE/OUTRAS PÁGINAS:\n${context}`,
          `INSTAGRAM: ${instagramUrl}\nOBSERVAÇÕES: ${clean(instagramNotes, 12000)}`,
        ].join("\n\n"),
      };
      const result = providerId ? await generateWithProvider(String(providerId), request) : await generateWithDefaultProvider(request);
      ai = parseAiJson(result.text) || {};
      aiMeta = { used: true, providerName: result.providerName || "", model: result.model || "", warning: "" };
    } catch (error) {
      aiMeta.warning = clean(error.message, 500);
    }
  }

  const registration = deterministicRegistrations[0] || {};
  const aiWhatsapp = normalizePhone(ai.whatsapp);
  const fallbackMobile = unique([...deterministicWhatsapp, ...deterministicPhones.filter(isMobile)], 10)[0] || "";
  const email = chooseEmail([ai.email, ...deterministicEmails, lead.email]);
  const whatsapp = aiWhatsapp || fallbackMobile || normalizePhone(lead.whatsapp) || (isMobile(lead.phone) ? normalizePhone(lead.phone) : "");
  const phone = unique([...deterministicPhones, normalizePhone(lead.phone)], 10)[0] || "";

  return {
    name: clean(ai.name, 180) || clean(lead.name, 180),
    profession: clean(ai.profession, 180) || deterministicProfession || clean(lead.segment, 180),
    email,
    whatsapp,
    phone,
    city: clean(ai.city, 120) || clean(lead.city, 120),
    state: clean(ai.state, 2).toUpperCase() || clean(lead.location, 120),
    council: clean(ai.council, 30).toUpperCase() || registration.council || "",
    registration: clean(ai.registration, 80).toUpperCase() || registration.registration || "",
    confidence: Math.max(0, Math.min(100, Number.parseInt(ai.confidence || 0, 10) || (email || whatsapp ? 70 : 30))),
    evidence: Array.isArray(ai.evidence) ? ai.evidence.map(item => clean(item, 300)).filter(Boolean).slice(0, 10) : [],
    sources: pages.map(page => page.url),
    inaccessibleSources: errors,
    renderedSources: pages.filter(page => page.rendered).map(page => page.url),
    deterministic: {
      emails: unique(deterministicEmails, 12),
      whatsapp: unique(deterministicWhatsapp, 8),
      phones: unique(deterministicPhones, 12),
      registrations: deterministicRegistrations,
      profession: deterministicProfession,
    },
    ai: aiMeta,
  };
}
