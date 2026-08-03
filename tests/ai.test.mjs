import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const testData = path.resolve(here, "../data/ai-test");
if (existsSync(testData)) rmSync(testData, { recursive: true, force: true });
process.env.LEADFLOW_DATA_DIR = testData;

const {
  generateWithDefaultProvider,
  getDefaultProviderInternal,
  getProviderInternal,
  listProviderModels,
  listProvidersPublic,
  removeProvider,
  upsertProvider,
} = await import("../src/services/ai/providerService.js");
const {
  buildLeadMessagePrompt,
  generateLeadMessage,
} = await import("../src/services/ai/leadMessageService.js");

let pass = 0, fail = 0;
const t = (name, condition) => {
  if (condition) pass++;
  else { fail++; console.error("FAIL:", name); }
};

const originalFetch = global.fetch;
const requests = [];
global.fetch = async (url, options = {}) => {
  const request = {
    url: String(url),
    method: options.method || "GET",
    headers: options.headers || {},
    body: options.body ? JSON.parse(options.body) : null,
  };
  requests.push(request);

  if (request.url.endsWith("/models")) {
    return new Response(JSON.stringify({
      data: [{ id: "auto/reasoning:free" }, { id: "modelo-teste" }],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  return new Response(JSON.stringify({
    choices: [{ message: { content: "Oi! Esta é uma mensagem gerada para teste." } }],
  }), { status: 200, headers: { "Content-Type": "application/json" } });
};

try {
  const created = await upsertProvider({
    name: "OmniRoute local",
    type: "openai-compatible",
    baseUrl: "http://localhost:20128/v1",
    endpoint: "/chat/completions",
    model: "",
    apiKey: "sk-chave-super-secreta",
    enabled: true,
    isDefault: false,
    headersJson: "{}",
  });

  t("cria provedor sem exigir modelo", Boolean(created.id));
  t("primeiro provedor ativo vira padrão", created.isDefault === true);
  t("não devolve apiKey", !("apiKey" in created));
  t("informa chave mascarada", created.apiKeyMasked.includes("••"));

  const models = await listProviderModels(created.id);
  t("consulta modelos no endpoint OpenAI", requests.at(-1).url === "http://localhost:20128/v1/models");
  t("lista modelos do OmniRoute", models.includes("auto/reasoning:free"));
  t("envia Bearer na consulta", requests.at(-1).headers.Authorization === "Bearer sk-chave-super-secreta");

  const publicList = await listProvidersPublic();
  t("lista um provedor", publicList.length === 1);
  t("lista não expõe chave", !("apiKey" in publicList[0]));
  t("marca como padrão", publicList[0].isDefault === true);

  const internal = await getProviderInternal(created.id);
  t("arquivo criptografado preserva chave", internal.apiKey === "sk-chave-super-secreta");

  await upsertProvider({ ...publicList[0], apiKey: "", name: "OmniRoute atualizado", model: "auto/reasoning:free" });
  const updated = await getProviderInternal(created.id);
  t("atualiza nome", updated.name === "OmniRoute atualizado");
  t("campo vazio mantém chave", updated.apiKey === "sk-chave-super-secreta");
  t("salva modelo escolhido", updated.model === "auto/reasoning:free");

  const defaultProvider = await getDefaultProviderInternal();
  t("resolve provedor padrão", defaultProvider.id === created.id);

  const generation = await generateWithDefaultProvider({
    systemPrompt: "Instrução do sistema",
    prompt: "Mensagem do usuário",
  });
  const generationRequest = requests.at(-1);
  t("gera pelo chat completions", generationRequest.url === "http://localhost:20128/v1/chat/completions");
  t("envia modelo escolhido", generationRequest.body.model === "auto/reasoning:free");
  t("envia system e user", generationRequest.body.messages[0].role === "system" && generationRequest.body.messages[1].role === "user");
  t("retorna metadados do provedor", generation.providerName === "OmniRoute atualizado");

  const prompt = buildLeadMessagePrompt({
    kind: "initial",
    lead: { name: "Mercado Silva", segment: "Mercado", city: "Dois Irmãos", problem: "Não possui site próprio" },
    currentMessage: "Mensagem antiga",
  });
  t("prompt contém lead", prompt.prompt.includes("Mercado Silva"));
  t("prompt exige fatos reais", prompt.systemPrompt.includes("Não invente"));

  const callPrompt = buildLeadMessagePrompt({
    kind: "call",
    lead: { name: "Mercado Silva", segment: "Mercado", city: "Dois Irmãos" },
  });
  t("prompt aceita roteiro de ligação", callPrompt.kind === "call");
  t("roteiro de ligação pede perguntas abertas", callPrompt.prompt.includes("perguntas abertas"));

  const leadMessage = await generateLeadMessage({
    kind: "followup",
    lead: { name: "Mercado Silva", segment: "Mercado", city: "Dois Irmãos" },
    currentMessage: "Oi, posso mostrar uma ideia?",
  });
  t("gera mensagem para lead", leadMessage.text.includes("mensagem gerada"));
  t("retorna modelo usado", leadMessage.model === "auto/reasoning:free");
  t("prompt de lead foi enviado", requests.at(-1).body.messages[1].content.includes("Mercado Silva"));

  await removeProvider(created.id);
  t("remove provedor", (await listProvidersPublic()).length === 0);
} finally {
  global.fetch = originalFetch;
  if (existsSync(testData)) rmSync(testData, { recursive: true, force: true });
}

console.log("\n" + pass + " passaram, " + fail + " falharam");
process.exit(fail ? 1 : 0);
