export type MaterialEquipmentMapping = { code: string; costObjectCodes: number[] };
export type MaterialEquipmentTarget = { objectCode: number; equipmentCodes: string[]; share: number };
const codeKey = (value: string) => {
  const raw = value.trim();
  return /^\d+$/.test(raw) ? String(Number(raw)) : raw.toUpperCase();
};

/** Uma parcela por equipamento; divide entre vínculos vigentes se houver mais de um. */
export function materialEquipmentTargets(codes: string[], mappings: MaterialEquipmentMapping[]): MaterialEquipmentTarget[] {
  if (!Array.isArray(codes) || !codes.length || codes.length > 200 || codes.some((code) => typeof code !== "string" || !code.trim())) {
    throw new Error("Selecione os equipamentos para distribuir o material.");
  }
  const selected = [...new Set(codes.map(codeKey))];
  const byEquipment = new Map<string, Set<number>>();
  for (const item of mappings) {
    const key = codeKey(item.code);
    const objects = byEquipment.get(key) ?? new Set<number>();
    for (const object of item.costObjectCodes) if (Number.isSafeInteger(object) && object > 0) objects.add(object);
    byEquipment.set(key, objects);
  }
  const missing = selected.filter((code) => !byEquipment.get(code)?.size);
  if (missing.length) throw new Error(`Equipamentos sem objeto de custo vigente: ${missing.join(", ")}. Corrija o vínculo ou retire esses equipamentos da seleção.`);
  const groups = new Map<number, MaterialEquipmentTarget>();
  for (const code of selected) {
    const objects = [...byEquipment.get(code)!];
    for (const object of objects) {
      const group = groups.get(object) ?? { objectCode: object, equipmentCodes: [], share: 0 };
      group.equipmentCodes.push(code);
      group.share += 1 / selected.length / objects.length;
      groups.set(object, group);
    }
  }
  const targets = [...groups.values()].sort((a, b) => a.objectCode - b.objectCode);
  // Absorve somente o resíduo de ponto flutuante no último destino.
  targets[targets.length - 1].share = 1 - targets.slice(0, -1).reduce((sum, target) => sum + target.share, 0);
  return targets;
}
