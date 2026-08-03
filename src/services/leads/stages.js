export const STAGES = [
  { id: "novo", label: "Novo", sub: "Ainda não abordado" },
  { id: "contatado", label: "Contatado", sub: "Mensagem enviada" },
  { id: "sem_resposta", label: "Sem resposta", sub: "Não respondeu — analisar" },
  { id: "com_resposta", label: "Com resposta", sub: "Respondeu — avançar" },
  { id: "proposta", label: "Proposta", sub: "Proposta enviada" },
  { id: "proposta_rejeitada", label: "Proposta rejeitada", sub: "Recuperar c/ 2ª proposta" },
  { id: "negociacao", label: "Negociação", sub: "Perto do sim" },
  { id: "ganho", label: "Ganho", sub: "Fechado" },
  { id: "perdido", label: "Perdido", sub: "Encerrado" },
];
export const STAGE_IDS = STAGES.map(s => s.id);
export const NEXT = { novo: "contatado", contatado: "com_resposta", sem_resposta: "com_resposta", com_resposta: "proposta", proposta: "negociacao", proposta_rejeitada: "negociacao", negociacao: "ganho" };
export const LANDING = { none: "—", todo: "A fazer", done: "Pronta", sent: "Enviada" };
