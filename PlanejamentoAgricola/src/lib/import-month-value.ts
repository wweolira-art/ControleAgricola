import type { LineItem, Material } from "../api";

export function isTypeEMaterial(line: Pick<LineItem, "item_type" | "ref_kind">) {
  return line.item_type === "E" && line.ref_kind !== "cost_object" && line.ref_kind !== "activity";
}

export function technicalImportMonthValue(
  line: Pick<LineItem, "item_type" | "ref_kind" | "calc_price" | "product_code" | "description"> & Partial<Pick<LineItem, "material_id">>,
  value: number,
  context: string,
  materials: Material[] = [],
) {
  const amount = Number(value) || 0;
  if (!isTypeEMaterial(line)) return Math.round(amount * 100) / 100;
  const codeKey = (code: string) => code.trim().replace(/^E(?=\d)/i, "").replace(/^0+(?=\d)/, "").toUpperCase();
  const material = line.material_id != null
    ? materials.find((item) => item.id === line.material_id)
    : materials.find((item) => item.tipo === "E" && codeKey(item.code) === codeKey(line.product_code ?? ""));
  if (material?.export_value === 1) return Math.round(amount * 100) / 100;
  if (amount === 0) return 0;
  const price = Number(line.calc_price);
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(`Não foi possível calcular a quantidade do material ${line.product_code ?? ""} — ${line.description} (${context}): informe um preço válido para o material nesta safra.`);
  }
  // Quantidade não é moeda: preserva a precisão da divisão, sem arredondar a centavos.
  return amount / price;
}
