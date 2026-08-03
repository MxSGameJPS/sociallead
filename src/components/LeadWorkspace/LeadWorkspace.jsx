"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { STAGES } from "../../services/leads/stages.js";
import { buildProfileMessages } from "../../services/leads/profileMessages.js";
import * as LeadActions from "../../app/actions/leads.js";
import * as AIActions from "../../app/actions/ai.js";
import { saveLeadWorkspaceAction } from "../../app/actions/workspaces.js";
import s from "./LeadWorkspace.module.css";

const TABS = [
  ["info", "Informações"],
  ["scripts", "Roteiros"],
  ["objections", "Objeções"],
  ["sale", "Venda"],
  ["schedule", "Agendar"],
];

const UNIVERSAL_OBJECTIONS = [
  ["Não tenho dinheiro / está caro", "Entendo. Antes de falar em valor, posso te perguntar o que precisaria acontecer para esse investimento fazer sentido? A ideia é começar pelo que resolve o problema principal, sem incluir coisa desnecessária."],
  ["Estou ocupado / não tenho tempo", "Sem problema. Eu consigo resumir em dois minutos ou deixar as informações organizadas para você olhar quando puder. Qual horário costuma ser mais tranquilo?"],
  ["Manda por WhatsApp / e-mail", "Claro. Para eu não mandar algo genérico, me diz só uma coisa: hoje o que mais incomoda na presença digital do negócio? Aí envio algo direto ao ponto."],
  ["Vou pensar / depois retorno", "Perfeito. O que você precisa avaliar para decidir: investimento, prazo, confiança na solução ou conversar com outra pessoa? Assim eu envio exatamente o que ajuda nessa decisão."],
  ["Já tenho quem cuida disso", "Ótimo, isso mostra que vocês valorizam o digital. Minha proposta não é substituir alguém sem necessidade; posso fazer uma análise objetiva e mostrar oportunidades que talvez ainda não estejam sendo trabalhadas."],
];

const SALE_STEPS = [
  ["Quebra-gelo e rapport", "Comece perguntando sobre o negócio, tempo de mercado e rotina. O objetivo é criar conexão antes de apresentar qualquer solução."],
  ["Diagnóstico", "Pergunte como os clientes encontram a empresa hoje, quais canais funcionam e onde existe dificuldade."],
  ["Apresentação da solução", "Conecte cada parte da proposta a algo que o cliente relatou. Evite apresentar recursos sem contexto."],
  ["Demonstração", "Apresente a solução devagar e explique o caminho que o cliente final faria até entrar em contato ou comprar."],
  ["Pergunta de interesse", "Pergunte o que ele achou e escute sem interromper. A resposta indica se existe interesse ou objeção."],
  ["Oferta", "Apresente escopo, valor, forma de pagamento e prazo somente com dados que você realmente poderá cumprir."],
];

function isMobilePhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  const local = digits.startsWith("55") ? digits.slice(2) : digits;
  return /^\d{2}9\d{8}$/.test(local);
}

function waLink(lead, message = "") {
  const raw = lead.whatsapp || (isMobilePhone(lead.phone) ? lead.phone : "");
  let digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return null;
  if (!digits.startsWith("55")) digits = `55${digits}`;
  return `https://wa.me/${digits}${message ? `?text=${encodeURIComponent(message)}` : ""}`;
}

function defaultCallScript(lead, profile) {
  const location = [lead.city, lead.location].filter(Boolean).join(" / ");
  const intro = [profile?.name, profile?.profession].filter(Boolean).join(", ") || "trabalho com soluções digitais";
  return [
    `ABERTURA\nOlá, falo com a pessoa responsável pela ${lead.name}? Aqui é ${intro}.`,
    `\nCONTEXTO\nEncontrei o perfil da empresa no Google${location ? ` em ${location}` : ""}${lead.googleRating ? ` e vi a avaliação ${lead.googleRating}/5` : ""}.`,
    `\nDIAGNÓSTICO\nHoje vocês usam qual canal como principal para apresentar o negócio e receber novos contatos?`,
    `\nCONEXÃO\n${lead.problem || `Percebi uma oportunidade de melhorar a presença digital do nicho de ${lead.segment || "vocês"}.`}`,
    `\nPRÓXIMO PASSO\nPosso explicar rapidamente a ideia e entender se faz sentido para vocês?`,
  ].join("\n");
}

