import { loadProviders, newProviderId, saveProviders, toPublicProvider } from "./configStore.js";

const TYPES = new Set(["openai-compatible", "ollama", "custom-rest"]);
const AUTH_TYPES = new Set(["bearer", "x-api-key", "custom-header", "query", "none"]);
function cleanUrl(value) {
  const url = String(value || "").trim();
  if (!url) throw new Error("Informe a URL do provedor.");
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error("URL do provedor inválida."); }
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("A URL deve começar com http:// ou https://.");
  return url.replace(/\/+$/, "");
}
function parseJsonObject(value, fieldName, fallback = {}) {
  if (!value || !String(value).trim()) return fallback;
  try { const parsed = typeof value === "string" ? JSON.parse(value) : value; if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error(); return parsed; }
  catch { throw new Error(`${fieldName} deve conter um objeto JSON válido.`); }
}
function clampNumber(value, fallback, min, max) { const n = Number(value); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback; }
function normalizeProvider(input, existing = null) {
  const type = String(input.type || existing?.type || "openai-compatible");
  if (!TYPES.has(type)) throw new Error("Tipo de provedor de IA inválido.");
  const name = String(input.name || existing?.name || "").trim();
  if (!name) throw new Error("Informe um nome para o provedor.");
  const provider = {
    id: existing?.id || input.id || newProviderId(), name: name.slice(0, 120), type, enabled: input.enabled !== false, isDefault: Boolean(input.isDefault),
    baseUrl: cleanUrl(input.baseUrl || existing?.baseUrl), endpoint: String(input.endpoint ?? existing?.endpoint ?? "").trim(), model: String(input.model ?? existing?.model ?? "").trim(), apiKey: String(input.apiKey || existing?.apiKey || "").trim(),
    temperature: clampNumber(input.temperature ?? existing?.temperature, .4, 0, 2), maxTokens: Math.round(clampNumber(input.maxTokens ?? existing?.maxTokens, 1024, 1, 200000)), timeout: Math.round(clampNumber(input.timeout ?? existing?.timeout, 60000, 1000, 300000)),
    method: String(input.method || existing?.method || "POST").toUpperCase(), authType: String(input.authType || existing?.authType || (type === "ollama" ? "none" : "bearer")), authHeader: String(input.authHeader || existing?.authHeader || "Authorization").trim(), queryKey: String(input.queryKey || existing?.queryKey || "api_key").trim(),
    headersJson: typeof input.headersJson === "string" ? input.headersJson : (input.headersJson ? JSON.stringify(input.headersJson, null, 2) : existing?.headersJson || "{}"), bodyTemplate: typeof input.bodyTemplate === "string" ? input.bodyTemplate : (input.bodyTemplate ? JSON.stringify(input.bodyTemplate, null, 2) : existing?.bodyTemplate || ""), responsePath: String(input.responsePath ?? existing?.responsePath ?? "").trim(),
    createdAt: existing?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  if (!AUTH_TYPES.has(provider.authType)) throw new Error("Tipo de autenticação inválido.");
  if (!["GET", "POST", "PUT", "PATCH"].includes(provider.method)) throw new Error("Método HTTP não permitido.");
  parseJsonObject(provider.headersJson, "Cabeçalhos adicionais");
  if (type === "custom-rest" && provider.bodyTemplate) parseJsonObject(provider.bodyTemplate, "Template do corpo");
  return provider;
}
function getPath(value, path) {
  if (!path) return value;
  const parts = String(path).replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean);
  let current = value;
  for (const part of parts) { if (current == null || !Object.prototype.hasOwnProperty.call(Object(current), part)) return undefined; current = current[part]; }
  return current;
}
function templateValue(value, variables) {
  if (typeof value === "string") {
    const exact = value.match(/^\{\{([a-zA-Z0-9_]+)\}\}$/);
    if (exact && exact[1] in variables) return variables[exact[1]];
    return value.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_, key) => variables[key] == null ? "" : String(variables[key]));
  }
  if (Array.isArray(value)) return value.map(item => templateValue(item, variables));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, templateValue(item, variables)]));
  return value;
}
function normalizeImages(input) {
  if (!Array.isArray(input)) return [];
  return input.map(item => {
    const source = typeof item === "string" ? { dataUrl: item } : (item || {}), dataUrl = String(source.dataUrl || source.url || "").trim();
    if (!/^data:image\/(?:png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=\s]+$/i.test(dataUrl)) return null;
    return { dataUrl: dataUrl.replace(/\s+/g, ""), label: String(source.label || source.kind || "Imagem de referência").slice(0, 180) };
  }).filter(Boolean).slice(0, 8);
}
function normalizeGenerationRequest(input) {
  const request = typeof input === "string" ? { prompt: input } : (input || {}), prompt = String(request.prompt || "").trim();
  if (!prompt) throw new Error("Informe o conteúdo que será enviado para a IA.");
  return { prompt, systemPrompt: String(request.systemPrompt || "").trim(), images: normalizeImages(request.images) };
}
function ensureReadyForGeneration(provider) { if (!provider.enabled) throw new Error("O provedor está desativado."); if (!provider.model && provider.type !== "custom-rest") throw new Error("Escolha um modelo antes de usar este provedor."); }
function authRequest(provider, url, headers) {
  const target = new URL(url);
  if (!provider.apiKey || provider.authType === "none") return target;
  if (provider.authType === "bearer") headers.Authorization = `Bearer ${provider.apiKey}`;
  else if (provider.authType === "x-api-key") headers["x-api-key"] = provider.apiKey;
  else if (provider.authType === "custom-header") headers[provider.authHeader || "Authorization"] = provider.apiKey;
  else if (provider.authType === "query") target.searchParams.set(provider.queryKey || "api_key", provider.apiKey);
  return target;
}
async function requestJson(provider, { url, method = "POST", body }) {
  const headers = { Accept: "application/json", ...parseJsonObject(provider.headersJson, "Cabeçalhos adicionais") };
  if (body !== undefined) headers["Content-Type"] = headers["Content-Type"] || "application/json";
  const target = authRequest(provider, url, headers), controller = new AbortController(), timeout = setTimeout(() => controller.abort(), provider.timeout || 60000), started = Date.now();
  try {
    const response = await fetch(target, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal, cache: "no-store" }), raw = await response.text();
    let parsed;
    try { parsed = raw ? JSON.parse(raw) : {}; } catch { parsed = { raw }; }
    if (!response.ok) { const detail = getPath(parsed, "error.message") || getPath(parsed, "message") || raw.slice(0, 300); throw new Error(`HTTP ${response.status}: ${detail || "falha no provedor"}`); }
    return { data: parsed, status: response.status, elapsedMs: Date.now() - started };
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("A conexão com o provedor excedeu o tempo limite.");
    if (error?.cause?.code === "ECONNREFUSED") throw new Error(`Não foi possível conectar em ${provider.baseUrl}. Confirme se o serviço está em execução.`);
    throw error;
  } finally { clearTimeout(timeout); }
}
function openAIUserContent(request) {
  if (!request.images.length) return request.prompt;
  return [{ type: "text", text: request.prompt }, ...request.images.flatMap(image => [{ type: "text", text: `Imagem de referência: ${image.label}` }, { type: "image_url", image_url: { url: image.dataUrl } }])];
}
async function generateOpenAICompatible(provider, requestInput) {
  const request = normalizeGenerationRequest(requestInput), endpoint = provider.endpoint || "/chat/completions", messages = [];
  if (request.systemPrompt) messages.push({ role: "system", content: request.systemPrompt });
  messages.push({ role: "user", content: openAIUserContent(request) });
  const result = await requestJson(provider, { url: provider.baseUrl + (endpoint.startsWith("/") ? endpoint : "/" + endpoint), body: { model: provider.model, messages, temperature: provider.temperature, max_tokens: provider.maxTokens, stream: false } });
  const output = getPath(result.data, "choices[0].message.content") ?? getPath(result.data, "choices[0].text") ?? getPath(result.data, "output_text");
  if (typeof output !== "string") throw new Error("A resposta não contém texto no formato compatível com OpenAI.");
  return { ...result, text: output.trim() };
}
async function generateOllama(provider, requestInput) {
  const request = normalizeGenerationRequest(requestInput), endpoint = provider.endpoint || "/api/chat", messages = [];
  if (request.systemPrompt) messages.push({ role: "system", content: request.systemPrompt });
  const userMessage = { role: "user", content: request.prompt };
  if (request.images.length) userMessage.images = request.images.map(image => image.dataUrl.split(",", 2)[1]);
  messages.push(userMessage);
  const result = await requestJson(provider, { url: provider.baseUrl + (endpoint.startsWith("/") ? endpoint : "/" + endpoint), body: { model: provider.model, messages, stream: false, options: { temperature: provider.temperature, num_predict: provider.maxTokens } } });
  const output = getPath(result.data, "message.content") ?? getPath(result.data, "response");
  if (typeof output !== "string") throw new Error("A resposta do Ollama não contém texto reconhecível.");
  return { ...result, text: output.trim() };
}
async function generateCustom(provider, requestInput) {
  const request = normalizeGenerationRequest(requestInput), variables = { prompt: request.prompt, systemPrompt: request.systemPrompt, model: provider.model, temperature: provider.temperature, maxTokens: provider.maxTokens, images: request.images, imagesJson: JSON.stringify(request.images) };
  const template = provider.bodyTemplate ? parseJsonObject(provider.bodyTemplate, "Template do corpo") : { model: "{{model}}", prompt: "{{prompt}}", system_prompt: "{{systemPrompt}}", temperature: "{{temperature}}", max_tokens: "{{maxTokens}}", images: "{{images}}" };
  const endpoint = provider.endpoint || "", result = await requestJson(provider, { url: provider.baseUrl + (endpoint ? (endpoint.startsWith("/") ? endpoint : "/" + endpoint) : ""), method: provider.method || "POST", body: provider.method === "GET" ? undefined : templateValue(template, variables) });
  const output = getPath(result.data, provider.responsePath || "choices[0].message.content");
  if (typeof output !== "string") throw new Error(`Não foi encontrado texto no caminho de resposta: ${provider.responsePath || "choices[0].message.content"}.`);
  return { ...result, text: output.trim() };
}
async function generateInternal(provider, request) {
  ensureReadyForGeneration(provider);
  const result = provider.type === "ollama" ? await generateOllama(provider, request) : provider.type === "custom-rest" ? await generateCustom(provider, request) : await generateOpenAICompatible(provider, request);
  return { ...result, providerId: provider.id, providerName: provider.name, model: provider.model || "" };
}
export async function listProvidersPublic() { return (await loadProviders()).map(toPublicProvider); }
export async function getProviderInternal(id) { const provider = (await loadProviders()).find(item => item.id === id); if (!provider) throw new Error("Provedor de IA não encontrado."); return provider; }
export async function getDefaultProviderInternal() { const providers = await loadProviders(), provider = providers.find(item => item.enabled && item.isDefault) || providers.find(item => item.enabled); if (!provider) throw new Error("Nenhum provedor de IA ativo foi configurado. Acesse Configurações → Inteligência Artificial."); return provider; }
export async function upsertProvider(input) {
  const providers = await loadProviders(), index = input.id ? providers.findIndex(item => item.id === input.id) : -1, provider = normalizeProvider(input, index >= 0 ? providers[index] : null);
  if (provider.isDefault) for (const item of providers) item.isDefault = false;
  else if (!providers.some(item => item.enabled && item.isDefault && item.id !== provider.id) && provider.enabled) provider.isDefault = true;
  if (index >= 0) providers[index] = provider; else providers.push(provider);
  await saveProviders(providers); return toPublicProvider(provider);
}
export async function removeProvider(id) { const providers = await loadProviders(), removed = providers.find(item => item.id === id), next = providers.filter(item => item.id !== id); if (!removed) throw new Error("Provedor de IA não encontrado."); if (removed.isDefault) { const replacement = next.find(item => item.enabled); if (replacement) replacement.isDefault = true; } await saveProviders(next); }
export async function testProvider(id) { const result = await generateInternal(await getProviderInternal(id), { systemPrompt: "Você está executando um teste de conexão.", prompt: "Responda somente com a palavra OK." }); return { ok: true, text: result.text.slice(0, 500), status: result.status, elapsedMs: result.elapsedMs, model: result.model }; }
export async function listProviderModels(id) {
  const provider = await getProviderInternal(id);
  if (provider.type === "custom-rest") return [];
  if (provider.type === "ollama") { const result = await requestJson(provider, { url: provider.baseUrl + "/api/tags", method: "GET" }); return Array.isArray(result.data?.models) ? result.data.models.map(item => item.name).filter(Boolean) : []; }
  const result = await requestJson(provider, { url: provider.baseUrl + "/models", method: "GET" });
  return Array.isArray(result.data?.data) ? result.data.data.map(item => item.id).filter(Boolean) : [];
}
export async function generateWithProvider(id, request) { return generateInternal(await getProviderInternal(id), request); }
export async function generateWithDefaultProvider(request) { return generateInternal(await getDefaultProviderInternal(), request); }
