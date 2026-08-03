"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { enrichLeadDataAction, saveConsultingWorkspaceAction } from "../../app/actions/consulting.js";
import s from "./ConsultingWorkspace.module.css";

function formatWhatsapp(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "Não encontrado";
  const local = digits.startsWith("55") ? digits.slice(2) : digits;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return digits;
}

function display(value) {
  return String(value || "").trim() || "Não encontrado";
}

function validationTagFor(data = {}) {
  const hasEmail = Boolean(String(data.email || "").trim());
  const hasRegistration = Boolean(String(data.registration || "").trim());
  if (hasEmail && hasRegistration) return "VALIDADO";
  if (hasEmail) return "FALTA REGISTRO";
  if (hasRegistration) return "FALTA EMAIL";
  return "NÃO VALIDADO";
}

export default function ConsultingWorkspace({ initialLead, initialWorkspace }) {
  const router = useRouter();
  const initial = initialWorkspace.consulting || {};
  const initialEnrichment = initial.contactEnrichment || {};

  const [lead, setLead] = useState(initialLead);
  const [websiteUrl, setWebsiteUrl] = useState(initial.websiteUrl || initialLead.site || "");
  const [instagramUrl, setInstagramUrl] = useState(initial.instagramUrl || initialLead.instagram || "");
  const [instagramNotes, setInstagramNotes] = useState(initial.instagramNotes || "");
  const [enrichment, setEnrichment] = useState({
    name: initialEnrichment.name || initialLead.name || "",
    email: initialEnrichment.email || initialLead.email || "",
    whatsapp: initialEnrichment.whatsapp || initialLead.whatsapp || initialLead.phone || "",
    city: initialEnrichment.city || initialLead.city || "",
    state: initialEnrichment.state || initialLead.location || "",
    profession: initialEnrichment.profession || initialLead.segment || "",
    council: initialEnrichment.council || initial.council || "",
    registration: initialEnrichment.registration || initial.registration || "",
    validationTag: initialEnrichment.validationTag || validationTagFor({ email: initialEnrichment.email || initialLead.email, registration: initialEnrichment.registration || initial.registration }),
    confidence: initialEnrichment.confidence || 0,
    evidence: initialEnrichment.evidence || [],
    sources: initialEnrichment.sources || [],
    inaccessibleSources: initialEnrichment.inaccessibleSources || [],
    ai: initialEnrichment.ai || {},
  });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeKind, setNoticeKind] = useState("success");

  const completeness = useMemo(() => {
    const essential = [enrichment.name, enrichment.email, enrichment.whatsapp, enrichment.city, enrichment.state];
    return Math.round((essential.filter(Boolean).length / essential.length) * 100);
  }, [enrichment]);

  function showNotice(message, kind = "success") {
    setNotice(message);
    setNoticeKind(kind);
  }

  async function saveSources() {
    setBusy(true);
    setNotice("");
    try {
      await saveConsultingWorkspaceAction(lead.id, { websiteUrl, instagramUrl, instagramNotes });
      showNotice("Fontes salvas.");
      router.refresh();
    } catch (error) {
      showNotice(`Erro: ${error.message}`, "error");
    } finally {
      setBusy(false);
    }
  }

  async function analyzeLead() {
    setBusy(true);
    setNotice("");
    try {
      const result = await enrichLeadDataAction({ leadId: lead.id, websiteUrl, instagramUrl, instagramNotes });
      setLead(result.lead);
      setEnrichment(result.enrichment);
      showNotice(`Análise concluída: ${result.enrichment.validationTag || validationTagFor(result.enrichment)}.`);
      router.refresh();
    } catch (error) {
      showNotice(`Erro na análise: ${error.message}`, "error");
    } finally {
      setBusy(false);
    }
  }

  const validationTag = enrichment.validationTag || validationTagFor(enrichment);

  return <main className={s.page}>
    <header className={s.header}>
      <div>
        <span>Diagnóstico e enriquecimento</span>
        <h1>Dados do lead</h1>
        <p>A IA analisa as fontes públicas e atualiza o mesmo cadastro do CRM.</p>
      </div>
      <div className={s.completeness}>
        <strong>{completeness}%</strong>
        <span>dados essenciais</span>
      </div>
    </header>

    {notice && <div className={`${s.notice} ${noticeKind === "error" ? s.noticeError : ""}`}>{notice}</div>}

    <section className={s.layout}>
      <div className={s.card}>
        <div className={s.cardHead}>
          <div><span>Fontes</span><h2>Onde a IA deve procurar</h2></div>
          <button type="button" disabled={busy} onClick={saveSources}>Salvar</button>
        </div>

        <label><span>Site do lead</span><input value={websiteUrl} onChange={event => setWebsiteUrl(event.target.value)} placeholder="https://empresa.com.br" /></label>
        <label><span>Instagram</span><input value={instagramUrl} onChange={event => setInstagramUrl(event.target.value)} placeholder="https://instagram.com/empresa" /></label>
        <label><span>Outros dados públicos</span><textarea value={instagramNotes} onChange={event => setInstagramNotes(event.target.value)} placeholder="Cole aqui links adicionais, bio do Instagram, texto do Facebook, Linktree, nome de profissionais ou outras informações públicas." /></label>

        <button className={s.primary} type="button" disabled={busy} onClick={analyzeLead}>{busy ? "Analisando fontes..." : "Analisar e atualizar CRM"}</button>
        <small>A análise prioriza e-mail e registro profissional. A tag é definida automaticamente após a análise.</small>
      </div>

      <div className={s.card}>
        <div className={s.cardHead}><div><span>Resultado</span><h2>Dados encontrados</h2></div><span className={s.confidence}>{Number(enrichment.confidence || 0)}% confiança</span></div>

        <div className={s.crmStatus}>
          <strong>TAG: {validationTag}</strong>
          <p>VALIDADO exige e-mail e registro. Quando faltar um deles, o sistema informa exatamente qual dado ainda precisa ser localizado.</p>
        </div>

        <div className={s.dataGrid}>
          <article><span>Nome</span><strong>{display(enrichment.name || lead.name)}</strong></article>
          <article><span>Profissão</span><strong>{display(enrichment.profession || lead.segment)}</strong></article>
          <article><span>E-mail</span><strong>{display(enrichment.email || lead.email)}</strong></article>
          <article><span>WhatsApp</span><strong>{formatWhatsapp(enrichment.whatsapp || lead.whatsapp || lead.phone)}</strong></article>
          <article><span>Cidade</span><strong>{display(enrichment.city || lead.city)}</strong></article>
          <article><span>Estado</span><strong>{display(enrichment.state || lead.location)}</strong></article>
          <article><span>Conselho</span><strong>{display(enrichment.council)}</strong></article>
          <article><span>Número de registro</span><strong>{display(enrichment.registration)}</strong></article>
        </div>
      </div>
    </section>

    <section className={s.details}>
      <div className={s.card}>
        <div className={s.cardHead}><div><span>Comprovação</span><h2>Evidências encontradas</h2></div></div>
        {enrichment.evidence?.length ? <ul>{enrichment.evidence.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul> : <p className={s.empty}>Nenhuma evidência textual foi retornada pela IA.</p>}
      </div>

      <div className={s.card}>
        <div className={s.cardHead}><div><span>Origem</span><h2>Fontes analisadas</h2></div></div>
        {enrichment.sources?.length ? <ul className={s.sources}>{enrichment.sources.map(url => <li key={url}><a href={url} target="_blank" rel="noopener noreferrer">{url}</a></li>)}</ul> : <p className={s.empty}>Nenhuma fonte foi analisada ainda.</p>}
        {enrichment.inaccessibleSources?.length > 0 && <div className={s.blocked}><strong>Fontes não acessíveis</strong>{enrichment.inaccessibleSources.map(item => <p key={item.url}>{item.url}: {item.error}</p>)}</div>}
      </div>
    </section>
  </main>;
}
