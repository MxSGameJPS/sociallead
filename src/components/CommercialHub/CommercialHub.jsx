"use client";

import { useState } from "react";
import CRMBoard from "../CRMBoard/CRMBoard.jsx";
import ConsultingBoard from "../ConsultingBoard/ConsultingBoard.jsx";
import s from "./CommercialHub.module.css";

export default function CommercialHub({ crmLeads = [], consultingLeads = [] }) {
  const [view, setView] = useState("crm");

  return <div className={s.page}>
    <header className={s.switcher}>
      <div>
        <span className={s.eyebrow}>Operação comercial unificada</span>
        <h1>CRM e Consultorias</h1>
        <p>Gerencie o funil comercial e os diagnósticos de consultoria no mesmo módulo.</p>
      </div>
      <div className={s.tabs} role="tablist" aria-label="Visualização comercial">
        <button type="button" role="tab" aria-selected={view === "crm"} className={view === "crm" ? s.active : ""} onClick={() => setView("crm")}>CRM <span>{crmLeads.length}</span></button>
        <button type="button" role="tab" aria-selected={view === "consulting"} className={view === "consulting" ? s.active : ""} onClick={() => setView("consulting")}>Consultorias <span>{consultingLeads.length}</span></button>
      </div>
    </header>

    <div className={s.content}>
      {view === "crm"
        ? <CRMBoard initialLeads={crmLeads} embedded />
        : <ConsultingBoard initialLeads={consultingLeads} embedded />}
    </div>
  </div>;
}
