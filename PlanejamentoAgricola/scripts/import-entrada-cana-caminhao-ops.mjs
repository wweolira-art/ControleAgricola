import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "data", "entrada-cana-caminhao-ops.json");
if (!fs.existsSync(source)) throw new Error(`Arquivo de OPs não encontrado: ${source}`);

const payload = JSON.parse(fs.readFileSync(source, "utf8"));
if (!Array.isArray(payload.records)) throw new Error("Arquivo de OPs inválido: 'records' deve ser uma lista.");

const opColumns = Array.from({ length: 12 }, (_, index) => `op${String(index + 1).padStart(2, "0")}`);
const database = new Database(path.join(root, "data", "planejamento.db"));
for (const column of opColumns) {
  try {
    database.exec(`ALTER TABLE entrada_cana_caminhao_conferencia ADD COLUMN ${column} TEXT`);
  } catch {
    // A coluna já existe.
  }
}

const statement = database.prepare(`
  INSERT INTO entrada_cana_caminhao_conferencia (pesagem, guia, ${opColumns.join(", ")})
  VALUES (@pesagem, @guia, ${opColumns.map((column) => `@${column}`).join(", ")})
  ON CONFLICT(pesagem, guia) DO UPDATE SET
    ${opColumns.map((column) => `${column} = excluded.${column}`).join(", ")}
`);
const importRecords = database.transaction((records) => {
  for (const record of records) {
    const pesagem = String(record?.pesagem ?? "").trim();
    const guia = String(record?.guia ?? "").trim();
    if (!pesagem || !guia) continue;
    statement.run({
      pesagem,
      guia,
      ...Object.fromEntries(opColumns.map((column) => [column, String(record[column] ?? "").trim()])),
    });
  }
});

importRecords(payload.records);
console.log(`${payload.records.length} registros de OPs importados de ${path.relative(root, source)}.`);
