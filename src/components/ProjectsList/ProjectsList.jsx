import ProjectDeleteButton from "../ProjectDeleteButton/ProjectDeleteButton.jsx";
import s from "./ProjectsList.module.css";

const STATUS = {
  draft: "Rascunho",
  building: "Em construção",
  ready: "Prévia pronta",
  sent: "Enviado",
  approved: "Aprovado",
  published: "Publicado",
};

const TEMPLATE = {
  institutional: "Site institucional",
  landing: "Landing page",
  menu: "Cardápio / delivery",
  booking: "Serviços / agendamento",
};

const DELETABLE = new Set(["draft", "building"]);

export default function ProjectsList({ projects = [] }) {
  return <main className={s.page}>
    <header className={s.header}>
      <div><h1>Meus projetos</h1><p>Prévias geradas em pastas independentes, prontas para abrir na IDE e validar antes do deploy.</p></div>
      <a href="/criar-site">+ Criar projeto</a>
    </header>

    {projects.length === 0 ? <section className={s.empty}><span>◇</span><h2>Nenhum projeto criado</h2><p>Abra um lead no CRM ou comece pelo criador de sites.</p><a href="/criar-site">Criar primeiro projeto</a></section>
      : <section className={s.grid}>{projects.map(project => <article className={s.card} key={project.id}>
        <div className={s.cardTop}><span>{project.name.slice(0, 1).toUpperCase()}</span><div><h2>{project.name}</h2><p>{[project.segment, project.city].filter(Boolean).join(" · ") || "Negócio sem categoria"}</p></div><b>{STATUS[project.status] || project.status}</b></div>
        <dl><div><dt>Modelo</dt><dd>{TEMPLATE[project.template] || project.template}</dd></div><div><dt>Origem</dt><dd>{project.mode === "lead" ? "Lead do CRM" : project.mode === "google" ? "Link do Google" : "Descrição manual"}</dd></div><div><dt>Conteúdo</dt><dd>{project.aiUsed ? "Direção premium + IA" : "Sistema visual específico do nicho"}</dd></div><div><dt>Imagens</dt><dd>{project.imageCount || 0} obtidas</dd></div><div><dt>Atualizado</dt><dd>{new Date(project.updatedAt).toLocaleString("pt-BR")}</dd></div></dl>
        {project.folderPath && <div className={s.folder}><span>Pasta do projeto</span><code>{project.folderPath}</code><small>Abra esta pasta na IDE e execute: npm install && npm run dev</small></div>}
        {project.warning && <div className={s.warning}>{project.warning}</div>}
        <div className={s.actions}>
          <div className={s.navigationActions}>{project.leadId && <a href={`/crm/${project.leadId}`}>Abrir lead</a>}<a href={`/criar-site${project.leadId ? `?lead=${project.leadId}` : ""}`}>Gerar nova versão</a></div>
          {DELETABLE.has(project.status) && <ProjectDeleteButton projectId={project.id} projectName={project.name} />}
        </div>
      </article>)}</section>}
  </main>;
}
