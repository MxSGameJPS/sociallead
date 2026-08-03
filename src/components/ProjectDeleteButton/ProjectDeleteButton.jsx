"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteSiteProjectAction } from "../../app/actions/projects.js";
import s from "./ProjectDeleteButton.module.css";

export default function ProjectDeleteButton({ projectId, projectName }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function removeProject() {
    const confirmed = window.confirm(`Excluir o rascunho “${projectName}”?\n\nO registro e a pasta gerada serão removidos permanentemente.`);
    if (!confirmed) return;

    setError("");
    startTransition(async () => {
      try {
        await deleteSiteProjectAction(projectId);
        router.refresh();
      } catch (cause) {
        setError(cause?.message || "Não foi possível excluir o rascunho.");
      }
    });
  }

  return <div className={s.wrapper}>
    <button type="button" onClick={removeProject} disabled={pending} aria-label={`Excluir rascunho ${projectName}`}>
      {pending ? "Excluindo…" : "Excluir rascunho"}
    </button>
    {error && <p role="alert">{error}</p>}
  </div>;
}
