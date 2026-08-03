// Base em branco: por decisao do usuario, nenhum lead e importado.
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const total = await prisma.lead.count();
  console.log("Base em branco. Nenhum lead importado. Total atual no banco:", total);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
