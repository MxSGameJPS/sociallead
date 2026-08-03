import s from "./ModulePlaceholder.module.css";

export default function ModulePlaceholder({ title, description, icon = "◇", items = [], actionHref = "/dashboard", actionLabel = "Voltar ao Dashboard" }) {
  return <main className={s.page}>
    <div className={s.card}>
      <div className={s.icon}>{icon}</div>
      <span className={s.eyebrow}>Próxima etapa do LeadFlow</span>
      <h1>{title}</h1>
      <p>{description}</p>
      {items.length > 0 && <div className={s.items}>{items.map(item => <div key={item}><span>✓</span>{item}</div>)}</div>}
      <a href={actionHref}>{actionLabel}</a>
    </div>
  </main>;
}
