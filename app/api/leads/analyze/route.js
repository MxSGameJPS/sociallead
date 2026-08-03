import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { readLeads } from "../../../../lib/leads/storage.js";

const SETTINGS_FILE = path.join(process.cwd(), "data", "settings.json");
const LEADS_FILE = path.join(process.cwd(), "data", "leads.json");
const MAX_HTML_LENGTH = 120000;

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

  const leads = await readLeads();
  const index = leads.findIndex((lead) => String(lead.id) === leadId);
  if (index < 0) {
    return NextResponse.json({ error: "Lead não encontrado." }, { status: 404 });
  }

  const lead = leads[index];
  if (!lead.website) {
    return NextResponse.json(
      { error: "Este lead não possui site para análise." },
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
  const model = settings.model || "";
  const baseUrl = String(settings.baseUrl || settings.url || "http://localhost:20128/v1")
    .replace(/\/$/, "");
  const temperature = Number(settings.temperature ?? 0.3);

  if (!apiKey || !model || !baseUrl) {
    return NextResponse.json(
      { error: "A configuração da IA está incompleta. Informe chave, modelo e URL base." },
      { status: 400 }
    );
  }

  let html = "";
  try {
    const websiteResponse = await fetch(lead.website, {
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "SocialLeadBot/1.0"
      }
    });
    if (!websiteResponse.ok) {
      throw new Error(`Site respondeu com status ${websiteResponse.status}.`);
    }
    html = (await websiteResponse.text()).slice(0, MAX_HTML_LENGTH);
  } catch (error) {
    return NextResponse.json(
      { error: `Não foi possível acessar o site do lead: ${error.message}` },
      { status: 502 }
    );
  }

  const pageText = htmlToText(html);
  const prompt = buildPrompt(lead, pageText);

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
              "Você é um analista de inteligência comercial. Responda somente com JSON válido, sem markdown. Não invente informações."
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
  const updatedLead = {
    ...lead,
    registration: dossier.registration || lead.registration || "",
    council: dossier.council || lead.council || "",
    email: firstValue(dossier.emails) || lead.email || "",
    whatsapp: dossier.whatsapp || lead.whatsapp || "",
    instagram: dossier.instagram || lead.instagram || "",
    facebook: dossier.facebook || lead.facebook || "",
    linkedin: dossier.linkedin || lead.linkedin || "",
    dossierStatus: "COMPLETED",
    registryStatus: dossier.registration ? "FOUND_ON_WEBSITE" : "NOT_FOUND",
    dossier,
    dossierGeneratedAt: now,
    lastSeenAt: now
  };

  leads[index] = updatedLead;
  await fs.writeFile(LEADS_FILE, JSON.stringify(leads, null, 2), "utf-8");

  return NextResponse.json({ lead: updatedLead, dossier });
}

function buildPrompt(lead, pageText) {
  return `Analise o conteúdo público do site deste lead e crie um dossiê comercial.\n\nLEAD:\n${JSON.stringify({
    name: lead.businessName || lead.name,
    website: lead.website,
    phone: lead.phone,
    address: lead.formattedAddress,
    probableCouncil: lead.council,
    niche: lead.specialty
  })}\n\nCONTEÚDO DO SITE:\n${pageText}\n\nRetorne exatamente um objeto JSON com estas chaves:\n{
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
  "confidence": 0
}\nNão invente registro profissional, nomes, CNPJ ou contatos. Use string vazia ou lista vazia quando não encontrar. confidence deve ser de 0 a 1.`;
}

function htmlToText(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60000);
}

function stripCodeFence(value) {
  return String(value || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

function firstValue(value) {
  return Array.isArray(value) && value.length ? String(value[0] || "") : "";
}
