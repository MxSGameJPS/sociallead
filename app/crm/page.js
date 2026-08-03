"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import styles from "./page.module.css";
import { generateCSV } from "../../lib/csv/export.js";

export default function CrmPage() {
  const [leads, setLeads] = useState([]);
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [extraLinks, setExtraLinks] = useState("");

  async function loadLeads() {
    setLoading(true);
    try {
      const response = await fetch("/api/leads", { cache: "no-store" });
      const data = await response.json();
      setLeads(data.leads || []);
      if (selected) {
        const freshSelected = (data.leads || []).find((lead) => lead.id === selected.id);
        setSelected(freshSelected || null);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadLeads(); }, []);

  async function generateDossier() {
    if (!selected) return;
    setAnalyzing(true);
    setAnalysisError("");
    try {
      const links = extraLinks.split(/\n|,/).map((link) => link.trim()).filter(Boolean);
      const response = await fetch("/api/leads/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: selected.id, links })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Não foi possível gerar o dossiê.");
      }
      setSelected(data.lead);
      setLeads((current) => current.map((lead) => lead.id === data.lead.id ? data.lead : lead));
      setExtraLinks("");
    } catch (error) {
      setAnalysisError(error?.message || "Não foi possível gerar o dossiê.");
    } finally {
      setAnalyzing(false);
    }
  }

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return leads;
    return leads.filter((lead) => [lead.name, lead.businessName, lead.email, lead.whatsapp, lead.city, lead.state, lead.specialty, lead.council]
      .filter(Boolean).join(" ").toLowerCase().includes(term));
  }, [leads, query]);

  function exportCRM() {
    if (!filtered.length) return;

    const csv = generateCSV(filtered);
    const date = new Date().toISOString().slice(0, 10);
    const suffix = query.trim() ? "-filtrados" : "";
    const fileName = `sociallead-crm${suffix}-${date}.csv`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = fileName;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

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
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nome, e-mail, WhatsApp, cidade ou nicho" />
        <button type="button" onClick={loadLeads}>Atualizar</button>
        <button
          type="button"
          className={styles.exportButton}
          onClick={exportCRM}
          disabled={loading || filtered.length === 0}
          title={query.trim() ? "Baixar os resultados filtrados" : "Baixar todos os leads do CRM"}
        >
          Baixar CSV ({filtered.length})
        </button>
      </section>

      <section className={styles.layout}>
        <div className={styles.list}>
          {loading ? <p>Carregando CRM...</p> : null}
          {!loading && filtered.length === 0 ? <p>Nenhum lead encontrado.</p> : null}
          {filtered.map((lead) => (
            <button key={lead.id} className={styles.leadCard} onClick={() => { setSelected(lead); setAnalysisError(""); setExtraLinks(""); }}>
              <div>
                <strong>{lead.name || lead.businessName || "Lead sem nome"}</strong>
                <span>{[lead.email || lead.whatsapp, lead.city, lead.state].filter(Boolean).join(" · ") || "Contato ainda incompleto"}</span>
              </div>
              <div className={styles.tags}>
                {lead.council ? <span>{lead.council}</span> : null}
                <span>{lead.contactCompleteness ?? 0}% contato</span>
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
                  <h2>{selected.name || selected.businessName}</h2>
                </div>
                <span className={styles.status}>{selected.dossierStatus || "DISCOVERED"}</span>
              </div>

              <section className={styles.priorityCard}>
                <div className={styles.priorityHeader}>
                  <div>
                    <span>DADOS ESSENCIAIS</span>
                    <h3>Contato principal do lead</h3>
                  </div>
                  <strong>{selected.contactCompleteness ?? calculateLocalCompleteness(selected)}%</strong>
                </div>
                <div className={styles.priorityGrid}>
                  <div><span>Nome do lead</span><strong>{selected.name || "Não encontrado"}</strong></div>
                  <div><span>E-mail</span><strong>{selected.email || "Não encontrado"}</strong></div>
                  <div><span>WhatsApp</span><strong>{selected.whatsapp || "Não encontrado"}</strong></div>
                  <div><span>Cidade/Estado</span><strong>{[selected.city, selected.state].filter(Boolean).join(" / ") || "Não encontrado"}</strong></div>
                </div>
              </section>

              <dl className={styles.details}>
                <div><dt>Empresa / estabelecimento</dt><dd>{selected.businessName || "Não identificado"}</dd></div>
                <div><dt>Conselho provável</dt><dd>{selected.council || "Não identificado"}</dd></div>
                <div><dt>Registro</dt><dd>{selected.registration || "Pendente de localização"}</dd></div>
                <div><dt>Telefone</dt><dd>{selected.phone || "Não encontrado"}</dd></div>
                <div><dt>Site</dt><dd>{selected.website ? <a href={selected.website} target="_blank" rel="noreferrer">Abrir site</a> : "Não encontrado"}</dd></div>
                <div><dt>Endereço</dt><dd>{selected.formattedAddress || [selected.city, selected.state].filter(Boolean).join(" - ") || "Não encontrado"}</dd></div>
                <div><dt>Avaliação</dt><dd>{selected.rating ? `${selected.rating} (${selected.reviewCount || 0} avaliações)` : "Sem avaliação"}</dd></div>
                <div><dt>Google Maps</dt><dd>{selected.googleMapsUrl ? <a href={selected.googleMapsUrl} target="_blank" rel="noreferrer">Abrir perfil</a> : "Não disponível"}</dd></div>
                <div><dt>Fonte</dt><dd>{(selected.sources || []).join(", ") || selected.discoveredBy || "Local"}</dd></div>
              </dl>

              {selected.dossier ? (
                <section className={styles.analysis}>
                  <h3>Análise da IA</h3>
                  <p>{selected.dossier.summary || "Dossiê concluído."}</p>
                  <div className={styles.analysisGrid}>
                    <div><strong>Profissionais</strong><span>{listValue(selected.dossier.professionalNames)}</span></div>
                    <div><strong>Especialidades</strong><span>{listValue(selected.dossier.specialties)}</span></div>
                    <div><strong>Serviços</strong><span>{listValue(selected.dossier.services)}</span></div>
                    <div><strong>E-mails encontrados</strong><span>{listValue(selected.dossier.emails)}</span></div>
                    <div><strong>Equipe</strong><span>{listValue(selected.dossier.teamMembers)}</span></div>
                    <div><strong>Oportunidades</strong><span>{listValue(selected.dossier.opportunities)}</span></div>
                    <div><strong>Confiança</strong><span>{formatConfidence(selected.dossier.confidence)}</span></div>
                    <div><strong>Fontes analisadas</strong><span>{listValue(selected.dossier.analyzedSources)}</span></div>
                  </div>
                </section>
              ) : null}

              <section className={styles.analysisAction}>
                <h3>{selected.dossier ? "Adicionar fontes e atualizar dossiê" : "Gerar dossiê com IA"}</h3>
                <p>Cole links públicos adicionais, um por linha: Instagram, Facebook, Link na Bio, página da equipe, perfil profissional ou outra fonte relevante.</p>
                <textarea
                  className={styles.linksInput}
                  value={extraLinks}
                  onChange={(event) => setExtraLinks(event.target.value)}
                  placeholder={"https://instagram.com/perfil\nhttps://facebook.com/pagina\nhttps://linktr.ee/perfil"}
                  disabled={analyzing}
                />
                {selected.analysisLinks?.length ? (
                  <p className={styles.savedLinks}>Links já salvos: {selected.analysisLinks.length}</p>
                ) : null}
                <button
                  type="button"
                  className={styles.analyzeButton}
                  onClick={generateDossier}
                  disabled={analyzing || (!selected.website && !extraLinks.trim())}
                >
                  {analyzing ? "Analisando fontes..." : selected.dossier ? "Analisar novos links e atualizar" : "Analisar e criar dossiê"}
                </button>
                {!selected.website && !extraLinks.trim() ? <p className={styles.warning}>Este lead não possui site. Adicione ao menos um link público acima.</p> : null}
                {analysisError ? <p className={styles.analysisError}>{analysisError}</p> : null}
              </section>
            </>
          )}
        </aside>
      </section>
    </main>
  );
}

function listValue(value) {
  return Array.isArray(value) && value.length ? value.join(", ") : "Não encontrado";
}

function formatConfidence(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${Math.round(number * 100)}%` : "Não informado";
}

function calculateLocalCompleteness(lead) {
  const values = [lead.name, lead.email, lead.whatsapp, lead.city && lead.state];
  return Math.round((values.filter(Boolean).length / values.length) * 100);
}
