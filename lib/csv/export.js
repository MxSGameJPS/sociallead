import { CSV_COLUMNS } from "../constants.js";

const SEPARATOR = ";";
const BOM = "\uFEFF";

/**
 * Escapa um valor para CSV: envolve em aspas quando contém
 * separador, aspas, ou quebra de linha; duplica aspas internas.
 */
function escapeValue(value) {
  const str = value === null || value === undefined ? "" : String(value);
  const needsQuotes =
    str.includes(SEPARATOR) ||
    str.includes('"') ||
    str.includes("\n") ||
    str.includes("\r");

  const escaped = str.replace(/"/g, '""');
  return needsQuotes ? `"${escaped}"` : escaped;
}

/**
 * Gera o conteúdo CSV (UTF-8 com BOM, separador ponto e vírgula)
 * apenas com os leads fornecidos.
 */
export function generateCSV(records) {
  const rows = [];

  rows.push(CSV_COLUMNS.map((col) => escapeValue(col.label)).join(SEPARATOR));

  for (const record of records) {
    const row = CSV_COLUMNS.map((col) => escapeValue(record[col.key]));
    rows.push(row.join(SEPARATOR));
  }

  return BOM + rows.join("\r\n");
}

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Monta o nome do arquivo no padrão:
 *   leads-crm-rs-2026-08-02.csv
 *   leads-coren-porto-alegre-2026-08-02.csv
 */
export function buildFileName(filters) {
  const parts = ["leads"];
  if (filters.council) parts.push(slugify(filters.council));

  const localePart = filters.city
    ? slugify(filters.city)
    : filters.state
    ? slugify(filters.state)
    : "";
  if (localePart) parts.push(localePart);

  const date = new Date().toISOString().slice(0, 10);
  parts.push(date);

  return `${parts.filter(Boolean).join("-")}.csv`;
}