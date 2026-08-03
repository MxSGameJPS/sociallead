"use client";

import CRMBoard from "../CRMBoard/CRMBoard.jsx";

function csvValue(value) {
  const text = String(value ?? "");
  return /[;\n\r\"]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export default function CRMExportBoard({ initialLeads = [] }) {
  function exportCompleteCsv() {
    const header = ["NOME", "PROFISSÃO", "REGISTRO", "EMAIL", "WHATSAPP", "CIDADE", "ESTADO"];
    const rows = initialLeads.map(lead => [
      lead.name,
      lead.profession || lead.segment,
      lead.registration,
      lead.email,
      lead.whatsapp || lead.phone,
      lead.city,
      lead.state || lead.location,
    ]);
    const content = [header, ...rows].map(row => row.map(csvValue).join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `leadflow-leads-completos-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  return <>
    <div style={{ display: "flex", justifyContent: "flex-end", padding: "18px 18px 0" }}>
      <button
        type="button"
        onClick={exportCompleteCsv}
        disabled={!initialLeads.length}
        style={{ border: 0, borderRadius: 10, padding: "11px 16px", background: "var(--accent)", color: "#fff", fontWeight: 900, cursor: "pointer" }}
      >
        Exportar CSV completo ({initialLeads.length})
      </button>
    </div>
    <CRMBoard initialLeads={initialLeads} />
  </>;
}
