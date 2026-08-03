"use client";

import { useEffect, useState } from "react";
import styles from "./JsonImport.module.css";

const MAX_JSON_LENGTH = 10 * 1024 * 1024;

export default function JsonImport({ onImported, disabled }) {
  const [open, setOpen] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return undefined;

    function handleKeyDown(event) {
      if (event.key === "Escape" && !loading) closeModal();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, loading]);

  function openModal() {
    setMessage("");
    setError("");
    setOpen(true);
  }

  function closeModal() {
    if (loading) return;
    setOpen(false);
    setError("");
  }

  async function handleImport() {
    setMessage("");
    setError("");

    const text = jsonText.trim();
    if (!text) {
      setError("Cole o JSON retornado pelo CFM antes de importar.");
      return;
    }

    if (text.length > MAX_JSON_LENGTH) {
      setError("O conteúdo excede o limite de 10 MB.");
      return;
    }

    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      setError("O conteúdo colado não é um JSON válido.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/registries/import-json", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Não foi possível importar o JSON.");
      }

      setMessage(
        `${data.imported} registro(s) processado(s): ${data.saved?.added || 0} novo(s) e ${data.saved?.updated || 0} atualizado(s).`
      );
      setJsonText("");
      setOpen(false);
      onImported?.(data);
    } catch (err) {
      setError(err?.message || "Não foi possível importar o JSON.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <section className={styles.card} aria-labelledby="json-import-title">
        <div>
          <h2 id="json-import-title" className={styles.title}>Importar JSON do CFM</h2>
          <p className={styles.description}>
            Copie a resposta da busca pública do CFM, cole no campo de importação e salve os registros na base local.
          </p>
        </div>

        <button
          type="button"
          className={styles.button}
          onClick={openModal}
          disabled={disabled || loading}
        >
          Importar JSON
        </button>

        {message ? <p className={styles.success}>{message}</p> : null}
      </section>

      {open ? (
        <div className={styles.overlay} role="presentation" onMouseDown={closeModal}>
          <section
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="json-modal-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <div>
                <h2 id="json-modal-title" className={styles.modalTitle}>Colar JSON do CFM</h2>
                <p className={styles.modalDescription}>
                  Cole o objeto completo, incluindo os campos <code>status</code> e <code>dados</code>.
                </p>
              </div>
              <button
                type="button"
                className={styles.closeButton}
                onClick={closeModal}
                disabled={loading}
                aria-label="Fechar"
              >
                ×
              </button>
            </div>

            <textarea
              className={styles.textarea}
              value={jsonText}
              onChange={(event) => setJsonText(event.target.value)}
              placeholder={'{\n  "status": "sucesso",\n  "dados": [ ... ]\n}'}
              spellCheck="false"
              autoFocus
              disabled={loading}
            />

            <div className={styles.counter}>
              {jsonText.length.toLocaleString("pt-BR")} caracteres
            </div>

            {error ? <p className={styles.error} role="alert">{error}</p> : null}

            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={closeModal}
                disabled={loading}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={styles.button}
                onClick={handleImport}
                disabled={loading || !jsonText.trim()}
              >
                {loading ? "Importando..." : "Importar registros"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
