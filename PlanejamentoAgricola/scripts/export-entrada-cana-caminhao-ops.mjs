import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const database = new Database(path.join(root, "data", "planejamento.db"), { readonly: true });
const opColumns = Array.from({ length: 12 }, (_, index) => `op${String(index + 1).padStart(2, "0")}`);
const rows = database
  .prepare(`SELECT pesagem, guia, ${opColumns.join(", ")} FROM entrada_cana_caminhao_conferencia ORDER BY pesagem, guia`)
  .all()
  .filter((row) => opColumns.some((column) => String(row[column] ?? "").trim()));

const destination = path.join(root, "data", "entrada-cana-caminhao-ops.json");
fs.writeFileSync(destination, `${JSON.stringify({ version: 1, records: rows }, null, 2)}\n`);
console.log(`${rows.length} registros de OPs exportados para ${path.relative(root, destination)}.`);
