"use client";

import { useState } from "react";
import styles from "./page.module.css";
import Header from "../../components/dashboard/Header/Header.js";
import SearchForm from "../../components/search/SearchForm/SearchForm.js";
import JsonImport from "../../components/search/JsonImport/JsonImport.js";
import ResultsTable from "../../components/search/ResultsTable/ResultsTable.js";

export default function DashboardPage() {
  const [results, setResults] = useState([]);
  const [isMock, setIsMock] = useState(false);
  const [pendingIntegration, setPendingIntegration] = useState(false);
  const [filters, setFilters] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searched, setSearched] = useState(false);

  async function handleSearch(formData) {
    setLoading(true);
    setError(null);
    setSelectedIds(new Set());
    try {
      const res = await fetch("/api/registries/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (res.ok) {
        setResults(data.results || []);
        setIsMock(Boolean(data.isMock));
        setPendingIntegration(Boolean(data.pendingIntegration));
        setFilters(data.filters || formData);
        setSearched(true);
      } else {
        setResults([]);
        setError(data.error || "Não foi possível consultar este conselho agora.");
        setSearched(true);
      }
    } catch {
      setResults([]);
      setError("Não foi possível consultar este conselho agora.");
      setSearched(true);
    } finally {
      setLoading(false);
    }
  }

  function handleImported(data) {
    setResults(data.results || []);
    setIsMock(false);
    setPendingIntegration(false);
    setFilters({ council: "CRM", source: "cfm-json-import" });
    setSelectedIds(new Set());
    setError(null);
    setSearched(true);
  }

  function toggle(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(results.map((r) => r.id)));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  return (
    <>
      <Header
        title="Buscador de Registros Profissionais"
        subtitle="Consulte registros, importe respostas oficiais e exporte em CSV."
      />
      <div className={styles.content}>
        <JsonImport onImported={handleImported} disabled={loading} />
        <SearchForm onSearch={handleSearch} loading={loading} />

        {loading ? (
          <p className={styles.info}>Buscando registros...</p>
        ) : null}

        {error ? <div className={styles.error}>{error}</div> : null}

        {!loading && !error && searched && results.length === 0 && pendingIntegration ? (
          <div className={styles.notice}>
            Este conselho ainda não possui integração automática de consulta.
            A arquitetura está preparada para receber um conector real.
          </div>
        ) : null}

        {!loading && !error && searched && results.length === 0 && !pendingIntegration ? (
          <p className={styles.info}>Nenhum registro encontrado para os filtros informados.</p>
        ) : null}

        {!loading && results.length > 0 ? (
          <ResultsTable
            results={results}
            isMock={isMock}
            filters={filters}
            selectedIds={selectedIds}
            onToggle={toggle}
            onSelectAll={selectAll}
            onClear={clearSelection}
          />
        ) : null}
      </div>
    </>
  );
}
