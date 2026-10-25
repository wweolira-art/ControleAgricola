export const COMPACTACAO_PROFUNDIDADES = [
  { nome: "0-3cm", inicio: 0, fim: 3 }, { nome: "3-6cm", inicio: 3, fim: 6 },
  { nome: "6-9cm", inicio: 6, fim: 9 }, { nome: "9-12cm", inicio: 9, fim: 12 },
  { nome: "12-15cm", inicio: 12, fim: 15 }, { nome: "15-18cm", inicio: 15, fim: 18 },
  { nome: "18-21cm", inicio: 18, fim: 21 }, { nome: "21-24cm", inicio: 21, fim: 24 },
  { nome: "24-28cm", inicio: 24, fim: 28 },
  // O PBIX chama esta faixa de 27-32cm, mas usa as leituras de 28 a 32cm.
  { nome: "27-32cm", inicio: 28, fim: 32 }, { nome: "32-36cm", inicio: 32, fim: 36 },
  { nome: "36-40cm", inicio: 36, fim: 40 }, { nome: "40-44cm", inicio: 40, fim: 44 },
  { nome: "44-48cm", inicio: 44, fim: 48 }, { nome: "48-52cm", inicio: 48, fim: 52 },
  { nome: "52-60cm", inicio: 52, fim: 60 },
] as const;

export type CompactacaoLeitura = { profundidade: string; ordem: number; kpa: number };
export type CompactacaoPonto = {
  id: string; fazenda: string; campo: string; lote: number | null; dataHora: string;
  latitude: number; longitude: number; altitude: number | null; equipamento: string;
  leituras: CompactacaoLeitura[]; mediaKpa: number; descompactar: number;
};
export type CompactacaoData = {
  geojson?: CompactacaoContornos;
  pontos: CompactacaoPonto[]; fonte: string; consultadoEm: string;
  periodoDisponivel: { inicio: string | null; fim: string | null };
  profundidade: string | null; duplicadosRemovidos: number;
};

export type CompactacaoFeature = {
  type: "Feature"; properties: Record<string, unknown>;
  geometry: { type: "Polygon" | "MultiPolygon"; coordinates: number[][][] | number[][][][] };
};
export type CompactacaoContornos = { type: "FeatureCollection"; features: CompactacaoFeature[] };
const nomeFazenda = (value: unknown) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

function contemPonto(feature: CompactacaoFeature, point: CompactacaoPonto): boolean {
  const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates as number[][][]] : feature.geometry.coordinates as number[][][][];
  const insideRing = (ring: number[][]) => {
    const x = point.longitude, y = point.latitude;
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i], b = ring[j];
      if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
  };
  return polygons.some((rings) => rings.length && insideRing(rings[0]) && !rings.slice(1).some(insideRing));
}

/** Matches source farm names, falling back to point location for renamed farms. */
export function contornosCompactacao(features: CompactacaoFeature[], pontos: CompactacaoPonto[], filtrarTalhao = false): CompactacaoFeature[] {
  const lotes = features.filter((f) => String(f.properties.camada ?? "LOTES").toUpperCase() === "LOTES");
  const farmOf = (f: CompactacaoFeature) => nomeFazenda(f.properties.Fazenda ?? f.properties.fazenda);
  const codeOf = (f: CompactacaoFeature) => String(f.properties.Cod_fazend ?? f.properties.cod_fazend ?? f.properties.cod_fazenda ?? "");
  const activeNames = new Set(pontos.map((p) => nomeFazenda(p.fazenda)));
  const knownNames = new Set(lotes.map(farmOf));
  const activeCodes = new Set(lotes.filter((f) => activeNames.has(farmOf(f))).map(codeOf).filter(Boolean));
  for (const point of pontos) {
    if (knownNames.has(nomeFazenda(point.fazenda))) continue;
    const matching = lotes.find((f) => contemPonto(f, point));
    if (matching) { activeNames.add(farmOf(matching)); if (codeOf(matching)) activeCodes.add(codeOf(matching)); }
  }
  const selectedPlots = new Set(pontos.map((p) => p.lote));
  return lotes.filter((f) => {
    if (!activeNames.has(farmOf(f)) && !activeCodes.has(codeOf(f))) return false;
    if (!filtrarTalhao) return true;
    const plot = f.properties.Lote ?? f.properties.lote ?? f.properties.cod_talhao;
    return (plot != null && selectedPlots.has(Number(plot))) || pontos.some((p) => contemPonto(f, p));
  });
}

