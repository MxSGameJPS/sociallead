import { resolveBaseUrl } from "./providers.js";

const TIMEOUT_MS = 15000;

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Testa a conexão com o provedor de IA usando a chave configurada.
 * Executa apenas no servidor. Nunca retorna a chave.
 * Retorna { ok: boolean, message: string }.
 */
export async function testAIConnection(settings) {
  if (!settings.apiKey) {
    return { ok: false, message: "Nenhuma chave de API configurada." };
  }

  const baseUrl = resolveBaseUrl(settings);
  if (!baseUrl) {
    return {
      ok: false,
      message: "Informe a URL base para este provedor."
    };
  }

  try {
    const { url, options } = buildTestRequest(settings, baseUrl);
    const res = await fetchWithTimeout(url, options);

    if (res.ok || res.status === 200) {
      return { ok: true, message: "Conexão realizada com sucesso." };
    }

    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        message: "Chave de API inválida ou sem permissão."
      };
    }

    return {
      ok: false,
      message: "Não foi possível conectar ao provedor."
    };
  } catch (err) {
    return {
      ok: false,
      message: "Não foi possível conectar ao provedor."
    };
  }
}

function buildTestRequest(settings, baseUrl) {
  const { provider, apiKey } = settings;

  if (provider === "google") {
    return {
      url: `${baseUrl}/models?key=${encodeURIComponent(apiKey)}`,
      options: { method: "GET" }
    };
  }

  if (provider === "anthropic") {
    return {
      url: `${baseUrl}/models`,
      options: {
        method: "GET",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01"
        }
      }
    };
  }

  // openai, openrouter e compatíveis usam Bearer + /models
  return {
    url: `${baseUrl}/models`,
    options: {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`
      }
    }
  };
}