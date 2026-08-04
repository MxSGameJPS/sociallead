import { listLeads, stats as getStats } from "../../repositories/leadRepository.js";
import { listLeadEnrichments } from "../../services/leads/leadEnrichmentStore.js";
import { isPossibleWhatsApp } from "../../services/places/googlePlaces.js";
import styles from "./dashboard.module.css";

export const dynamic = "force-dynamic";

const pct = (value, base) => base > 0 ? Math.round((value / base) * 100) : 0;

function hasWhatsappAvailable(lead) {
  return Boolean(lead.whatsapp || isPossibleWhatsApp(lead.phone, "BR"));
}

function verificationTag(lead, enrichments) {
  const enrichment = enrichments[lead.id] || {};
  return String(enrichment.validationTag || "AGUARDANDO ANÁLISE").toUpperCase();
}

export default async function DashboardPage() {
  let s = null;
  let leads = [];
  let enrichments = {};
  let err = null;

  try {
    [s, leads, enrichments] = await Promise.all([
      getStats(),
      listLeads(),
      listLeadEnrichments(),
    ]);
  } catch (error) {
    err = error.message;
  }

  if (err) return <main className={styles.page}><div className={styles.err}>Não foi possível carregar os dados locais: {err}</div></main>;

  const total = s.total;
  const whatsappAvailable = leads.filter(hasWhatsappAvailable).length;
  const verified = leads.filter(lead => verificationTag(lead, enrichments) === "VALIDADO").length;
  const pending = leads.filter(lead => verificationTag(lead, enrichments) === "AGUARDANDO ANÁLISE").length;
  const missingEmail = leads.filter(lead => verificationTag(lead, enrichments) === "FALTA EMAIL").length;
  const missingRegistration = leads.filter(lead => verificationTag(lead, enrichments) === "FALTA REGISTRO").length;
  const unverified = leads.filter(lead => verificationTag(lead, enrichments) === "NÃO VALIDADO").length;
  const contacted = Math.max(0, total - (s.byStage.novo || 0));
  const responded = (s.byStage.com_resposta || 0) + (s.byStage.proposta || 0) + (s.byStage.negociacao || 0) + (s.byStage.ganho || 0);
  const contracted = s.byStage.ganho || 0;

  const funnel = [
    { key: "located", label: "Localizados", value: total, rate: "Base de profissionais", tone: styles.gray },
    { key: "verified", label: "Verificados", value: verified, rate: `${pct(verified, total)}% da base`, tone: styles.blue },
    { key: "contacted", label: "Contatados", value: contacted, rate: `${pct(contacted, total)}% da base`, tone: styles.green },
    { key: "responded", label: "Responderam", value: responded, rate: `${pct(responded, contacted)}% dos contatos`, tone: styles.orange },
    { key: "contracted", label: "Contratados", value: contracted, rate: `${pct(contracted, Math.max(1, responded))}% das respostas`, tone: styles.purple },
  ];

  const recommendations = [];
  if (total === 0) recommendations.push({ level: "info", title: "Localize os primeiros profissionais", text: "Use a busca por profissão e cidade para formar a base inicial da tese jurídica." });
  if (pending > 0) recommendations.push({ level: "info", title: "Verificações pendentes", text: `${pending} profissionais ainda aguardam análise de e-mail e registro profissional.` });
  if (missingEmail > 0) recommendations.push({ level: "warn", title: "E-mails não localizados", text: `${missingEmail} profissionais possuem registro, mas ainda exigem busca complementar de e-mail.` });
  if (missingRegistration > 0) recommendations.push({ level: "warn", title: "Registros não localizados", text: `${missingRegistration} profissionais possuem e-mail, mas o registro profissional ainda não foi encontrado.` });
  if (unverified > 0) recommendations.push({ level: "danger", title: "Dados insuficientes", text: `${unverified} profissionais não tiveram e-mail nem registro localizados.` });
  if (s.followupDue > 0) recommendations.push({ level: "warn", title: "Retornos pendentes", text: `${s.followupDue} contatos possuem acompanhamento vencido para hoje.` });
  if (!recommendations.length) recommendations.push({ level: "ok", title: "Operação organizada", text: "Não há pendências críticas de verificação ou acompanhamento neste momento." });

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div><h1>Visão geral</h1><p>Acompanhamento da localização, verificação e contato dos profissionais.</p></div>
        <div className={styles.headerActions}><a href="/leads">Localizar profissionais</a><a className={styles.primary} href="/crm">Abrir acompanhamento</a></div>
      </header>

      <section className={styles.panel}>
        <div className={styles.panelTitle}>Fluxo da operação jurídica</div>
        <div className={styles.funnel}>
          {funnel.map((item, index) => <div key={item.key} className={styles.stepWrap}>
            <div className={`${styles.step} ${item.tone}`} style={{ "--step": index }}><strong>{item.value}</strong></div>
            <div className={styles.stepLabel}><span>{item.label}</span><small>{item.rate}</small></div>
          </div>)}
        </div>

        <div className={styles.legendAndTotal}>
          <div className={styles.legend}>
            <p><b className={styles.blueText}>Verificação</b> — profissionais com e-mail e registro localizados.</p>
            <p><b className={styles.greenText}>Contato</b> — profissionais que já receberam a primeira abordagem.</p>
            <p><b className={styles.orangeText}>Resposta</b> — profissionais que responderam e podem avançar para análise.</p>
            <p><b className={styles.purpleText}>Contratação</b> — profissionais incorporados ao atendimento jurídico.</p>
          </div>
          <div className={styles.totalBox}><span>Profissionais cadastrados</span><div className={styles.donut} style={{ "--fill": `${pct(verified, Math.max(total, 1)) * 3.6}deg` }}><strong>{total}</strong></div><small>{verified} com dados verificados</small></div>
        </div>
      </section>

      <div className={styles.bottomGrid}>
        <section className={styles.panel}>
          <div className={styles.panelTitle}>Situação da base</div>
          <div className={styles.bars}>{funnel.map(item => <div key={item.key} className={styles.barRow}><span>{item.label}</span><div><i className={item.tone} style={{ width: `${pct(item.value, Math.max(total, 1))}%` }} /></div><b>{item.value}</b></div>)}</div>
          <a className={styles.link} href="/crm">Ver profissionais →</a>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelTitle}>Pendências e próximos passos</div>
          <div className={styles.recommendations}>{recommendations.map((item, index) => <div key={index} className={`${styles.recommendation} ${styles[item.level]}`}><strong>{item.title}</strong><p>{item.text}</p></div>)}</div>
        </section>
      </div>

      <section className={styles.kpis}>
        <div><span>Verificados</span><strong>{verified}</strong></div>
        <div><span>Aguardando análise</span><strong>{pending}</strong></div>
        <div><span>Falta e-mail</span><strong>{missingEmail}</strong></div>
        <div><span>Falta registro</span><strong>{missingRegistration}</strong></div>
        <div><span>WhatsApp disponível</span><strong>{whatsappAvailable}</strong></div>
      </section>
    </main>
  );
}
