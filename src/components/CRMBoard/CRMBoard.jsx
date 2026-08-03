"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { STAGES, STAGE_IDS } from "../../services/leads/stages.js";
import { createLeadAction, deleteLeadAction, deleteLeadsAction, moveStageAction } from "../../app/actions/leads.js";
import s from "./CRMBoard.module.css";

const STAGE_COLOR = {
  novo: "#8b949e", contatado: "#1473e6", sem_resposta: "#f59e0b", com_resposta: "#0ea5a5",
  proposta: "#6d5ce7", proposta_rejeitada: "#ef4444", negociacao: "#f2760c", ganho: "#22c55e", perdido: "#ef4444",
};

const GRADE_LABEL = { A: "Quente", B: "Morno", C: "Potencial", D: "Frio" };
const TAG_CLASS = {
  "VALIDADO": "validated",
  "FALTA REGISTRO": "missing",
  "FALTA EMAIL": "missing",
  "NÃO VALIDADO": "invalid",
  "AGUARDANDO ANÁLISE": "pending",
};

function normalizeFilterValue(value) {
  return String(value || "").trim().toLocaleLowerCase("pt-BR");
}

function isPossibleMobile(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  const local = digits.startsWith("55") ? digits.slice(2) : digits;
  return /^\d{2}9\d{8}$/.test(local);
}

function whatsappUrl(lead) {
  const raw = lead.whatsapp || (isPossibleMobile(lead.phone) ? lead.phone : "");
  let digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return null;
  if (!digits.startsWith("55")) digits = `55${digits}`;
  return `https://wa.me/${digits}`;
}

function validationLabel(lead) {
  return String(lead.validationTag || "AGUARDANDO ANÁLISE").toUpperCase();
}

