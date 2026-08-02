import styles from "./page.module.css";
import Header from "../../../components/dashboard/Header/Header.js";
import AISettingsForm from "../../../components/settings/AISettingsForm/AISettingsForm.js";

export const dynamic = "force-dynamic";

export default function ConfiguracoesPage() {
  return (
    <>
      <Header
        title="Configurações da IA"
        subtitle="Configure o provedor de IA usado para enriquecer os dados."
      />
      <div className={styles.content}>
        <p className={styles.intro}>
          As configurações são salvas localmente em <code>data/settings.json</code>.
          A chave da API permanece apenas no servidor.
        </p>
        <AISettingsForm />
      </div>
    </>
  );
}