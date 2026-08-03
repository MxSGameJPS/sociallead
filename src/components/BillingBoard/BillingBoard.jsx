"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { saveLeadWorkspaceAction } from "../../app/actions/workspaces.js";
import s from "./BillingBoard.module.css";

const METHODS = ["Pix", "Transferência", "Dinheiro", "Cartão", "Boleto", "Outro"];

function money(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(Number(value) || 0);
}

function initialSale(client) {
  const source = client.workspace?.sale || {};
  const projectValue = Number(source.projectValue || client.lead.proposalValue || 0);
  const installments = Math.max(1, Number(source.installments || 1));
  const paidInstallments = Math.min(installments, Math.max(0, Number(source.paidInstallments || 0)));
  const amountPaid = Math.max(0, Number(source.amountPaid || 0));
  const paymentStatus = source.paymentStatus || (amountPaid >= projectValue && projectValue > 0 ? "paid" : amountPaid > 0 || paidInstallments > 0 ? "partial" : "pending");
  return {
    projectValue,
    paymentMethod: source.paymentMethod || "Pix",
    installments,
    paidInstallments,
    amountPaid,
    firstDueDate: source.firstDueDate || "",
    paymentStatus,
    paymentTerms: source.paymentTerms || "",
    meetingNotes: source.meetingNotes || "",
    outcome: "won",
  };
}

function statusLabel(status) {
  return status === "paid" ? "Pago" : status === "partial" ? "Parcial" : status === "overdue" ? "Atrasado" : "Pendente";
}

