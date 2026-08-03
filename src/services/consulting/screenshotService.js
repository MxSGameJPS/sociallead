import { createRequire } from "node:module";
import { assertPublicWebsiteUrl, normalizeWebsiteUrl } from "./siteAuditService.js";
import { saveGeneratedScreenshot } from "./assetStore.js";

const SCREENSHOT_TIMEOUT_MS = 45_000;
const require = createRequire(import.meta.url);

export function resolveChromiumExport(playwrightModule) {
  const chromium = playwrightModule?.chromium
    || playwrightModule?.default?.chromium
    || playwrightModule?.default?.default?.chromium
    || null;
  return chromium && typeof chromium.launch === "function" ? chromium : null;
}

async function loadChromium() {
  let importError = null;
  let requireError = null;

  try {
    const playwright = await import("playwright");
    const chromium = resolveChromiumExport(playwright);
    if (chromium) return chromium;
  } catch (error) {
    importError = error;
  }

  try {
    const playwright = require("playwright");
    const chromium = resolveChromiumExport(playwright);
    if (chromium) return chromium;
  } catch (error) {
    requireError = error;
  }

  const details = [importError?.message, requireError?.message].filter(Boolean).join(" | ");
  throw new Error([
    "O Playwright foi localizado, mas o Chromium não ficou disponível para execução.",
    "Execute npm run install:browser e reinicie completamente o servidor Next.",
    details ? `Detalhe: ${details}` : "O módulo carregado não expôs chromium.launch.",
  ].join(" "));
}

async function createSafeRouter(context) {
  const checkedHosts = new Map();
  await context.route("**/*", async route => {
    const requestUrl = route.request().url();
    let parsed;
    try { parsed = new URL(requestUrl); } catch { return route.abort(); }
    if (["data:", "blob:", "about:"].includes(parsed.protocol)) return route.continue();
    if (!["http:", "https:"].includes(parsed.protocol)) return route.abort();
    const key = parsed.hostname.toLowerCase();
    let validation = checkedHosts.get(key);
    if (!validation) {
      validation = assertPublicWebsiteUrl(parsed).then(() => true).catch(() => false);
      checkedHosts.set(key, validation);
    }
    return (await validation) ? route.continue() : route.abort();
  });
}

async function autoScroll(page) {
  await page.evaluate(async () => {
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    let previousHeight = 0;
    for (let index = 0; index < 18; index += 1) {
      const height = Math.max(document.body?.scrollHeight || 0, document.documentElement?.scrollHeight || 0);
      window.scrollTo(0, Math.min(height, index * Math.max(window.innerHeight * 0.85, 700)));
      await sleep(180);
      if (height === previousHeight && window.scrollY + window.innerHeight >= height - 20) break;
      previousHeight = height;
    }
    window.scrollTo(0, Math.max(document.body?.scrollHeight || 0, document.documentElement?.scrollHeight || 0));
    await sleep(350);
    window.scrollTo(0, 0);
  }).catch(() => {});
}

async function openPage(browser, websiteUrl) {
  const normalized = normalizeWebsiteUrl(websiteUrl);
  await assertPublicWebsiteUrl(normalized);
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
    javaScriptEnabled: true,
    locale: "pt-BR",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36 LeadFlow/4.0",
    ignoreHTTPSErrors: false,
  });
  await createSafeRouter(context);
  const page = await context.newPage();
  const response = await page.goto(normalized.toString(), { waitUntil: "domcontentloaded", timeout: SCREENSHOT_TIMEOUT_MS });
  if (!response) {
    await context.close();
    throw new Error("O site não retornou uma resposta para o navegador.");
  }
  await assertPublicWebsiteUrl(new URL(page.url()));
  try { await page.waitForLoadState("networkidle", { timeout: 10_000 }); } catch {}
  await page.waitForTimeout(1800);
  await autoScroll(page);
  await page.waitForTimeout(700);
  return { context, page };
}

function uniqueText(values, limit = 4000) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const text = String(value || "").replace(/\u0000/g, "").replace(/\s+/g, " ").trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
    if (result.length >= limit) break;
  }
  return result;
}

