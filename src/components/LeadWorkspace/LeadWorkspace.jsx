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
  ["info", "Dados do profissional"],
  ["communication", "Comunicação"],
  ["objections", "Dúvidas e objeções"],
  ["analysis", "Análise jurídica"],
  ["schedule", "Agenda"],
];

const LEGAL_OBJECTIONS = [
  ["Como você conseguiu meu contato?", "Localizei seus dados profissionais em fontes públicas relacionadas à sua atuação. O contato tem caráter informativo e, caso prefira não receber novas mensagens, respeitarei imediatamente."],
  ["Tenho mesmo direito à restituição?", "Não é possível afirmar isso sem analisar sua situação e a documentação pertinente. O contato existe justamente para verificar se há possível enquadramento jurídico."],
  ["Isso é garantido?", "Não. Nenhum resultado pode ser garantido. A viabilidade depende dos fatos, documentos, período envolvido e interpretação jurídica aplicável ao caso individual."],
  ["Quais documentos são necessários?", "A relação exata depende da tese e do caso. Posso enviar a lista preliminar cadastrada pelo advogado e, após a análise inicial, confirmar o que realmente será necessário."],
  ["Preciso pagar para saber se me enquadro?", "A forma de análise e eventual cobrança deve seguir as condições definidas pelo advogado. Posso esclarecer o procedimento antes de qualquer contratação."],
  ["Não tenho interesse", "Compreendo e agradeço pela resposta. Registrarei sua opção e não farei novas abordagens sobre este assunto."],
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
  const profession = lead.profession || lead.segment || "profissional regulamentado";
  const council = lead.council ? ` vinculado ao ${lead.council}` : "";
  const lawyer = profile.professionalName || profile.name || "o advogado responsável";
  return [
    `ABERTURA\nOlá, falo com ${lead.name}? Meu nome é ${lawyer}.`,
    `\nMOTIVO DO CONTATO\nLocalizei seu perfil profissional como ${profession}${council} e estou entrando em contato para apresentar uma possibilidade de análise jurídica.`,
    `\nCONTEXTO\n${profile.thesisSummary || profile.thesisName || "A análise está relacionada a valores pagos por profissionais vinculados a órgãos de registro."}`,
    `\nVALIDAÇÃO\nAntes de qualquer conclusão, preciso entender sua situação e verificar os documentos aplicáveis.`,
    `\nPRÓXIMO PASSO\nPosso explicar brevemente os critérios e verificar se faz sentido realizar uma análise individual?`,
  ].join("\n");
}

function parseEmailResult(text) {
  const lines = String(text || "").split("\n");
  const first = lines[0] || "";
  if (/^ASSUNTO:/i.test(first)) return { subject: first.replace(/^ASSUNTO:\s*/i, "").trim(), body: lines.slice(1).join("\n").trim() };
  return { subject: "Possível análise jurídica relacionada ao seu registro profissional", body: String(text || "").trim() };
}