export default function CRMBoard({ initialLeads = [] }) {
  const router = useRouter();
  const [leads, setLeads] = useState(initialLeads);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [search, setSearch] = useState("");
  const [nicheFilter, setNicheFilter] = useState("all");
  const [gradeFilter, setGradeFilter] = useState("all");
  const [quick, setQuick] = useState("all");
  const [sort, setSort] = useState("recent");
  const [dragOver, setDragOver] = useState("");
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeKind, setNoticeKind] = useState("error");
  const [form, setForm] = useState({ name: "", segment: "", city: "", location: "", phone: "" });

  useEffect(() => {
    setLeads(initialLeads);
    const available = new Set(initialLeads.map(lead => lead.id));
    setSelectedIds(current => new Set([...current].filter(id => available.has(id))));
  }, [initialLeads]);

  const nicheOptions = useMemo(() => {
    const grouped = new Map();
    for (const lead of leads) {
      const label = String(lead.segment || lead.profession || "").trim();
      if (!label) continue;
      const value = normalizeFilterValue(label);
      const current = grouped.get(value);
      if (current) current.count++;
      else grouped.set(value, { value, label, count: 1 });
    }
    return [...grouped.values()].sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [leads]);

  const visible = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    const filtered = leads.filter(lead => {
      const tag = validationLabel(lead);
      if (query) {
        const haystack = [lead.name, lead.segment, lead.profession, lead.city, lead.location, lead.phone, lead.whatsapp, lead.email, lead.registration, tag]
          .filter(Boolean).join(" ").toLocaleLowerCase("pt-BR");
        if (!haystack.includes(query)) return false;
      }
      if (nicheFilter !== "all" && normalizeFilterValue(lead.segment || lead.profession) !== nicheFilter) return false;
      if (gradeFilter !== "all" && lead.grade !== gradeFilter) return false;
      if (quick === "no-site" && lead.site && !lead.weakSite) return false;
      if (quick === "score" && Number(lead.score || 0) < 50) return false;
      if (quick === "phone" && !lead.phone && !lead.whatsapp) return false;
      if (quick === "whatsapp" && !lead.whatsapp && !isPossibleMobile(lead.phone)) return false;
      if (quick === "validated" && tag !== "VALIDADO") return false;
      if (quick === "pending" && tag !== "AGUARDANDO ANÁLISE") return false;
      if (quick === "manual" && !["FALTA REGISTRO", "FALTA EMAIL", "NÃO VALIDADO"].includes(tag)) return false;
      return true;
    });
    return filtered.sort((a, b) => {
      if (sort === "score") return Number(b.score || 0) - Number(a.score || 0);
      if (sort === "name") return String(a.name).localeCompare(String(b.name), "pt-BR");
      return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0);
    });
  }, [leads, nicheFilter, gradeFilter, quick, search, sort]);

  const byStage = useMemo(() => {
    const grouped = Object.fromEntries(STAGE_IDS.map(id => [id, []]));
    for (const lead of visible) if (grouped[lead.stage]) grouped[lead.stage].push(lead);
    return grouped;
  }, [visible]);

  const selectedCount = selectedIds.size;
  const allVisibleSelected = visible.length > 0 && visible.every(lead => selectedIds.has(lead.id));
  const activeFilterCount = [Boolean(search.trim()), nicheFilter !== "all", gradeFilter !== "all", quick !== "all"].filter(Boolean).length;

  function showNotice(message, kind = "error") { setNoticeKind(kind); setNotice(message); }
  function clearFilters() { setSearch(""); setNicheFilter("all"); setGradeFilter("all"); setQuick("all"); }
  function toggleLeadSelection(id) {
    setSelectedIds(current => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }
  function toggleVisibleSelection() {
    setSelectedIds(current => {
      const next = new Set(current);
      for (const lead of visible) allVisibleSelected ? next.delete(lead.id) : next.add(lead.id);
      return next;
    });
  }

  async function moveLead(leadId, stage) {
    const previous = leads;
    setLeads(current => current.map(lead => lead.id === leadId ? { ...lead, stage } : lead));
    try { await moveStageAction(leadId, stage); router.refresh(); }
    catch (error) { setLeads(previous); showNotice(`Erro ao mover lead: ${error.message}`); }
  }

  async function createLead(event) {
    event.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true); setNotice("");
    try {
      const created = await createLeadAction({ ...form, source: "Manual", stage: "novo", score: 10, grade: "D", weakSite: true });
      setLeads(current => [{ ...created, validationTag: "AGUARDANDO ANÁLISE" }, ...current]);
      setForm({ name: "", segment: "", city: "", location: "", phone: "" });
      setCreating(false); router.refresh();
    } catch (error) { showNotice(`Erro ao criar lead: ${error.message}`); }
    finally { setSaving(false); }
  }

  async function removeLead(lead) {
    if (!window.confirm(`Excluir o lead "${lead.name}" do CRM? Esta ação não pode ser desfeita.`)) return;
    setDeleting(true); setNotice("");
    try {
      await deleteLeadAction(lead.id);
      setLeads(current => current.filter(item => item.id !== lead.id));
      setSelectedIds(current => { const next = new Set(current); next.delete(lead.id); return next; });
      showNotice(`Lead "${lead.name}" excluído com sucesso.`, "success"); router.refresh();
    } catch (error) { showNotice(`Erro ao excluir lead: ${error.message}`); }
    finally { setDeleting(false); }
  }

  async function removeSelectedLeads() {
    const ids = [...selectedIds].filter(id => leads.some(lead => lead.id === id));
    if (!ids.length || !window.confirm(`Excluir ${ids.length} lead${ids.length === 1 ? "" : "s"} selecionado${ids.length === 1 ? "" : "s"}?`)) return;
    setDeleting(true); setNotice("");
    try {
      const result = await deleteLeadsAction(ids);
      const removed = new Set(ids);
      setLeads(current => current.filter(lead => !removed.has(lead.id)));
      setSelectedIds(new Set());
      showNotice(`${Number(result?.count ?? ids.length)} lead(s) excluído(s) com sucesso.`, "success"); router.refresh();
    } catch (error) { showNotice(`Erro ao excluir leads: ${error.message}`); }
    finally { setDeleting(false); }
  }

  return <main className={s.page}>
    <header className={s.header}><div><h1>CRM</h1><p>Priorize profissionais, acompanhe o enriquecimento e avance cada lead no funil.</p></div></header>

    <section className={s.toolbar}>
      <input className={s.search} value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar por nome, profissão, cidade, registro, e-mail ou tag..." />
      <div className={s.filterBar} aria-label="Filtros combináveis do CRM">
        <label className={s.filterField}><span>Profissão</span><select value={nicheFilter} onChange={event => setNicheFilter(event.target.value)}><option value="all">Todas as profissões</option>{nicheOptions.map(option => <option key={option.value} value={option.value}>{option.label} ({option.count})</option>)}</select></label>
        <label className={s.filterField}><span>Nota comercial</span><select value={gradeFilter} onChange={event => setGradeFilter(event.target.value)}><option value="all">Todas as notas</option><option value="A">Nota A · Quente</option><option value="B">Nota B · Morno</option><option value="C">Nota C · Potencial</option><option value="D">Nota D · Frio</option></select></label>
        <label className={s.filterField}><span>Oportunidade / validação</span><select value={quick} onChange={event => setQuick(event.target.value)}><option value="all">Todas</option><option value="validated">Validados</option><option value="pending">Aguardando análise</option><option value="manual">Exigem busca manual</option><option value="no-site">Sem site próprio</option><option value="score">Score 50+</option><option value="phone">Com telefone</option><option value="whatsapp">WhatsApp testável</option></select></label>
        {activeFilterCount > 0 && <button className={s.clearFilters} type="button" onClick={clearFilters}>Limpar filtros ({activeFilterCount})</button>}
      </div>

      <div className={s.toolbarRow}>
        <div className={s.filterSummary}><strong>{visible.length}</strong><span>de {leads.length} leads correspondem aos filtros</span></div>
        <div className={s.actions}>
          <button type="button" onClick={toggleVisibleSelection} disabled={!visible.length || deleting}>{allVisibleSelected ? "Desmarcar exibidos" : "Selecionar exibidos"}</button>
          <button type="button" className={s.dangerAction} onClick={removeSelectedLeads} disabled={!selectedCount || deleting}>{deleting ? "Excluindo..." : `Excluir selecionados (${selectedCount})`}</button>
          <button type="button" className={s.primary} onClick={() => setCreating(true)} disabled={deleting}>+ Criar lead</button>
          <select value={sort} onChange={event => setSort(event.target.value)} aria-label="Ordenar leads"><option value="recent">Ordenar: mais recentes</option><option value="score">Ordenar: maior score</option><option value="name">Ordenar: nome</option></select>
        </div>
      </div>
    </section>

    {notice && <div className={`${s.notice} ${noticeKind === "success" ? s.noticeSuccess : ""}`}>{notice}</div>}
    <div className={s.counter}>{visible.length} lead{visible.length === 1 ? "" : "s"} exibido{visible.length === 1 ? "" : "s"}{selectedCount > 0 && <span className={s.selectionCount}> · {selectedCount} selecionado{selectedCount === 1 ? "" : "s"}</span>}</div>

    <section className={s.board}>
      {STAGES.map(stage => <div key={stage.id} className={`${s.column} ${dragOver === stage.id ? s.dragOver : ""}`} onDragOver={event => { event.preventDefault(); setDragOver(stage.id); }} onDragLeave={() => setDragOver(current => current === stage.id ? "" : current)} onDrop={event => { event.preventDefault(); setDragOver(""); const id = event.dataTransfer.getData("text/plain"); if (id) moveLead(id, stage.id); }}>
        <div className={s.columnHeader}><span className={s.stageDot} style={{ background: STAGE_COLOR[stage.id] }} /><strong>{stage.label}</strong><span>{byStage[stage.id]?.length || 0}</span></div>
        <small className={s.columnSub}>{stage.sub}</small>
        <div className={s.columnBody}>
          {(byStage[stage.id] || []).length === 0 ? <div className={s.empty}>Sem leads</div> : byStage[stage.id].map(lead => {
            const wa = whatsappUrl(lead);
            const selected = selectedIds.has(lead.id);
            const tag = validationLabel(lead);
            return <article key={lead.id} className={`${s.card} ${selected ? s.cardSelected : ""}`} draggable={!deleting} onDragStart={event => event.dataTransfer.setData("text/plain", lead.id)} onClick={() => router.push(`/crm/${lead.id}`)}>
              <div className={s.cardTop}>
                <input className={s.selectBox} type="checkbox" checked={selected} aria-label={`Selecionar ${lead.name}`} onClick={event => event.stopPropagation()} onChange={() => toggleLeadSelection(lead.id)} />
                <span className={`${s.score} ${s[`grade${lead.grade}`]}`}>{lead.score}</span>
                <span className={`${s.temperature} ${s[`grade${lead.grade}`]}`}>{GRADE_LABEL[lead.grade] || lead.grade}</span>
                <div className={s.cardTopActions}><button type="button" className={s.deleteCard} aria-label={`Excluir ${lead.name}`} title="Excluir lead" disabled={deleting} onClick={event => { event.stopPropagation(); removeLead(lead); }}>Excluir</button><button type="button" aria-label={`Abrir ${lead.name}`} onClick={event => { event.stopPropagation(); router.push(`/crm/${lead.id}`); }}>›</button></div>
              </div>
              <div className={`${s.validationTag} ${s[TAG_CLASS[tag] || "pending"]}`}>{tag}</div>
              <h2 title={lead.name}>{lead.name}</h2>
              <p>{lead.profession || lead.segment || "Sem profissão"} · {[lead.city, lead.state || lead.location].filter(Boolean).join(", ") || "Local não informado"}</p>
              {(lead.email || lead.registration) && <div className={s.enrichmentPreview}>{lead.email && <span title={lead.email}>✉ {lead.email}</span>}{lead.registration && <span>Registro: {lead.registration}</span>}</div>}
              <div className={s.cardActions}>{lead.phone ? <a href={`tel:${lead.phone}`} onClick={event => event.stopPropagation()}>Ligar</a> : <span>Sem telefone</span>}{wa ? <a href={wa} target="_blank" rel="noopener noreferrer" onClick={event => event.stopPropagation()}>{lead.whatsapp ? "WhatsApp" : "Testar WhatsApp"}</a> : <span>Sem WhatsApp</span>}</div>
            </article>;
          })}
        </div>
      </div>)}
    </section>

    {creating && <div className={s.modalBackdrop} onMouseDown={() => !saving && setCreating(false)}><form className={s.modal} onSubmit={createLead} onMouseDown={event => event.stopPropagation()}><div className={s.modalHead}><div><h2>Criar lead</h2><p>Cadastre manualmente um profissional no CRM.</p></div><button type="button" onClick={() => setCreating(false)}>×</button></div><label><span>Nome do profissional</span><input autoFocus required value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} /></label><div className={s.formGrid}><label><span>Profissão</span><input value={form.segment} onChange={event => setForm(current => ({ ...current, segment: event.target.value }))} /></label><label><span>Telefone</span><input value={form.phone} onChange={event => setForm(current => ({ ...current, phone: event.target.value }))} /></label><label><span>Cidade</span><input value={form.city} onChange={event => setForm(current => ({ ...current, city: event.target.value }))} /></label><label><span>Estado</span><input maxLength={40} value={form.location} onChange={event => setForm(current => ({ ...current, location: event.target.value }))} /></label></div><div className={s.modalActions}><button type="button" onClick={() => setCreating(false)}>Cancelar</button><button className={s.primary} disabled={saving}>{saving ? "Salvando..." : "Criar lead"}</button></div></form></div>}
  </main>;
}
