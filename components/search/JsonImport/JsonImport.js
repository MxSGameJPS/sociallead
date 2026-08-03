"use client";

import { useRef, useState } from "react";
import styles from "./JsonImport.module.css";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

export default function JsonImport({ onImported, disabled }) {
  const inputRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    setMessage("");
    setError("");

    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".json")) {
      setError("Selecione um arquivo com extensão .json.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError("O arquivo excede o limite de 10 MB.");
      return;
    }

    setLoading(true);

    try {
      const text = await file.text();
      let payload;
      try {
        payload = JSON.parse(text);
      } catch {
        throw new Error("O arquivo não contém um JSON válido.");
      }

      const response = await fetch("/api/registries/import-json", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Não foi possível importar o arquivo.");
      }

      setMessage(
        `${data.imported} registro(s) processado(s): ${data.saved?.added || 0} novo(s) e ${data.saved?.updated || 0} atualizado(s).`
      );
      onImported?.(data);
    } catch (err) {
      setError(err?.message || "Não foi possível importar o arquivo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className={styles.card} aria-labelledby="json-import-title">
      <div>
        <h2 id="json-import-title" className={styles.title}>Importar JSON do CFM</h2>
        <p className={styles.description}>
          Importe a resposta da busca pública do CFM. Os registros serão normalizados,
          deduplicados e salvos na base local.
        </p>
      </div>

      <input
        ref={inputRef}
        className={styles.hiddenInput}
        type="file"
        accept="application/json,.json"
        onChange={handleFile}
        disabled={disabled || loading}
      />

      <button
        type="button"
        className={styles.button}
        onClick={() => inputRef.current?.click()}
        disabled={disabled || loading}
      >
        {loading ? "Importando..." : "Importar JSON"}
      </button>

      {message ? <p className={styles.success}>{message}</p> : null}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
    </section>
  );
}