export default function LeadWorkspace({ initialLead, initialWorkspace, initialProfile = {} }) {
  const router = useRouter();
  const [lead, setLead] = useState(initialLead);
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [tab, setTab] = useState("info");
  const [kind, setKind] = useState("initial");
  const initialMessages = buildProfileMessages(initialLead, initialProfile, "");
  const [callScript, setCallScript] = useState(initialWorkspace.callScript || defaultCallScript(initialLead, initialProfile));
  const [whatsappMessage, setWhatsappMessage] = useState(initialWorkspace.whatsappMessage || initialMessages.initial);
  const [instagram, setInstagram] = useState(initialLead.instagram || "");
  const [proposalValue, setProposalValue] = useState(String(initialLead.proposalValue || ""));
  const [notes, setNotes] = useState(initialLead.notes || "");
  const [appointment, setAppointment] = useState({
    date: initialLead.followUpAt || "",
    type: initialWorkspace.appointment?.type || "Reunião",
    time: initialWorkspace.appointment?.time || "09:00",
    notes: initialWorkspace.appointment?.notes || "",
  });
  const [sale, setSale] = useState(initialWorkspace.sale || { paymentTerms: "", meetingNotes: "", outcome: "open" });
  const [expanded, setExpanded] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");

  const currentStage = useMemo(() => STAGES.find(item => item.id === lead.stage), [lead.stage]);
  const status = lead.stage === "ganho" ? "won" : lead.stage === "perdido" ? "lost" : "open";
  const whatsapp = waLink(lead, whatsappMessage);

  async function mutateLead(action, patch, success) {
    const before = lead;
    setLead(current => ({ ...current, ...patch }));
    setNotice("");
    try {
      await action();
      router.refresh();
      if (success) setNotice(success);
      return true;
    } catch (error) {
      setLead(before);
      setNotice(`Erro: ${error.message}`);
      return false;
    }
  }

  async function persistWorkspace(patch, success) {
    const before = workspace;
    const next = {
      ...workspace,
      ...patch,
      appointment: { ...workspace.appointment, ...(patch.appointment || {}) },
      sale: { ...workspace.sale, ...(patch.sale || {}) },
    };
    setWorkspace(next);
    try {
      const saved = await saveLeadWorkspaceAction(lead.id, patch);
      setWorkspace(saved);
      if (success) setNotice(success);
      return saved;
    } catch (error) {
      setWorkspace(before);
      setNotice(`Erro: ${error.message}`);
      return null;
    }
  }

  async function saveDigitalData() {
    setBusy("digital");
    setNotice("");
    try {
      const normalizedInstagram = instagram.trim() || null;
      const updatedLead = await LeadActions.updateLeadAction(lead.id, { instagram: normalizedInstagram });
      setLead(current => ({ ...current, instagram: updatedLead?.instagram ?? normalizedInstagram }));
      router.refresh();
      setNotice("Instagram salvo.");
    } catch (error) {
      setNotice(`Erro: ${error.message}`);
    } finally {
      setBusy("");
    }
  }

  async function generateAI(target) {
    setBusy(target);
    setNotice("");
    try {
      const result = await AIActions.generateLeadMessageAction({
        lead: { ...lead, instagram },
        kind: target === "call" ? "call" : kind,
        currentMessage: target === "call" ? callScript : whatsappMessage,
      });
      if (target === "call") {
        setCallScript(result.text);
        await persistWorkspace({ callScript: result.text });
      } else {
        setWhatsappMessage(result.text);
        await persistWorkspace({ whatsappMessage: result.text });
      }
      setNotice(`Conteúdo gerado por ${result.providerName}${result.model ? ` · ${result.model}` : ""}. Revise antes de usar.`);
    } catch (error) {
      setNotice(`IA: ${error.message}`);
    } finally {
      setBusy("");
    }
  }

  async function copy(text, message = "Copiado.") {
    await navigator.clipboard.writeText(text);
    setNotice(message);
  }

  async function saveAppointment(event) {
    event.preventDefault();
    setBusy("appointment");
    setNotice("");
    try {
      await LeadActions.setFollowUpAction(lead.id, appointment.date);
      const saved = await saveLeadWorkspaceAction(lead.id, { appointment: { type: appointment.type, time: appointment.time, notes: appointment.notes } });
      setLead(current => ({ ...current, followUpAt: appointment.date || null }));
      setWorkspace(saved);
      router.refresh();
      setNotice("Agendamento salvo.");
    } catch (error) {
      setNotice(`Erro ao agendar: ${error.message}`);
    } finally {
      setBusy("");
    }
  }

  async function saveSale() {
    setBusy("sale");
    setNotice("");
    try {
      await LeadActions.setProposalValueAction(lead.id, proposalValue || 0);
      await LeadActions.setNotesAction(lead.id, notes);
      const saved = await saveLeadWorkspaceAction(lead.id, { sale });
      setLead(current => ({ ...current, proposalValue: Number.parseInt(proposalValue || "0", 10) || 0, notes }));
      setWorkspace(saved);
      router.refresh();
      setNotice("Informações da venda salvas.");
    } catch (error) {
      setNotice(`Erro ao salvar venda: ${error.message}`);
    } finally {
      setBusy("");
    }
  }

  function selectMessageKind(value) {
    setKind(value);
    setWhatsappMessage(buildProfileMessages({ ...lead, instagram }, initialProfile, "")[value]);
  }

  function renderInformation() {
    return <section className={s.section}>
      <h3>Informações</h3>
      <div className={s.infoCard}>
        {[
          ["Categoria", lead.segment || "Não informada"],
          ["Cidade", [lead.city, lead.location].filter(Boolean).join(", ") || "Não informada"],
          ["Telefone", lead.phone || lead.whatsapp || "Não encontrado"],
          ["Endereço", lead.address || "Não informado"],
          ["Avaliação", lead.googleRating ? `${lead.googleRating}/5 · ${lead.googleReviews || 0} avaliações` : "Sem avaliação"],
          ["Fonte", lead.source || "Não informada"],
        ].map(([label, value]) => <div className={s.infoRow} key={label}><span>{label}</span><strong>{value}</strong></div>)}

        <div className={s.infoRow}><span>Etapa</span><div className={s.stageButtons}>{STAGES.map(stage => <button key={stage.id} className={lead.stage === stage.id ? s.activePill : ""} onClick={() => mutateLead(() => LeadActions.moveStageAction(lead.id, stage.id), { stage: stage.id }, `Etapa alterada para ${stage.label}.`)}>{stage.label}</button>)}</div></div>
        <div className={s.infoRow}><span>Site atual</span><div className={s.inlineActions}>{lead.site ? <a href={lead.site} target="_blank" rel="noopener noreferrer">Visitar presença ↗</a> : <em>Não encontrado</em>}{lead.mapsLink && <a href={lead.mapsLink} target="_blank" rel="noopener noreferrer">Ver no Google ↗</a>}</div></div>
        <div className={s.infoRow}><span>Status</span><div className={s.statusButtons}><button className={status === "open" ? s.activePill : ""} onClick={() => mutateLead(() => LeadActions.moveStageAction(lead.id, "negociacao"), { stage: "negociacao" })}>Em aberto</button><button className={status === "won" ? s.won : ""} onClick={() => mutateLead(() => LeadActions.moveStageAction(lead.id, "ganho"), { stage: "ganho" }, "Venda marcada como ganha.")}>Ganho</button><button className={status === "lost" ? s.lost : ""} onClick={() => mutateLead(() => LeadActions.moveStageAction(lead.id, "perdido"), { stage: "perdido" }, "Lead marcado como perdido.")}>Perdido</button></div></div>
      </div>

      <div className={s.digitalCard}>
        <div><h3>Presença digital do cliente</h3><p>O Instagram cadastrado será utilizado pela IA nas mensagens e análises.</p></div>
        <label><span>Instagram do cliente</span><input value={instagram} onChange={event => setInstagram(event.target.value)} placeholder="https://instagram.com/perfil" /></label>
        <div className={s.buttonRow}><button className={s.primary} disabled={busy === "digital"} onClick={saveDigitalData}>{busy === "digital" ? "Salvando..." : "Salvar Instagram"}</button></div>
      </div>
    </section>;
  }

  function renderScripts() {
    return <section className={s.section}>
      <div className={s.scriptCard}>
        <div className={s.cardHeading}><div><h3>Roteiro de ligação</h3><p>Use como guia; não precisa ler palavra por palavra.</p></div>{lead.phone && <a href={`tel:${lead.phone}`}>Ligar agora</a>}</div>
        <textarea value={callScript} onChange={event => setCallScript(event.target.value)} />
        <div className={s.buttonRow}><button className={s.primary} disabled={busy === "call"} onClick={() => generateAI("call")}>{busy === "call" ? "Gerando..." : "Gerar com IA"}</button><button onClick={() => persistWorkspace({ callScript }, "Roteiro salvo.")}>Salvar</button><button onClick={() => copy(callScript, "Roteiro copiado.")}>Copiar</button></div>
      </div>

      <div className={s.scriptCard}>
        <div className={s.cardHeading}><div><h3>Mensagem WhatsApp</h3><p>Usa seu perfil, os dados do Google, o nicho e o Instagram do cliente.</p></div>{whatsapp && <a className={s.whatsapp} href={whatsapp} target="_blank" rel="noopener noreferrer">Chamar no WhatsApp</a>}</div>
        <div className={s.messageTabs}>{[["initial", "Primeiro contato"], ["followup", "Follow-up"], ["recovery", "Recuperar"]].map(([value, label]) => <button key={value} className={kind === value ? s.activePill : ""} onClick={() => selectMessageKind(value)}>{label}</button>)}</div>
        <textarea value={whatsappMessage} onChange={event => setWhatsappMessage(event.target.value)} />
        <div className={s.buttonRow}><button className={s.primary} disabled={busy === "whatsapp"} onClick={() => generateAI("whatsapp")}>{busy === "whatsapp" ? "Gerando..." : "Gerar com IA"}</button><button onClick={() => persistWorkspace({ whatsappMessage }, "Mensagem salva.")}>Salvar</button><button onClick={() => copy(whatsappMessage, "Mensagem copiada.")}>Copiar</button></div>
      </div>
    </section>;
  }

  function renderObjections() {
    return <section className={s.section}><div className={s.objectionGroup}><h3>Objeções universais</h3>{UNIVERSAL_OBJECTIONS.map(([question, answer]) => {
      const key = question;
      return <article className={s.objection} key={key}><button onClick={() => setExpanded(expanded === key ? "" : key)}><strong>“{question}”</strong><span>{expanded === key ? "−" : "+"}</span></button>{expanded === key && <div><p>{answer}</p><button onClick={() => copy(answer, "Resposta copiada.")}>Copiar resposta</button></div>}</article>;
    })}</div></section>;
  }

  function renderSale() {
    return <section className={s.section}>
      <h3>Roteiro da reunião</h3>
      <div className={s.saleSteps}>{SALE_STEPS.map(([title, text], index) => <article key={title}><span>{index + 1}</span><div><strong>{title}</strong><p>{text}</p></div></article>)}</div>
      <div className={s.saleForm}>
        <label><span>Valor da proposta</span><div className={s.moneyInput}><b>R$</b><input inputMode="numeric" value={proposalValue} onChange={event => setProposalValue(event.target.value.replace(/\D/g, ""))} /></div></label>
        <label><span>Condições de pagamento</span><input value={sale.paymentTerms || ""} onChange={event => setSale(current => ({ ...current, paymentTerms: event.target.value }))} placeholder="Ex.: entrada + 2 parcelas" /></label>
        <label className={s.full}><span>Anotações da reunião</span><textarea value={sale.meetingNotes || ""} onChange={event => setSale(current => ({ ...current, meetingNotes: event.target.value }))} /></label>
        <label className={s.full}><span>Anotações gerais do lead</span><textarea value={notes} onChange={event => setNotes(event.target.value)} /></label>
        <div className={`${s.buttonRow} ${s.full}`}><button className={s.primary} disabled={busy === "sale"} onClick={saveSale}>{busy === "sale" ? "Salvando..." : "Salvar venda"}</button><button className={s.wonButton} onClick={() => mutateLead(() => LeadActions.moveStageAction(lead.id, "ganho"), { stage: "ganho" }, "Venda concluída.")}>Marcar como ganho</button><button className={s.lostButton} onClick={() => mutateLead(() => LeadActions.moveStageAction(lead.id, "perdido"), { stage: "perdido" }, "Lead encerrado como perdido.")}>Marcar como perdido</button></div>
      </div>
    </section>;
  }

  function renderSchedule() {
    return <section className={s.section}><h3>Novo agendamento</h3><form className={s.scheduleForm} onSubmit={saveAppointment}>
      <label><span>Tipo</span><select value={appointment.type} onChange={event => setAppointment(current => ({ ...current, type: event.target.value }))}><option>Ligação</option><option>Reunião</option><option>Apresentação</option><option>Follow-up</option><option>Envio de proposta</option></select></label>
      <label><span>Data</span><input required type="date" value={appointment.date} onChange={event => setAppointment(current => ({ ...current, date: event.target.value }))} /></label>
      <label><span>Hora</span><input required type="time" value={appointment.time} onChange={event => setAppointment(current => ({ ...current, time: event.target.value }))} /></label>
      <label className={s.full}><span>Observações</span><textarea value={appointment.notes} onChange={event => setAppointment(current => ({ ...current, notes: event.target.value }))} placeholder="Adicione uma observação..." /></label>
      <button className={`${s.primary} ${s.full}`} disabled={busy === "appointment"}>{busy === "appointment" ? "Salvando..." : "Confirmar agendamento"}</button>
    </form></section>;
  }

  const content = tab === "info" ? renderInformation()
    : tab === "scripts" ? renderScripts()
      : tab === "objections" ? renderObjections()
        : tab === "sale" ? renderSale()
          : renderSchedule();

  return <main className={s.page}>
    <div className={s.breadcrumb}><a href="/crm">← CRM</a><span>/</span><strong>{lead.name}</strong></div>
    <section className={s.workspace}>
      <header className={s.workspaceHeader}>
        <div className={s.leadTitle}><span className={`${s.scoreBadge} ${s[`grade${lead.grade}`]}`}>{lead.score}</span><span className={`${s.gradeBadge} ${s[`grade${lead.grade}`]}`}>{lead.grade === "A" ? "Quente" : lead.grade === "B" ? "Morno" : `Nota ${lead.grade}`}</span><h1>{lead.name}</h1></div>
        <p>{currentStage?.label || lead.stage} · {[lead.segment, lead.city, lead.location].filter(Boolean).join(" · ")}</p>
      </header>
      <nav className={s.tabs}>{TABS.map(([value, label]) => <button key={value} className={tab === value ? s.tabActive : ""} onClick={() => setTab(value)}>{label}</button>)}</nav>
      {notice && <div className={notice.startsWith("Erro") || notice.startsWith("IA:") ? s.error : s.notice}>{notice}</div>}
      <div className={s.content}>{content}</div>
    </section>
  </main>;
}