export default function BillingBoard({ clients = [] }) {
  const router = useRouter();
  const [forms, setForms] = useState(() => Object.fromEntries(clients.map(client => [client.lead.id, initialSale(client)])));
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState("all");

  const rows = useMemo(() => clients.map(client => ({ ...client, sale: forms[client.lead.id] || initialSale(client) })), [clients, forms]);
  const visible = useMemo(() => rows.filter(item => filter === "all" || item.sale.paymentStatus === filter), [rows, filter]);
  const totals = useMemo(() => rows.reduce((acc, item) => {
    const total = Number(item.sale.projectValue || 0);
    const paid = Math.min(total || Number.MAX_SAFE_INTEGER, Number(item.sale.amountPaid || 0));
    acc.contracted += total;
    acc.received += paid;
    acc.outstanding += Math.max(0, total - paid);
    if (item.sale.paymentStatus === "overdue") acc.overdue += Math.max(0, total - paid);
    return acc;
  }, { contracted: 0, received: 0, outstanding: 0, overdue: 0 }), [rows]);

  function patch(id, field, value) {
    setForms(current => {
      const next = { ...(current[id] || {}) };
      next[field] = value;
      if (field === "installments") next.paidInstallments = Math.min(Number(next.paidInstallments || 0), Number(value || 1));
      if (field === "amountPaid" || field === "projectValue" || field === "paidInstallments" || field === "installments") {
        const total = Number(field === "projectValue" ? value : next.projectValue || 0);
        const paid = Number(field === "amountPaid" ? value : next.amountPaid || 0);
        const installments = Number(field === "installments" ? value : next.installments || 1);
        const paidInstallments = Number(field === "paidInstallments" ? value : next.paidInstallments || 0);
        if (total > 0 && paid >= total) next.paymentStatus = "paid";
        else if (paid > 0 || paidInstallments > 0) next.paymentStatus = "partial";
        else next.paymentStatus = "pending";
        if (paidInstallments >= installments && installments > 0 && total > 0) next.paymentStatus = "paid";
      }
      return { ...current, [id]: next };
    });
  }

  async function save(item) {
    setBusy(item.lead.id);
    setNotice("");
    try {
      await saveLeadWorkspaceAction(item.lead.id, { sale: item.sale });
      setNotice(`Cobrança de ${item.lead.name} atualizada.`);
      router.refresh();
    } catch (error) {
      setNotice(`Erro: ${error.message}`);
    } finally {
      setBusy("");
    }
  }

  return <main className={s.page}>
    <header className={s.header}>
      <div><h1>Cobrar clientes</h1><p>Controle valores, formas de pagamento e parcelas dos projetos ganhos no CRM.</p></div>
      <a href="/crm">Abrir CRM</a>
    </header>

    <section className={s.summary}>
      <article><span>Contratado</span><strong>{money(totals.contracted)}</strong></article>
      <article><span>Recebido</span><strong>{money(totals.received)}</strong></article>
      <article><span>A receber</span><strong>{money(totals.outstanding)}</strong></article>
      <article><span>Em atraso</span><strong>{money(totals.overdue)}</strong></article>
    </section>

    <div className={s.toolbar}>
      {[['all', 'Todos'], ['pending', 'Pendentes'], ['partial', 'Parciais'], ['paid', 'Pagos'], ['overdue', 'Atrasados']].map(([value, label]) => <button key={value} className={filter === value ? s.active : ""} onClick={() => setFilter(value)}>{label}</button>)}
    </div>

    {notice && <div className={notice.startsWith("Erro") ? s.error : s.notice}>{notice}</div>}

    {clients.length === 0 ? <section className={s.empty}><h2>Nenhum cliente ganho</h2><p>Quando um lead for marcado como ganho no CRM, ele aparecerá aqui para controle de cobrança.</p><a href="/crm">Ir para o CRM</a></section>
      : <section className={s.list}>{visible.map(item => {
        const sale = item.sale;
        const installmentValue = sale.installments > 0 ? Math.ceil((Number(sale.projectValue) || 0) / Number(sale.installments)) : 0;
        const progress = sale.projectValue > 0 ? Math.min(100, Math.round((Number(sale.amountPaid || 0) / Number(sale.projectValue)) * 100)) : 0;
        return <article className={s.card} key={item.lead.id}>
          <div className={s.cardHead}>
            <div><span className={s.clientMark}>{item.lead.name.slice(0, 1).toUpperCase()}</span><div><h2>{item.lead.name}</h2><p>{[item.lead.segment, item.lead.city, item.lead.location].filter(Boolean).join(" · ")}</p></div></div>
            <span className={`${s.status} ${s[sale.paymentStatus]}`}>{statusLabel(sale.paymentStatus)}</span>
          </div>

          <div className={s.progress}><span style={{ width: `${progress}%` }} /></div>
          <div className={s.progressText}><span>{progress}% recebido</span><strong>{money(Math.max(0, Number(sale.projectValue || 0) - Number(sale.amountPaid || 0)))} pendente</strong></div>

          <div className={s.formGrid}>
            <label><span>Valor do projeto</span><div className={s.moneyInput}><b>R$</b><input inputMode="numeric" value={sale.projectValue || ""} onChange={event => patch(item.lead.id, "projectValue", event.target.value.replace(/\D/g, ""))} /></div></label>
            <label><span>Forma de pagamento</span><select value={sale.paymentMethod} onChange={event => patch(item.lead.id, "paymentMethod", event.target.value)}>{METHODS.map(method => <option key={method}>{method}</option>)}</select></label>
            <label><span>Total de parcelas</span><input type="number" min="1" max="120" value={sale.installments} onChange={event => patch(item.lead.id, "installments", Math.max(1, Number(event.target.value || 1)))} /></label>
            <label><span>Parcelas pagas</span><input type="number" min="0" max={sale.installments} value={sale.paidInstallments} onChange={event => patch(item.lead.id, "paidInstallments", Math.max(0, Number(event.target.value || 0)))} /></label>
            <label><span>Valor já recebido</span><div className={s.moneyInput}><b>R$</b><input inputMode="numeric" value={sale.amountPaid || ""} onChange={event => patch(item.lead.id, "amountPaid", event.target.value.replace(/\D/g, ""))} /></div></label>
            <label><span>Primeiro vencimento</span><input type="date" value={sale.firstDueDate} onChange={event => patch(item.lead.id, "firstDueDate", event.target.value)} /></label>
            <label><span>Status</span><select value={sale.paymentStatus} onChange={event => patch(item.lead.id, "paymentStatus", event.target.value)}><option value="pending">Pendente</option><option value="partial">Parcial</option><option value="paid">Pago</option><option value="overdue">Atrasado</option></select></label>
            <label><span>Valor aproximado por parcela</span><input readOnly value={money(installmentValue)} /></label>
            <label className={s.full}><span>Condições e observações</span><textarea value={sale.paymentTerms} onChange={event => patch(item.lead.id, "paymentTerms", event.target.value)} placeholder="Ex.: entrada no Pix e duas parcelas mensais" /></label>
          </div>

          <div className={s.actions}><a href={`/crm/${item.lead.id}`}>Abrir cliente</a><button disabled={busy === item.lead.id} onClick={() => save(item)}>{busy === item.lead.id ? "Salvando..." : "Salvar cobrança"}</button></div>
        </article>;
      })}</section>}
    {clients.length > 0 && visible.length === 0 && <div className={s.noResults}>Nenhum cliente corresponde ao filtro selecionado.</div>}
  </main>;
}
