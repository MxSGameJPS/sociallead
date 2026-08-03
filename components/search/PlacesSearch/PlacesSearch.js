"use client";

import { useState } from "react";
import styles from "./PlacesSearch.module.css";
import { UFS } from "../../../lib/constants.js";

const INITIAL = { query: "", city: "", state: "", limit: 20 };

export default function PlacesSearch({ onResults, disabled }) {
  const [form, setForm] = useState(INITIAL);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    try {
      const response = await fetch("/api/places/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível buscar no Google Places.");

      setMessage(
        `${data.total} lead(s) encontrado(s): ${data.saved?.added || 0} novo(s) e ${data.saved?.updated || 0} atualizado(s).`
      );
      onResults?.(data);
    } catch (err) {
      setError(err?.message || "Não foi possível buscar no Google Places.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className={styles.card}>
      <div className={styles.heading}>
        <div>
          <h2 className={styles.title}>Descobrir leads pelo Google Places</h2>
          <p className={styles.description}>
            Pesquise profissionais e empresas por profissão e localização. Todo resultado é salvo automaticamente no CRM local.
          </p>
        </div>
        <span className={styles.badge}>Fonte de descoberta</span>
      </div>

      <form className={styles.form} onSubmit={handleSubmit}>
        <label className={styles.field}>
          <span>Profissão ou nicho</span>
          <input
            value={form.query}
            onChange={(event) => update("query", event.target.value)}
            placeholder="Ex.: advogado trabalhista"
            required
          />
        </label>

        <label className={styles.field}>
          <span>Cidade</span>
          <input
            value={form.city}
            onChange={(event) => update("city", event.target.value)}
            placeholder="Ex.: Porto Alegre"
          />
        </label>

        <label className={styles.field}>
          <span>Estado</span>
          <select value={form.state} onChange={(event) => update("state", event.target.value)}>
            <option value="">Selecione</option>
            {UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
          </select>
        </label>

        <label className={styles.field}>
          <span>Quantidade</span>
          <select value={form.limit} onChange={(event) => update("limit", Number(event.target.value))}>
            <option value={10}>10</option>
            <option value={20}>20</option>
          </select>
        </label>

        <button className={styles.button} type="submit" disabled={disabled || loading}>
          {loading ? "Buscando..." : "Buscar e salvar no CRM"}
        </button>
      </form>

      {message ? <p className={styles.success}>{message}</p> : null}
      {error ? <p className={styles.error}>{error}</p> : null}
    </section>
  );
}
