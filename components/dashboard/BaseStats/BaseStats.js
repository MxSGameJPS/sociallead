"use client";

import styles from "./BaseStats.module.css";

function formatNumber(value) {
  return new Intl.NumberFormat("pt-BR").format(Number(value || 0));
}

function formatDate(value) {
  if (!value) return "Nenhuma atualização";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data indisponível";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(date);
}

export default function BaseStats({ stats, loading, error }) {
  const values = stats || {
    total: 0,
    newToday: 0,
    councils: 0,
    states: 0,
    lastUpdatedAt: null
  };

  return (
    <section className={styles.card} aria-labelledby="base-local-title">
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Base local</p>
          <h2 id="base-local-title" className={styles.title}>
            {loading ? "Carregando registros..." : `${formatNumber(values.total)} registros salvos`}
          </h2>
        </div>
        <div className={styles.updated}>
          Última atualização: {loading ? "carregando..." : formatDate(values.lastUpdatedAt)}
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.grid}>
        <div className={styles.metric}>
          <span className={styles.label}>Total armazenado</span>
          <strong>{formatNumber(values.total)}</strong>
        </div>
        <div className={styles.metric}>
          <span className={styles.label}>Novos hoje</span>
          <strong>{formatNumber(values.newToday)}</strong>
        </div>
        <div className={styles.metric}>
          <span className={styles.label}>Conselhos</span>
          <strong>{formatNumber(values.councils)}</strong>
        </div>
        <div className={styles.metric}>
          <span className={styles.label}>Estados</span>
          <strong>{formatNumber(values.states)}</strong>
        </div>
      </div>
    </section>
  );
}
