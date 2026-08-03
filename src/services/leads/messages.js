export function firstName(l) { if (l.source === "Instagram") return ""; return (l.name || "").split(/\s|–|-/)[0]; }
export function gapPhrase(l) {
  const t = ((l.problem || "") + " " + (l.offer || "")).toLowerCase();
  if (l.source === "Instagram") return "vocês vendem pelo Instagram, mas não têm um lugar próprio onde o cliente vê preço, agenda ou compra sozinho";
  if (/fora do ar/.test((l.site || "").toLowerCase()) || /fora do ar/.test(t)) return "o site de vocês está fora do ar — quem procura acaba desistindo ou indo pro concorrente";
  if (l.weakSite !== false) return "vocês ainda não têm um site próprio — dependem de plataforma/rede social, e o cliente que busca no Google cai no concorrente que aparece melhor";
  return "dá pra fazer a presença online de vocês trabalhar muito mais a favor das vendas";
}
export function offerShort(l) {
  const o = (l.offer || "").toLowerCase();
  if (/cardápio|cardapio|delivery/.test(o)) return "site próprio com cardápio digital e pedidos diretos (sem comissão de app)";
  if (/e-commerce|loja|catálogo|catalogo/.test(o)) return "uma loja/catálogo online próprio com pedido direto no WhatsApp";
  if (/agend/.test(o)) return "um site com agendamento online próprio";
  if (/reformul/.test(o)) return "a reformulação completa do site pra ele voltar a vender";
  return "um site profissional próprio";
}
export function buildMessages(l) {
  const nm = l.name || "seu negócio";
  const fn = firstName(l);
  const rating = l.googleRating, rev = l.googleReviews;
  const cityBit = l.city ? (" em " + String(l.city).replace(/\/.*/, "")) : "";
  const gap = gapPhrase(l), off = offerShort(l);
  let cred = "";
  if (l.source === "Google Maps" && rating) { cred = "Vi que a " + nm + " tem " + rating + "★" + (rev ? (" com " + rev + " avaliações") : "") + cityBit + " — reputação assim é difícil de construir. "; }
  else if (l.source === "Instagram") { cred = "Acompanhei o perfil de vocês e dá pra ver que o trabalho é bom. "; }
  const initial =
    (l.source === "Instagram" ? ("Oi! Falo com quem cuida da @" + nm + "? 👋\n\n") : ("Oi! Falo com o responsável pela " + nm + "? 👋\n\n")) +
    cred + "Só que reparei numa coisa: " + gap + ".\n\n" +
    "Eu desenvolvo " + off + " e resolvo isso rápido. Posso te mostrar em 2 minutos uma ideia pronta pra " + nm + ", sem compromisso nenhum. Topa dar uma olhada?";
  const followup =
    "Oi" + (fn ? (", " + fn) : "") + "! Passando de novo por aqui 👋\n\n" +
    "Sei que a rotina é corrida, então vou ser direto: consigo deixar " + nm + " com uma presença online profissional no ar ainda esta semana — e o primeiro passo não te custa nada. Eu monto a prévia, te mostro pronta, e você decide se faz sentido.\n\n" +
    "Prefere que eu te mande o exemplo por aqui ou te explique num áudio de 1 minuto?";
  const recovery =
    "Oi" + (fn ? (", " + fn) : "") + "! Fiquei pensando no que conversamos.\n\n" +
    "Entendo total a cautela com investimento agora — e é justamente por isso que remontei a proposta pra fazer mais sentido: dá pra começar com um escopo enxuto (só o essencial pra você já captar cliente), em condição parcelada, e a gente evolui conforme o retorno aparece.\n\n" +
    "Assim você não trava o caixa e já para de perder venda pra quem tem site. Quer que eu te mande os números nesse novo formato?";
  return { initial, followup, recovery };
}
export function msgKindForStage(s) { if (s === "sem_resposta") return "followup"; if (s === "proposta_rejeitada" || s === "perdido") return "recovery"; return "initial"; }
export function waFor(l, kind) { if (!l.whatsapp) return null; const m = buildMessages(l); const text = kind === "followup" ? m.followup : kind === "recovery" ? m.recovery : m.initial; return "https://wa.me/" + l.whatsapp + "?text=" + encodeURIComponent(text); }
