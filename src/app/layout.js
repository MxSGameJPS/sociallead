import "./globals.css";
import AppShell from "../components/AppShell/AppShell.jsx";

export const metadata = {
  title: "LeadFlow — Prospecção e CRM local",
  description: "Gestão local de leads, CRM, IA e acompanhamento comercial",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body><AppShell>{children}</AppShell></body>
    </html>
  );
}
