export const BRL = n => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
export function fmtNum(n) { return n == null ? "" : Number(n).toLocaleString("pt-BR"); }
export function todayStr() { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
export function fmtDate(iso) { if (!iso) return ""; const p = String(iso).split("-"); return p.length === 3 ? (p[2] + "/" + p[1] + "/" + p[0]) : iso; }
export function fmtDateShort(iso) { if (!iso) return ""; const p = String(iso).split("-"); return p.length === 3 ? (p[2] + "/" + p[1]) : iso; }
export function plusDays(n) { const d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
