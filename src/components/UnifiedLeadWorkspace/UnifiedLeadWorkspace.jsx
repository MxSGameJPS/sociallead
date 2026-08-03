"use client";

import { useState } from "react";
import LeadWorkspace from "../LeadWorkspace/LeadWorkspace.jsx";
import ConsultingWorkspace from "../ConsultingWorkspace/ConsultingWorkspace.jsx";
import s from "./UnifiedLeadWorkspace.module.css";

export default function UnifiedLeadWorkspace({ lead, workspace, profile, assets = [] }) {
  const [section, setSection] = useState("commercial");

  return <div className={s.page}>
    <div className={s.header}>
      <div>
        <span>CRM unificado</span>
        <h1>{lead.name}</h1>
        <p>Operação comercial, diagnóstico, abordagem, venda e acompanhamento no mesmo cadastro.</p>
      </div>
      <div className={s.tabs}>
        <button type="button" className={section === "commercial" ? s.active : ""} onClick={() => setSection("commercial")}>CRM e atendimento</button>
        <button type="button" className={section === "diagnosis" ? s.active : ""} onClick={() => setSection("diagnosis")}>Diagnóstico e consultoria</button>
      </div>
    </div>

    <div className={s.content}>
      {section === "commercial"
        ? <LeadWorkspace initialLead={lead} initialWorkspace={workspace} initialProfile={profile} />
        : <ConsultingWorkspace initialLead={lead} initialWorkspace={workspace} initialProfile={profile} initialAssets={assets} />}
    </div>
  </div>;
}
