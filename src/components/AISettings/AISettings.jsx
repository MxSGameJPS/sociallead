"use client";

import { useState } from "react";
import * as A from "../../app/actions/ai.js";
import s from "./AISettings.module.css";

const EMPTY = {
  id: "",
  name: "",
  type: "openai-compatible",
  enabled: true,
  isDefault: false,
  baseUrl: "https://api.openai.com/v1",
  endpoint: "/chat/completions",
  model: "",
  apiKey: "",
  temperature: 0.4,
  maxTokens: 1024,
  timeout: 60000,
  method: "POST",
  authType: "bearer",
  authHeader: "Authorization",
  queryKey: "api_key",
  headersJson: "{}",
  bodyTemplate: "",
  responsePath: "",
};

const OMNIROUTE = {
  ...EMPTY,
  name: "OmniRoute local",
  type: "openai-compatible",
  enabled: true,
  isDefault: true,
  baseUrl: "http://localhost:20128/v1",
  endpoint: "/chat/completions",
  model: "",
  authType: "bearer",
  temperature: 0.4,
  maxTokens: 1200,
  timeout: 120000,
};

function editShape(provider) {
  return {
    ...EMPTY,
    ...provider,
    apiKey: "",
    headersJson: provider.headersJson || "{}",
    bodyTemplate: provider.bodyTemplate || "",
  };
}

