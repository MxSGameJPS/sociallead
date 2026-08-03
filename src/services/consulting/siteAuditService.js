import dns from "node:dns/promises";
import net from "node:net";

const MAX_HTML_BYTES = 1_500_000;
const MAX_REDIRECTS = 4;
const REQUEST_TIMEOUT_MS = 15_000;
const BLOCKED_HOST_SUFFIXES = [".localhost", ".local", ".internal", ".home", ".lan"];
function text(value, max = 500) { return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max); }
export function normalizeWebsiteUrl(value) {
  const raw = text(value, 1200);
  if (!raw) throw new Error("Informe o endereço do site.");
  const parsed = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("O site precisa utilizar HTTP ou HTTPS.");
  if (parsed.username || parsed.password) throw new Error("Endereços com usuário ou senha não são permitidos.");
  parsed.hash = "";
  return parsed;
}
function isPrivateIpv4(address) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b, c] = parts;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true;
  if (a === 198 && (b === 18 || b === 19 || b === 51)) return true;
  if (a === 203 && b === 0 && c === 113) return true;
  return false;
}
function isPrivateIpv6(address) { const n = address.toLowerCase().split("%")[0]; return n === "::" || n === "::1" || n.startsWith("fc") || n.startsWith("fd") || /^fe[89ab]/.test(n) || n.startsWith("2001:db8"); }
function isPrivateAddress(address) { const family = net.isIP(address); return family === 4 ? isPrivateIpv4(address) : family === 6 ? isPrivateIpv6(address) : true; }
export async function assertPublicWebsiteUrl(urlInput) {
  const url = urlInput instanceof URL ? urlInput : normalizeWebsiteUrl(urlInput);
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!hostname || hostname === "localhost" || BLOCKED_HOST_SUFFIXES.some(suffix => hostname.endsWith(suffix))) throw new Error("Este endereço não pode ser analisado por segurança.");
  if (net.isIP(hostname)) {
    if (isPrivateAddress(hostname)) throw new Error("Endereços de rede privada não podem ser analisados.");
    return url;
  }
  const records = await dns.lookup(hostname, { all: true, verbatim: true });
  if (!records.length || records.some(record => isPrivateAddress(record.address))) throw new Error("O domínio não possui um endereço público válido.");
  return url;
}
function decodeHtml(value) { return String(value || "").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code))); }
function stripTags(value, max = 500) { return text(decodeHtml(String(value || "").replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ").replace(/<[^>]*>/g, " ")), max); }
function parseAttributes(tag) {
  const attributes = {};
  const pattern = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let match;
  while ((match = pattern.exec(tag))) attributes[String(match[1] || "").toLowerCase()] = decodeHtml(match[2] ?? match[3] ?? match[4] ?? "");
  return attributes;
}
function findMetaContent(html, target) {
  const wanted = target.toLowerCase();
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const attrs = parseAttributes(tag);
    if (String(attrs.name || attrs.property || "").toLowerCase() === wanted) return text(attrs.content, 500);
  }
  return "";
}
function findLinkHref(html, rel) {
  for (const tag of html.match(/<link\b[^>]*>/gi) || []) {
    const attrs = parseAttributes(tag);
    if (String(attrs.rel || "").toLowerCase().split(/\s+/).includes(rel)) return text(attrs.href, 1000);
  }
  return "";
}
function matchTexts(html, tagName, limit = 12) {
  const results = [];
  const pattern = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "gi");
  let match;
  while ((match = pattern.exec(html)) && results.length < limit) { const value = stripTags(match[1], 220); if (value) results.push(value); }
  return results;
}
function unique(values, limit = 12) { return [...new Set(values.filter(Boolean))].slice(0, limit); }
function clampScore(value) { return Math.max(0, Math.min(100, Math.round(value))); }
function structuredDataTypes(source) {
  const types = [];
  for (const script of (source.match(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) || []).slice(0, 20)) {
    for (const match of script.matchAll(/"@type"\s*:\s*(?:"([^"]+)"|\[([^\]]+)\])/gi)) {
      if (match[1]) types.push(match[1]);
      if (match[2]) types.push(...[...match[2].matchAll(/"([^"]+)"/g)].map(item => item[1]));
    }
  }
  return unique(types, 20);
}
function calculateCategoryScores(data) {
  const seo = clampScore((data.title ? (data.title.length >= 20 && data.title.length <= 65 ? 15 : 9) : 0) + (data.metaDescription ? (data.metaDescription.length >= 70 && data.metaDescription.length <= 170 ? 15 : 9) : 0) + (data.h1Count === 1 ? 15 : data.h1Count > 0 ? 7 : 0) + (data.canonical ? 10 : 0) + (data.hasStructuredData ? 15 : 0) + (data.language ? 5 : 0) + (data.hasOpenGraph ? 10 : 0) + Math.round(Math.min(1, data.imageAltCoverage) * 15));
  const conversion = clampScore((data.hasContactLink ? 20 : 0) + (data.hasWhatsapp ? 20 : 0) + (data.ctas.length ? 20 : 0) + (data.formCount ? 15 : 0) + ((data.hasPhoneLink || data.hasEmailLink) ? 10 : 0) + (data.h1Count === 1 ? 10 : 0) + (data.responseTimeMs <= 4000 ? 5 : 0));
  const mobile = clampScore((data.hasViewport ? 35 : 0) + (data.responseTimeMs <= 2000 ? 25 : data.responseTimeMs <= 4000 ? 15 : 0) + Math.round(Math.min(1, data.imageAltCoverage) * 15) + (data.ctas.length ? 15 : 0) + (data.hasContactLink ? 10 : 0));
  const trust = clampScore((data.https ? 25 : 0) + (data.hasAboutLink ? 15 : 0) + (data.hasPrivacyLink ? 15 : 0) + (data.hasTestimonials ? 15 : 0) + (data.socialLinks.length ? 10 : 0) + (data.hasContactLink ? 10 : 0) + (data.hasStructuredData ? 10 : 0));
  const local = clampScore((data.hasAddress ? 25 : 0) + (data.hasMapsLink ? 20 : 0) + (data.hasPhoneLink ? 20 : 0) + (data.hasWhatsapp ? 15 : 0) + (data.hasLocalBusinessSchema ? 10 : 0) + (data.socialLinks.length ? 5 : 0) + (data.hasContactLink ? 5 : 0));
  return { seo, conversion, mobile, trust, local, overall: clampScore(seo * .25 + conversion * .25 + mobile * .2 + trust * .15 + local * .15) };
}
function buildFindings(data) {
  const positives = [], issues = [];
  if (data.https) positives.push("O site utiliza HTTPS."); else issues.push("O site não utiliza HTTPS na página analisada.");
  if (data.title) positives.push("A página possui título configurado."); else issues.push("A página não possui título identificável.");
  if (data.title && (data.title.length < 20 || data.title.length > 65)) issues.push("O título pode ser ajustado para ficar mais claro nos resultados de busca.");
  if (data.metaDescription) positives.push("Existe descrição para mecanismos de busca."); else issues.push("Não foi encontrada uma meta description.");
  if (data.hasViewport) positives.push("A página declara configuração para dispositivos móveis."); else issues.push("Não foi encontrada a configuração viewport para celulares.");
  if (data.h1Count === 1) positives.push("A página possui um título principal bem definido."); else if (data.h1Count === 0) issues.push("Não foi encontrado um título principal H1."); else issues.push("A página possui vários títulos H1 e pode precisar de melhor hierarquia.");
  if (data.hasContactLink) positives.push("Há formas diretas de contato na página."); else issues.push("Não foi encontrado link direto de telefone, e-mail ou WhatsApp.");
  if (data.hasWhatsapp) positives.push("O site oferece contato por WhatsApp."); else issues.push("Não foi encontrado um botão ou link claro para WhatsApp.");
  if (data.ctas.length) positives.push("Foram identificadas chamadas para ação."); else issues.push("As chamadas para ação não estão claras na página inicial.");
  if (data.hasOpenGraph) positives.push("A página possui dados para compartilhamento em redes sociais."); else issues.push("Não foram encontrados dados Open Graph para compartilhamentos.");
  if (data.hasPrivacyLink) positives.push("Foi identificado acesso à política de privacidade."); else issues.push("Não foi encontrado link visível para política de privacidade.");
  if (data.hasAddress || data.hasMapsLink) positives.push("A página apresenta sinais de presença local."); else issues.push("Endereço ou acesso ao mapa não foram identificados na página analisada.");
  if (data.imageCount > 0 && data.imageAltCoverage < .6) issues.push("Muitas imagens não possuem texto alternativo, prejudicando acessibilidade e SEO.");
  if (!data.canonical) issues.push("Não foi encontrado endereço canônico da página.");
  if (!data.hasStructuredData) issues.push("Não foram encontrados dados estruturados para mecanismos de busca.");
  if (!data.formCount) issues.push("Não foi encontrado formulário de contato ou solicitação.");
  if (data.responseTimeMs > 4000) issues.push("A resposta inicial do site foi lenta durante a análise.");
  return { positives: unique(positives, 14), issues: unique(issues, 16) };
}
export function inspectWebsiteHtml({ html, url, status = 200, responseTimeMs = 0, contentType = "text/html" } = {}) {
  const source = String(html || ""), parsedUrl = normalizeWebsiteUrl(url), titleMatch = source.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i), htmlAttrs = parseAttributes(source.match(/<html\b[^>]*>/i)?.[0] || ""), anchors = [];
  const anchorPattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let anchorMatch;
  while ((anchorMatch = anchorPattern.exec(source)) && anchors.length < 400) { const attrs = parseAttributes(anchorMatch[1]); anchors.push({ href: text(attrs.href, 1200), label: stripTags(anchorMatch[2], 180) }); }
  const pageText = stripTags(source, 250_000), ctaPattern = /(orçamento|orcamento|agendar|comprar|pedir|fale conosco|entre em contato|saiba mais|conheça|conheca|reservar|solicitar|chamar no whatsapp)/i;
  const ctas = unique(anchors.filter(item => ctaPattern.test(item.label)).map(item => item.label), 12), imageTags = source.match(/<img\b[^>]*>/gi) || [], imageAltCount = imageTags.filter(tag => text(parseAttributes(tag).alt, 300)).length;
  const socialLinks = unique(anchors.map(item => item.href).filter(href => /instagram\.com|facebook\.com|linkedin\.com|youtube\.com|tiktok\.com/i.test(href)), 12), hasWhatsapp = anchors.some(item => /wa\.me|api\.whatsapp\.com|whatsapp:/i.test(item.href)), hasPhoneLink = anchors.some(item => /^tel:/i.test(item.href)), hasEmailLink = anchors.some(item => /^mailto:/i.test(item.href));
  const schemaTypes = structuredDataTypes(source);
  const data = {
    url: parsedUrl.toString(), status: Number(status || 0), contentType: text(contentType, 120), responseTimeMs: Math.max(0, Number(responseTimeMs || 0)), https: parsedUrl.protocol === "https:",
    title: titleMatch ? stripTags(titleMatch[1], 180) : "", metaDescription: findMetaContent(source, "description"), hasViewport: Boolean(findMetaContent(source, "viewport")), canonical: findLinkHref(source, "canonical"), language: text(htmlAttrs.lang, 30),
    h1Count: (source.match(/<h1\b/gi) || []).length, h1s: matchTexts(source, "h1", 8), h2s: matchTexts(source, "h2", 12), formCount: (source.match(/<form\b/gi) || []).length,
    imageCount: imageTags.length, imageAltCount, imageAltCoverage: imageTags.length ? imageAltCount / imageTags.length : 1, linkCount: anchors.length,
    hasWhatsapp, hasPhoneLink, hasEmailLink, hasContactLink: hasWhatsapp || hasPhoneLink || hasEmailLink,
    hasMapsLink: anchors.some(item => /google\.[^/]+\/maps|maps\.google\.|maps\.app\.goo\.gl|goo\.gl\/maps|waze\.com/i.test(item.href)),
    hasPrivacyLink: anchors.some(item => /privacidade|privacy|lgpd/i.test(`${item.label} ${item.href}`)), hasAboutLink: anchors.some(item => /sobre|quem somos|nossa história|nossa historia|about/i.test(`${item.label} ${item.href}`)),
    hasTestimonials: /(depoimentos?|avaliações?|avaliacoes?|o que dizem|clientes satisfeitos)/i.test(pageText), hasAddress: /(rua|avenida|av\.|rodovia|estrada|travessa|bairro|cep)\s+[\p{L}\d]/iu.test(pageText) || /\b\d{5}-?\d{3}\b/.test(pageText),
    hasOpenGraph: Boolean(findMetaContent(source, "og:title") || findMetaContent(source, "og:description") || findMetaContent(source, "og:image")), hasFavicon: Boolean(findLinkHref(source, "icon") || findLinkHref(source, "shortcut")),
    hasStructuredData: schemaTypes.length > 0 || /application\/ld\+json|schema\.org/i.test(source), structuredDataTypes: schemaTypes, hasLocalBusinessSchema: schemaTypes.some(type => /localbusiness|organization|restaurant|store|professionalservice|medicalbusiness|legalservice/i.test(type)),
    socialLinks, ctas, wordCount: pageText.split(/\s+/).filter(Boolean).length,
  };
  const categoryScores = calculateCategoryScores(data), findings = buildFindings(data);
  return { ...data, score: categoryScores.overall, categoryScores, ...findings };
}
async function readLimitedText(response) {
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > MAX_HTML_BYTES) throw new Error("A página é grande demais para a análise automática.");
  if (!response.body) return "";
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let received = 0, output = "";
  while (true) { const { done, value } = await reader.read(); if (done) break; received += value.byteLength; if (received > MAX_HTML_BYTES) { await reader.cancel(); throw new Error("A página excedeu o limite de análise."); } output += decoder.decode(value, { stream: true }); }
  return output + decoder.decode();
}
async function fetchPage(startUrl) {
  let current = normalizeWebsiteUrl(startUrl);
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect++) {
    await assertPublicWebsiteUrl(current);
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS), startedAt = Date.now();
    let response;
    try { response = await fetch(current, { redirect: "manual", signal: controller.signal, headers: { "user-agent": "LeadFlowConsultoria/2.0 (+diagnostico de presenca digital)", accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.2" } }); }
    catch (error) { if (error?.name === "AbortError") throw new Error("O site demorou demais para responder."); throw new Error(`Não foi possível acessar o site: ${error.message}`); }
    finally { clearTimeout(timeout); }
    if ([301, 302, 303, 307, 308].includes(response.status)) { const location = response.headers.get("location"); if (!location) throw new Error("O site retornou um redirecionamento inválido."); current = new URL(location, current); continue; }
    if (!response.ok) throw new Error(`O site respondeu com status ${response.status}.`);
    const contentType = response.headers.get("content-type") || "";
    if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) throw new Error("O endereço não retornou uma página HTML.");
    return { html: await readLimitedText(response), url: current.toString(), status: response.status, contentType, responseTimeMs: Date.now() - startedAt };
  }
  throw new Error("O site realizou redirecionamentos demais.");
}
export async function auditWebsite(url) { return inspectWebsiteHtml(await fetchPage(url)); }
