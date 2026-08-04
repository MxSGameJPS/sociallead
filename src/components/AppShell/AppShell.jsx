"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import s from "./AppShell.module.css";

const ITEMS = [
  { href: "/dashboard", icon: "▦", label: "Visão geral" },
  { href: "/leads", icon: "◎", label: "Localizar profissionais" },
  { href: "/crm", icon: "▤", label: "Acompanhamento" },
  { href: "/agendamentos", icon: "□", label: "Agenda" },
  { href: "/cobrancas", icon: "R$", label: "Honorários" },
  { href: "/perfil", icon: "◉", label: "Perfil e tese" },
];

export default function AppShell({ children }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem("leadflow_sidebar_collapsed") === "1");
    const theme = localStorage.getItem("leadflow_theme");
    if (theme) document.documentElement.setAttribute("data-theme", theme);
  }, []);

  function toggleSidebar() {
    setCollapsed(current => {
      const next = !current;
      localStorage.setItem("leadflow_sidebar_collapsed", next ? "1" : "0");
      return next;
    });
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme");
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const dark = current ? current === "dark" : systemDark;
    const next = dark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("leadflow_theme", next);
  }

  return <div className={s.shell + (collapsed ? " " + s.collapsed : "")}>
    <aside className={s.sidebar}>
      <div className={s.brand}>
        <div className={s.logoMark}>S</div>
        <div className={s.brandText}><strong>Social Leads</strong><span>Prospecção jurídica</span></div>
        <button className={s.collapse} onClick={toggleSidebar} aria-label={collapsed ? "Expandir menu" : "Recolher menu"}>{collapsed ? "›" : "‹"}</button>
      </div>

      <nav className={s.nav} aria-label="Navegação principal">
        {ITEMS.map(item => {
          const crmActive = item.href === "/crm" && (pathname.startsWith("/crm") || pathname.startsWith("/consultoria"));
          const active = crmActive || pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href + "/"));
          return <a key={item.href} href={item.href} className={active ? s.active : ""} title={item.label}><span className={s.icon}>{item.icon}</span><span className={s.label}>{item.label}</span></a>;
        })}
      </nav>

      <div className={s.footer}>
        <a href="/configuracoes/ia" className={pathname.startsWith("/configuracoes") ? s.active : ""} title="Configurações"><span className={s.icon}>⚙</span><span className={s.label}>Configurações</span></a>
        <button onClick={toggleTheme} title="Alternar tema"><span className={s.icon}>◐</span><span className={s.label}>Alternar tema</span></button>
      </div>
    </aside>
    <div className={s.content}>{children}</div>
  </div>;
}