export default function LeadWorkspace({ initialLead, initialWorkspace, initialProfile = {} }) {
  const router = useRouter();
  const [lead, setLead] = useState(initialLead);
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [tab, setTab] = useState("info");
  const [kind, setKind] = useState("initial");
  const defaults = buildProfileMessages(initialLead, initialProfile);
  const [callScript, setCallScript] = useState(initialWorkspace.callScript || defaultCallScript(initialLead, initialProfile));
  const [whatsappMessage, setWhatsappMessage] = useState(initialWorkspace.whatsappMessage || defaults.initial);
  const [emailSubject, setEmailSubject] = useState(initialWorkspace.emailSubject || `Possível análise jurídica para ${initialLead.profession || initialLead.segment || "profissional regulamentado"}`);
  const [emailMessage, setEmailMessage] = useState(initialWorkspace.emailMessage || "");
  const [instagram, setInstagram] = useState(initialLead.instagram || "");
  const [notes, setNotes] = useState(initialLead.notes || "");
  const [analysisNotes, setAnalysisNotes] = useState(initialWorkspace.sale?.meetingNotes || "");
  const [appointment, setAppointment] = useState({
    date: initialLead.followUpAt || "",
    type: initialWorkspace.appointment?.type || "Reunião de análise",
    time: initialWorkspace.appointment?.time || "09:00",
    notes: initialWorkspace.appointment?.notes || "",
  });
  const [expanded, setExpanded] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");

  const currentStage = useMemo(() => STAGES.find(item => item.id === lead.stage), [lead.stage]);
  const whatsapp = waLink(lead, whatsappMessage);
  const mailto = lead.email ? `mailto:${lead.email}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailMessage)}` : "";

  async function mutateLead(action, patch, success) {
    const before = lead;
    setLead(current => ({ ...current, ...patch }));
    setNotice("");
    try { await action(); router.refresh(); if (success) setNotice(success); return true; }
    catch (error) { setLead(before); setNotice(`Erro: ${error.message}`); return false; }
  }

  async function persistWorkspace(patch, success) {
    const before = workspace;
    const next = { ...workspace, ...patch, appointment: { ...workspace.appointment, ...(patch.appointment || {}) }, sale: { ...workspace.sale, ...(patch.sale || {}) } };
    setWorkspace(next);
    try { const saved = await saveLeadWorkspaceAction(lead.id, patch); setWorkspace(saved); if (success) setNotice(success); return saved; }
    catch (error) { setWorkspace(before); setNotice(`Erro: ${error.message}`); return null; }
  }

  async function saveSourceData() {
    setBusy("source"); setNotice("");
    try {
      const normalizedInstagram = instagram.trim() || null;
      const updated = await LeadActions.updateLeadAction(lead.id, { instagram: normalizedInstagram });
      setLead(current => ({ ...current, instagram: updated?.instagram ?? normalizedInstagram }));
      router.refresh(); setNotice("Fonte complementar salva.");
    } catch (error) { setNotice(`Erro: ${error.message}`); }
    finally { setBusy(""); }
  }

  async function generateAI(target) {
    setBusy(target); setNotice("");
    try {
      const aiKind = target === "call" ? "call" : target === "email" ? "email" : kind;
      const currentMessage = target === "call" ? callScript : target === "email" ? `${emailSubject}\n${emailMessage}` : whatsappMessage;
      const result = await AIActions.generateLeadMessageAction({ lead: { ...lead, instagram }, kind: aiKind, currentMessage });
      if (target === "call") {
        setCallScript(result.text); await persistWorkspace({ callScript: result.text });
      } else if (target === "email") {
        const parsed = parseEmailResult(result.text);
        setEmailSubject(parsed.subject); setEmailMessage(parsed.body);
        await persistWorkspace({ emailSubject: parsed.subject, emailMessage: parsed.body });
      } else {
        setWhatsappMessage(result.text); await persistWorkspace({ whatsappMessage: result.text });
      }
      setNotice(`Comunicação gerada por ${result.providerName}${result.model ? ` · ${result.model}` : ""}. Revise antes do envio.`);
    } catch (error) { setNotice(`IA: ${error.message}`); }
    finally { setBusy(""); }
  }

  async function copy(text, message = "Copiado.") { await navigator.clipboard.writeText(text); setNotice(message); }

  async function saveAppointment(event) {
    event.preventDefault(); setBusy("appointment"); setNotice("");
    try {
      await LeadActions.setFollowUpAction(lead.id, appointment.date);
      const saved = await saveLeadWorkspaceAction(lead.id, { appointment });
      setLead(current => ({ ...current, followUpAt: appointment.date || null })); setWorkspace(saved); router.refresh(); setNotice("Agendamento salvo.");
    } catch (error) { setNotice(`Erro ao agendar: ${error.message}`); }
    finally { setBusy(""); }
  }

  async function saveAnalysis() {
    setBusy("analysis"); setNotice("");
    try {
      await LeadActions.setNotesAction(lead.id, notes);
      const sale = { ...workspace.sale, meetingNotes: analysisNotes };
      const saved = await saveLeadWorkspaceAction(lead.id, { sale });
      setWorkspace(saved); setLead(current => ({ ...current, notes })); router.refresh(); setNotice("Análise jurídica salva.");
    } catch (error) { setNotice(`Erro: ${error.message}`); }
    finally { setBusy(""); }
  }

  function selectMessageKind(value) { setKind(value); setWhatsappMessage(buildProfileMessages({ ...lead, instagram }, initialProfile)[value]); }

  function renderInformation() {
    const validation = lead.validationTag || "AGUARDANDO ANÁLISE";
    return <section className={s.section}>
      <h3>Dados cadastrais e profissionais</h3>
      <div className={s.infoCard}>
        {[
          ["Nome", lead.name], ["Profissão", lead.profession || lead.segment || "Não informada"],
          ["Conselho", lead.council || "Não localizado"], ["Registro", lead.registration || "Não localizado"],
          ["E-mail", lead.email || "Não localizado"], ["WhatsApp", lead.whatsapp || lead.phone || "Não localizado"],
          ["Cidade / Estado", [lead.city, lead.state || lead.location].filter(Boolean).join(" / ") || "Não informado"],
          ["Status de verificação", validation], ["Fonte", lead.source || "Não informada"],
        ].map(([label, value]) => <div className={s.infoRow} key={label}><span>{label}</span><strong>{value}</strong></div>)}
        <div className={s.infoRow}><span>Etapa do atendimento</span><div className={s.stageButtons}>{STAGES.map(stage => <button key={stage.id} className={lead.stage === stage.id ? s.activePill : ""} onClick={() => mutateLead(() => LeadActions.moveStageAction(lead.id, stage.id), { stage: stage.id }, `Etapa alterada para ${stage.label}.`)}>{stage.label}</button>)}</div></div>
        <div className={s.infoRow}><span>Fontes públicas</span><div className={s.inlineActions}>{lead.site ? <a href={lead.site} target="_blank" rel="noopener noreferrer">Abrir site ↗</a> : <em>Site não localizado</em>}{lead.mapsLink && <a href={lead.mapsLink} target="_blank" rel="noopener noreferrer">Abrir Google ↗</a>}</div></div>
      </div>
      <div className={s.digitalCard}>
        <div><h3>Fonte complementar</h3><p>Adicione o Instagram público para auxiliar a verificação dos dados profissionais.</p></div>
        <label><span>Instagram</span><input value={instagram} onChange={event => setInstagram(event.target.value)} placeholder="https://instagram.com/perfil" /></label>
        <div className={s.buttonRow}><button className={s.primary} disabled={busy === "source"} onClick={saveSourceData}>{busy === "source" ? "Salvando..." : "Salvar fonte"}</button></div>
      </div>
    </section>;
  }

  function renderCommunication() {
    return <section className={s.section}>
      <div className={s.scriptCard}>
        <div className={s.cardHeading}><div><h3>Mensagem para WhatsApp</h3><p>Personalizada com os dados do advogado, da tese e do profissional.</p></div>{whatsapp && <a className={s.whatsapp} href={whatsapp} target="_blank" rel="noopener noreferrer">Abrir WhatsApp</a>}</div>
        <div className={s.messageTabs}>{[["initial", "Primeiro contato"], ["followup", "Retomada"], ["recovery", "Encerramento respeitoso"]].map(([value, label]) => <button key={value} className={kind === value ? s.activePill : ""} onClick={() => selectMessageKind(value)}>{label}</button>)}</div>
        <textarea value={whatsappMessage} onChange={event => setWhatsappMessage(event.target.value)} />
        <div className={s.buttonRow}><button className={s.primary} disabled={busy === "whatsapp"} onClick={() => generateAI("whatsapp")}>{busy === "whatsapp" ? "Gerando..." : "Gerar com IA"}</button><button onClick={() => persistWorkspace({ whatsappMessage }, "Mensagem salva.")}>Salvar</button><button onClick={() => copy(whatsappMessage, "Mensagem copiada.")}>Copiar</button></div>
      </div>

      <div className={s.scriptCard}>
        <div className={s.cardHeading}><div><h3>E-mail jurídico</h3><p>Explicação detalhada da tese, sem promessa de resultado.</p></div>{mailto && <a href={mailto}>Abrir no e-mail</a>}</div>
        <label><span>Assunto</span><input value={emailSubject} onChange={event => setEmailSubject(event.target.value)} /></label>
        <textarea value={emailMessage} onChange={event => setEmailMessage(event.target.value)} placeholder="Gere o e-mail com a IA ou escreva manualmente." />
        <div className={s.buttonRow}><button className={s.primary} disabled={busy === "email"} onClick={() => generateAI("email")}>{busy === "email" ? "Gerando..." : "Gerar e-mail com IA"}</button><button onClick={() => persistWorkspace({ emailSubject, emailMessage }, "E-mail salvo.")}>Salvar</button><button onClick={() => copy(`Assunto: ${emailSubject}\n\n${emailMessage}`, "E-mail copiado.")}>Copiar</button></div>
      </div>

      <div className={s.scriptCard}>
        <div className={s.cardHeading}><div><h3>Roteiro de ligação</h3><p>Guia institucional para explicar o motivo do contato e realizar uma triagem inicial.</p></div>{lead.phone && <a href={`tel:${lead.phone}`}>Ligar agora</a>}</div>
        <textarea value={callScript} onChange={event => setCallScript(event.target.value)} />
        <div className={s.buttonRow}><button className={s.primary} disabled={busy === "call"} onClick={() => generateAI("call")}>{busy === "call" ? "Gerando..." : "Gerar com IA"}</button><button onClick={() => persistWorkspace({ callScript }, "Roteiro salvo.")}>Salvar</button><button onClick={() => copy(callScript, "Roteiro copiado.")}>Copiar</button></div>
      </div>
    </section>;
  }

  function renderObjections() {
    return <section className={s.section}><div className={s.objectionGroup}><h3>Dúvidas e respostas orientativas</h3><p>Revise as respostas conforme os dados reais da tese antes de utilizá-las.</p>{LEGAL_OBJECTIONS.map(([question, answer]) => <article className={s.objection} key={question}><button onClick={() => setExpanded(expanded === question ? "" : question)}><strong>“{question}”</strong><span>{expanded === question ? "−" : "+"}</span></button>{expanded === question && <div><p>{answer}</p><button onClick={() => copy(answer, "Resposta copiada.")}>Copiar resposta</button></div>}</article>)}</div></section>;
  }

  function renderAnalysis() {
    return <section className={s.section}>
      <h3>Análise jurídica interna</h3>
      <div className={s.saleForm}>
        <label className={s.full}><span>Observações de enquadramento</span><textarea value={analysisNotes} onChange={event => setAnalysisNotes(event.target.value)} placeholder="Registre fatos, período, órgão profissional, pagamentos e pontos que precisam de confirmação." /></label>
        <label className={s.full}><span>Anotações gerais do profissional</span><textarea value={notes} onChange={event => setNotes(event.target.value)} placeholder="Histórico de contato, documentos mencionados e próximos passos." /></label>
        <div className={`${s.buttonRow} ${s.full}`}><button className={s.primary} disabled={busy === "analysis"} onClick={saveAnalysis}>{busy === "analysis" ? "Salvando..." : "Salvar análise"}</button><button onClick={() => mutateLead(() => LeadActions.moveStageAction(lead.id, "negociacao"), { stage: "negociacao" }, "Profissional movido para análise jurídica.")}>Em análise jurídica</button><button className={s.wonButton} onClick={() => mutateLead(() => LeadActions.moveStageAction(lead.id, "ganho"), { stage: "ganho" }, "Profissional marcado como contratado.")}>Marcar como contratado</button><button className={s.lostButton} onClick={() => mutateLead(() => LeadActions.moveStageAction(lead.id, "perdido"), { stage: "perdido" }, "Profissional marcado como não elegível.")}>Marcar como não elegível</button></div>
      </div>
    </section>;
  }

  function renderSchedule() {
    return <section className={s.section}><h3>Novo agendamento</h3><form className={s.scheduleForm} onSubmit={saveAppointment}>
      <label><span>Tipo</span><select value={appointment.type} onChange={event => setAppointment(current => ({ ...current, type: event.target.value }))}><option>Ligação inicial</option><option>Reunião de análise</option><option>Solicitação de documentos</option><option>Retorno jurídico</option><option>Assinatura contratual</option></select></label>
      <label><span>Data</span><input required type="date" value={appointment.date} onChange={event => setAppointment(current => ({ ...current, date: event.target.value }))} /></label>
      <label><span>Hora</span><input required type="time" value={appointment.time} onChange={event => setAppointment(current => ({ ...current, time: event.target.value }))} /></label>
      <label className={s.full}><span>Observações</span><textarea value={appointment.notes} onChange={event => setAppointment(current => ({ ...current, notes: event.target.value }))} placeholder="Documentos, pauta e orientações para o atendimento." /></label>
      <button className={`${s.primary} ${s.full}`} disabled={busy === "appointment"}>{busy === "appointment" ? "Salvando..." : "Confirmar agendamento"}</button>
    </form></section>;
  }

  const content = tab === "info" ? renderInformation() : tab === "communication" ? renderCommunication() : tab === "objections" ? renderObjections() : tab === "analysis" ? renderAnalysis() : renderSchedule();

  return <main className={s.page}>
    <div className={s.breadcrumb}><a href="/crm">← Acompanhamento</a><span>/</span><strong>{lead.name}</strong></div>
    <section className={s.workspace}>
      <header className={s.workspaceHeader}>
        <div className={s.leadTitle}><h1>{lead.name}</h1></div>
        <p>{currentStage?.label || lead.stage} · {[lead.profession || lead.segment, lead.council, lead.city, lead.state || lead.location].filter(Boolean).join(" · ")}</p>
      </header>
      <nav className={s.tabs}>{TABS.map(([value, label]) => <button key={value} className={tab === value ? s.tabActive : ""} onClick={() => setTab(value)}>{label}</button>)}</nav>
      {notice && <div className={notice.startsWith("Erro") || notice.startsWith("IA:") ? s.error : s.notice}>{notice}</div>}
      <div className={s.content}>{content}</div>
    </section>
  </main>;
}
