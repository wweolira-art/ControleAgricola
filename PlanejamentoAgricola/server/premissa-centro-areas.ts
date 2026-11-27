import { db } from "./db.js";
import { currentSafraId, resolveSafraId } from "./safras.js";
import { premissasKpis } from "./calc.js";
import { listCustomSubprocesses, listStoredPremissaValues } from "./premissas-dist.js";

export interface PremissaCentroArea {
  sheetId: number;
  center: string;
  area: number;
  planejadaMeses?: number[];
}

function ensureTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS premissa_centro_areas (
      safra_id INTEGER NOT NULL REFERENCES safras(id) ON DELETE CASCADE,
      sheet_id INTEGER NOT NULL REFERENCES sheets(id) ON DELETE CASCADE,
      area REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (safra_id, sheet_id)
    );
    CREATE TABLE IF NOT EXISTS realizado_centro_areas (
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
  const current = harvestId === currentSafraId() ? premissasKpis() : null;
  const stored = listStoredPremissaValues(harvestId);
  const custom = listCustomSubprocesses(harvestId);
  const qty = (key: string) => current?.subprocesses?.find((item) => item.key === key)?.qty?.value ?? stored.get(key)?.qty ?? 0;
  const irrigation = custom.find((item) => item.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase() === "irrigacao");
  const planejadas: Record<string, number> = {
    "T.C.S.": qty("haSoca"), "T.C.P.": qty("haPlanta"),
    "P.SOLO": qty("haVerao") + qty("haInverno"), PLANTIO: qty("haVerao") + qty("haInverno"),
    "C. MECANIZADA": qty("tons"), "C. MANUAL": qty("tonsManual"),
    "IRRIGAÇÃO": irrigation ? qty(irrigation.key) : 0,
  };
  const normalizeName = (value: string) => value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const premiseKeyFor = (value: string) => {
    const name = normalizeName(value);
    if (name === "p solo" || name === "preparo de solo" || name === "preparo solo") return "P.SOLO";
    if (name === "plantio") return "PLANTIO";
    if (name === "t c p" || name === "tratos de cana planta" || name === "tratos cana planta") return "T.C.P.";
    if (name === "t c s" || name === "tratos de cana soca" || name === "tratos cana soca") return "T.C.S.";
    if (name === "c mecanizada" || name === "colheita mecanizada" || name === "colheita de cana mecanizada") return "C. MECANIZADA";
    if (name === "c manual" || name === "colheita manual" || name === "colheita de cana manual") return "C. MANUAL";
    if (name === "irrigacao") return "IRRIGAÇÃO";
    return null;
  };
  const monthValues = (name: string) => {
    const months = current?.months ?? [];
    const values = (key: keyof (typeof months)[number]) => months.map((month) => Number(month[key] ?? 0));
    const key = premiseKeyFor(name);
    if (key === "T.C.S.") return values("haSoca");
    if (key === "T.C.P.") return values("haPlanta");
    if (key === "P.SOLO" || key === "PLANTIO") return months.map((month) => month.haVerao + month.haInverno);
    if (key === "C. MECANIZADA") return values("tons");
    if (key === "C. MANUAL") return values("tonsManual");
    if (key === "IRRIGAÇÃO") return months.map(() => 0);
    return null;
  };
  const rows = db.prepare(`
    SELECT s.id AS sheet_id, s.name, s.title AS center, a.area AS area
      FROM sheets s
      LEFT JOIN realizado_centro_areas a ON a.sheet_id = s.id AND a.safra_id = ?
     WHERE s.kind = 'cost_center' AND s.visible = 1
     ORDER BY s.sort_order, s.title COLLATE NOCASE
  `).all(harvestId) as { sheet_id: number; name: string; center: string; area: number | null }[];
  return {
    safraId: harvestId,
    areas: rows.map((row) => ({
      sheetId: row.sheet_id,
      center: row.center,
      area: row.area == null ? null : Number(row.area),
      planejada: planejadas[premiseKeyFor(row.name) ?? row.name] ?? null,
      planejadaMeses: monthValues(row.name),
    })),
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
    const area = row.area == null || row.area === "" ? null : typeof row.area === "string" ? Number(row.area.replace(",", ".")) : Number(row.area);
    if (!Number.isInteger(sheetId) || !validSheets.has(sheetId)) throw new Error("Centro de custo inválido.");
    if (area != null && (!Number.isFinite(area) || area < 0)) throw new Error("Informe áreas válidas, iguais ou maiores que zero.");
    return { sheetId, area };
  });
  if (new Set(parsed.map((row) => row.sheetId)).size !== parsed.length) {
    throw new Error("Há centro de custo repetido na lista.");
  }
  const upsert = db.prepare(`
    INSERT INTO realizado_centro_areas (safra_id, sheet_id, area) VALUES (?, ?, ?)
    ON CONFLICT(safra_id, sheet_id) DO UPDATE SET area = excluded.area
  `);
  const transaction = db.transaction(() => {
    const remove = db.prepare("DELETE FROM realizado_centro_areas WHERE safra_id = ? AND sheet_id = ?");
    for (const row of parsed) {
      if (row.area == null) remove.run(harvestId, row.sheetId);
      else upsert.run(harvestId, row.sheetId, row.area);
    }
  });
  transaction();
  return listPremissaCentroAreas(harvestId);
}
