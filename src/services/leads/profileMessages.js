function firstName(lead) {
  return String(lead?.name || "").trim().split(/\s|–|-/)[0];
}

function lawyerName(profile = {}) {
  return profile.professionalName || profile.name || "";
}

function lawyerIdentification(profile = {}) {
  const oab = [profile.oabState, profile.oabNumber].filter(Boolean).join(" ");
  return [lawyerName(profile), profile.profession || "Advogado", oab ? `OAB ${oab}` : ""].filter(Boolean).join(" · ");
}

function thesisContext(profile = {}) {
  if (profile.thesisSummary) return profile.thesisSummary;
  if (profile.thesisName) return `uma tese jurídica denominada ${profile.thesisName}`;
  return "uma possibilidade jurídica relacionada a valores pagos por profissionais vinculados a órgãos de registro profissional";
}

function professionalContext(lead = {}) {
  const profession = lead.profession || lead.segment || "profissional regulamentado";
  const council = lead.council ? ` vinculado(a) ao ${lead.council}` : "";
  return `${profession}${council}`;
}

function disclaimer(profile = {}) {
  return profile.requiredDisclaimer || "A existência de eventual direito depende de análise individual dos fatos e documentos.";
}

function signature(profile = {}) {
  const sign = lawyerIdentification(profile);
  const contacts = [profile.email, profile.whatsapp].filter(Boolean).join(" · ");
  return [sign, profile.brandName, contacts].filter(Boolean).join("\n");
}

export function buildProfileMessages(lead, profile = {}) {
  const first = firstName(lead);
  const context = professionalContext(lead);
  const thesis = thesisContext(profile);
  const sign = signature(profile);
  const ending = sign ? `\n\n${sign}` : "";

  const initial = `Olá${first ? `, ${first}` : ""}. Meu nome é ${lawyerName(profile) || "advogado responsável"}. Estou entrando em contato porque identifiquei seu perfil público como ${context}. Trabalho com ${thesis} e gostaria de verificar se a situação pode ter relação com o seu caso. ${disclaimer(profile)} Posso lhe explicar de forma breve como funciona essa análise?${ending}`;

  const followup = `Olá${first ? `, ${first}` : ""}. Retomo meu contato apenas para confirmar se recebeu a mensagem sobre ${profile.thesisName || "a análise jurídica destinada a profissionais registrados em órgãos de classe"}. Não se trata de afirmação de direito garantido, mas de uma possibilidade que depende de avaliação individual. Posso lhe encaminhar um resumo objetivo?${ending}`;

  const recovery = `Olá${first ? `, ${first}` : ""}. Respeito sua decisão e não quero ser insistente. Deixo apenas registrado que permaneço disponível caso queira compreender melhor ${profile.thesisName || "a possibilidade jurídica mencionada"} e verificar, sem compromisso, se existe algum enquadramento aplicável à sua situação. ${disclaimer(profile)}${ending}`;

  return { initial, followup, recovery };
}
