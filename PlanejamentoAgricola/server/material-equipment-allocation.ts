import type Database from "better-sqlite3";
import type { MaterialEquipmentTarget } from "../src/lib/material-equipment-allocation.js";

/** Preserva a quantidade total ao retirar um objeto de uma distribuição. */
export function redistributeMaterialAfterRemoval(db: Database.Database, id: number) {
  const line = db.prepare("SELECT material_distribution_group FROM lines WHERE id = ?").get(id) as
    { material_distribution_group: number | null } | undefined;
  if (line?.material_distribution_group == null) return;
  const rows = db.prepare("SELECT id, calc_dose FROM lines WHERE material_distribution_group = ?").all(line.material_distribution_group) as
    { id: number; calc_dose: number | null }[];
  const remaining = rows.filter((row) => row.id !== id);
  if (!remaining.length) return;
  const total = rows.reduce((sum, row) => sum + Number(row.calc_dose ?? 0), 0);
  const update = db.prepare("UPDATE lines SET calc_dose = ? WHERE id = ?");
  for (const row of remaining) update.run(total / remaining.length, row.id);
}

/** Todos os destinos e linhas são criados em uma única transação local. */
export function writeMaterialEquipmentTargets(
  db: Database.Database, targets: MaterialEquipmentTarget[],
  write: (target: MaterialEquipmentTarget & { costObjectId: number; localObjectCode: string }) => void,
) {
  db.transaction(() => {
    const objects = db.prepare("SELECT id, code FROM cost_objects").all() as { id: number; code: string }[];
    for (const target of targets) {
      const existing = objects.find((row) => /^\d+$/.test(row.code.trim()) && Number(row.code) === target.objectCode);
      const code = existing?.code ?? String(target.objectCode);
      const id = existing?.id ?? Number(db.prepare("INSERT INTO cost_objects (code, description) VALUES (?, ?)")
        .run(code, `Objeto de custo ${code}`).lastInsertRowid);
      write({ ...target, costObjectId: id, localObjectCode: code });
    }
  })();
}
