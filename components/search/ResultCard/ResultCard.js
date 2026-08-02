"use client";

import styles from "./ResultCard.module.css";

function statusClass(status) {
  const s = (status || "").toLowerCase();
  if (s === "ativo") return styles.statusActive;
  if (s === "inativo") return styles.statusInactive;
  return styles.statusUnknown;
}

export default function ResultCard({ record, selected, onToggle }) {
  const contacts = [
    record.email && { label: "E-mail", value: record.email },
    record.whatsapp && { label: "WhatsApp", value: record.whatsapp },
    record.phone && { label: "Telefone", value: record.phone }
  ].filter(Boolean);

  const socials = [
    record.website && { label: "Site", value: record.website, href: record.website },
    record.instagram && { label: "Instagram", value: record.instagram },
    record.facebook && { label: "Facebook", value: record.facebook },
    record.linkedin && { label: "LinkedIn", value: record.linkedin, href: record.linkedin }
  ].filter(Boolean);

  return (
    <div className={`${styles.card} ${selected ? styles.selected : ""}`}>
      <div className={styles.head}>
        <label className={styles.checkboxWrap}>
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggle(record.id)}
          />
        </label>
        <div className={styles.headInfo}>
          <h3 className={styles.name}>{record.name || "—"}</h3>
          <div className={styles.meta}>
            <span className={styles.badge}>{record.council}</span>
            {record.registration ? (
              <span className={styles.reg}>Nº {record.registration}</span>
            ) : null}
            <span className={statusClass(record.status)}>
              {record.status || "Indefinido"}
            </span>
          </div>
        </div>
      </div>

      <div className={styles.body}>
        {record.specialty ? (
          <div className={styles.row}>
            <span className={styles.rowLabel}>Especialidade</span>
            <span>{record.specialty}</span>
          </div>
        ) : null}
        <div className={styles.row}>
          <span className={styles.rowLabel}>Local</span>
          <span>
            {[record.city, record.state].filter(Boolean).join(" / ") || "—"}
          </span>
        </div>

        {contacts.length > 0 ? (
          <div className={styles.group}>
            {contacts.map((c) => (
              <div key={c.label} className={styles.row}>
                <span className={styles.rowLabel}>{c.label}</span>
                <span>{c.value}</span>
              </div>
            ))}
          </div>
        ) : null}

        {socials.length > 0 ? (
          <div className={styles.socials}>
            {socials.map((s) =>
              s.href ? (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noreferrer"
                  className={styles.social}
                >
                  {s.label}
                </a>
              ) : (
                <span key={s.label} className={styles.social}>
                  {s.label}: {s.value}
                </span>
              )
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}