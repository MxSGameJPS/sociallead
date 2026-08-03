const VISUAL_SEG = ["beleza", "alimentação", "alimentacao", "varejo/e-commerce", "varejo", "saúde/bem-estar", "saude/bem-estar"];
export function recommend(l) {
  const visual = l.source === "Google Maps" || VISUAL_SEG.includes(String(l.segment || "").toLowerCase());
  const weak = l.weakSite !== false;
  const strong = l.grade === "A" || (l.grade === "B" && (l.score || 0) >= 68);
  const reach = l.source === "Google Maps" ? true : (l.followers || 0) >= 1500;
  if (strong && weak && visual && reach) {
    return { type: "landing", label: "Chegar com landing pronta",
      why: "Nota alta, negócio visual e sem site à altura. Monte uma prévia da landing/site dele ANTES de falar e mande junto: \"já fiz um exemplo pra você ver\". Mostrar o pronto encurta o sim — ele reage ao que vê, não ao que imagina. Vale investir as horas aqui." };
  }
  return { type: "msg", label: "Começar só pela mensagem",
    why: "Valide o interesse primeiro. Mande a mensagem, confirme que ele quer ver — só então invista horas montando a landing. Gastar design em lead frio é o que queima seu tempo. Peça um \"sim, quero ver\" antes de produzir." };
}
export function defaultLanding(l) { return recommend(l).type === "landing" ? "todo" : "none"; }
