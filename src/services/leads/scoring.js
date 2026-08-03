export function waNorm(p) { if (!p) return null; let d = String(p).replace(/\D/g, ""); if (!d || d.length < 8) return null; if (!d.startsWith("55")) d = "55" + d; if (d.length < 12 || d.length > 13) return null; return d; }
export function autoScore(l) { let s = 10; if (l.whatsapp) s += 40; if (l.email) s += 18; if (l.followers && l.followers > 1000) s += 18; else if (l.followers) s += 8; if (l.segment) s += 8; if (l.site) s += 6; if (l.googleRating) s += 10; return Math.min(100, s); }
export function gradeFromScore(s) { return s >= 70 ? "A" : s >= 50 ? "B" : s >= 30 ? "C" : "D"; }
