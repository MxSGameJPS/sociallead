import "./globals.css";

export const metadata = {
  title: "Buscador de Registros Profissionais",
  description:
    "MVP local para buscar profissionais por registro em conselhos profissionais brasileiros."
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}