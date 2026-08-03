"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setCommercialTrackAction } from "../../app/actions/consulting.js";
import { COMMERCIAL_TRACKS } from "../../services/leads/commercialTrack.js";
import s from "./CommercialTrackSelector.module.css";

export default function CommercialTrackSelector({ leadId, grade, initialTrack = "projects" }) {
  const router = useRouter();
  const [track, setTrack] = useState(initialTrack);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function changeTrack(value) {
    const before = track;
    setTrack(value);
    setBusy(true);
    setNotice("");
    try {
      const saved = await setCommercialTrackAction(leadId, value);
      setTrack(saved.commercialTrack);
      setNotice("Tipo de oportunidade atualizado sem alterar a nota.");
      router.refresh();
    } catch (error) {
      setTrack(before);
      setNotice(`Erro: ${error.message}`);
    } finally {
      setBusy(false);
    }
  }

  return <section className={s.card}>
    <div>
      <span>Tipo de oportunidade</span>
      <strong>Nota {grade} preservada</strong>
      <p>Controle em quais funis este lead aparece, independentemente da classificação.</p>
    </div>
    <div className={s.control}>
      <select value={track} disabled={busy} onChange={event => changeTrack(event.target.value)}>
        {COMMERCIAL_TRACKS.filter(item => item.id !== "auto").map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select>
      {track === "consulting" || track === "both" ? <a href={`/consultoria/${leadId}`}>Abrir Consultoria →</a> : null}
    </div>
    {notice && <small className={notice.startsWith("Erro") ? s.error : ""}>{notice}</small>}
  </section>;
}