export default function AISettings({ initialProviders = [], initialError = "" }) {
  const [providers, setProviders] = useState(initialProviders);
  const [form, setForm] = useState({ ...EMPTY });
  const [selectedId, setSelectedId] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState(initialError);
  const [models, setModels] = useState([]);

  const selected = providers.find(item => item.id === selectedId) || null;
  const set = (field, value) => setForm(current => ({ ...current, [field]: value }));

  async function reload(preferId = selectedId) {
    const next = await A.listProvidersAction();
    setProviders(next);
    if (preferId) {
      const item = next.find(provider => provider.id === preferId);
      if (item) {
        setSelectedId(item.id);
        setForm(editShape(item));
      }
    }
    return next;
  }

  function createNew() {
    setSelectedId("");
    setForm({ ...EMPTY });
    setModels([]);
    setMessage("");
  }

  function useOmniRoutePreset() {
    setSelectedId("");
    setForm({ ...OMNIROUTE });
    setModels([]);
    setMessage("Preset do OmniRoute aplicado. Informe a chave local, salve e consulte os modelos disponíveis.");
  }

  function selectProvider(provider) {
    setSelectedId(provider.id);
    setForm(editShape(provider));
    setModels([]);
    setMessage("");
  }

  function changeType(type) {
    const defaults = type === "ollama"
      ? { baseUrl: "http://localhost:11434", endpoint: "/api/chat", authType: "none", model: "" }
      : type === "custom-rest"
        ? { baseUrl: "http://localhost:8000", endpoint: "", authType: "bearer", model: "", responsePath: "choices[0].message.content" }
        : { baseUrl: "https://api.openai.com/v1", endpoint: "/chat/completions", authType: "bearer", model: "" };
    setForm(current => ({ ...current, type, ...defaults }));
    setModels([]);
  }

  async function save({ consultModels = false } = {}) {
    setBusy(consultModels ? "save-models" : "save");
    setMessage("");
    try {
      const saved = await A.saveProviderAction(form);
      await reload(saved.id);

      if (consultModels && saved.type !== "custom-rest") {
        const result = await A.listModelsAction(saved.id);
        setModels(result);
        setMessage(result.length
          ? `Provedor salvo. ${result.length} modelos encontrados — escolha um modelo, salve novamente e teste a conexão.`
          : "Provedor salvo, mas a API não retornou modelos.");
      } else {
        setMessage(saved.model
          ? "Provedor salvo localmente. A chave foi armazenada de forma criptografada."
          : "Provedor salvo. Agora consulte os modelos, escolha um deles e salve novamente.");
      }
    } catch (error) {
      setMessage("Erro: " + error.message);
    } finally {
      setBusy("");
    }
  }

  async function test() {
    if (!selectedId) { setMessage("Salve o provedor antes de testar."); return; }
    if (!form.model && form.type !== "custom-rest") { setMessage("Escolha e salve um modelo antes de testar."); return; }
    setBusy("test");
    setMessage("");
    try {
      const result = await A.testProviderAction(selectedId);
      setMessage(`Conectado em ${result.elapsedMs} ms · HTTP ${result.status} · Modelo ${result.model || "padrão"} · Resposta: ${result.text}`);
    } catch (error) {
      setMessage("Falha no teste: " + error.message);
    } finally {
      setBusy("");
    }
  }

  async function loadModels() {
    if (!selectedId) { setMessage("Salve o provedor antes de consultar modelos."); return; }
    setBusy("models");
    setMessage("");
    try {
      const result = await A.listModelsAction(selectedId);
      setModels(result);
      setMessage(result.length ? `${result.length} modelos encontrados. Escolha um modelo na lista e salve novamente.` : "O provedor não retornou uma lista de modelos.");
    } catch (error) {
      setMessage("Falha ao consultar modelos: " + error.message);
    } finally {
      setBusy("");
    }
  }

  async function remove() {
    if (!selectedId || !selected) return;
    if (!window.confirm(`Excluir o provedor “${selected.name}”?`)) return;
    setBusy("delete");
    try {
      await A.deleteProviderAction(selectedId);
      const next = await A.listProvidersAction();
      setProviders(next);
      createNew();
      setMessage("Provedor removido.");
    } catch (error) {
      setMessage("Erro: " + error.message);
    } finally {
      setBusy("");
    }
  }

  const isCustom = form.type === "custom-rest";
  const isOllama = form.type === "ollama";
  const isOmniRoute = form.baseUrl.replace(/\/+$/, "") === "http://localhost:20128/v1";

  return (
    <div className={s.page}>
      <header className={s.header}>
        <div>
          <a href="/dashboard" className={s.back}>← Dashboard</a>
          <h1>Inteligência Artificial</h1>
          <p>Cadastre APIs externas ou modelos locais. As chamadas são feitas pelo servidor local do LeadFlow.</p>
        </div>
        <div className={s.actions}>
          <button onClick={useOmniRoutePreset}>Usar OmniRoute local</button>
          <button className={s.primary} onClick={createNew}>Novo provedor</button>
        </div>
      </header>

      <div className={s.layout}>
        <aside className={s.sidebar}>
          <div className={s.sideTitle}>Provedores</div>
          {!providers.length && <div className={s.empty}>Nenhum provedor configurado.</div>}
          {providers.map(provider => (
            <button key={provider.id} className={s.provider + (selectedId === provider.id ? " " + s.providerActive : "")} onClick={() => selectProvider(provider)}>
              <span className={s.providerName}>{provider.name}</span>
              <span className={s.providerMeta}>{provider.type}{provider.isDefault ? " · padrão" : ""}</span>
              <span className={provider.enabled ? s.statusOn : s.statusOff}>{provider.enabled ? "Ativo" : "Desativado"}</span>
            </button>
          ))}
        </aside>

        <main className={s.panel}>
          {isOmniRoute && <div className={s.security}>
            <strong>OmniRoute local detectado</strong>
            <span>Fluxo recomendado: deixe o OmniRoute em execução, informe a chave, salve e consulte os modelos em <code>http://localhost:20128/v1/models</code>. Depois escolha o modelo, salve novamente e teste.</span>
          </div>}

          <div className={s.grid2}>
            <label>Nome do provedor<input value={form.name} onChange={event => set("name", event.target.value)} placeholder="Ex.: OmniRoute local" /></label>
            <label>Tipo<select value={form.type} onChange={event => changeType(event.target.value)}><option value="openai-compatible">API compatível com OpenAI</option><option value="ollama">Ollama local</option><option value="custom-rest">Endpoint REST personalizado</option></select></label>
          </div>

          <label>URL base<input value={form.baseUrl} onChange={event => set("baseUrl", event.target.value)} placeholder="http://localhost:20128/v1" /></label>

          <div className={s.grid2}>
            <label>Endpoint<input value={form.endpoint} onChange={event => set("endpoint", event.target.value)} placeholder={isOllama ? "/api/chat" : "/chat/completions"} /></label>
            <label>Modelo<input list="ai-models" value={form.model} onChange={event => set("model", event.target.value)} placeholder="Escolha após consultar os modelos" /><datalist id="ai-models">{models.map(model => <option key={model} value={model} />)}</datalist></label>
          </div>

          {!isOllama && <div className={s.grid2}>
            <label>Chave da API<input type="password" autoComplete="off" value={form.apiKey} onChange={event => set("apiKey", event.target.value)} placeholder={selected?.hasApiKey ? `Mantida: ${selected.apiKeyMasked}` : "Cole a chave da API"} /></label>
            <label>Autenticação<select value={form.authType} onChange={event => set("authType", event.target.value)}><option value="bearer">Bearer Token</option><option value="x-api-key">x-api-key</option><option value="custom-header">Cabeçalho personalizado</option><option value="query">Query parameter</option><option value="none">Sem autenticação</option></select></label>
          </div>}

          {form.authType === "custom-header" && <label>Nome do cabeçalho<input value={form.authHeader} onChange={event => set("authHeader", event.target.value)} placeholder="Authorization" /></label>}
          {form.authType === "query" && <label>Nome do parâmetro<input value={form.queryKey} onChange={event => set("queryKey", event.target.value)} placeholder="api_key" /></label>}

          <div className={s.grid3}>
            <label>Temperatura<input type="number" min="0" max="2" step="0.1" value={form.temperature} onChange={event => set("temperature", event.target.value)} /></label>
            <label>Máximo de tokens<input type="number" min="1" value={form.maxTokens} onChange={event => set("maxTokens", event.target.value)} /></label>
            <label>Timeout em ms<input type="number" min="1000" value={form.timeout} onChange={event => set("timeout", event.target.value)} /></label>
          </div>

          {isCustom && <>
            <div className={s.grid2}>
              <label>Método HTTP<select value={form.method} onChange={event => set("method", event.target.value)}><option>POST</option><option>GET</option><option>PUT</option><option>PATCH</option></select></label>
              <label>Caminho do texto na resposta<input value={form.responsePath} onChange={event => set("responsePath", event.target.value)} placeholder="data.output.text" /></label>
            </div>
            <label>Template JSON da requisição<textarea rows="8" value={form.bodyTemplate} onChange={event => set("bodyTemplate", event.target.value)} placeholder={'{\n  "model": "{{model}}",\n  "prompt": "{{prompt}}"\n}'} /></label>
          </>}

          <label>Cabeçalhos adicionais em JSON<textarea rows="4" value={form.headersJson} onChange={event => set("headersJson", event.target.value)} placeholder={'{\n  "X-OmniRoute-Mode": "balanced"\n}'} /></label>

          <div className={s.checks}>
            <label><input type="checkbox" checked={form.enabled} onChange={event => set("enabled", event.target.checked)} /> Provedor ativo</label>
            <label><input type="checkbox" checked={form.isDefault} onChange={event => set("isDefault", event.target.checked)} /> Usar como padrão</label>
          </div>

          {message && <div className={message.startsWith("Erro") || message.startsWith("Falha") ? s.messageError : s.message}>{message}</div>}

          <div className={s.actions}>
            <button className={s.primary} onClick={() => save()} disabled={Boolean(busy)}>{busy === "save" ? "Salvando…" : "Salvar provedor"}</button>
            {!isCustom && <button onClick={() => save({ consultModels: true })} disabled={Boolean(busy)}>{busy === "save-models" ? "Salvando e consultando…" : "Salvar e consultar modelos"}</button>}
            <button onClick={test} disabled={Boolean(busy) || !selectedId}>{busy === "test" ? "Testando…" : "Testar conexão"}</button>
            {!isCustom && <button onClick={loadModels} disabled={Boolean(busy) || !selectedId}>{busy === "models" ? "Consultando…" : "Consultar novamente"}</button>}
            {selectedId && <button className={s.danger} onClick={remove} disabled={Boolean(busy)}>Excluir</button>}
          </div>

          <div className={s.security}>
            <strong>Armazenamento local protegido</strong>
            <span>As chaves não são devolvidas ao navegador. Elas ficam criptografadas em <code>data/ai-config/providers.enc.json</code>, usando uma chave local separada.</span>
          </div>
        </main>
      </div>
    </div>
  );
}
