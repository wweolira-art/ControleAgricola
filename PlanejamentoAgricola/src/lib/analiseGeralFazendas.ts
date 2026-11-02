import type { CompactacaoData } from "./compactacaoSolo";
import { percentualTocosDanificados } from "./mapaEntomologia";
import type { AnaliseGeralPeriodos } from "./analiseGeralPeriodos";

export type AnaliseGeralFazenda = {
  id: string; codigo: string | null; fazenda: string;
  compactacaoTotal: number | null; tocosPercentual: number | null; tch: number | null;
};
export type AnaliseGeralFazendasData = {
  fazendas: AnaliseGeralFazenda[]; avisos: string[]; atualizadoEm: string;
  periodos?: AnaliseGeralPeriodos;
};
type Biometria = { fazenda: string; fazendaNome: string | null; talhao: string; areaHa: number | null; tch: number | null };
type Entomologia = { codFazenda: number; tocosAnalisados: number; tocosBrocados: number };
const code = (value: unknown) => /^\d+$/.test(String(value ?? "").trim()) ? String(Number(value)) : String(value ?? "").trim();
const name = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/^(fazenda|faz|fz)\.?\s+/, "").replace(/[^a-z0-9]/g, "");

export function consolidarAnaliseGeralFazendas(input: {
  cadastro: { codigo: string; nome: string }[];
  compactacao: Pick<CompactacaoData, "pontos" | "geojson"> | null;
  entomologia: Entomologia[];
  biometria: Biometria[];
}): AnaliseGeralFazenda[] {
  const farms = new Map<string, AnaliseGeralFazenda>();
  const aliases = new Map<string, Set<string>>();
  const alias = (nome: string, id: string) => {
    const key = name(nome);
    if (!key) return;
    const ids = aliases.get(key) ?? new Set<string>(); ids.add(id); aliases.set(key, ids);
  };
  const farm = (codigo: string | null, nome: string) => {
    const id = codigo ? `codigo:${code(codigo)}` : `nome:${name(nome)}`;
    let row = farms.get(id);
    if (!row) {
      row = { id, codigo: codigo ? code(codigo) : null, fazenda: nome || `Fazenda ${codigo}`, compactacaoTotal: null, tocosPercentual: null, tch: null };
      farms.set(id, row);
    }
    alias(nome, id);
    return row;
  };
  for (const item of input.cadastro) farm(item.codigo, item.nome);
  for (const item of input.biometria) farm(item.fazenda, item.fazendaNome || `Fazenda ${item.fazenda}`);
  for (const feature of input.compactacao?.geojson?.features ?? []) {
    const props = feature.properties;
    const codigo = code(props.Cod_fazend ?? props.cod_fazenda);
    const nome = String(props.Fazenda ?? props.fazenda ?? "");
    if (codigo && codigo !== "0" && nome) farm(codigo, nome);
  }
  const readings = new Map<string, { sum: number; count: number }>();
  for (const point of input.compactacao?.pontos ?? []) {
    if (!point.fazenda.trim()) continue;
    const ids = aliases.get(name(point.fazenda));
    const row = ids?.size === 1 ? farms.get([...ids][0])! : farm(null, point.fazenda);
    const total = readings.get(row.id) ?? { sum: 0, count: 0 };
    for (const reading of point.leituras) if (Number.isFinite(reading.kpa)) { total.sum += reading.kpa; total.count++; }
    readings.set(row.id, total);
  }
  for (const [id, total] of readings) if (total.count) farms.get(id)!.compactacaoTotal = total.sum / total.count;
  const tocos = new Map<string, { analisados: number; danificados: number }>();
  for (const item of input.entomologia) {
    const row = farm(String(item.codFazenda), "");
    const total = tocos.get(row.id) ?? { analisados: 0, danificados: 0 };
    total.analisados += item.tocosAnalisados; total.danificados += item.tocosBrocados; tocos.set(row.id, total);
  }
  for (const [id, total] of tocos) farms.get(id)!.tocosPercentual = percentualTocosDanificados(total.danificados, total.analisados);
  const fields = new Map<string, { farmId: string; sum: number; count: number; area: number | null }>();
  for (const item of input.biometria) {
    if (item.tch == null || !Number.isFinite(item.tch)) continue;
    const row = farm(item.fazenda, item.fazendaNome || "");
    const key = `${row.id}|${item.talhao}`;
    const field = fields.get(key) ?? { farmId: row.id, sum: 0, count: 0, area: null };
    field.sum += item.tch; field.count++;
    if (!(field.area != null && field.area > 0) && item.areaHa != null && item.areaHa > 0) field.area = item.areaHa;
    fields.set(key, field);
  }
  const yields = new Map<string, { weighted: number; area: number; fallback: number[] }>();
  for (const field of fields.values()) {
    const value = field.sum / field.count;
    const total = yields.get(field.farmId) ?? { weighted: 0, area: 0, fallback: [] };
    if (field.area != null && field.area > 0) { total.weighted += value * field.area; total.area += field.area; }
    else total.fallback.push(value);
    yields.set(field.farmId, total);
  }
  for (const [id, total] of yields) farms.get(id)!.tch = total.area > 0 ? total.weighted / total.area : total.fallback.reduce((a, b) => a + b, 0) / total.fallback.length;
  return [...farms.values()].sort((a, b) => a.fazenda.localeCompare(b.fazenda, "pt-BR", { numeric: true }) || a.id.localeCompare(b.id));
}
