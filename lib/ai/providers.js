/**
 * Configuração de endpoints por provedor de IA.
 * Usado apenas no servidor.
 */
export const AI_PROVIDER_CONFIG = {
  google: {
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    defaultModel: "gemini-2.5-flash"
  },
  openai: {
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-5-mini"
  },
  anthropic: {
    defaultBaseUrl: "https://api.anthropic.com/v1",
    defaultModel: "claude-sonnet"
  },
  openrouter: {
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "openai/gpt-4o-mini"
  },
  other: {
    defaultBaseUrl: "",
    defaultModel: ""
  }
};

export function resolveBaseUrl(settings) {
  if (settings.baseUrl) return settings.baseUrl.replace(/\/+$/, "");
  const config = AI_PROVIDER_CONFIG[settings.provider];
  return config ? config.defaultBaseUrl : "";
}