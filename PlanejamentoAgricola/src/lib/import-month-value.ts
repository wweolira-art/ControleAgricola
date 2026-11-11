import type { LineItem } from "../api";

export function isTypeEMaterial(line: Pick<LineItem, "item_type" | "ref_kind">) {
  return line.item_type === "E" && line.ref_kind !== "cost_object" && line.ref_kind !== "activity";
}

export function technicalImportMonthValue(
  line: Pick<LineItem, "item_type" | "ref_kind" | "calc_price" | "product_code" | "description">,
  value: number,
  context: string,
) {
  const amount = Number(value) || 0;
  if (!isTypeEMaterial(line)) return Math.round(amount * 100) / 100;
  if (amount === 0) return 0;
  const price = Number(line.calc_price);
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(`Não foi possível calcular a quantidade do material ${line.product_code ?? ""} — ${line.description} (${context}): informe um preço válido para o material nesta safra.`);
  }
  // Quantidade não é moeda: preserva a precisão da divisão, sem arredondar a centavos.
  return amount / price;
}
