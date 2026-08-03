"use client";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import s from "./Board.module.css";
import { STAGES, STAGE_IDS, NEXT } from "../../services/leads/stages.js";
import { recommend } from "../../services/leads/recommend.js";
import { buildMessages, waFor, msgKindForStage } from "../../services/leads/messages.js";
import { BRL, fmtDate, fmtDateShort, todayStr, plusDays } from "../../services/leads/format.js";
import { locShort, UNKNOWN_LOC } from "../../services/leads/location.js";
import { decodeSmart } from "../../services/imports/parseLeads.js";
import * as A from "../../app/actions/leads.js";
import * as AI from "../../app/actions/ai.js";

const STAGE_DOT = { novo: "var(--accent)", contatado: "var(--gC)", sem_resposta: "var(--warn)", com_resposta: "#0ea5a5", proposta: "#7c5cff", proposta_rejeitada: "var(--danger)", negociacao: "var(--accent)", ganho: "var(--won)", perdido: "var(--lost)" };
const GBG = { A: "var(--gA-bg)", B: "var(--gB-bg)", C: "var(--gC-bg)", D: "var(--gD-bg)" };
const GFILL = { A: "var(--gA)", B: "var(--gB)", C: "var(--gC)", D: "var(--gD)" };

export default function Board({ initialLeads }) {
  const router = useRouter();
  const [leads, setLeads] = useState(initialLeads || []);
  const [openId, setOpenId] = useState(null);
  const [toast, setToast] = useState("");
  const [dragOver, setDragOver] = useState(null);
  const [f, setF] = useState({ search: "", source: "", grades: new Set(["A", "B", "C", "D"]), segment: "", location: "", landing: "" });

  useEffect(() => { setLeads(initialLeads || []); }, [initialLeads]);
  useEffect(() => { const t = localStorage.getItem("leadflow_theme"); if (t) document.documentElement.setAttribute("data-theme", t); }, []);

  function notify(m) { setToast(m); clearTimeout(window.__lf_t); window.__lf_t = setTimeout(() => setToast(""), 3200); }
  function patchLocal(id, patch) { setLeads(ls => ls.map(l => l.id === id ? { ...l, ...patch } : l)); }
  async function run(fn, id, patch, msg) {
    const before = id ? leads.find(l => l.id === id) : null;
    if (patch) patchLocal(id, patch);
    try {
      await fn();
      router.refresh();
      if (msg) notify(msg);
      return true;
    } catch (e) {
      if (before) patchLocal(id, before);
      router.refresh();
      notify("Erro: " + e.message);
      return false;
    }
  }

  const open = leads.find(l => l.id === openId) || null;
  const segs = useMemo(() => [...new Set(leads.map(l => l.segment).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")), [leads]);
  const locs = useMemo(() => [...new Set(leads.map(l => l.location).filter(Boolean))].sort((a, b) => a === UNKNOWN_LOC ? 1 : b === UNKNOWN_LOC ? -1 : a.localeCompare(b, "pt-BR")), [leads]);

  const visible = leads.filter(l => {
    if (f.source && l.source !== f.source) return false;
    if (!f.grades.has(l.grade)) return false;
    if (f.segment && l.segment !== f.segment) return false;
    if (f.location && l.location !== f.location) return false;
    if (f.landing && l.landingStatus !== f.landing) return false;
    if (f.search) { const q = f.search.toLowerCase(); const hay = (l.name + " " + (l.segment || "") + " " + (l.location || "") + " " + (l.offer || "") + " " + (l.problem || "")).toLowerCase(); if (!hay.includes(q)) return false; }
    return true;
  });

  const today = todayStr();
  const active = leads.filter(l => ["contatado", "sem_resposta", "com_resposta", "proposta", "proposta_rejeitada", "negociacao"].includes(l.stage)).length;
  const kpis = [
    { v: leads.length, l: "Leads" },
    { v: leads.filter(l => l.grade === "A").length, l: "Nota A", c: s.accent },
    { v: leads.filter(l => l.whatsapp).length, l: "C/ WhatsApp" },
    { v: leads.filter(l => l.landingStatus === "todo").length, l: "Landings a fazer", c: s.warn },
    { v: leads.filter(l => l.followUpAt && l.followUpAt <= today && l.stage !== "ganho" && l.stage !== "perdido").length, l: "Retomar hoje", c: s.warn },
    { v: active, l: "Em aberto" },
    { v: BRL(leads.filter(l => ["proposta", "proposta_rejeitada", "negociacao"].includes(l.stage)).reduce((a, l) => a + (l.proposalValue || 0), 0)), l: "Pipeline", c: s.money },
    { v: leads.filter(l => l.stage === "ganho").length, l: "Ganhos", c: s.won },
    { v: BRL(leads.filter(l => l.stage === "ganho").reduce((a, l) => a + (l.proposalValue || 0), 0)), l: "Fechado", c: s.money + " " + s.won },
  ];

  const byStage = {}; STAGE_IDS.forEach(id => byStage[id] = []);
  visible.forEach(l => { if (byStage[l.stage]) byStage[l.stage].push(l); });
  STAGE_IDS.forEach(id => byStage[id].sort((a, b) => (b.score || 0) - (a.score || 0)));

  function toggleGrade(g) { setF(prev => { const gr = new Set(prev.grades); gr.has(g) ? gr.delete(g) : gr.add(g); return { ...prev, grades: gr }; }); }
  function toggleTheme() { const cur = document.documentElement.getAttribute("data-theme"); const isDark = cur ? cur === "dark" : matchMedia("(prefers-color-scheme:dark)").matches; const nt = isDark ? "light" : "dark"; document.documentElement.setAttribute("data-theme", nt); localStorage.setItem("leadflow_theme", nt); }

  async function onFile(e) { const file = e.target.files[0]; if (!file) return; const buf = await file.arrayBuffer(); const text = decodeSmart(buf); try { const res = await A.importTextAction(text, file.name); router.refresh(); notify("Importado: " + res.added + " novos, " + res.updated + " atualizados"); } catch (err) { notify("Falha: " + err.message); } e.target.value = ""; }
  function exportJson() { const blob = new Blob([JSON.stringify(leads, null, 2)], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "leadflow_backup_" + today + ".json"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); notify("Backup exportado"); }
  async function clearAll() {
    if (!leads.length) { notify("Já está vazio"); return; }
    const confirmation = window.prompt("Esta ação apagará TODOS os " + leads.length + " leads.\n\nDigite APAGAR para confirmar:");
    if (confirmation !== "APAGAR") { notify("Exclusão cancelada"); return; }

    const snapshot = leads;
    exportJson();
    setLeads([]);
    try {
      await A.clearAllAction("APAGAR");
      setOpenId(null);
      router.refresh();
      notify("Quadro limpo — backup exportado");
    } catch (e) {
      setLeads(snapshot);
      router.refresh();
      notify("Erro: " + e.message);
    }
  }
  async function advance(l) { const nx = l.stage === "negociacao" ? "ganho" : NEXT[l.stage]; if (!nx) return; await run(() => A.moveStageAction(l.id, nx), l.id, { stage: nx }, l.name + " → " + STAGES.find(x => x.id === nx).label); }

  return (
    <div className={s.app}>
      <header className={s.header}>
        <div className={s.barTop}>
          <div className={s.brand}><div className={s.mark} /><div><h1>LeadFlow</h1><div className={s.sub}>Pipeline de Fechamento</div></div></div>
          <div className={s.search}><input placeholder="Buscar nome, segmento, local…" value={f.search} onChange={e => setF({ ...f, search: e.target.value })} /></div>
          <div className={s.spacer} />
          <a className={s.btn + " " + s.btnGhost} href="/dashboard">Dashboard</a>
          <a className={s.btn + " " + s.btnGhost} href="/configuracoes/ia">IA</a>
          <button className={s.btn + " " + s.btnGhost} onClick={toggleTheme}>Tema</button>
          <button className={s.btn + " " + s.btnGhost} onClick={exportJson}>Backup</button>
          <label className={s.btn + " " + s.btnPrimary}>Importar CSV/JSON<input type="file" accept=".csv,.json" hidden onChange={onFile} /></label>
        </div>
        <div className={s.kpis}>{kpis.map(k => (<div key={k.l} className={s.kpi + (k.c ? " " + k.c : "")}><span className={s.kpiV}>{k.v}</span><span className={s.kpiL}>{k.l}</span></div>))}</div>
        <div className={s.filters}>
          <span className={s.flabel}>Fonte</span>
          <select className={s.mini} value={f.source} onChange={e => setF({ ...f, source: e.target.value })}><option value="">Todas</option><option>Instagram</option><option>Google Maps</option></select>
          <span className={s.flabel}>Nota</span>
          {["A", "B", "C", "D"].map(g => (<button key={g} className={s.chip} style={f.grades.has(g) ? { background: GFILL[g], borderColor: GFILL[g], color: "#fff" } : {}} onClick={() => toggleGrade(g)}><span className={s.dot} style={{ background: f.grades.has(g) ? "#fff" : GFILL[g] }} />{g}</button>))}
          <span className={s.divider} />
          <select className={s.mini} value={f.segment} onChange={e => setF({ ...f, segment: e.target.value })}><option value="">Todos segmentos</option>{segs.map(x => (<option key={x}>{x}</option>))}</select>
          <select className={s.mini} value={f.location} onChange={e => setF({ ...f, location: e.target.value })}><option value="">Todos locais</option>{locs.map(x => (<option key={x}>{x}</option>))}</select>
          <select className={s.mini} value={f.landing} onChange={e => setF({ ...f, landing: e.target.value })}><option value="">Landing: todas</option><option value="todo">A fazer</option><option value="done">Pronta</option><option value="sent">Enviada</option></select>
          <div className={s.spacer} />
          <button className={s.btn + " " + s.btnGhost} onClick={clearAll} style={{ fontSize: "12px" }}>Limpar tudo</button>
        </div>
      </header>

      <main className={s.board}>
        {!leads.length ? (
          <div className={s.boardEmpty}><h3>Comece importando seus leads</h3><p>O quadro está vazio. Clique em <b>Importar CSV/JSON</b> e envie sua planilha do Google Maps ou Instagram.</p></div>
        ) : STAGES.map(stage => {
          const items = byStage[stage.id] || [];
          return (
            <div key={stage.id} className={s.col}
              onDragOver={e => { e.preventDefault(); setDragOver(stage.id); }}
              onDragLeave={() => setDragOver(d => d === stage.id ? null : d)}
              onDrop={e => { e.preventDefault(); setDragOver(null); const id = e.dataTransfer.getData("text/plain"); const l = leads.find(x => x.id === id); if (l && l.stage !== stage.id) run(() => A.moveStageAction(id, stage.id), id, { stage: stage.id }, l.name + " → " + stage.label); }}>
              <div className={s.colHead}><span className={s.stageDot} style={{ background: STAGE_DOT[stage.id] }} /><h2>{stage.label}</h2><span className={s.count}>{items.length}</span></div>
              <div className={s.colSub}>{stage.sub}</div>
              <div className={s.colBody + (dragOver === stage.id ? " " + s.dragOver : "")}>
                {items.length === 0 ? <div className={s.colEmpty}>—</div> : items.map(l => (<Card key={l.id} l={l} onOpen={() => setOpenId(l.id)} onAdvance={() => advance(l)} />))}
              </div>
            </div>
          );
        })}
      </main>

      {open && <Drawer l={open} onClose={() => setOpenId(null)} run={run} notify={notify} />}
      {toast && <div className={s.toast}>{toast}</div>}
    </div>
  );
}

function Card({ l, onOpen, onAdvance }) {
  const rec = recommend(l);
  const loc = locShort(l);
  const wa = waFor(l, msgKindForStage(l.stage));
  const isEnd = l.stage === "ganho" || l.stage === "perdido";
  const nx = NEXT[l.stage];
  const advLabel = l.stage === "negociacao" ? "✓ Ganhou" : (nx ? "→ " + STAGES.find(x => x.id === nx).label : "");
  const today = todayStr();
  return (
    <div className={s.card} draggable style={{ ["--gd"]: GFILL[l.grade], ["--gbg"]: GBG[l.grade] }}
      onDragStart={e => { e.dataTransfer.setData("text/plain", l.id); e.dataTransfer.effectAllowed = "move"; }}
      onClick={e => { if (e.target.closest("[data-act]")) return; onOpen(); }}>
      <div className={s.cardTop}><div className={s.grade}>{l.grade}</div><p className={s.name}>{l.name}</p><span className={s.score}>{l.score}</span></div>
      <div className={s.meta}>
        <span className={s.tag}>{l.source === "Instagram" ? "Instagram" : "Maps"}</span>
        <span className={s.tag + " " + s.tagLoc + (loc ? "" : " " + s.tagLocUnknown)}>📍 {loc || "Local?"}</span>
        {l.segment && <span className={s.tag}>{l.segment}</span>}
        {l.googleRating && <span className={s.tag}>★ {l.googleRating}</span>}
        {l.landingStatus === "todo" && <span className={s.tag + " " + s.tagLsTodo}>⚠ Landing: fazer</span>}
        {l.landingStatus === "done" && <span className={s.tag + " " + s.tagLsDone}>Landing pronta</span>}
        {l.landingStatus === "sent" && <span className={s.tag + " " + s.tagLsSent}>Landing enviada</span>}
        {l.landingStatus === "none" && rec.type === "msg" && <span className={s.tag + " " + s.tagMsg}>Só msg</span>}
        {l.proposalValue > 0 && <span className={s.tag + " " + s.tagVal}>{BRL(l.proposalValue)}</span>}
        {l.followUpAt && <span className={s.tag} style={l.followUpAt <= today ? { background: "var(--warn-bg)", color: "var(--warn)", fontWeight: 700 } : { fontWeight: 700 }}>{l.followUpAt <= today ? "⏰ Retomar" : "📅 " + fmtDateShort(l.followUpAt)}</span>}
      </div>
      {l.offer && <div className={s.offer}>{l.offer}</div>}
      <div className={s.cardActions}>
        {advLabel && !isEnd ? <button data-act className={s.adv} onClick={onAdvance}>{advLabel}</button> : <button data-act className={s.adv} onClick={onOpen}>Ver detalhes</button>}
        <button data-act className={s.iconBtn + (wa ? "" : " " + s.iconBtnOff)} title={wa ? "WhatsApp" : "Sem WhatsApp"} onClick={() => wa && window.open(wa, "_blank", "noopener")}>W</button>
      </div>
    </div>
  );
}

function Drawer({ l, onClose, run, notify }) {
  const rec = recommend(l);
  const [kind, setKind] = useState(msgKindForStage(l.stage));
  const [msg, setMsg] = useState(buildMessages(l)[msgKindForStage(l.stage)]);
  const [val, setVal] = useState(l.proposalValue || 0);
  const [notes, setNotes] = useState(l.notes || "");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiInfo, setAiInfo] = useState("");
  const knownLoc = l.location && l.location !== UNKNOWN_LOC;
  const showFu = ["proposta_rejeitada", "sem_resposta", "perdido"].includes(l.stage);

  useEffect(() => {
    setMsg(buildMessages(l)[kind]);
    setAiInfo("");
  }, [kind, l.id]);

  async function generateWithAI() {
    setAiBusy(true);
    setAiInfo("");
    try {
      const result = await AI.generateLeadMessageAction({ lead: l, kind, currentMessage: msg });
      setMsg(result.text);
      setAiInfo(`Gerada por ${result.providerName}${result.model ? " · " + result.model : ""} · ${result.elapsedMs} ms`);
      notify("Mensagem gerada com IA — revise antes de enviar");
    } catch (error) {
      setAiInfo("Falha: " + error.message);
      notify("IA: " + error.message);
    } finally {
      setAiBusy(false);
    }
  }

  const contacts = [];
  if (l.whatsapp) contacts.push(<a key="wa" className={s.wa} href={waFor(l, kind)} target="_blank" rel="noopener">WhatsApp</a>);
  else if (l.phone) contacts.push(<a key="tel" href={"tel:" + l.phone}>Ligar</a>);
  if (l.email) contacts.push(<a key="em" href={"mailto:" + l.email}>E-mail</a>);
  if (l.instagram) contacts.push(<a key="ig" href={l.instagram} target="_blank" rel="noopener">Instagram</a>);
  if (l.site) contacts.push(<a key="st" href={/^https?:/.test(l.site) ? l.site : "http://" + l.site} target="_blank" rel="noopener">Site</a>);
  if (l.mapsLink) contacts.push(<a key="mp" href={l.mapsLink} target="_blank" rel="noopener">Maps</a>);

  return (<>
    <div className={s.scrim} onClick={onClose} />
    <aside className={s.drawer} aria-label={"Detalhes do lead " + l.name}>
      <div className={s.drawerHead}>
        <div className={s.grade} style={{ width: 34, height: 34, fontSize: 15, background: GBG[l.grade], color: GFILL[l.grade] }}>{l.grade}</div>
        <div style={{ flex: 1 }}><h2>{l.name}</h2><div className={s.locLine}>📍 {knownLoc ? l.location : "Local não informado"}</div></div>
        <button className={s.closeX} onClick={onClose} aria-label="Fechar detalhes">×</button>
      </div>
      <div className={s.drawerBody}>
        <div className={s.scorebar}><span className={s.tag}>{l.source}</span><div className={s.track}><div className={s.fill} style={{ width: (l.score || 0) + "%", background: GFILL[l.grade] }} /></div><span className={s.num} style={{ color: GFILL[l.grade] }}>{l.score}</span></div>

        <div className={s.locBox + (knownLoc ? "" : " " + s.locBoxUnknown)}>{knownLoc ? <b>{l.location}</b> : <span>Local não informado — confirme antes de citar a cidade.</span>}{l.address && <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{l.address}</div>}</div>

        {contacts.length > 0 && <div className={s.field}><label>Contato</label><div className={s.row}>{contacts}</div></div>}

        <div className={s.reco + " " + (rec.type === "landing" ? s.recoLanding : s.recoMsg)}><div className={s.recoHead} style={{ color: rec.type === "landing" ? "var(--accent)" : "var(--gC)" }}>{rec.label}</div><p>{rec.why}</p></div>

        <div className={s.field}><label>Status da landing page</label>
          <div className={s.seg}>{[["none", "N/A"], ["todo", "A fazer"], ["done", "Pronta"], ["sent", "Enviada"]].map(([k, lab]) => (<button key={k} className={l.landingStatus === k ? s.segOn : ""} onClick={() => run(() => A.setLandingAction(l.id, k), l.id, { landingStatus: k }, "Landing: " + lab)}>{lab}</button>))}</div>
        </div>

        {showFu && <div className={s.field}><label>Reagendar abordagem futura</label>
          <div className={s.valInput}><input type="date" value={l.followUpAt || ""} onChange={e => run(() => A.setFollowUpAction(l.id, e.target.value), l.id, { followUpAt: e.target.value }, e.target.value ? "Retomar em " + fmtDate(e.target.value) : "Removido")} /></div>
          <div className={s.seg}>{[["7", "+7 dias"], ["15", "+15 dias"], ["30", "+30 dias"]].map(([d, lab]) => (<button key={d} onClick={() => { const dt = plusDays(parseInt(d, 10)); run(() => A.setFollowUpAction(l.id, dt), l.id, { followUpAt: dt }, "Retomar em " + fmtDate(dt)); }}>{lab}</button>))}<button style={{ marginLeft: "auto" }} onClick={() => run(() => A.setFollowUpAction(l.id, ""), l.id, { followUpAt: null }, "Removido")}>Limpar</button></div>
        </div>}

        <div className={s.field}><label>Mensagem de WhatsApp</label>
          <div className={s.tabs}>{[["initial", "1º contato"], ["followup", "Follow-up"], ["recovery", "Recuperar"]].map(([k, lab]) => (<button key={k} className={kind === k ? s.tabActive : ""} onClick={() => setKind(k)}>{lab}</button>))}</div>
          <textarea className={s.msg} value={msg} onChange={e => { setMsg(e.target.value); setAiInfo(""); }} />
          <div className={s.row}>
            <button className={s.miniBtn} onClick={generateWithAI} disabled={aiBusy}>{aiBusy ? "Gerando com IA…" : "Gerar com IA"}</button>
            <button className={s.miniBtn} onClick={() => { navigator.clipboard.writeText(msg); notify("Mensagem copiada"); }}>Copiar</button>
            {l.whatsapp && <button className={s.miniBtn + " " + s.wa} onClick={() => { window.open("https://wa.me/" + l.whatsapp + "?text=" + encodeURIComponent(msg), "_blank", "noopener"); if (l.stage === "novo") run(() => A.moveStageAction(l.id, "contatado"), l.id, { stage: "contatado" }, "Movido p/ Contatado"); }}>Enviar no WhatsApp</button>}
          </div>
          {aiInfo && <div className={s.hint}>{aiInfo}</div>}
          <div className={s.hint}>Revise e personalize antes de enviar. Configure o provedor em <a href="/configuracoes/ia">Inteligência Artificial</a>.</div>
        </div>

        <div className={s.field}><label>Valor da proposta</label><div className={s.valInput}><span style={{ fontFamily: "var(--mono)", fontWeight: 700, color: "var(--muted)" }}>R$</span><input inputMode="numeric" value={val} onChange={e => setVal(e.target.value.replace(/\D/g, ""))} onBlur={() => run(() => A.setProposalValueAction(l.id, val), l.id, { proposalValue: parseInt(val, 10) || 0 })} /></div></div>

        {l.approach && <div className={s.field}><label>Abordagem original</label><div className={s.reco} style={{ background: "var(--surface-2)" }}><p>{l.approach}</p></div></div>}
        {l.problem && <div className={s.field}><label>{l.source === "Instagram" ? "Sinais observados" : "Problema"}</label><div className={s.val + " " + s.mut}>{l.problem}</div></div>}
        {l.offer && <div className={s.field}><label>Oferta recomendada</label><div className={s.val}>{l.offer}</div></div>}
        {l.nextAction && <div className={s.field}><label>Próxima ação</label><div className={s.val + " " + s.mut}>{l.nextAction}</div></div>}
        {l.bio && <div className={s.field}><label>Bio</label><div className={s.val + " " + s.mut}>{l.bio}</div></div>}

        <div className={s.field}><label>Estágio no pipeline</label><div className={s.seg}>{STAGES.map(st => (<button key={st.id} className={l.stage === st.id ? s.segOn : ""} onClick={() => run(() => A.moveStageAction(l.id, st.id), l.id, { stage: st.id })}>{st.label}</button>))}</div></div>
        <div className={s.field}><label>Nota</label><div className={s.seg}>{["A", "B", "C", "D"].map(g => (<button key={g} className={l.grade === g ? s.segOn : ""} style={l.grade === g ? { background: GFILL[g], borderColor: GFILL[g], color: "#fff" } : {}} onClick={() => run(() => A.setGradeAction(l.id, g), l.id, { grade: g })}>{g}</button>))}</div></div>
        <div className={s.field}><label>Anotações</label><textarea className={s.notes} value={notes} onChange={e => setNotes(e.target.value)} onBlur={() => run(() => A.setNotesAction(l.id, notes), l.id, { notes })} /></div>
      </div>
    </aside>
  </>);
}
