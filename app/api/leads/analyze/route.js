import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { readLeads } from "../../../../lib/leads/storage.js";

const SETTINGS_FILE = path.join(process.cwd(), "data", "settings.json");
const LEADS_FILE = path.join(process.cwd(), "data", "leads.json");
const MAX_HTML_LENGTH = 120000;
const MAX_TEXT_PER_SOURCE = 35000;
const MAX_EXTRA_LINKS = 8;

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  const leadId = String(body?.leadId || "").trim();
  if (!leadId) {
    return NextResponse.json({ error: "Lead não informado." }, { status: 400 });
  }

  const extraLinks = normalizeLinks(body?.links).slice(0, MAX_EXTRA_LINKS);
  const leads = await readLeads();
  const index = leads.findIndex((lead) => String(lead.id) === leadId);
  if (index < 0) {
    return NextResponse.json({ error: "Lead não encontrado." }, { status: 404 });
  }

  const lead = leads[index];
  const sourceUrls = normalizeLinks([lead.website, ...(lead.analysisLinks || []), ...extraLinks]);
  if (!sourceUrls.length) {
    return NextResponse.json(
      { error: "Informe ao menos um site ou link público para análise." },
      { status: 400 }
    );
  }

  let settings;
  try {
    settings = JSON.parse(await fs.readFile(SETTINGS_FILE, "utf-8"));
  } catch {
    return NextResponse.json(
      { error: "Configure e salve a IA antes de gerar o dossiê." },
      { status: 400 }
    );
  }

  const apiKey = settings.apiKey || settings.key || settings.token || "";
  const baseUrl = String(settings.baseUrl || settings.url || "http://localhost:20128/v1")
    .replace(/\/$/, "");
  const temperature = Number(settings.temperature ?? 0.3);
  let model = String(settings.model || "").trim();

  if (!apiKey || !baseUrl) {
    return NextResponse.json(
      { error: "A configuração da IA está incompleta. Informe a chave e a URL base." },
      { status: 400 }
    );
  }

  if (!model) {
    try {
      model = await resolveFirstModel(baseUrl, apiKey);
    } catch (error) {
      return NextResponse.json(
        { error: `A conexão está configurada, mas nenhum modelo foi informado e não foi possível detectá-lo automaticamente: ${error.message}` },
        { status: 400 }
      );
    }
  }

  const sources = [];
  const failures = [];
  for (const url of sourceUrls) {
    try {
      const response = await fetch(url, {
        cache: "no-store",
        redirect: "follow",
        signal: AbortSignal.timeout(25000),
        headers: {
          Accept: "text/html,application/xhtml+xml,text/plain",
          "User-Agent": "Mozilla/5.0 (compatible; SocialLeadBot/1.0; +local-analysis)"
        }
      });
      if (!response.ok) throw new Error(`status ${response.status}`);
      const html = (await response.text()).slice(0, MAX_HTML_LENGTH);
      const text = htmlToText(html).slice(0, MAX_TEXT_PER_SOURCE);
      if (text) sources.push({ url, text });
      else failures.push({ url, error: "conteúdo vazio" });
    } catch (error) {
      failures.push({ url, error: error.message });
    }
  }

  if (!sources.length) {
    return NextResponse.json(
      { error: "Não foi possível acessar nenhum dos links informados.", details: failures },
      { status: 502 }
    );
  }

  const prompt = buildPrompt(lead, sources, failures);
  let aiPayload;
  try {
    const aiResponse = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(120000),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        temperature: Number.isFinite(temperature) ? temperature : 0.3,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Você é um analista de inteligência comercial. Responda somente com JSON válido, sem markdown. Não invente informações e preserve evidências de origem."
          },
          { role: "user", content: prompt }
        ]
      })
    });

    aiPayload = await aiResponse.json().catch(() => ({}));
    if (!aiResponse.ok) {
      throw new Error(aiPayload?.error?.message || `IA respondeu com status ${aiResponse.status}.`);
    }
  } catch (error) {
    return NextResponse.json(
      { error: `Falha ao consultar a IA: ${error.message}` },
      { status: 502 }
    );
  }

  const content = aiPayload?.choices?.[0]?.message?.content || "";
  let dossier;
  try {
    dossier = JSON.parse(stripCodeFence(content));
  } catch {
    return NextResponse.json(
      { error: "A IA respondeu, mas não retornou um JSON de dossiê válido.", details: content.slice(0, 1000) },
      { status: 502 }
    );
  }

  const now = new Date().toISOString();
  const leadName = clean(dossier.leadName) || firstValue(dossier.professionalNames) || lead.name || lead.businessName || "";
  const email = clean(dossier.primaryEmail) || firstValue(dossier.emails) || lead.email || "";
  const whatsapp = clean(dossier.primaryWhatsapp) || clean(dossier.whatsapp) || lead.whatsapp || "";
  const city = clean(dossier.city) || lead.city || "";
  const state = clean(dossier.state).toUpperCase() || lead.state || "";

  const updatedLead = {
    ...lead,
    name: leadName,
    registration: dossier.registration || lead.registration || "",
    council: dossier.council || lead.council || "",
    email,
    whatsapp,
    phone: clean(dossier.primaryPhone) || firstValue(dossier.phones) || lead.phone || "",
    city,
    state,
    instagram: dossier.instagram || lead.instagram || "",
    facebook: dossier.facebook || lead.facebook || "",
    linkedin: dossier.linkedin || lead.linkedin || "",
    analysisLinks: sourceUrls,
    dossierStatus: "COMPLETED",
    registryStatus: dossier.registration ? "FOUND_ON_WEBSITE" : "NOT_FOUND",
    contactCompleteness: calculateCompleteness({ name: leadName, email, whatsapp, city, state }),
    dossier: {
      ...(lead.dossier || {}),
      ...dossier,
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

async function resolveFirstModel(baseUrl, apiKey) {
  const response = await fetch(`${baseUrl}/models`, {
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || `endpoint /models respondeu com status ${response.status}`);
  }
  const model = payload?.data?.find((item) => item?.id)?.id || payload?.models?.find((item) => item?.id)?.id || "";
  if (!model) throw new Error("nenhum modelo foi retornado pelo endpoint /models");
  return model;
}

function buildPrompt(lead, sources, failures) {
  const sourceText = sources
    .map((source, index) => `\nFONTE ${index + 1}: ${source.url}\n${source.text}`)
    .join("\n");

  return `Analise todas as fontes públicas deste lead e crie ou atualize um dossiê comercial.\n\nPRIORIDADE ABSOLUTA: localizar com máxima precisão estes cinco campos:\n1. Nome do lead ou profissional responsável\n2. E-mail principal de contato\n3. WhatsApp principal\n4. Cidade\n5. Estado (UF)\n\nDADOS JÁ CONHECIDOS:\n${JSON.stringify({
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
  })}\n\nFONTES ANALISADAS:${sourceText}\n\nFONTES INACESSÍVEIS:\n${JSON.stringify(failures)}\n\nRetorne exatamente um objeto JSON com estas chaves:\n{
  "leadName": "nome completo do principal profissional ou responsável",
  "primaryEmail": "melhor e-mail de contato",
  "primaryWhatsapp": "WhatsApp com DDD",
  "primaryPhone": "telefone principal",
  "city": "cidade",
  "state": "UF",
  "summary": "resumo objetivo",
  "professionalNames": [],
  "council": "",
  "registration": "",
  "registrationEvidence": "trecho exato onde encontrou ou vazio",
  "specialties": [],
  "services": [],
  "emails": [],
  "phones": [],
  "whatsapp": "",
  "instagram": "",
  "facebook": "",
  "linkedin": "",
  "teamMembers": [],
  "companyName": "",
  "cnpj": "",
  "opportunities": [],
  "warnings": [],
  "evidence": {
    "leadName": { "value": "", "sourceUrl": "", "excerpt": "" },
    "primaryEmail": { "value": "", "sourceUrl": "", "excerpt": "" },
    "primaryWhatsapp": { "value": "", "sourceUrl": "", "excerpt": "" },
    "city": { "value": "", "sourceUrl": "", "excerpt": "" },
    "state": { "value": "", "sourceUrl": "", "excerpt": "" }
  },
  "confidence": 0
}\nNão invente nomes, registros, CNPJ ou contatos. Diferencie telefone comum de WhatsApp apenas quando houver indicação. Prefira contato do profissional/empresa analisada, não de plataformas intermediárias. Use string vazia ou lista vazia quando não encontrar. confidence deve ser de 0 a 1.`;
}

function normalizeLinks(value) {
  const list = Array.isArray(value) ? value : String(value || "").split(/[\n,]/);
  return Array.from(new Set(list.map((item) => normalizeUrl(item)).filter(Boolean)));
}

function normalizeUrl(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function htmlToText(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function stripCodeFence(value) {
  return String(value || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
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
