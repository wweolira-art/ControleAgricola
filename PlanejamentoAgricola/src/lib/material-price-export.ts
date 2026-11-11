import type { CalcRule, Material } from "../api";

export interface MaterialPriceExportOptions {
  safraId: number;
  safraCode: string;
  group: number;
  company: number;
  branch: number;
}

type PlanningPrice = { materialId: number | null; materialCode: string | null; price: number };

function priceCandidates(material: Material, rules: CalcRule[], safraId: number, linePrices: PlanningPrice[]) {
  const normalizeCode = (code: string | null) => (code ?? "").trim().replace(/^E(?=\d)/i, "").replace(/^0+(?=\d)/, "");
    const lineValues = linePrices.filter((row) => (row.materialId === material.id ||
      (!row.materialId && normalizeCode(row.materialCode) === normalizeCode(material.code))) && Number.isFinite(row.price))
      .map((row) => row.price);
    const ruleValues = rules.filter((rule) => rule.kind === "material" && rule.materialId === material.id
      && rule.safraId === safraId && rule.storedPrice != null && Number.isFinite(rule.storedPrice))
      .map((rule) => rule.storedPrice as number);
    return [...new Set(lineValues.length ? lineValues : ruleValues)];
}

export function materialPriceConflicts(materials: Material[], rules: CalcRule[], safraId: number, linePrices: PlanningPrice[]) {
  return materials.filter((material) => material.tipo === "E").map((material) => ({
    material, prices: priceCandidates(material, rules, safraId, linePrices),
  })).filter((conflict) => conflict.prices.length > 1);
}

export function materialPricesForSafra(materials: Material[], rules: CalcRule[], safraId: number,
  linePrices: PlanningPrice[] = []): Material[] {
  return materials.map((material) => {
    const prices = priceCandidates(material, rules, safraId, linePrices);
    if (material.tipo === "E" && prices.length > 1) {
      throw new Error(`O material ${material.code} possui preços diferentes no planejamento desta safra. Unifique os preços antes de exportar.`);
    }
    return { ...material, valor: prices[0] ?? null };
  });
}

export function materialPriceExportData(materials: Material[], options: MaterialPriceExportOptions) {
  const match = options.safraCode.match(/^(\d{2})\s*\/\s*(\d{2})$/);
  if (!match || Number(match[2]) !== (Number(match[1]) + 1) % 100 || !(options.safraId > 0)) {
    throw new Error("Selecione uma safra válida para os preços.");
  }
  if (![options.group, options.company, options.branch].every((value) => Number.isSafeInteger(value) && value > 0)) {
    throw new Error("Informe códigos inteiros positivos para grupo, empresa e filial.");
  }
  const selected = materials.filter((material) => material.tipo === "E");
  if (!selected.length) throw new Error("Não há materiais do tipo E para exportar.");
  if (!selected.some((material) => material.valor != null && Number.isFinite(material.valor))) {
    throw new Error("Nenhum preço foi encontrado para esta safra. Confira os preços dos materiais no planejamento antes de exportar.");
  }
  const headers = ["COD_GRUPOEMPRESA", "COD_EMPRESA", "COD_FILIAL", "EMPENHO", "SUBEMPENHO", "OBSERVACAO",
    ...Array.from({ length: 12 }, (_, index) => {
      const date = new Date(Date.UTC(2000 + Number(match[1]), 8 + index, 1));
      return date.getUTCFullYear() * 100 + date.getUTCMonth() + 1;
    })];
  const rows = selected.map((material) => {
    const empenho = material.empenho?.trim() ?? "";
    const code = material.code.trim().replace(/^E(?=\d)/i, "");
    const price = material.valor != null && Number.isFinite(material.valor) ? material.valor : null;
    return [options.group, options.company, options.branch,
      /^\d+$/.test(empenho) ? Number(empenho) : empenho || null,
      `E${code}`, null, ...Array.from({ length: 12 }, () => price)];
  });
  return { headers, rows };
}