function numeric(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function normalizarCompactacao(raw: Record<string, unknown>, profundidade?: string | null): CompactacaoPonto | null {
  const latitude = numeric(raw.latitude), longitude = numeric(raw.longitude);
  if (latitude == null || longitude == null || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  const leituras: CompactacaoLeitura[] = [];
  for (const faixa of COMPACTACAO_PROFUNDIDADES) {
    if (profundidade && faixa.nome !== profundidade) continue;
    const valores = Array.from({ length: faixa.fim - faixa.inicio }, (_, index) => {
      const depth = faixa.inicio + index;
      return numeric(raw[`${depth}-${depth + 1}cm`]);
    });
    // A soma aritmética do Power Query propaga null e o unpivot exclui a faixa.
    if (valores.some((value) => value == null)) continue;
    const kpa = (valores as number[]).reduce((a, b) => a + b, 0) / valores.length;
    leituras.push({ profundidade: faixa.nome, ordem: Number(faixa.nome.split("-")[0]), kpa });
  }
  if (!leituras.length) return null;
  const dataHora = String(raw["dataehora(utc)"] ?? raw.dataehora_utc ?? "");
  return {
    id: String(raw.idunico ?? `${raw.equipamento}:${dataHora}:${latitude}:${longitude}`),
    fazenda: String(raw.fazenda ?? "Sem fazenda"), campo: String(raw.campo ?? ""), lote: numeric(raw.lote),
    dataHora, latitude, longitude, altitude: numeric(raw.altitude), equipamento: String(raw.equipamento ?? ""),
    leituras, mediaKpa: leituras.reduce((sum, row) => sum + row.kpa, 0) / leituras.length,
    // DAX: COUNT(Atributo), Ordem <= 40 && Valor > 2000. Inclui a faixa 40-44cm.
    descompactar: leituras.filter((row) => row.ordem <= 40 && row.kpa > 2000).length,
  };
}

export function mediaCompactacao(pontos: CompactacaoPonto[]): number | null {
  let total = 0, count = 0;
  for (const ponto of pontos) for (const row of ponto.leituras) { total += row.kpa; count++; }
  return count ? total / count : null;
}

/** Escala do gráfico de profundidades do PBIX: 0 / 1250 / 2500 kPa. */
export function corLeituraCompactacao(kpa: number): string {
  const value = Math.max(0, Math.min(2500, kpa));
  const stops = value <= 1250 ? [[0, 179, 51], [1, 167, 10]] : [[1, 167, 10], [181, 1, 1]];
  const ratio = value <= 1250 ? value / 1250 : (value - 1250) / 1250;
  const rgb = stops[0].map((start, index) => Math.round(start + (stops[1][index] - start) * ratio));
  return `rgb(${rgb.join(", ")})`;
}

export function gruposCompactacao(pontos: CompactacaoPonto[], por: "fazenda" | "lote") {
  const groups = new Map<string, CompactacaoPonto[]>();
  for (const ponto of pontos) {
    const key = por === "fazenda" ? ponto.fazenda : `${ponto.fazenda}\u0000${ponto.lote}`;
    const list = groups.get(key) ?? []; list.push(ponto); groups.set(key, list);
  }
  return [...groups.entries()].map(([key, list]) => ({
    key, nome: por === "fazenda" ? list[0].fazenda : `Talhão ${list[0].lote ?? "—"}`,
    fazenda: list[0].fazenda, lote: por === "lote" ? list[0].lote : null,
    pontos: list.length, mediaKpa: mediaCompactacao(list), compactados: list.filter((p) => p.descompactar > 0).length,
  })).sort((a, b) => (b.mediaKpa ?? 0) - (a.mediaKpa ?? 0) || a.nome.localeCompare(b.nome, "pt-BR"));
}
