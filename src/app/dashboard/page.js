import { listLeads, stats as getStats } from "../../repositories/leadRepository.js";
import { BRL } from "../../services/leads/format.js";
import { isPossibleWhatsApp } from "../../services/places/googlePlaces.js";
import styles from "./dashboard.module.css";

export const dynamic = "force-dynamic";

const pct = (value, base) => base > 0 ? Math.round((value / base) * 100) : 0;

function hasWhatsappAvailable(lead) {
  return Boolean(lead.whatsapp || isPossibleWhatsApp(lead.phone, "BR"));
}

export default async function DashboardPage() {
  let s = null, leads = [], err = null;
  try {
    [s, leads] = await Promise.all([getStats(), listLeads()]);
  } catch (e) {
    err = e.message;
  }

  if (err) return <main className={styles.page}><div className={styles.err}>Erro ao ler o banco: {err}</div></main>;

  const total = s.total;
  const whatsappAvailable = leads.filter(hasWhatsappAvailable).length;
  const newLeads = s.byStage.novo || 0;
  const approached = Math.max(0, total - newLeads);
  const scheduled = 0;
  const followups = s.followupTotal;
  const lost = s.lost;
  const converted = s.won;

  const funnel = [
    { key: "total", label: "Total", value: total, rate: "Base completa", tone: styles.gray },
    { key: "approached", label: "Abordados", value: approached, rate: `${pct(approached, total)}% do total`, tone: styles.blue },
    { key: "scheduled", label: "Agendados", value: scheduled, rate: `${pct(scheduled, approached)}% dos abordados`, tone: styles.green },
    { key: "followup", label: "Follow Up", value: followups, rate: `${pct(followups, approached)}% dos abordados`, tone: styles.orange },
    { key: "lost", label: "Perdidos", value: lost, rate: `${pct(lost, approached)}% dos abordados`, tone: styles.red },
    { key: "converted", label: "Convertidos", value: converted, rate: `${pct(converted, Math.max(1, scheduled || approached))}% da operação`, tone: styles.purple },
  ];

  const recommendations = [];
  if (total === 0) recommendations.push({ level: "info", title: "Importe sua primeira base", text: "Abra Leads e envie um CSV ou JSON para começar a operação." });
  if (total > 0 && whatsappAvailable === 0) recommendations.push({ level: "danger", title: "Nenhum WhatsApp disponível", text: `Os ${total} leads atuais não possuem WhatsApp confirmado nem celular compatível para teste.` });
  else if (s.withoutContact > 0) recommendations.push({ level: "warn", title: "Base com contatos incompletos", text: `${s.withoutContact} leads não possuem WhatsApp, telefone, e-mail ou Instagram.` });
  if (s.followupDue > 0) recommendations.push({ level: "warn", title: "Follow-ups vencidos", text: `${s.followupDue} leads precisam ser retomados hoje.` });
  if (s.active > 0 && converted === 0) recommendations.push({ level: "info", title: "Pipeline em andamento", text: `${s.active} leads estão sendo trabalhados. Registre propostas e próximos passos no CRM.` });
  if (!recommendations.length) recommendations.push({ level: "ok", title: "Operação saudável", text: "Sem ações urgentes no momento." });

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div><h1>Dashboard</h1><p>Visão geral da sua operação</p></div>
        <div className={styles.headerActions}><a href="/leads">Importar leads</a><a className={styles.primary} href="/crm">Abrir CRM</a></div>
      </header>

      <section className={styles.panel}>
        <div className={styles.panelTitle}>Funil de conversão</div>
        <div className={styles.funnel}>
          {funnel.map((item, index) => <div key={item.key} className={styles.stepWrap}>
            <div className={`${styles.step} ${item.tone}`} style={{ "--step": index }}><strong>{item.value}</strong></div>
            <div className={styles.stepLabel}><span>{item.label}</span><small>{item.rate}</small></div>
          </div>)}
        </div>

        <div className={styles.legendAndTotal}>
          <div className={styles.legend}>
            <p><b className={styles.purpleText}>Taxa de conversão</b> (Convertidos / Total) — principal indicador de fechamento.</p>
            <p><b className={styles.blueText}>Taxa de abordagem</b> (Abordados / Total) — mostra quanto da base já está sendo trabalhada.</p>
            <p><b className={styles.greenText}>Taxa de agendamento</b> — será ativada junto ao calendário de agendamentos.</p>
            <p><b className={styles.orangeText}>Taxa de follow-up</b> — muitos leads aqui podem indicar pipeline parado.</p>
            <p><b className={styles.redText}>Taxa de perdidos</b> — ajuda a revisar script, oferta e qualidade da base.</p>
          </div>
          <div className={styles.totalBox}><span>Total de leads</span><div className={styles.donut} style={{ "--fill": `${pct(whatsappAvailable, Math.max(total, 1)) * 3.6}deg` }}><strong>{total}</strong></div><small>{whatsappAvailable} com WhatsApp ou celular testável</small></div>
        </div>
      </section>

      <div className={styles.bottomGrid}>
        <section className={styles.panel}>
          <div className={styles.panelTitle}>Funil de leads</div>
          <div className={styles.bars}>{funnel.map(item => <div key={item.key} className={styles.barRow}><span>{item.label}</span><div><i className={item.tone} style={{ width: `${pct(item.value, Math.max(total, 1))}%` }} /></div><b>{item.value}</b></div>)}</div>
          <a className={styles.link} href="/crm">Ver CRM →</a>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelTitle}>Recomendações</div>
          <div className={styles.recommendations}>{recommendations.map((item, index) => <div key={index} className={`${styles.recommendation} ${styles[item.level]}`}><strong>{item.title}</strong><p>{item.text}</p></div>)}</div>
        </section>
      </div>

      <section className={styles.kpis}>
        <div><span>Com WhatsApp</span><strong>{whatsappAvailable}</strong></div>
        <div><span>Sem contato</span><strong>{s.withoutContact}</strong></div>
        <div><span>Em aberto</span><strong>{s.active}</strong></div>
        <div><span>Pipeline</span><strong>{BRL(s.pipeline)}</strong></div>
        <div><span>Fechado</span><strong>{BRL(s.closed)}</strong></div>
      </section>
    </main>
  );
}
