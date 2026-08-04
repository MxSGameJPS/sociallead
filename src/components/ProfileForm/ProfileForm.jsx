"use client";

import { useState, useTransition } from "react";
import { saveProfessionalProfileAction } from "../../app/actions/profile.js";
import s from "./ProfileForm.module.css";

const PROFESSIONAL_FIELDS = [
  ["name", "Nome completo", "Carlos Eduardo da Silva"],
  ["professionalName", "Nome profissional", "Dr. Carlos Silva"],
  ["brandName", "Escritório ou marca profissional", "Silva Advocacia"],
  ["profession", "Profissão", "Advogado"],
  ["oabNumber", "Número da OAB", "123456"],
  ["oabState", "UF da OAB", "RS"],
  ["specialty", "Área de atuação", "Direito tributário"],
  ["city", "Cidade", "Porto Alegre"],
  ["state", "Estado", "RS"],
  ["whatsapp", "WhatsApp profissional", "(51) 99999-9999"],
  ["email", "E-mail profissional", "contato@escritorio.com.br"],
  ["site", "Site", "https://escritorio.com.br"],
  ["instagram", "Instagram", "https://instagram.com/escritorio"],
];

const THESIS_FIELDS = [
  ["thesisName", "Nome da tese jurídica", "Restituição de valores pagos a órgão regulador", 220],
  ["thesisSummary", "Resumo da tese", "Explique de forma objetiva o possível direito analisado.", 3000],
  ["thesisDetails", "Explicação detalhada", "Descreva fundamentos, contexto, condições e limites da tese. A IA usará somente o que estiver informado aqui.", 12000],
  ["eligibleProfessions", "Profissões abrangidas", "Ex.: médicos, dentistas, psicólogos e engenheiros.", 3000],
  ["relatedCouncils", "Conselhos e órgãos relacionados", "Ex.: CRM, CRO, CRP e CREA.", 1500],
  ["eligibilityContext", "Possíveis critérios de enquadramento", "Informe quais situações podem indicar que o profissional merece uma análise individual.", 5000],
  ["requiredDocuments", "Documentos normalmente necessários", "Liste os documentos que podem ser solicitados para a análise jurídica.", 4000],
  ["relevantPeriod", "Período relevante", "Informe datas, exercícios ou períodos que devem ser considerados.", 1200],
  ["callToAction", "Chamada para ação", "Ex.: convite para uma conversa inicial e análise individual, sem compromisso.", 1500],
  ["prohibitedClaims", "Afirmações que a IA não pode fazer", "Ex.: não garantir restituição, prazo, valor ou êxito antes da análise individual.", 4000],
  ["mandatoryDisclaimer", "Aviso obrigatório nas comunicações", "Inclua ressalvas ou texto informativo que deve acompanhar as mensagens.", 3000],
];

export default function ProfileForm({ initialProfile }) {
  const [form, setForm] = useState(initialProfile);
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();

  function change(name, value) {
    setForm(current => ({ ...current, [name]: value }));
  }

  function submit(event) {
    event.preventDefault();
    setNotice("");
    startTransition(async () => {
      try {
        const saved = await saveProfessionalProfileAction(form);
        setForm(saved);
        setNotice("Perfil jurídico e configuração da tese salvos com sucesso.");
      } catch (error) {
        setNotice(`Erro: ${error.message}`);
      }
    });
  }

  const signatureName = form.professionalName || form.name || "Nome do advogado";
  const oab = [form.oabState && `OAB/${form.oabState}`, form.oabNumber].filter(Boolean).join(" ");

  return <form className={s.form} onSubmit={submit}>
    <header className={s.intro}>
      <span>Configuração institucional</span>
      <h1>Perfil do advogado e tese jurídica</h1>
      <p>Estas informações orientam a apresentação profissional e a geração das mensagens destinadas aos profissionais localizados.</p>
    </header>

    <section className={s.section}>
      <div className={s.sectionHead}><div><span>Identificação</span><h2>Dados profissionais</h2></div><p>Preencha como o advogado deverá ser apresentado nas comunicações.</p></div>
      <div className={s.grid}>{PROFESSIONAL_FIELDS.map(([name, label, placeholder]) => <label key={name} className={["brandName", "professionalBio"].includes(name) ? s.wide : ""}><span>{label}</span><input type={name === "email" ? "email" : name === "site" ? "url" : "text"} maxLength={name === "oabState" || name === "state" ? 2 : undefined} value={form[name] || ""} placeholder={placeholder} onChange={event => change(name, event.target.value)} /></label>)}</div>
      <label className={s.textareaField}><span>Apresentação profissional</span><textarea rows={5} value={form.professionalBio || ""} placeholder="Breve apresentação do advogado, experiência, área de atuação e forma de atendimento." onChange={event => change("professionalBio", event.target.value)} /></label>
    </section>

    <section className={s.section}>
      <div className={s.sectionHead}><div><span>Base da comunicação</span><h2>Configuração da tese jurídica</h2></div><p>Não é necessário preencher tudo agora. Campos vazios não devem ser inventados pela IA.</p></div>
      <div className={s.thesisGrid}>{THESIS_FIELDS.map(([name, label, placeholder, maxLength], index) => <label key={name} className={index === 0 ? s.wide : ""}><span>{label}</span>{index === 0 ? <input value={form[name] || ""} maxLength={maxLength} placeholder={placeholder} onChange={event => change(name, event.target.value)} /> : <textarea rows={name === "thesisDetails" ? 8 : 4} value={form[name] || ""} maxLength={maxLength} placeholder={placeholder} onChange={event => change(name, event.target.value)} />}</label>)}</div>
    </section>

    <aside className={s.preview}>
      <span>Identificação que será disponibilizada à IA</span>
      <strong>{signatureName}{oab ? ` · ${oab}` : ""}</strong>
      <small>{[form.brandName, form.specialty, [form.city, form.state].filter(Boolean).join("/ ")].filter(Boolean).join(" · ") || "Complete os dados profissionais"}</small>
      <p>{form.thesisName ? `Tese configurada: ${form.thesisName}` : "A tese jurídica ainda não recebeu um nome."}</p>
    </aside>

    {notice && <p className={notice.startsWith("Erro") ? s.error : s.notice} role="status">{notice}</p>}
    <button disabled={pending}>{pending ? "Salvando configurações..." : "Salvar perfil e tese"}</button>
  </form>;
}
