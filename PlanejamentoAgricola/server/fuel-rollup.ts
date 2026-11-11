/** Cabeçalhos de combustível com materiais são subtotais, sem despesa própria. */
export function ownMonthsForRollup(own: number[], children: { ref_kind?: string | null; material_id?: number | null }[],
  fuelCategory: boolean) {
  return fuelCategory && children.some((child) => child.ref_kind === "material" || Boolean(child.material_id))
    ? own.map(() => 0)
    : own;
}
