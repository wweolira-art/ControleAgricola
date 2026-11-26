import { db } from "./db.js";
import { resolveSafraId } from "./safras.js";

export interface PremissaCentroArea {
  sheetId: number;
  center: string;
  area: number;
}

function ensureTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS premissa_centro_areas (
      safra_id INTEGER NOT NULL REFERENCES safras(id) ON DELETE CASCADE,
      sheet_id INTEGER NOT NULL REFERENCES sheets(id) ON DELETE CASCADE,
      area REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (safra_id, sheet_id)
    );
  `);
}

export function listPremissaCentroAreas(safraId?: number | null) {
  ensureTable();
  const harvestId = resolveSafraId(safraId);
  const rows = db.prepare(`
    SELECT s.id AS sheet_id, s.title AS center, COALESCE(a.area, 0) AS area
      FROM sheets s
      LEFT JOIN premissa_centro_areas a ON a.sheet_id = s.id AND a.safra_id = ?
     WHERE s.kind = 'cost_center' AND s.visible = 1
     ORDER BY s.sort_order, s.title COLLATE NOCASE
  `).all(harvestId) as { sheet_id: number; center: string; area: number }[];
  return {
    safraId: harvestId,
    areas: rows.map((row) => ({ sheetId: row.sheet_id, center: row.center, area: Number(row.area) || 0 })),
  };
}

export function savePremissaCentroAreas(input: { safraId?: number | null; areas?: Array<{ sheetId: number; area: unknown }> }) {
  ensureTable();
  const harvestId = resolveSafraId(input.safraId);
  if (!Array.isArray(input.areas)) throw new Error("Informe as áreas dos centros de custo.");
  const validSheets = new Set(
    (db.prepare("SELECT id FROM sheets WHERE kind = 'cost_center' AND visible = 1").all() as { id: number }[])
      .map((row) => row.id),
  );
  const parsed = input.areas.map((row) => {
    const sheetId = Number(row.sheetId);
    const area = typeof row.area === "string" ? Number(row.area.replace(",", ".")) : Number(row.area);
    if (!Number.isInteger(sheetId) || !validSheets.has(sheetId)) throw new Error("Centro de custo inválido.");
    if (!Number.isFinite(area) || area < 0) throw new Error("Informe áreas válidas, iguais ou maiores que zero.");
    return { sheetId, area };
  });
  if (new Set(parsed.map((row) => row.sheetId)).size !== parsed.length) {
    throw new Error("Há centro de custo repetido na lista.");
  }
  const upsert = db.prepare(`
    INSERT INTO premissa_centro_areas (safra_id, sheet_id, area) VALUES (?, ?, ?)
    ON CONFLICT(safra_id, sheet_id) DO UPDATE SET area = excluded.area
  `);
  const transaction = db.transaction(() => {
    for (const row of parsed) upsert.run(harvestId, row.sheetId, row.area);
  });
  transaction();
  return listPremissaCentroAreas(harvestId);
}
