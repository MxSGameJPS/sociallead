"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import styles from "./page.module.css";

export default function CrmPage() {
  const [leads, setLeads] = useState([]);
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadLeads() {
    setLoading(true);
    try {
      const response = await fetch("/api/leads", { cache: "no-store" });
      const data = await response.json();
      setLeads(data.leads || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadLeads(); }, []);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return leads;
    return leads.filter((lead) => [lead.name, lead.businessName, lead.city, lead.state, lead.specialty, lead.council]
      .filter(Boolean).join(" ").toLowerCase().includes(term));
  }, [leads, query]);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>SOCIALLEAD</p>
          <h1>CRM de Leads</h1>
          <p>Todos os resultados descobertos ou importados ficam salvos aqui para formar o dossiê.</p>
        </div>
        <Link className={styles.back} href="/dashboard">Voltar ao buscador</Link>
      </header>

      <section className={styles.toolbar}>
        <strong>{leads.length.toLocaleString("pt-BR")} registros salvos</strong>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nome, cidade, conselho ou nicho" />
        <button onClick={loadLeads}>Atualizar</button>
      </section>

      <section className={styles.layout}>
        <div className={styles.list}>
          {loading ? <p>Carregando CRM...</p> : null}
          {!loading && filtered.length === 0 ? <p>Nenhum lead encontrado.</p> : null}
          {filtered.map((lead) => (
            <button key={lead.id} className={styles.leadCard} onClick={() => setSelected(lead)}>
              <div>
                <strong>{lead.businessName || lead.name || "Lead sem nome"}</strong>
                <span>{[lead.specialty, lead.city, lead.state].filter(Boolean).join(" · ") || "Sem localização"}</span>
              </div>
              <div className={styles.tags}>
                {lead.council ? <span>{lead.council}</span> : null}
                <span>{lead.dossierStatus || "PENDENTE"}</span>
              </div>
            </button>
          ))}
        </div>

        <aside className={styles.dossier}>
          {!selected ? (
            <div className={styles.empty}>
              <h2>Dossiê do lead</h2>
              <p>Selecione um registro para visualizar os dados coletados e o status de enriquecimento.</p>
            </div>
          ) : (
            <>
              <div className={styles.dossierHeader}>
                <div>
                  <span>DOSSIÊ</span>
                  <h2>{selected.businessName || selected.name}</h2>
                </div>
                <span className={styles.status}>{selected.dossierStatus || "DISCOVERED"}</span>
              </div>

              <dl className={styles.details}>
                <div><dt>Conselho provável</dt><dd>{selected.council || "Não identificado"}</dd></div>
                <div><dt>Registro</dt><dd>{selected.registration || "Pendente de localização"}</dd></div>
                <div><dt>Telefone</dt><dd>{selected.phone || "Não encontrado"}</dd></div>
                <div><dt>Site</dt><dd>{selected.website ? <a href={selected.website} target="_blank">Abrir site</a> : "Não encontrado"}</dd></div>
                <div><dt>Endereço</dt><dd>{selected.formattedAddress || [selected.city, selected.state].filter(Boolean).join(" - ") || "Não encontrado"}</dd></div>
                <div><dt>Avaliação</dt><dd>{selected.rating ? `${selected.rating} (${selected.reviewCount || 0} avaliações)` : "Sem avaliação"}</dd></div>
                <div><dt>Google Maps</dt><dd>{selected.googleMapsUrl ? <a href={selected.googleMapsUrl} target="_blank">Abrir perfil</a> : "Não disponível"}</dd></div>
                <div><dt>Fonte</dt><dd>{(selected.sources || []).join(", ") || selected.discoveredBy || "Local"}</dd></div>
              </dl>

              <section className={styles.analysis}>
                <h3>Próxima etapa</h3>
                <p>O módulo do OmniRoute será conectado aqui para analisar o site, localizar registro profissional, equipe, especialidades e oportunidades comerciais.</p>
              </section>
            </>
          )}
        </aside>
      </section>
    </main>
  );
}
