import type Database from "better-sqlite3";
import type { MaterialEquipmentTarget } from "../src/lib/material-equipment-allocation.js";

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
