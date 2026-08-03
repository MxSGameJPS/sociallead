export const CONSULTING_STAGES = Object.freeze([
  { id: "novo", label: "Novo", sub: "Aguardando diagnóstico" },
  { id: "diagnostico", label: "Diagnóstico pronto", sub: "Revisar relatório e abordagem" },
  { id: "contatado", label: "Contatado", sub: "Mensagem enviada ao lead" },
  { id: "negociacao", label: "Negociação", sub: "Interesse ou pagamento em andamento" },
  { id: "cliente", label: "Cliente", sub: "Venda, entrega ou conversão" },
  { id: "perdido", label: "Perdido", sub: "Sem continuidade" },
]);

export const CONSULTING_STAGE_IDS = Object.freeze(CONSULTING_STAGES.map(stage => stage.id));

const LEGACY_STAGE_MAP = Object.freeze({
  analise: "novo",
  relatorio_pronto: "diagnostico",
  abordagem: "contatado",
  interessado: "negociacao",
  pagamento: "negociacao",
  vendido: "cliente",
  entregue: "cliente",
});

export const CONSULTING_STATUS_LABELS = Object.freeze({
  pending: "Pendente",
  analyzing: "Analisando",
  ready: "Relatório pronto",
  reviewed: "Revisado",
  sent: "Abordagem enviada",
  interested: "Interessado",
  payment_pending: "Aguardando pagamento",
  paid: "Pago",
  delivered: "Entregue",
  converted: "Convertido em projeto",
  lost: "Perdido",
});

export function normalizeConsultingStage(value) {
  const raw = String(value || "novo").trim();
  const mapped = LEGACY_STAGE_MAP[raw] || raw;
  return CONSULTING_STAGE_IDS.includes(mapped) ? mapped : "novo";
}

export function validateConsultingStage(value) {
  const stage = normalizeConsultingStage(value);
  if (!CONSULTING_STAGE_IDS.includes(stage)) throw new Error("Etapa de consultoria inválida.");
  return stage;
}
