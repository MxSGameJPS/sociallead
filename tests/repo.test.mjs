import { existsSync, mkdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const dataDir = path.join(root, "data");
const testDb = path.join(dataDir, "leadflow-test.db");
const prismaCli = path.join(root, "node_modules", "prisma", "build", "index.js");
const databaseUrl = "file:../data/leadflow-test.db";

mkdirSync(dataDir, { recursive: true });
for (const suffix of ["", "-journal", "-wal", "-shm"]) {
  const target = testDb + suffix;
  if (existsSync(target)) rmSync(target, { force: true });
}

process.env.DATABASE_URL = databaseUrl;
const push = spawnSync(process.execPath, [prismaCli, "db", "push", "--skip-generate"], {
  cwd: root,
  env: { ...process.env, DATABASE_URL: databaseUrl },
  stdio: "inherit",
});

if (push.status !== 0) {
  console.error("Não foi possível preparar o banco isolado de testes.");
  process.exit(push.status || 1);
}

const repo = await import("../src/repositories/leadRepository.js");
const { prisma } = await import("../src/lib/prisma.js");

let pass = 0, fail = 0;
const t = (name, condition) => {
  if (condition) pass++;
  else { fail++; console.error("FAIL:", name); }
};

try {
  await repo.clearAll();
  t("clear -> 0", (await repo.stats()).total === 0);

  const a = await repo.createLead({ id: "test_a", name: "Alpha Pizzaria", source: "Google Maps", grade: "A", score: 80, whatsapp: "5547999990001", weakSite: true, city: "Dois Irmãos" });
  t("create id", !!a.id);
  t("create stage novo (default)", a.stage === "novo");

  t("moveStage contatado", (await repo.moveStage(a.id, "contatado")).stage === "contatado");
  t("setFollowUp", (await repo.setFollowUp(a.id, "2026-01-01")).followUpAt === "2026-01-01");
  t("setProposalValue", (await repo.setProposalValue(a.id, 2500)).proposalValue === 2500);
  t("setLanding done", (await repo.setLanding(a.id, "done")).landingStatus === "done");

  let invalidStageRejected = false;
  try { await repo.moveStage(a.id, "qualquer_valor"); } catch { invalidStageRejected = true; }
  t("rejeita estágio inválido", invalidStageRejected);

  let invalidDateRejected = false;
  try { await repo.setFollowUp(a.id, "2026-02-31"); } catch { invalidDateRejected = true; }
  t("rejeita data inválida", invalidDateRejected);

  const inc = [
    { id: "test_b", name: "Beta Bar", source: "Google Maps", grade: "B", score: 60, whatsapp: "5547999990002", weakSite: "false" },
    { id: "test_a2", name: "Alpha Pizzaria", whatsapp: "5547999990001", source: "Google Maps", grade: "A", score: 85, weakSite: true, city: "Dois Irmãos" },
  ];
  const r1 = await repo.importLeads(inc);
  t("import added 1 (Beta)", r1.added === 1);
  t("import updated 1 (Alpha dedupe)", r1.updated === 1);
  t("total 2", (await repo.stats()).total === 2);

  const beta = (await repo.listLeads()).find(l => l.name === "Beta Bar");
  t("normaliza string false", beta.weakSite === false);

  const r2 = await repo.importLeads(inc);
  t("reimport added 0", r2.added === 0);
  t("reimport updated 2", r2.updated === 2);

  const alpha = (await repo.listLeads()).find(l => l.name === "Alpha Pizzaria");
  t("preserva stage apos import", alpha.stage === "contatado");
  t("preserva valor apos import", alpha.proposalValue === 2500);

  const st = await repo.stats();
  t("stats withWhatsapp 2", st.withWhatsapp === 2);
  t("stats total 2", st.total === 2);

  const gamma = await repo.createLead({ id: "test_c", name: "Gamma Café", score: 20 });
  const bulk = await repo.deleteLeads([beta.id, gamma.id, beta.id, ""]);
  t("bulk delete remove ids únicos", bulk.count === 2);
  t("bulk delete -> 1", (await repo.stats()).total === 1);

  await repo.deleteLead(alpha.id);
  t("delete -> 0", (await repo.stats()).total === 0);

  await repo.clearAll();
  t("cleanup -> 0", (await repo.stats()).total === 0);
} finally {
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const target = testDb + suffix;
    if (existsSync(target)) rmSync(target, { force: true });
  }
}

console.log("\n" + pass + " passaram, " + fail + " falharam");
process.exit(fail ? 1 : 0);
