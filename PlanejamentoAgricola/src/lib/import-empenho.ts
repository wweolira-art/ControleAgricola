import type { Activity, LineItem, Material } from "../api";

type LinhaImportacao = Pick<LineItem, "activity_id" | "item_type" | "product_code" | "empenho_override"> & Partial<Pick<LineItem, "material_id" | "ref_kind">>;

export function atividadeDaImportacao(activities: Activity[], line: LinhaImportacao) {
  const product = String(line.product_code ?? "").trim();
  const generico = line.item_type === "G" || (line.item_type !== "E" && /^G\d+$/i.test(product));
  if (generico && product) {
    const code = product.replace(/^G(?=\d)/i, "").toUpperCase();
    return activities.find((activity) => String(activity.code).trim().replace(/^G(?=\d)/i, "").toUpperCase() === code);
  }
  return activities.find((activity) => activity.id === line.activity_id);
}

export function empenhoDaImportacao(activities: Activity[], line: LinhaImportacao, materials: Material[] = []) {
  const override = String(line.empenho_override ?? "").trim();
  if (override) return override;
  if (line.item_type === "E" && line.ref_kind !== "cost_object") {
    const codeKey = (value: string) => {
      const code = value.trim().replace(/^E(?=\d)/i, "");
      return /^\d+$/.test(code) ? code.replace(/^0+(?=\d)/, "") : code.toUpperCase();
    };
    const material = materials.find((item) => item.id === line.material_id)
      ?? materials.find((item) => item.tipo === "E" && codeKey(item.code) === codeKey(String(line.product_code ?? "")));
    return String(material?.empenho ?? "").trim();
  }
  return String(atividadeDaImportacao(activities, line)?.empenho ?? "").trim();
}

