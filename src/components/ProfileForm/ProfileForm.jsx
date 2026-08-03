"use client";

import { useState, useTransition } from "react";
import { saveProfessionalProfileAction } from "../../app/actions/profile.js";
import s from "./ProfileForm.module.css";

const FIELDS = [
  ["name", "Nome", "Saulo Pavanello"],
  ["brandName", "Nome da marca", "Saulo Pavanello Engenharia de Software"],
  ["profession", "Profissão", "Engenheiro de software"],
  ["whatsapp", "WhatsApp", "(51) 99999-9999"],
  ["site", "Site", "https://seusite.com.br"],
  ["email", "E-mail", "contato@seusite.com.br"],
  ["instagram", "Instagram", "https://instagram.com/seuperfil"],
];

export default function ProfileForm({ initialProfile }) {
  const [form, setForm] = useState(initialProfile);
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(event) {
    event.preventDefault();
    setNotice("");
    startTransition(async () => {
      try {
        const saved = await saveProfessionalProfileAction(form);
        setForm(saved);
        setNotice("Perfil salvo. As próximas mensagens usarão estes dados.");
      } catch (error) {
        setNotice(`Erro: ${error.message}`);
      }
    });
  }

  return <form className={s.form} onSubmit={submit}>
    <div className={s.intro}><h1>Perfil profissional</h1><p>Esses dados serão usados para apresentar você e assinar as mensagens de prospecção.</p></div>
    <div className={s.grid}>{FIELDS.map(([name, label, placeholder]) => <label key={name}><span>{label}</span><input type={name === "email" ? "email" : name === "site" ? "url" : "text"} value={form[name] || ""} placeholder={placeholder} onChange={event => setForm(current => ({ ...current, [name]: event.target.value }))} /></label>)}</div>
    <div className={s.preview}><span>Assinatura usada pela IA</span><strong>{form.name || "Seu nome"}{form.profession ? ` · ${form.profession}` : ""}</strong><small>{form.brandName || "Sua marca"}</small></div>
    {notice && <p className={notice.startsWith("Erro") ? s.error : s.notice} role="status">{notice}</p>}
    <button disabled={pending}>{pending ? "Salvando..." : "Salvar perfil"}</button>
  </form>;
}
