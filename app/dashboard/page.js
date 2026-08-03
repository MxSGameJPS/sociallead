"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import styles from "./page.module.css";
import Header from "../../components/dashboard/Header/Header.js";
import BaseStats from "../../components/dashboard/BaseStats/BaseStats.js";
import PlacesSearch from "../../components/search/PlacesSearch/PlacesSearch.js";
import JsonImport from "../../components/search/JsonImport/JsonImport.js";
import ResultsTable from "../../components/search/ResultsTable/ResultsTable.js";

export default function DashboardPage() {
  const [results, setResults] = useState([]);
  const [filters, setFilters] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState("");

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    setStatsError("");
    try {
      const response = await fetch("/api/leads/stats", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível carregar a base local.");
      setStats(data);
    } catch (err) {
      setStatsError(err?.message || "Não foi possível carregar a base local.");
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  async function handlePlacesResults(data) {
    setResults(data.results || []);
    setFilters({ source: "google-places", query: data.textQuery || "" });
    setSelectedIds(new Set());
    await loadStats();
  }

  async function handleImported(data) {
    setResults(data.results || []);
    setFilters({ council: "CRM", source: "cfm-json-import" });
    setSelectedIds(new Set());
    await loadStats();
  }

  function toggle(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <>
      <Header
        title="SocialLead — Descoberta de Profissionais"
        subtitle="Encontre leads pelo Google Places, importe bases oficiais e monte dossiês no CRM local."
      />
      <div className={styles.content}>
        <div className={styles.topActions}>
          <div>
            <strong>Fluxo do MVP</strong>
            <span>Descoberta → CRM → Dossiê → análise futura pelo OmniRoute</span>
          </div>
          <Link className={styles.crmButton} href="/crm">Abrir CRM</Link>
        </div>

        <BaseStats stats={stats} loading={statsLoading} error={statsError} />
        <PlacesSearch onResults={handlePlacesResults} />
        <JsonImport onImported={handleImported} />

        {results.length > 0 ? (
          <ResultsTable
            results={results}
            isMock={false}
            filters={filters}
            selectedIds={selectedIds}
            onToggle={toggle}
            onSelectAll={() => setSelectedIds(new Set(results.map((item) => item.id)))}
            onClear={() => setSelectedIds(new Set())}
          />
        ) : null}
      </div>
    </>
  );
}
