"use client";

import styles from "./ExportButton.module.css";
import { generateCSV, buildFileName } from "../../../lib/csv/export.js";

export default function ExportButton({ records, filters, disabled }) {
  function handleExport() {
    if (!records || records.length === 0) return;

    const csv = generateCSV(records);
    const fileName = buildFileName(filters || {});

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <button
      className={styles.button}
      onClick={handleExport}
      disabled={disabled}
      type="button"
    >
      Baixar selecionados em CSV
    </button>
  );
}