"use client";

import { useEffect, useState } from "react";
import styles from "./AISettingsForm.module.css";
import { AI_PROVIDERS } from "../../../lib/constants.js";

const DEFAULT = {
  provider: "google",
  apiKey: "",
  model: "gemini-2.5-flash",
  baseUrl: "",
  temperature: 0.3
};

export default function AISettingsForm() {
  const [form, setForm] = useState(DEFAULT);
  const [hasStoredKey, setHasStoredKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/settings");
        const data = await res.json();
        if (data.settings) {
          setForm({
            provider: data.settings.provider ?? DEFAULT.provider,
            apiKey: "",
            model: data.settings.model ?? DEFAULT.model,
            baseUrl: data.settings.baseUrl ?? "",
            temperature:
              data.settings.temperature ?? DEFAULT.temperature
          });
          setHasStoredKey(Boolean(data.settings.hasApiKey));
        }
      } catch (err) {
        setFeedback({ ok: false, text: "Não foi possível carregar as configurações." });
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (res.ok) {
        setFeedback({ ok: true, text: data.message || "Configurações salvas." });
        if (form.apiKey) setHasStoredKey(true);
        setForm((prev) => ({ ...prev, apiKey: "" }));
      } else {
        setFeedback({ ok: false, text: data.error || "Erro ao salvar." });
      }
    } catch (err) {
      setFeedback({ ok: false, text: "Erro ao salvar as configurações." });
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/ai/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      setFeedback({ ok: Boolean(data.ok), text: data.message });
    } catch (err) {
      setFeedback({ ok: false, text: "Não foi possível conectar ao provedor." });
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return <p className={styles.loading}>Carregando configurações...</p>;
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.field}>
        <label className={styles.label}>Provedor</label>
        <select
          className={styles.input}
          value={form.provider}
          onChange={(e) => update("provider", e.target.value)}
        >
          {AI_PROVIDERS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Chave da API</label>
        <input
          className={styles.input}
          type="password"
          value={form.apiKey}
          maxLength={400}
          placeholder={
            hasStoredKey
              ? "•••••••• (chave salva — deixe em branco para manter)"
              : "Cole sua chave da API"
          }
          onChange={(e) => update("apiKey", e.target.value)}
        />
        <span className={styles.hint}>
          A chave é armazenada apenas no servidor e nunca retorna ao navegador.
        </span>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Modelo</label>
        <input
          className={styles.input}
          type="text"
          value={form.model}
          maxLength={120}
          placeholder="Ex.: gemini-2.5-flash"
          onChange={(e) => update("model", e.target.value)}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>URL base (opcional)</label>
        <input
          className={styles.input}
          type="text"
          value={form.baseUrl}
          maxLength={300}
          placeholder="Ex.: https://api.exemplo.com/v1"
          onChange={(e) => update("baseUrl", e.target.value)}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Temperatura</label>
        <input
          className={styles.inputSmall}
          type="number"
          min="0"
          max="1"
          step="0.1"
          value={form.temperature}
          onChange={(e) => update("temperature", Number(e.target.value))}
        />
      </div>

      {feedback ? (
        <div
          className={feedback.ok ? styles.feedbackOk : styles.feedbackError}
        >
          {feedback.text}
        </div>
      ) : null}

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.secondary}
          onClick={handleTest}
          disabled={testing}
        >
          {testing ? "Testando..." : "Testar conexão"}
        </button>
        <button type="submit" className={styles.primary} disabled={saving}>
          {saving ? "Salvando..." : "Salvar configurações"}
        </button>
      </div>
    </form>
  );
}