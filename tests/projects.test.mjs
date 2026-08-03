import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const stamp = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
const generatedRelative = `generated-sites/test-draft-${stamp}`;
const generatedAbsolute = path.join(root, generatedRelative);
const projectDir = path.join(root, "data", "projects");

const { createSiteProject, deleteSiteProject } = await import("../src/services/projects/projectStore.js");

const draft = await createSiteProject({
  name: `Rascunho teste ${stamp}`,
  status: "draft",
  folderPath: generatedRelative,
});

await fs.mkdir(generatedAbsolute, { recursive: true });
await fs.writeFile(path.join(generatedAbsolute, "preview.txt"), "teste", "utf8");

await deleteSiteProject(draft.id);
await assert.rejects(fs.access(path.join(projectDir, `${draft.id}.json`)));
await assert.rejects(fs.access(generatedAbsolute));

const ready = await createSiteProject({
  name: `Projeto pronto ${stamp}`,
  status: "ready",
});

await assert.rejects(
  deleteSiteProject(ready.id),
  /Somente projetos em rascunho ou em construção/
);

await fs.rm(path.join(projectDir, `${ready.id}.json`), { force: true });
console.log("Testes de projetos passaram.");
