"use client";

import { useState } from "react";
import styles from "./SearchForm.module.css";
import { COUNCILS, UFS, MAX_RESULTS_OPTIONS } from "../../../lib/constants.js";

const INITIAL = {
  council: "CRM",
  state: "",
  city: "",
  name: "",
  registration: "",
  specialty: "",
  limit: 20
};

const INFOSIMPLES_COUNCILS = new Set(["CRO", "CRP", "CRMV", "CRC", "CRF"]);

export default function SearchForm({ onSearch, loading }) {
  const [form, setForm] = useState(INITIAL);

  function update(field, value) {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "council" && value !== "CRM") next.city = "";
      return next;
    });
  }

  function handleSubmit(e) {
    e.preventDefault();
    onSearch(form);
  }

  const isCrm = form.council === "CRM";
  const hasIndividualQuery = Boolean(form.name.trim() || form.registration.trim());
  const infosimplesSupported = INFOSIMPLES_COUNCILS.has(form.council);

  let sourceMessage =
    "Fonte prevista: ConsultaCRM como fonte auxiliar para este conselho.";

  if (isCrm) {
    sourceMessage =
      "Fonte: busca pública oficial do CFM. Não consome a cota da ConsultaCRM nem crédito da InfoSimples.";
  } else if (infosimplesSupported && hasIndividualQuery) {
    sourceMessage =
      "Fonte prevista: InfoSimples. Esta consulta pode consumir crédito.";
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.grid}>
        <div className={styles.field}>
          <label className={styles.label}>
            Órgão profissional <span className={styles.required}>*</span>
          </label>
          <select
            className={styles.input}
            value={form.council}
            onChange={(e) => update("council", e.target.value)}
            required
          >
            {COUNCILS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Estado (UF)</label>
          <select
            className={styles.input}
            value={form.state}
            onChange={(e) => update("state", e.target.value)}
          >
            <option value="">Todos</option>
            {UFS.map((uf) => (
              <option key={uf} value={uf}>
                {uf}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Cidade</label>
          <input
            className={styles.input}
            type="text"
            value={form.city}
            maxLength={120}
            placeholder={isCrm ? "Ex.: Sorocaba" : "Não suportado nesta fonte"}
            disabled={!isCrm}
            title={
              isCrm
                ? "Filtro enviado à busca pública do CFM."
                : "A fonte atual deste conselho não oferece busca confiável por cidade."
            }
            onChange={(e) => update("city", e.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Nome do profissional</label>
          <input
            className={styles.input}
            type="text"
            value={form.name}
            maxLength={120}
            placeholder="Ex.: Ana Silva"
            onChange={(e) => update("name", e.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Número do registro</label>
          <input
            className={styles.input}
            type="text"
            value={form.registration}
            maxLength={40}
            placeholder="Ex.: 12345"
            onChange={(e) => update("registration", e.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Especialidade</label>
          <input
            className={styles.input}
            type="text"
            value={form.specialty}
            maxLength={120}
            placeholder="Ex.: Cardiologia"
            onChange={(e) => update("specialty", e.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Quantidade máxima</label>
          <select
            className={styles.input}
            value={form.limit}
            onChange={(e) => update("limit", Number(e.target.value))}
          >
            {MAX_RESULTS_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p aria-live="polite">{sourceMessage}</p>

      <div className={styles.actions}>
        <button className={styles.submit} type="submit" disabled={loading}>
          {loading ? "Buscando registros..." : "Buscar profissionais"}
        </button>
      </div>
    </form>
  );
}
