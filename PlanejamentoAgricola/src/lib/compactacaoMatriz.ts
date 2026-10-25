import { COMPACTACAO_PROFUNDIDADES, type CompactacaoPonto } from "./compactacaoSolo";

export function resumoCompactacaoMatriz(pontos: CompactacaoPonto[]) {
  const sums = new Map<string, { total: number; count: number }>();
  let total = 0, count = 0;
  for (const point of pontos) for (const row of point.leituras) {
    const item = sums.get(row.profundidade) ?? { total: 0, count: 0 };
    item.total += row.kpa; item.count++; sums.set(row.profundidade, item);
    total += row.kpa; count++;
  }
  return { profundidades: COMPACTACAO_PROFUNDIDADES.map((depth) => {
    const item = sums.get(depth.nome);
    return item?.count ? item.total / item.count : null;
  }), total: count ? total / count : null };
}

export function corCompactacaoMatriz(kpa: number | null) {
  if (kpa == null) return "#22344b";
  const fraction = Math.max(0, Math.min(1, (kpa - 1600) / 400));
  // Green at 1600, yellow at 1800 and red at 2000 kPa.
  return `rgb(${Math.round(Math.min(1, fraction * 2) * 255)}, ${Math.round(Math.min(1, (1 - fraction) * 2) * 210)}, 0)`;
}

export function gruposMatrizCompactacao(pontos: CompactacaoPonto[], key: "campo" | "fazenda" | "lote") {
  const groups = new Map<string, CompactacaoPonto[]>();
  for (const point of pontos) {
    const name = key === "lote" ? `Talhão ${point.lote ?? "—"}` : point[key] || "Sem campo";
    const items = groups.get(name) ?? []; items.push(point); groups.set(name, items);
  }
  return [...groups].map(([nome, points]) => ({ nome, pontos: points, resumo: resumoCompactacaoMatriz(points) }))
    .sort((a, b) => (b.resumo.total ?? -Infinity) - (a.resumo.total ?? -Infinity) || a.nome.localeCompare(b.nome, "pt-BR"));
}
