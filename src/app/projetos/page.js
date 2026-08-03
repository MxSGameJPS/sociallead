import { listSiteProjects } from "../../services/projects/projectStore.js";
import ProjectsList from "../../components/ProjectsList/ProjectsList.jsx";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const projects = await listSiteProjects();
  return <ProjectsList projects={projects} />;
}
