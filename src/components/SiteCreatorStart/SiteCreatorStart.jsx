"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createSiteProjectAction } from "../../app/actions/projects.js";
import s from "./SiteCreatorStart.module.css";

function BuildIcon() {
  return <svg viewBox="0 0 64 64" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 18h38v28H13z"/><path d="M13 25h38M20 18v28"/><path d="m31 35 4 4 8-9"/></svg>;
}

function ArrowIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>;
}

export default function SiteCreatorStart({ leads = [], initialLeadId = "" }) {
  const router = useRouter();
  const [mode, setMode] = useState(initialLeadId ? "lead" : "describe");
  const [leadId, setLeadId] = useState(initialLeadId || leads[0]?.id || "");
  const [name, setName] = useState("");
  const [segment, setSegment] = useState("");
  const [city, setCity] = useState("");
  const [source, setSource] = useState("");
  const [template, setTemplate] = useState("institutional");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const selectedLead = useMemo(() => leads.find(lead => lead.id === leadId) || null, [leadId, leads]);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    try {
      const project = await createSiteProjectAction({ mode, leadId, name, segment, city, source, template });
      setNotice(`Prévia criada em ${project.folderPath}.`);
      router.push("/projetos");
      router.refresh();
    } catch (error) {
      setNotice(`Erro: ${error.message}`);
      setBusy(false);
    }
  }

  return <main className={s.page}>
    <div className={s.hero}>
      <div className={s.spark}><BuildIcon /></div>
      <h1>Criar uma prévia profissional</h1>
      <p>O LeadFlow usa os dados do CRM, informações do Google e o provedor de IA configurado para gerar um projeto pronto para validação.</p>
    </div>

    <form className={s.creator} onSubmit={submit}>
      <div className={s.tabs}>
        <button type="button" className={mode === "describe" ? s.active : ""} onClick={() => setMode("describe")}>Descrever negócio</button>
        <button type="button" className={mode === "google" ? s.active : ""} onClick={() => setMode("google")}>Link do Google</button>
        <button type="button" className={mode === "lead" ? s.active : ""} onClick={() => setMode("lead")}>Lead existente</button>
      </div>

      <div className={s.body}>
        {mode === "lead" && <>
          <label className={s.leadSelect}><span>Escolha o lead</span><select required value={leadId} onChange={event => setLeadId(event.target.value)}><option value="">Selecione...</option>{leads.map(lead => <option key={lead.id} value={lead.id}>{lead.name} · {lead.city || lead.location || "Local não informado"}</option>)}</select></label>
          {selectedLead && <div className={s.selectedLead}><span>{selectedLead.name.slice(0, 1).toUpperCase()}</span><div><strong>{selectedLead.name}</strong><small>{selectedLead.segment || "Sem categoria"} · {selectedLead.city || selectedLead.location || "Local não informado"}</small></div><a href={`/crm/${selectedLead.id}`}>Abrir CRM</a></div>}
        </>}

        {mode === "describe" && <div className={s.formGrid}>
          <label><span>Nome do negócio</span><input required value={name} onChange={event => setName(event.target.value)} placeholder="Ex.: Pizzaria da Serra" /></label>
          <label><span>Categoria</span><input value={segment} onChange={event => setSegment(event.target.value)} placeholder="Ex.: Pizzaria" /></label>
          <label><span>Cidade</span><input value={city} onChange={event => setCity(event.target.value)} placeholder="Ex.: Dois Irmãos" /></label>
          <label className={s.full}><span>Descrição do negócio</span><textarea required value={source} onChange={event => setSource(event.target.value)} placeholder="Descreva serviços confirmados, diferenciais reais, público e objetivo do site." /></label>
        </div>}

        {mode === "google" && <div className={s.formGrid}>
          <label><span>Nome do negócio</span><input required value={name} onChange={event => setName(event.target.value)} /></label>
          <label><span>Categoria</span><input value={segment} onChange={event => setSegment(event.target.value)} /></label>
          <label><span>Cidade</span><input value={city} onChange={event => setCity(event.target.value)} /></label>
          <label className={s.full}><span>Link do Google Maps</span><input required type="url" value={source} onChange={event => setSource(event.target.value)} placeholder="https://maps.google.com/..." /></label>
        </div>}

        <div className={s.rules}>
          <strong>Padrão obrigatório da prévia</strong>
          <span>Sem emojis, sem textos genéricos, sem promessas inventadas e sem aparência de template automático. Ícones serão SVG e o rodapé terá a assinatura “Prévia desenvolvida por Saulo Pavanello”.</span>
        </div>

        <div className={s.footer}>
          <select value={template} onChange={event => setTemplate(event.target.value)}>
            <option value="institutional">Site institucional</option>
            <option value="landing">Landing page</option>
            <option value="menu">Cardápio / delivery</option>
            <option value="booking">Serviços / agendamento</option>
          </select>
          <span>O projeto será criado em <code>generated-sites/nome-do-lead</code>, pronto para abrir em uma IDE.</span>
          <button disabled={busy || (mode === "lead" && !leadId)}>{busy ? "Criando site..." : <><span>Criar agora</span><ArrowIcon /></>}</button>
        </div>
      </div>
    </form>

    {notice && <div className={notice.startsWith("Erro") ? s.notice : s.success}>{notice}</div>}
  </main>;
}
