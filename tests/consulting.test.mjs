import { inspectWebsiteHtml } from "../src/services/consulting/siteAuditService.js";
import { buildConsultingDiagnosisPrompt, buildConsultingReportPrompt } from "../src/services/ai/consultingAuditService.js";
import { normalizeConsultingStage } from "../src/services/consulting/stages.js";
import { resolveChromiumExport } from "../src/services/consulting/screenshotService.js";
import { resolveCommercialTrack, trackIncludes } from "../src/services/leads/commercialTrack.js";

let pass = 0;
let fail = 0;
function test(name, condition) {
  if (condition) pass++;
  else { fail++; console.error("FAIL:", name); }
}

const html = `<!doctype html><html lang="pt-BR"><head>
<title>Restaurante Exemplo em Dois Irmãos</title>
<meta name="description" content="Conheça nosso restaurante, cardápio e opções de reservas em Dois Irmãos.">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta property="og:title" content="Restaurante Exemplo">
<link rel="canonical" href="https://exemplo.com.br/"><link rel="icon" href="/favicon.ico">
<script type="application/ld+json">{"@type":"Restaurant"}</script></head><body>
<h1>Restaurante Exemplo</h1><h2>Cardápio e reservas</h2>
<p>Rua Exemplo, 123 - Centro - CEP 93950-000</p>
<a href="https://wa.me/5551999999999">Fale conosco no WhatsApp</a>
<a href="tel:51999999999">Telefone</a><a href="https://maps.google.com/?q=exemplo">Como chegar</a>
<a href="/sobre">Quem somos</a><a href="/privacidade">Política de privacidade</a>
<a href="https://instagram.com/exemplo">Instagram</a><p>Veja os depoimentos de clientes satisfeitos.</p>
<form><input name="nome"></form><img src="foto.jpg" alt="Prato do restaurante"></body></html>`;

const audit = inspectWebsiteHtml({ html, url: "https://exemplo.com.br", status: 200, responseTimeMs: 450, contentType: "text/html" });
test("calcula score geral", audit.score >= 70);
test("gera cinco scores por área", ["seo", "conversion", "mobile", "trust", "local"].every(key => Number.isFinite(audit.categoryScores[key])));
test("identifica presença local", audit.hasAddress && audit.hasMapsLink && audit.hasLocalBusinessSchema);
test("identifica confiança", audit.hasPrivacyLink && audit.hasAboutLink && audit.hasTestimonials);
test("identifica Open Graph", audit.hasOpenGraph === true);

test("nota C entra em consultoria por padrão", resolveCommercialTrack({ grade: "C" }, {}) === "consulting");
test("nota A entra em projetos por padrão", resolveCommercialTrack({ grade: "A" }, {}) === "projects");
test("track manual independe da nota", resolveCommercialTrack({ grade: "D" }, { commercialTrack: "both" }) === "both");
test("both aparece nos dois CRMs", trackIncludes("both", "projects") && trackIncludes("both", "consulting"));
test("migra etapa antiga para kanban simples", normalizeConsultingStage("relatorio_pronto") === "diagnostico" && normalizeConsultingStage("vendido") === "cliente");

const fakeChromium = { launch() {} };
test("aceita chromium como exportação ESM", resolveChromiumExport({ chromium: fakeChromium }) === fakeChromium);
test("aceita chromium dentro do default CommonJS", resolveChromiumExport({ default: { chromium: fakeChromium } }) === fakeChromium);
test("rejeita módulo sem chromium.launch", resolveChromiumExport({ default: {} }) === null);

const diagnosisPrompt = buildConsultingDiagnosisPrompt({
  lead: { name: "Restaurante Exemplo", segment: "Restaurante", grade: "C", score: 35 },
  profile: { name: "Saulo", profession: "Engenheiro de software" },
  websiteAudit: audit,
  instagramUrl: "https://instagram.com/exemplo",
  instagramNotes: "Bio informa endereço, mas não possui chamada clara para reservas.",
  imageLabels: [{ label: "Desktop", kind: "site-desktop" }],
  priceCents: 5000,
});
test("primeira chamada limita ao diagnóstico", diagnosisPrompt.prompt.includes("Não entregue o relatório completo"));
test("primeira chamada informa imagens", diagnosisPrompt.prompt.includes("site-desktop"));
test("prompt inclui preço", diagnosisPrompt.prompt.includes("50,00"));

const reportPrompt = buildConsultingReportPrompt({ lead: { name: "Restaurante Exemplo" }, websiteAudit: audit, diagnosis: { executiveSummary: "Resumo" } });
test("segunda chamada gera relatório separado", reportPrompt.prompt.includes("[[RELATORIO]]") && reportPrompt.prompt.includes("DIAGNÓSTICO DA PRIMEIRA CHAMADA"));

console.log("\n" + pass + " passaram, " + fail + " falharam");
process.exit(fail ? 1 : 0);
