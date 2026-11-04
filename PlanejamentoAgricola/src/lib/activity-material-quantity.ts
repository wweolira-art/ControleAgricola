type MaterialQuantity = {
  ref_kind: string | null;
  material_id: number | null;
  calc_kind?: string | null;
  calc_dose?: number | null;
  calc_direct?: number | null;
};

/** Soma as parcelas em L/ha do mesmo material, sem misturar unidades ou produtos. */
export function activityMaterialQuantity(materials: MaterialQuantity[]): number | null {
  if (!materials.length) return null;
  const materialId = materials[0].material_id;
  if (materialId == null || materials.some((line) =>
    line.ref_kind !== "material" || line.material_id !== materialId ||
    line.calc_kind !== "liters" || line.calc_direct === 1 ||
    !Number.isFinite(line.calc_dose) || !(Number(line.calc_dose) > 0)
  )) return null;
  return materials.reduce((sum, line) => sum + Number(line.calc_dose), 0);
}
