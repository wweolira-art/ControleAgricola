import type Database from "better-sqlite3";

export function syncPlanningMaterialPrices(db: Database.Database, safraId: number, recalculate: () => void) {
  const materials = db.prepare("SELECT id, code, valor FROM materials WHERE tipo = 'E'").all() as
    { id: number; code: string; valor: number | null }[];
  const normalize = (code: string) => code.trim().replace(/^E(?=\d)/i, "").replace(/^0+(?=\d)/, "");
  const byId = new Map(materials.map((material) => [material.id, material]));
  const byCode = new Map(materials.map((material) => [normalize(material.code), material]));
  const lines = db.prepare(`SELECT id, material_id, product_code FROM lines
    WHERE ref_kind = 'material' OR material_id IS NOT NULL
      OR (item_type = 'E' AND COALESCE(is_group, 0) = 0 AND ref_kind IS NULL)`).all() as
    { id: number; material_id: number | null; product_code: string | null }[];
  const save = db.prepare(`INSERT INTO line_safra_prices (line_id, safra_id, calc_price) VALUES (?, ?, ?)
    ON CONFLICT(line_id, safra_id) DO UPDATE SET calc_price = excluded.calc_price`);
  const updateRules = db.prepare("UPDATE calc_params SET price = ? WHERE safra_id = ? AND kind = 'material' AND material_id = ?");
  return db.transaction(() => {
    let updatedLines = 0;
    let updatedRules = 0;
    for (const line of lines) {
      const material = line.material_id ? byId.get(line.material_id) : byCode.get(normalize(line.product_code ?? ""));
      if (!material || material.valor == null || !Number.isFinite(material.valor) || material.valor <= 0) continue;
      save.run(line.id, safraId, material.valor);
      updatedLines++;
    }
    for (const material of materials) {
      if (material.valor == null || !Number.isFinite(material.valor) || material.valor <= 0) continue;
      updatedRules += updateRules.run(material.valor, safraId, material.id).changes;
    }
    recalculate();
    return { updatedLines, updatedRules,
      skippedMaterials: materials.filter((material) => material.valor == null || !Number.isFinite(material.valor) || material.valor <= 0).length };
  })();
}
