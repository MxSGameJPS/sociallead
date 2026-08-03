"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createAppointmentAction, updateAppointmentStatusAction } from "../../app/actions/appointments.js";
import { saveLeadWorkspaceAction } from "../../app/actions/workspaces.js";
import s from "./AppointmentsList.module.css";

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const TYPES = ["Ligação", "Reunião", "Apresentação", "Follow-up", "Envio de proposta"];

function toIso(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function fromIso(value) {
  const [year, month, day] = String(value || "").split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1, 12, 0, 0, 0);
}

function startOfWeek(date) {
  const next = new Date(date);
  next.setDate(next.getDate() - next.getDay());
  next.setHours(12, 0, 0, 0);
  return next;
}

function sameMonth(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function eventData(item) {
  return {
    id: item.appointment.id,
    leadId: item.lead.id,
    date: item.appointment.date,
    time: item.appointment.time || "09:00",
    type: item.appointment.type || "Follow-up",
    notes: item.appointment.notes || "",
    status: item.appointment.status || "pending",
    storage: item.storage || "store",
    lead: item.lead,
  };
}

export default function AppointmentsList({ appointments = [], leads = [] }) {
  const router = useRouter();
  const today = useMemo(() => new Date(), []);
  const todayIso = toIso(today);
  const [view, setView] = useState("month");
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1, 12));
  const [selectedDay, setSelectedDay] = useState(todayIso);
  const [modal, setModal] = useState(false);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({ leadId: leads[0]?.id || "", type: "Reunião", date: todayIso, time: "09:00", notes: "" });

  const events = useMemo(() => appointments.map(eventData), [appointments]);
  const byDate = useMemo(() => {
    const map = new Map();
    for (const event of events) {
      if (!map.has(event.date)) map.set(event.date, []);
      map.get(event.date).push(event);
    }
    for (const list of map.values()) list.sort((a, b) => a.time.localeCompare(b.time));
    return map;
  }, [events]);

  const weekStart = useMemo(() => startOfWeek(fromIso(selectedDay)), [selectedDay]);
  const weekEnd = useMemo(() => { const date = new Date(weekStart); date.setDate(date.getDate() + 6); return date; }, [weekStart]);
  const currentWeekStart = useMemo(() => startOfWeek(today), [today]);
  const currentWeekEnd = useMemo(() => { const date = new Date(currentWeekStart); date.setDate(date.getDate() + 6); return date; }, [currentWeekStart]);
  const stats = useMemo(() => {
    const todayCount = events.filter(event => event.date === todayIso && event.status === "pending").length;
    const weekCount = events.filter(event => {
      const date = fromIso(event.date);
      return date >= currentWeekStart && date <= currentWeekEnd && event.status === "pending";
    }).length;
    const pending = events.filter(event => event.status === "pending").length;
    return { todayCount, weekCount, pending };
  }, [events, todayIso, currentWeekStart, currentWeekEnd]);

  const monthDays = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1, 12);
    const start = new Date(first);
    start.setDate(1 - first.getDay());
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, [cursor]);

  function move(direction) {
    if (view === "month") setCursor(current => new Date(current.getFullYear(), current.getMonth() + direction, 1, 12));
    else {
      const base = fromIso(selectedDay);
      base.setDate(base.getDate() + direction * (view === "week" ? 7 : 1));
      setSelectedDay(toIso(base));
      setCursor(new Date(base.getFullYear(), base.getMonth(), 1, 12));
    }
  }

  function goToday() {
    setCursor(new Date(today.getFullYear(), today.getMonth(), 1, 12));
    setSelectedDay(todayIso);
  }

  function openNew(date = selectedDay) {
    setForm(current => ({ ...current, date: date || todayIso, leadId: current.leadId || leads[0]?.id || "" }));
    setModal(true);
    setNotice("");
  }

  async function save(event) {
    event.preventDefault();
    if (!form.leadId) return;
    setBusy("save");
    setNotice("");
    try {
      await createAppointmentAction(form);
      setModal(false);
      setSelectedDay(form.date);
      setCursor(new Date(fromIso(form.date).getFullYear(), fromIso(form.date).getMonth(), 1, 12));
      setNotice("Agendamento salvo.");
      router.refresh();
    } catch (error) {
      setNotice(`Erro: ${error.message}`);
    } finally {
      setBusy("");
    }
  }

  async function complete(event) {
    setBusy(event.id);
    setNotice("");
    const nextStatus = event.status === "completed" ? "pending" : "completed";
    try {
      if (event.storage === "legacy") await saveLeadWorkspaceAction(event.leadId, { appointment: { status: nextStatus } });
      else await updateAppointmentStatusAction(event.id, nextStatus);
      router.refresh();
      setNotice(nextStatus === "pending" ? "Agendamento reaberto." : "Agendamento concluído.");
    } catch (error) {
      setNotice(`Erro: ${error.message}`);
    } finally {
      setBusy("");
    }
  }

  function renderEvent(event, compact = false) {
    return <article key={event.id} className={`${s.event} ${event.status === "completed" ? s.eventDone : ""}`}>
      <a href={`/crm/${event.leadId}`}><strong>{event.time} · {event.type}</strong><span>{event.lead.name}</span>{!compact && event.notes && <small>{event.notes}</small>}</a>
      {!compact && <button disabled={busy === event.id} onClick={() => complete(event)}>{event.status === "completed" ? "Reabrir" : "Concluir"}</button>}
    </article>;
  }

  const title = view === "month"
    ? new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(cursor)
    : view === "week"
      ? `${new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(weekStart)} — ${new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(weekEnd)}`
      : new Intl.DateTimeFormat("pt-BR", { dateStyle: "full" }).format(fromIso(selectedDay));

  return <main className={s.page}>
    <header className={s.header}><div><h1>Agendamentos</h1><p>Visualize e gerencie reuniões, ligações e retornos do CRM.</p></div><button className={s.newButton} onClick={() => openNew(todayIso)}><span>+</span>Novo agendamento</button></header>

    <section className={s.stats}>
      <article><strong>{stats.todayCount}</strong><span>Hoje</span></article>
      <article><strong>{stats.weekCount}</strong><span>Esta semana</span></article>
      <article><strong>{stats.pending}</strong><span>Pendentes</span></article>
    </section>

    <section className={s.calendarPanel}>
      <div className={s.calendarToolbar}>
        <div className={s.navigation}><button aria-label="Anterior" onClick={() => move(-1)}>‹</button><strong>{title}</strong><button aria-label="Próximo" onClick={() => move(1)}>›</button><button className={s.todayButton} onClick={goToday}>Hoje</button></div>
        <div className={s.viewSwitch}>{[["month", "Mês"], ["week", "Semana"], ["day", "Dia"]].map(([value, label]) => <button key={value} className={view === value ? s.active : ""} onClick={() => setView(value)}>{label}</button>)}</div>
      </div>

      {view === "month" && <div className={s.monthGrid}>
        {WEEKDAYS.map(day => <div className={s.weekday} key={day}>{day}</div>)}
        {monthDays.map(date => {
          const iso = toIso(date);
          const dayEvents = byDate.get(iso) || [];
          return <button type="button" key={iso} className={`${s.dayCell} ${!sameMonth(date, cursor) ? s.outside : ""} ${iso === todayIso ? s.today : ""} ${iso === selectedDay ? s.selected : ""}`} onClick={() => { setSelectedDay(iso); if (dayEvents.length) setView("day"); else openNew(iso); }}>
            <span className={s.dayNumber}>{date.getDate()}</span>
            <div className={s.cellEvents}>{dayEvents.slice(0, 3).map(event => <span key={event.id} className={event.status === "completed" ? s.doneDot : ""}>{event.time} {event.lead.name}</span>)}{dayEvents.length > 3 && <small>+{dayEvents.length - 3} compromissos</small>}</div>
          </button>;
        })}
      </div>}

      {view === "week" && <div className={s.weekGrid}>{Array.from({ length: 7 }, (_, index) => {
        const date = new Date(weekStart); date.setDate(weekStart.getDate() + index);
        const iso = toIso(date); const dayEvents = byDate.get(iso) || [];
        return <section key={iso} className={iso === todayIso ? s.weekToday : ""}><button onClick={() => { setSelectedDay(iso); setView("day"); }}><span>{WEEKDAYS[index]}</span><strong>{date.getDate()}</strong></button><div>{dayEvents.length ? dayEvents.map(event => renderEvent(event, true)) : <small>Sem compromissos</small>}</div><button className={s.addDay} onClick={() => openNew(iso)}>Adicionar</button></section>;
      })}</div>}

      {view === "day" && <div className={s.dayView}><div className={s.dayViewHead}><div><strong>{new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long" }).format(fromIso(selectedDay))}</strong><span>{(byDate.get(selectedDay) || []).length} compromisso(s)</span></div><button onClick={() => openNew(selectedDay)}>+ Agendar neste dia</button></div><div className={s.dayEvents}>{(byDate.get(selectedDay) || []).length ? (byDate.get(selectedDay) || []).map(event => renderEvent(event)) : <div className={s.emptyDay}><h2>Nenhum compromisso</h2><p>Crie um agendamento para este dia ou volte para a visualização mensal.</p></div>}</div></div>}
    </section>

    {notice && <div className={notice.startsWith("Erro") ? s.error : s.notice}>{notice}</div>}

    {modal && <div className={s.modalBackdrop} onMouseDown={event => { if (event.target === event.currentTarget) setModal(false); }}><form className={s.modal} onSubmit={save}><div className={s.modalHead}><div><h2>Novo agendamento</h2><p>Vincule o compromisso a um lead do CRM.</p></div><button type="button" onClick={() => setModal(false)}>×</button></div><div className={s.formGrid}>
      <label className={s.full}><span>Cliente</span><select required value={form.leadId} onChange={event => setForm(current => ({ ...current, leadId: event.target.value }))}><option value="">Selecione um lead</option>{leads.map(lead => <option key={lead.id} value={lead.id}>{lead.name} · {lead.city || lead.location || "Local não informado"}</option>)}</select></label>
      <label><span>Tipo</span><select value={form.type} onChange={event => setForm(current => ({ ...current, type: event.target.value }))}>{TYPES.map(type => <option key={type}>{type}</option>)}</select></label>
      <label><span>Data</span><input required type="date" value={form.date} onChange={event => setForm(current => ({ ...current, date: event.target.value }))} /></label>
      <label><span>Hora</span><input required type="time" value={form.time} onChange={event => setForm(current => ({ ...current, time: event.target.value }))} /></label>
      <label className={s.full}><span>Observações</span><textarea value={form.notes} onChange={event => setForm(current => ({ ...current, notes: event.target.value }))} placeholder="Objetivo, pauta ou informação importante" /></label>
    </div><div className={s.modalActions}><button type="button" onClick={() => setModal(false)}>Cancelar</button><button className={s.primary} disabled={busy === "save"}>{busy === "save" ? "Salvando..." : "Confirmar agendamento"}</button></div></form></div>}
  </main>;
}
