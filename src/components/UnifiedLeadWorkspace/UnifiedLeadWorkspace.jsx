"use client";

import { useState } from "react";
import LeadWorkspace from "../LeadWorkspace/LeadWorkspace.jsx";
import ConsultingWorkspace from "../ConsultingWorkspace/ConsultingWorkspace.jsx";
import s from "./UnifiedLeadWorkspace.module.css";

export default function UnifiedLeadWorkspace({ lead, workspace, profile, assets = [] }) {
  const [section, setSection] = useState("followup");

  return <div className={s.page}>
    <div className={s.header}>
      <div>
        <span>Cadastro individual do profissional</span>
        <h1>{lead.name}</h1>
        <p>Dados profissionais, verificação cadastral, comunicação jurídica e acompanhamento do atendimento.</p>
      </div>
      <div className={s.tabs}>
        <button type="button" className={section === "followup" ? s.active : ""} onClick={() => setSection("followup")}>Atendimento e comunicação</button>
        <button type="button" className={section === "verification" ? s.active : ""} onClick={() => setSection("verification")}>Verificação de dados</button>
      </div>
    </div>

    <div className={s.content}>
      {section === "followup"
        ? <LeadWorkspace initialLead={lead} initialWorkspace={workspace} initialProfile={profile} />
        : <ConsultingWorkspace initialLead={lead} initialWorkspace={workspace} initialProfile={profile} initialAssets={assets} />}
    </div>
  </div>;
}