function deobfuscateContactText(text) {
  return String(text || "")
    .replace(/\s*(?:\[|\(|\{)?\s*(?:at|arroba)\s*(?:\]|\)|\})?\s*/gi, "@")
    .replace(/\s*(?:\[|\(|\{)?\s*(?:dot|ponto)\s*(?:\]|\)|\})?\s*/gi, ".")
    .replace(/&#64;|&commat;/gi, "@")
    .replace(/&#46;|&period;/gi, ".");
}

async function collectFrameSignals(frame) {
  try {
    return await frame.evaluate(() => {
      const values = [];
      const add = value => {
        const text = String(value || "").trim();
        if (text) values.push(text);
      };

      add(document.body?.innerText || "");
      add(document.title || "");
      add(document.documentElement?.getAttribute("lang") || "");

      const attributes = ["href", "src", "content", "title", "alt", "aria-label", "data-email", "data-phone", "data-whatsapp", "data-contact", "value"];
      for (const element of document.querySelectorAll("*")) {
        for (const name of attributes) add(element.getAttribute?.(name));
        if (element.tagName === "SCRIPT" && /application\/(?:ld\+json|json)/i.test(element.type || "")) add(element.textContent || "");
        if (element.shadowRoot) {
          add(element.shadowRoot.textContent || "");
          for (const shadowElement of element.shadowRoot.querySelectorAll("*")) {
            for (const name of attributes) add(shadowElement.getAttribute?.(name));
          }
        }
      }
      return values;
    });
  } catch {
    return [];
  }
}

export async function renderWebsiteContent(websiteUrl) {
  const chromium = await loadChromium();
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (error) {
    throw new Error(`O Chromium do Playwright não pôde ser iniciado. Execute npm run install:browser e reinicie o servidor. Detalhe: ${error.message}`);
  }

  try {
    const { context, page } = await openPage(browser, websiteUrl);
    try {
      const html = await page.content();
      const links = await page.locator("a[href]").evaluateAll(elements => elements.map(element => ({
        href: element.href,
        text: element.textContent || "",
        ariaLabel: element.getAttribute("aria-label") || "",
        title: element.getAttribute("title") || "",
      })).slice(0, 1200)).catch(() => []);

      const frameSignals = [];
      for (const frame of page.frames()) frameSignals.push(...await collectFrameSignals(frame));

      const responseSignals = await page.evaluate(() => {
        const values = [];
        const push = value => {
          const text = String(value || "").trim();
          if (text) values.push(text);
        };
        for (const meta of document.querySelectorAll("meta[content]")) push(meta.content);
        for (const link of document.querySelectorAll("link[href]")) push(link.href);
        for (const element of document.querySelectorAll("[onclick], [data-href], [data-url]")) {
          push(element.getAttribute("onclick"));
          push(element.getAttribute("data-href"));
          push(element.getAttribute("data-url"));
        }
        return values;
      }).catch(() => []);

      const linkSignals = links.flatMap(item => [item.href, item.text, item.ariaLabel, item.title]);
      const allSignals = uniqueText([...frameSignals, ...responseSignals, ...linkSignals], 6000);
      const visibleText = deobfuscateContactText(allSignals.join("\n")).slice(0, 350000);

      return {
        url: page.url(),
        html: `${html}\n<!-- LEADFLOW_RENDERED_SIGNALS\n${visibleText}\n-->`,
        visibleText,
        links,
      };
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

async function captureViewport(browser, leadId, url, config) {
  const context = await browser.newContext({
    viewport: config.viewport,
    deviceScaleFactor: 1,
    isMobile: Boolean(config.isMobile),
    hasTouch: Boolean(config.isMobile),
    userAgent: config.userAgent,
    ignoreHTTPSErrors: false,
  });
  await createSafeRouter(context);
  const page = await context.newPage();
  try {
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: SCREENSHOT_TIMEOUT_MS });
    if (!response) throw new Error("O site não retornou uma resposta para a captura.");
    await assertPublicWebsiteUrl(new URL(page.url()));
    await page.waitForTimeout(1200);
    const buffer = await page.screenshot({ type: "jpeg", quality: 76, fullPage: false });
    return saveGeneratedScreenshot(leadId, { buffer, kind: config.kind, label: config.label });
  } finally {
    await context.close();
  }
}

export async function captureWebsiteScreenshots(leadId, websiteUrl) {
  const normalized = normalizeWebsiteUrl(websiteUrl);
  await assertPublicWebsiteUrl(normalized);
  const chromium = await loadChromium();
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (error) {
    throw new Error(`O Chromium do Playwright não pôde ser iniciado. Execute npm run install:browser e reinicie o servidor. Detalhe: ${error.message}`);
  }

  try {
    const assets = [];
    assets.push(await captureViewport(browser, leadId, normalized.toString(), {
      kind: "site-desktop",
      label: "Captura automática do site — desktop",
      viewport: { width: 1440, height: 1000 },
      isMobile: false,
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36 LeadFlow/1.0",
    }));
    assets.push(await captureViewport(browser, leadId, normalized.toString(), {
      kind: "site-mobile",
      label: "Captura automática do site — celular",
      viewport: { width: 390, height: 844 },
      isMobile: true,
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1 LeadFlow/1.0",
    }));
    return assets;
  } finally {
    await browser.close();
  }
}
