import { COMPACTACAO_PROFUNDIDADES, normalizarCompactacao, type CompactacaoData, type CompactacaoContornos } from "../../src/lib/compactacaoSolo.js";
import fs from "node:fs";
import { geojsonPath } from "./mapa-fazendas.js";

const DEFAULT_SOURCE = "https://g58645a2c384a96-bd1.adb.sa-saopaulo-1.oraclecloudapps.com/ords/admin/compactacaopenetrometro/";
let cache: { source: string; expires: number; rows: Record<string, unknown>[]; duplicados: number; fetchedAt: string } | null = null;
let pending: Promise<NonNullable<typeof cache>> | null = null;
let generation = 0;

export function invalidarCacheCompactacao() {
  generation++;
  cache = null;
  pending = null;
}

async function fetchRows() {
  const source = process.env.COMPACTACAO_API_URL?.trim() || process.env.ORDS_PENETROMETRO_URL?.trim() || DEFAULT_SOURCE;
  if (cache && cache.source === source && cache.expires > Date.now()) return cache;
  if (pending) return pending;
  const startedGeneration = generation;
  const request = (async () => {
    const rows = new Map<string, Record<string, unknown>>();
    let offset = 0, duplicados = 0;
    for (let page = 0; page < 2000; page++) {
      const url = new URL(source); url.searchParams.set("offset", String(offset)); url.searchParams.set("limit", "100");
      const response = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`A fonte de compactação respondeu HTTP ${response.status}.`);
      const data = await response.json() as { items?: Record<string, unknown>[]; hasMore?: boolean };
      if (!Array.isArray(data.items)) throw new Error("Resposta inválida da fonte de compactação.");
      for (const row of data.items) {
        const id = String(row.idunico ?? `${row.equipamento}:${row["dataehora(utc)"]}:${row.latitude}:${row.longitude}`);
        if (rows.has(id)) duplicados++;
        rows.set(id, row);
      }
      if (!data.items.length || data.hasMore === false || (data.hasMore == null && data.items.length < 100)) {
        const result = { source, expires: Date.now() + 300000, rows: [...rows.values()], duplicados, fetchedAt: new Date().toISOString() };
        if (generation === startedGeneration) cache = result;
        return result;
      }
      offset += data.items.length;
    }
    throw new Error("A fonte ultrapassou o limite de páginas de compactação.");
  })();
  pending = request;
  try { return await request; }
  finally { if (pending === request) pending = null; }
}

export async function carregarCompactacaoSolo(filtros: { dataInicio?: string | null; dataFim?: string | null; profundidade?: string | null }): Promise<CompactacaoData> {
  if (filtros.profundidade && !COMPACTACAO_PROFUNDIDADES.some((d) => d.nome === filtros.profundidade)) throw Object.assign(new Error("Profundidade inválida."), { status: 400 });
  for (const date of [filtros.dataInicio, filtros.dataFim]) if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)))) throw Object.assign(new Error("Data inválida."), { status: 400 });
  if (filtros.dataInicio && filtros.dataFim && filtros.dataInicio > filtros.dataFim) throw Object.assign(new Error("A data inicial deve ser anterior à final."), { status: 400 });
  const result = await fetchRows();
  const dates = result.rows.map((row) => String(row["dataehora(utc)"] ?? row.dataehora_utc ?? "").slice(0, 10)).filter(Boolean).sort();
  const pontos = result.rows.filter((row) => {
    const day = String(row["dataehora(utc)"] ?? row.dataehora_utc ?? "").slice(0, 10);
    return (!filtros.dataInicio || day >= filtros.dataInicio) && (!filtros.dataFim || day <= filtros.dataFim);
  }).map((row) => normalizarCompactacao(row, filtros.profundidade)).filter((row) => row != null);
  const geojson = JSON.parse(fs.readFileSync(geojsonPath(), "utf8")) as CompactacaoContornos;
  return { pontos, geojson, fonte: result.source, consultadoEm: result.fetchedAt, periodoDisponivel: { inicio: dates[0] ?? null, fim: dates.at(-1) ?? null }, profundidade: filtros.profundidade ?? null, duplicadosRemovidos: result.duplicados };
}
