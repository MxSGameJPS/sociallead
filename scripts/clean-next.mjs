import { rmSync } from "node:fs";
import path from "node:path";

const nextDirectory = path.join(process.cwd(), ".next");
rmSync(nextDirectory, { recursive: true, force: true });
console.log("Cache de desenvolvimento .next removido.");
