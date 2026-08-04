export const STAGES = [
  { id: "novo", label: "Localizado", sub: "Profissional ainda não contatado" },
  { id: "contatado", label: "Contato realizado", sub: "Primeira comunicação enviada" },
  { id: "sem_resposta", label: "Aguardando resposta", sub: "Contato realizado, sem retorno" },
  { id: "com_resposta", label: "Respondeu", sub: "Profissional demonstrou interesse" },
  { id: "proposta", label: "Documentos solicitados", sub: "Aguardando informações para análise" },
  { id: "proposta_rejeitada", label: "Não interessado", sub: "Profissional recusou o atendimento" },
  { id: "negociacao", label: "Em análise jurídica", sub: "Documentação e enquadramento em análise" },
  { id: "ganho", label: "Contratado", sub: "Contratação formalizada" },
  { id: "perdido", label: "Não elegível", sub: "Caso encerrado após avaliação" },
];

export const STAGE_IDS = STAGES.map(stage => stage.id);

export const NEXT = {
  novo: "contatado",
  contatado: "sem_resposta",
  sem_resposta: "com_resposta",
  com_resposta: "proposta",
  proposta: "negociacao",
  negociacao: "ganho",
};

export const LANDING = { none: "—", todo: "Pendente", done: "Concluído", sent: "Enviado" };
