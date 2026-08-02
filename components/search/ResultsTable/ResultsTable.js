"use client";

import styles from "./ResultsTable.module.css";
import ResultCard from "../ResultCard/ResultCard.js";
import ExportButton from "../ExportButton/ExportButton.js";

export default function ResultsTable({
  results,
  isMock,
  filters,
  selectedIds,
  onToggle,
  onSelectAll,
  onClear
}) {
  const total = results.length;
  const selectedCount = selectedIds.size;
  const selectedRecords = results.filter((r) => selectedIds.has(r.id));

  return (
    <section className={styles.wrapper}>
      {isMock ? (
        <div className={styles.mockBanner}>
          MODO DE TESTE — DADOS SIMULADOS
        </div>
      ) : null}

      <div className={styles.toolbar}>
        <div className={styles.counter}>
          <strong>{total}</strong> resultados encontrados
          <span className={styles.dot}>•</span>
          <strong>{selectedCount}</strong> selecionados
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.secondary}
            onClick={onSelectAll}
          >
            Selecionar todos
          </button>
          <button
            type="button"
            className={styles.secondary}
            onClick={onClear}
            disabled={selectedCount === 0}
          >
            Limpar seleção
          </button>
          <ExportButton
            records={selectedRecords}
            filters={filters}
            disabled={selectedCount === 0}
          />
        </div>
      </div>

      <div className={styles.grid}>
        {results.map((record) => (
          <ResultCard
            key={record.id}
            record={record}
            selected={selectedIds.has(record.id)}
            onToggle={onToggle}
          />
        ))}
      </div>
    </section>
  );
}