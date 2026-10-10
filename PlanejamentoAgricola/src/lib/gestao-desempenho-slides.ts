import type {
  GestaoManutencaoData,
  IndicadoresColheitaProducaoData,
  IndicadoresColheitaQualidadeData,
  IndicadoresProducaoLinha,
} from "../api";
import {
  META_OLEO_HIDRAULICO_LT_TON,
  type ConsumoOleoHidraulicoData,
} from "./consumo-oleo-hidraulico";
import { chartBox, defaultDeckLayout, type ChartBox, type DeckLayout } from "./gestao-desempenho-layout";
import {
  kpisLubrificacao,
  montarMensalLubrificacao,
  type LubrificacaoDashboardData,
} from "./lubrificacao";
import {
  pneusAverage,
  pneusComparativoSemanal,
  pneusCost,
  pneusInPeriod,
  type PneuItem,
  type PneusData,
} from "./pneus";

export const SLIDE_W = 1920;
export const SLIDE_H = 1080;

const NAVY = "#163d63";
const NAVY_DEEP = "#011d42";
const TEXT = "#1b2838";
const MUTED = "#5c6d7e";
const SOFT = "#f4f8fc";
const GRID = "#d7e1eb";
const GREEN = "#8ed18a";
const YELLOW = "#f6e28a";
const RED = "#f3aaaa";
const BLUE = "#2b6cb0";
const GREEN_BAR = "#3aaa55";
const ORANGE = "#e07b2a";
const FONT = "Segoe UI, Arial, sans-serif";
const PIE = ["#2b6cb0", "#38a169", "#d69e2e", "#e24b4b", "#805ad5", "#319795", "#dd6b20", "#718096"];
const MESES = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

type Producao = IndicadoresColheitaProducaoData;
type Grupo = "colhedora" | "trator" | "caminhao";
type HoraRow = {
  data?: string;
  equipTag?: string;
  codEquipamento?: number;
  horasPotenciais: number;
  horasDisponiveis: number;
  horasEfetivas: number;
  horasOutrasAtividades?: number;
  horasManutencao: number;
  horasParada: number;
  horasParadaProgramada?: number;
  horasSemRegistro: number;
  eficiencia: number | null;
};

export type SlideSpec = { title: string; svg: string };

export type GestaoDeckInput = {
  inicio: string;
  fim: string;
  safraInicio: string;
  safraCode: string;
  semana: Producao | null;
  safra: Producao | null;
  horasSemana: Producao | null;
  horasSafra: Producao | null;
  qualidade: IndicadoresColheitaQualidadeData | null;
  colhedoraSemana: GestaoManutencaoData | null;
  colhedoraSafra: GestaoManutencaoData | null;
  tratorSemana: GestaoManutencaoData | null;
  tratorSafra: GestaoManutencaoData | null;
  caminhaoSemana: GestaoManutencaoData | null;
  caminhaoSafra: GestaoManutencaoData | null;
  custoColhedoraSemana: GestaoManutencaoData | null;
  custoColhedoraSafra: GestaoManutencaoData | null;
  custoTratorSemana: GestaoManutencaoData | null;
  custoTratorSafra: GestaoManutencaoData | null;
  oleo: ConsumoOleoHidraulicoData | null;
  lub: LubrificacaoDashboardData | null;
  pneus: PneusData | null;
  capaUrl: string;
  logoUrl: string;
};

type Metrics = {
  label: string;
  equipamentos: number;
  dias: number;
  toneladas: number;
  litros: number;
  hrsMotor: number;
  hrsElevador: number;
  km: number;
  disponibilidade: number | null;
  tonDia: number | null;
  ltHr: number | null;
  ltTon: number | null;
  ltKm: number | null;
  kmLt: number | null;
};

type MetricRow = {
  label: string;
  digits: number;
  suffix?: string;
  higherBetter?: boolean;
  meta?: number | null;
  value: (row: Metrics) => number | null;
};

type BarPart = { label: string; value: number; color: string };
type Column = { label: string; parts: BarPart[] };

const HORA_PARTS: Array<{ key: keyof HoraRow; label: string; color: string }> = [
  { key: "horasEfetivas", label: "Horas efetivas", color: "#2b6cb0" },
  { key: "horasManutencao", label: "Manutenção", color: "#e24b4b" },
  { key: "horasParada", label: "Parada na colheita", color: "#d69e2e" },
  { key: "horasParadaProgramada", label: "Parada programada", color: "#38a169" },
  { key: "horasOutrasAtividades", label: "Horas sem produção", color: "#dd6b20" },
  { key: "horasSemRegistro", label: "Horas sem registro", color: "#8d99a6" },
];

export function safraPeriodo(dataFim: string) {
  const [year, month] = dataFim.split("-").map(Number);
  const startYear = month >= 9 ? year : year - 1;
  const code = `${String(startYear).slice(-2)}/${String(startYear + 1).slice(-2)}`;
  return { inicio: `${startYear}-09-01`, fim: dataFim, code };
}

export function nomeArquivoGestao(inicio: string, fim: string) {
  const dot = (iso: string) => {
    const [, month, day] = iso.split("-");
    return `${day}.${month}`;
  };
  return `Gestão de desempenho - ${dot(inicio)} a ${dot(fim)}.${fim.slice(0, 4)}.pptx`;
}

function r(value: number) {
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : 0;
}

function esc(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmt(value: number | null | undefined, digits = 2) {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function fmt0(value: number | null | undefined) {
  return fmt(value, 0);
}

function fmtPct(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? "—" : `${fmt(value, 2)}%`;
}

function fmtMetric(value: number | null | undefined, digits: number, suffix = "") {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${fmt(value, digits)}${suffix}`;
}

function fmtMoney(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function fmtHm(hours: number | null | undefined) {
  if (hours == null || !Number.isFinite(hours)) return "—";
  const total = Math.round(Math.abs(hours) * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

function fmtDate(iso: string) {
  const [year, month, day] = iso.split("-");
  return year && month && day ? `${day}/${month}/${year}` : iso;
}

function fmtDay(iso: string) {
  const [, month, day] = iso.split("-");
  return day && month ? `${day}/${month}` : iso;
}

function semanaTitulo(inicio: string, fim: string) {
  return `SEMANA ${fmtDay(inicio)} A ${fmtDate(fim)}`;
}

function clip(value: string, max: number) {
  const text = value.trim();
  return text.length > max ? `${text.slice(0, Math.max(1, max - 1))}…` : text;
}

function text(
  x: number,
  y: number,
  value: string,
  opts?: { size?: number; weight?: number; fill?: string; anchor?: "start" | "middle" | "end" },
) {
  const size = opts?.size ?? 16;
  const weight = opts?.weight ?? 600;
  const fill = opts?.fill ?? TEXT;
  const anchor = opts?.anchor ? ` text-anchor="${opts.anchor}"` : "";
  return `<text x="${r(x)}" y="${r(y)}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${fill}"${anchor}>${esc(value)}</text>`;
}

function frame(line1: string, line2: string, body: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SLIDE_W}" height="${SLIDE_H}" viewBox="0 0 ${SLIDE_W} ${SLIDE_H}">
  <rect width="${SLIDE_W}" height="${SLIDE_H}" fill="#ffffff"/>
  <rect width="${SLIDE_W}" height="118" fill="${NAVY}"/>
  ${text(40, 50, line1, { size: 26, weight: 600, fill: "#ffffff" })}
  ${text(40, 96, line2, { size: 36, weight: 800, fill: "#ffffff" })}
  ${body}
</svg>`;
}

function slide(line1: string, line2: string, body: string): SlideSpec {
  return { title: line2, svg: frame(line1, line2, body) };
}

function clipBox(box: ChartBox, inner: string) {
  return `<svg x="${r(box.x)}" y="${r(box.y)}" width="${r(Math.max(box.w, 1))}" height="${r(Math.max(box.h, 1))}" overflow="hidden">${inner}</svg>`;
}

function drawIn(
  layout: DeckLayout,
  slideId: string,
  chartId: string,
  render: (width: number, height: number) => string,
  opts?: { top?: number; bottom?: number },
) {
  const box = chartBox(layout, slideId, chartId, opts);
  return clipBox(box, render(box.w, box.h));
}

function fitBlock(layout: DeckLayout, slideId: string, chartId: string, inner: string) {
  const box = chartBox(layout, slideId, chartId);
  const origin = { x: 40, y: 140, w: 1840, h: 900 };
  const sx = box.w / origin.w;
  const sy = box.h / origin.h;
  const same =
    Math.abs(sx - 1) < 0.02 &&
    Math.abs(sy - 1) < 0.02 &&
    Math.abs(box.x - origin.x) < 2 &&
    Math.abs(box.y - origin.y) < 2;
  if (same) return inner;
  return `<g transform="translate(${r(box.x)},${r(box.y)}) scale(${r(sx)},${r(sy)}) translate(${r(-origin.x)},${r(-origin.y)})">${inner}</g>`;
}

function emptySlide(line1: string, line2: string, message = "Sem dados no período.") {
  return slide(line1, line2, text(72, 280, message, { size: 30, weight: 700 }));
}

function kpi(x: number, y: number, w: number, h: number, value: string, label: string, valueSize = 28) {
  return `<rect x="${r(x)}" y="${r(y)}" width="${r(w)}" height="${r(h)}" rx="8" fill="${NAVY}"/>
    ${text(x + w / 2, y + h * 0.46, value, { size: valueSize, weight: 800, fill: "#ffffff", anchor: "middle" })}
    ${text(x + w / 2, y + h * 0.78, clip(label, 28), { size: 14, weight: 600, fill: "#d6e4f0", anchor: "middle" })}`;
}

function panel(x: number, y: number, w: number, h: number) {
  return `<rect x="${r(x)}" y="${r(y)}" width="${r(w)}" height="${r(h)}" rx="12" fill="#ffffff" stroke="${GRID}"/>`;
}

function tone(value: number | null, meta: number | null | undefined, higherBetter = true) {
  if (value == null || meta == null || !Number.isFinite(meta) || meta === 0) return "#ffffff";
  const ratio = higherBetter ? value / meta : meta / Math.max(value, 0.0001);
  if (ratio >= 0.98) return GREEN;
  if (ratio >= 0.85) return YELLOW;
  return RED;
}

function frenteCodigo(label: string | undefined, key: string) {
  const source = label && label !== "Sem frente" ? label : key;
  const match = source.match(/\d{3,5}/);
  return match?.[0] ?? source;
}

function blankMetrics(label: string): Metrics {
  return {
    label,
    equipamentos: 0,
    dias: 0,
    toneladas: 0,
    litros: 0,
    hrsMotor: 0,
    hrsElevador: 0,
    km: 0,
    disponibilidade: null,
    tonDia: null,
    ltHr: null,
    ltTon: null,
    ltKm: null,
    kmLt: null,
  };
}

function finalizeMetrics(row: Metrics & { pot: number; ofi: number; dispSum: number; dispN: number }, diasPeriodo: number) {
  const dias = row.dias > 0 ? row.dias : row.toneladas > 0 ? diasPeriodo : 0;
  row.dias = dias;
  row.disponibilidade = row.pot > 0 ? ((row.pot - row.ofi) / row.pot) * 100 : row.dispN > 0 ? row.dispSum / row.dispN : null;
  row.tonDia = row.equipamentos > 0 && dias > 0 ? row.toneladas / dias / row.equipamentos : null;
  row.ltHr = row.hrsMotor > 0 ? row.litros / row.hrsMotor : null;
  row.ltTon = row.toneladas > 0 ? row.litros / row.toneladas : null;
  row.ltKm = row.km > 0 ? row.litros / row.km : null;
  row.kmLt = row.litros > 0 ? row.km / row.litros : null;
  return row;
}

function buildMetrics(data: Producao | null, grupo: Grupo) {
  const linhas = data?.tabelas?.[grupo]?.linhas ?? [];
  if (!linhas.length) return null;
  const diasPeriodo = Math.max(1, data?.filtros?.dias || data?.filtros?.diasColheitaColhedora || 1);
  const groups = new Map<string, Metrics & { pot: number; ofi: number; dispSum: number; dispN: number }>();
  const keyOf = new Map<number, string>();
  for (const row of linhas) {
    const grouped = Boolean(row.frenteKey && row.frenteKey !== "sem-frente");
    const key = grouped ? row.frenteKey! : row.equipTag;
    const label = grouped ? frenteCodigo(row.frenteLabel, row.frenteKey!) : row.equipTag;
    keyOf.set(row.codEquipamento, key);
    const acc =
      groups.get(key) ??
      ({
        ...blankMetrics(label),
        pot: 0,
        ofi: 0,
        dispSum: 0,
        dispN: 0,
      } as Metrics & { pot: number; ofi: number; dispSum: number; dispN: number });
    acc.equipamentos += 1;
    acc.toneladas += row.toneladaColhida || 0;
    acc.litros += row.litrosCombustivel || 0;
    acc.hrsMotor += row.hrsMotor || 0;
    acc.hrsElevador += row.hrsElevador || 0;
    acc.km += row.kmRodados || 0;
    acc.pot += row.horasPotenciais || 0;
    acc.ofi += row.horasOficina || 0;
    if (row.disponibilidadePct != null && Number.isFinite(row.disponibilidadePct)) {
      acc.dispSum += row.disponibilidadePct;
      acc.dispN += 1;
    }
    groups.set(key, acc);
  }
  const diasPorGrupo = new Map<string, Set<string>>();
  for (const day of data?.producaoDiariaPorEquipamento ?? []) {
    if (!(day.toneladaColhida > 0)) continue;
    const key = keyOf.get(day.codEquipamento);
    if (!key) continue;
    const set = diasPorGrupo.get(key) ?? new Set<string>();
    set.add(day.data.slice(0, 10));
    diasPorGrupo.set(key, set);
  }
  const frentes = [...groups.entries()]
    .map(([key, row]) => {
      row.dias = diasPorGrupo.get(key)?.size ?? 0;
      return finalizeMetrics(row, diasPeriodo);
    })
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { numeric: true }));
  const totalAcc = {
    ...blankMetrics("Total"),
    pot: 0,
    ofi: 0,
    dispSum: 0,
    dispN: 0,
  } as Metrics & { pot: number; ofi: number; dispSum: number; dispN: number };
  for (const row of linhas) {
    totalAcc.equipamentos += 1;
    totalAcc.toneladas += row.toneladaColhida || 0;
    totalAcc.litros += row.litrosCombustivel || 0;
    totalAcc.hrsMotor += row.hrsMotor || 0;
    totalAcc.hrsElevador += row.hrsElevador || 0;
    totalAcc.km += row.kmRodados || 0;
    totalAcc.pot += row.horasPotenciais || 0;
    totalAcc.ofi += row.horasOficina || 0;
    if (row.disponibilidadePct != null && Number.isFinite(row.disponibilidadePct)) {
      totalAcc.dispSum += row.disponibilidadePct;
      totalAcc.dispN += 1;
    }
  }
  const diasTotal = new Set(
    (data?.producaoDiariaPorEquipamento ?? []).filter((day) => day.toneladaColhida > 0).map((day) => day.data.slice(0, 10)),
  );
  totalAcc.dias = diasTotal.size;
  const total = finalizeMetrics(totalAcc, diasPeriodo);
  const machineDays = frentes.reduce((sum, row) => sum + row.dias * Math.max(row.equipamentos, 1), 0);
  if (machineDays > 0) total.tonDia = total.toneladas / machineDays;
  return { frentes, total };
}

function media(frentes: Metrics[], read: (row: Metrics) => number | null) {
  const values = frentes.map(read).filter((value): value is number => value != null && Number.isFinite(value));
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function splitLabel(label: string, max = 38): [string, string | null] {
  if (label.length <= max) return [label, null];
  const cut = label.lastIndexOf(" ", max);
  const index = cut > 12 ? cut : max;
  return [label.slice(0, index), label.slice(index).trim()];
}

function indicatorTable(
  x: number,
  y: number,
  w: number,
  rows: MetricRow[],
  frentes: Metrics[],
  total: Metrics,
) {
  const shown = frentes.slice(0, 8);
  const headers = ["Indicadores", ...shown.map((row) => row.label), "Total", "META", "Média", "% Meta"];
  const labelW = Math.min(390, w * 0.34);
  const colW = (w - labelW) / Math.max(headers.length - 1, 1);
  const rowH = 44;
  const head = headers
    .map((header, index) => {
      const cx = index === 0 ? x : x + labelW + (index - 1) * colW;
      const cw = index === 0 ? labelW : colW;
      return `<rect x="${r(cx)}" y="${r(y)}" width="${r(cw)}" height="${rowH}" fill="${NAVY}"/>
        ${text(cx + cw / 2, y + 28, clip(header, 12), { size: 14, weight: 800, fill: "#ffffff", anchor: "middle" })}`;
    })
    .join("");
  const body = rows
    .map((metric, rowIndex) => {
      const yy = y + rowH * (rowIndex + 1);
      const totalValue = metric.value(total);
      const avg = media(shown, metric.value);
      const pct = metric.meta != null && metric.meta !== 0 && totalValue != null ? (totalValue / metric.meta) * 100 : null;
      const cells = [
        metric.label,
        ...shown.map((frente) => fmtMetric(metric.value(frente), metric.digits, metric.suffix)),
        fmtMetric(totalValue, metric.digits, metric.suffix),
        fmtMetric(metric.meta, metric.digits, metric.suffix),
        fmtMetric(avg, metric.digits, metric.suffix),
        pct == null ? "—" : `${fmt(pct, 1)}%`,
      ];
      const fills = [
        SOFT,
        ...shown.map((frente) => tone(metric.value(frente), metric.meta, metric.higherBetter !== false)),
        NAVY,
        "#e7eef6",
        tone(avg, metric.meta, metric.higherBetter !== false),
        tone(pct, 100, true),
      ];
      return cells
        .map((cell, index) => {
          const cx = index === 0 ? x : x + labelW + (index - 1) * colW;
          const cw = index === 0 ? labelW : colW;
          const fill = fills[index] ?? "#ffffff";
          const color = fill === NAVY ? "#ffffff" : TEXT;
          const [line1, line2] = index === 0 ? splitLabel(String(cell)) : [String(cell), null];
          const content = line2
            ? `<text x="${r(cx + 10)}" y="${r(yy + 18)}" font-family="${FONT}" font-size="13" font-weight="700" fill="${color}">${esc(line1)}</text>
               <text x="${r(cx + 10)}" y="${r(yy + 34)}" font-family="${FONT}" font-size="13" font-weight="700" fill="${color}">${esc(line2)}</text>`
            : text(index === 0 ? cx + 10 : cx + cw / 2, yy + 28, clip(line1, index === 0 ? 42 : 10), {
                size: 14,
                weight: 700,
                fill: color,
                anchor: index === 0 ? "start" : "middle",
              });
          return `<rect x="${r(cx)}" y="${r(yy)}" width="${r(cw)}" height="${rowH}" fill="${fill}" stroke="${GRID}"/>${content}`;
        })
        .join("");
    })
    .join("");
  return head + body;
}

function lineSeries(
  x: number,
  y: number,
  w: number,
  h: number,
  title: string,
  points: Array<{ label: string; value: number }>,
) {
  const clean = points.filter((point) => Number.isFinite(point.value));
  if (!clean.length) return text(x, y + 40, "Sem série no período.", { size: 18, weight: 700 });
  const max = Math.max(...clean.map((point) => point.value), 1) * 1.15;
  const plotY = y + 36;
  const plotH = h - 78;
  const step = clean.length > 1 ? w / (clean.length - 1) : w;
  const coords = clean.map((point, index) => ({
    x: x + index * step,
    y: plotY + plotH - (point.value / max) * plotH,
    point,
  }));
  const avg = clean.reduce((sum, point) => sum + point.value, 0) / clean.length;
  const avgY = plotY + plotH - (avg / max) * plotH;
  const stepLabel = Math.max(1, Math.ceil(clean.length / 6));
  const labels = coords
    .filter((_, index) => index % stepLabel === 0 || index === coords.length - 1)
    .map((point) => text(point.x, plotY + plotH + 28, point.point.label, { size: 13, weight: 600, anchor: "middle" }))
    .join("");
  const dots =
    clean.length > 40
      ? ""
      : coords.map((point) => `<circle cx="${r(point.x)}" cy="${r(point.y)}" r="4" fill="${BLUE}"/>`).join("");
  return `${text(x, y, title, { size: 18, weight: 800 })}
    <line x1="${r(x)}" y1="${r(plotY + plotH)}" x2="${r(x + w)}" y2="${r(plotY + plotH)}" stroke="${GRID}"/>
    <polyline points="${coords.map((point) => `${r(point.x)},${r(point.y)}`).join(" ")}" fill="none" stroke="${BLUE}" stroke-width="3"/>
    <line x1="${r(x)}" y1="${r(avgY)}" x2="${r(x + w)}" y2="${r(avgY)}" stroke="${ORANGE}" stroke-width="2" stroke-dasharray="6 4"/>
    ${text(x + w, avgY - 8, `Média ${fmt0(avg)}`, { size: 13, weight: 700, fill: ORANGE, anchor: "end" })}
    ${dots}${labels}`;
}

function columnsChart(x: number, y: number, w: number, h: number, items: Array<{ label: string; value: number | null; color?: string }>, opts?: { max?: number; meta?: number | null; suffix?: string }) {
  const clean = items.filter((item) => item.value != null && Number.isFinite(item.value));
  if (!clean.length) return text(x, y + 36, "Sem dados no período.", { size: 18, weight: 700 });
  const max = opts?.max ?? Math.max(...clean.map((item) => Number(item.value)), opts?.meta ?? 0, 1);
  const plotY = y + 8;
  const plotH = h - 64;
  const gap = 18;
  const bw = Math.max(8, Math.min(110, (w - gap * clean.length) / clean.length));
  const used = clean.length * bw + Math.max(0, clean.length - 1) * gap;
  const origin = x + Math.max(0, (w - used) / 2);
  const metaY = opts?.meta != null ? plotY + plotH - (opts.meta / max) * plotH : null;
  const bars = clean
    .map((item, index) => {
      const value = Number(item.value);
      const bh = Math.max(2, (value / max) * plotH);
      const bx = origin + index * (bw + gap);
      const by = plotY + plotH - bh;
      return `<rect x="${r(bx)}" y="${r(by)}" width="${r(bw)}" height="${r(bh)}" fill="${item.color ?? BLUE}"/>
        ${text(bx + bw / 2, by - 8, `${fmt(value, value >= 100 ? 0 : 1)}${opts?.suffix ?? ""}`, { size: 12, weight: 700, anchor: "middle" })}
        ${text(bx + bw / 2, plotY + plotH + 22, clip(item.label, 8), { size: 13, weight: 700, anchor: "middle" })}`;
    })
    .join("");
  const meta =
    metaY == null
      ? ""
      : `<line x1="${r(x)}" y1="${r(metaY)}" x2="${r(x + w)}" y2="${r(metaY)}" stroke="${ORANGE}" stroke-width="2"/>
         ${text(x + w, metaY - 6, `Meta ${fmt(opts?.meta, 0)}${opts?.suffix ?? ""}`, { size: 13, weight: 700, fill: ORANGE, anchor: "end" })}`;
  return bars + meta;
}

function stackedColumns(x: number, y: number, w: number, h: number, columns: Column[]) {
  if (!columns.length) return text(x, y + 30, "Sem dados no período.", { size: 18, weight: 700 });
  const totals = columns.map((column) => column.parts.reduce((sum, part) => sum + Math.max(0, part.value), 0));
  const max = Math.max(...totals, 1);
  const plotY = y;
  const plotH = h - 42;
  const gap = columns.length > 10 ? 6 : 16;
  const bw = Math.max(8, Math.min(64, (w - gap * columns.length) / columns.length));
  const used = columns.length * bw + Math.max(0, columns.length - 1) * gap;
  const origin = x + Math.max(0, (w - used) / 2);
  return columns
    .map((column, index) => {
      let cursor = plotY + plotH;
      const bx = origin + index * (bw + gap);
      const segs = column.parts
        .filter((part) => part.value > 0)
        .map((part) => {
          const bh = (part.value / max) * plotH;
          cursor -= bh;
          const label = bh >= 18 ? text(bx + bw / 2, cursor + bh / 2 + 4, fmt(part.value, part.value >= 100 ? 0 : 0), { size: 11, weight: 800, fill: "#ffffff", anchor: "middle" }) : "";
          return `<rect x="${r(bx)}" y="${r(cursor)}" width="${r(bw)}" height="${r(Math.max(bh, 0))}" fill="${part.color}"/>${label}`;
        })
        .join("");
      return `${segs}${text(bx + bw / 2, plotY + plotH + 20, clip(column.label, 10), { size: 12, weight: 700, anchor: "middle" })}`;
    })
    .join("");
}

function hBars(x: number, y: number, w: number, h: number, items: Array<{ label: string; value: number; color?: string }>, format: (value: number) => string) {
  const clean = items.filter((item) => item.value > 0).slice(0, 6);
  if (!clean.length) return text(x, y + 24, "Sem dados no período.", { size: 16, weight: 700 });
  const max = Math.max(...clean.map((item) => item.value), 1);
  const rowH = Math.min(36, (h - 8) / clean.length);
  return clean
    .map((item, index) => {
      const yy = y + index * (rowH + 8);
      const bw = Math.max(4, (item.value / max) * (w - 250));
      return `${text(x, yy + rowH * 0.72, clip(item.label, 18), { size: 14, weight: 700 })}
        <rect x="${r(x + 160)}" y="${r(yy)}" width="${r(bw)}" height="${r(rowH)}" fill="${item.color ?? BLUE}"/>
        ${text(x + 168 + bw, yy + rowH * 0.72, format(item.value), { size: 13, weight: 700 })}`;
    })
    .join("");
}

function legend(x: number, y: number, items: Array<{ color: string; label: string }>) {
  let cursor = x;
  return items
    .map((item) => {
      const chunk = `<rect x="${r(cursor)}" y="${r(y - 12)}" width="14" height="14" rx="2" fill="${item.color}"/>${text(cursor + 20, y, item.label, { size: 13, weight: 650 })}`;
      cursor += 28 + item.label.length * 7.4;
      return chunk;
    })
    .join("");
}

function pie(cx: number, cy: number, radius: number, rows: Array<{ label: string; value: number }>, legendX: number, legendY: number) {
  const clean = rows.filter((row) => row.value > 0);
  const total = clean.reduce((sum, row) => sum + row.value, 0);
  if (!total) return text(cx - radius, cy, "Sem dados.", { size: 16, weight: 700 });
  let start = -90;
  const slices = clean
    .map((row, index) => {
      const pct = row.value / total;
      const end = start + pct * 360;
      const color = PIE[index % PIE.length]!;
      if (pct >= 0.999) {
        start = end;
        return `<circle cx="${r(cx)}" cy="${r(cy)}" r="${r(radius)}" fill="${color}"/>`;
      }
      if (end - start < 0.8) {
        start = end;
        return "";
      }
      const large = end - start > 180 ? 1 : 0;
      const a0 = (Math.PI / 180) * start;
      const a1 = (Math.PI / 180) * end;
      const x0 = cx + radius * Math.cos(a0);
      const y0 = cy + radius * Math.sin(a0);
      const x1 = cx + radius * Math.cos(a1);
      const y1 = cy + radius * Math.sin(a1);
      start = end;
      return `<path d="M ${r(cx)} ${r(cy)} L ${r(x0)} ${r(y0)} A ${r(radius)} ${r(radius)} 0 ${large} 1 ${r(x1)} ${r(y1)} Z" fill="${color}"/>`;
    })
    .join("");
  const labels = clean
    .map((row, index) => {
      const pct = (row.value / total) * 100;
      return `<rect x="${r(legendX)}" y="${r(legendY + index * 28)}" width="14" height="14" rx="7" fill="${PIE[index % PIE.length]}"/>
        ${text(legendX + 22, legendY + 12 + index * 28, `${clip(row.label, 22)} ${fmt(pct, 0)}%`, { size: 14, weight: 650 })}`;
    })
    .join("");
  return `${slices}<circle cx="${r(cx)}" cy="${r(cy)}" r="${r(radius * 0.58)}" fill="#ffffff"/>${labels}`;
}

function blankHora(): HoraRow {
  return {
    horasPotenciais: 0,
    horasDisponiveis: 0,
    horasEfetivas: 0,
    horasOutrasAtividades: 0,
    horasManutencao: 0,
    horasParada: 0,
    horasParadaProgramada: 0,
    horasSemRegistro: 0,
    eficiencia: null,
  };
}

function addHora(acc: HoraRow, row: HoraRow) {
  acc.horasPotenciais += row.horasPotenciais || 0;
  acc.horasDisponiveis += row.horasDisponiveis || 0;
  acc.horasEfetivas += row.horasEfetivas || 0;
  acc.horasOutrasAtividades = (acc.horasOutrasAtividades || 0) + (row.horasOutrasAtividades || 0);
  acc.horasManutencao += row.horasManutencao || 0;
  acc.horasParada += row.horasParada || 0;
  acc.horasParadaProgramada = (acc.horasParadaProgramada || 0) + (row.horasParadaProgramada || 0);
  acc.horasSemRegistro += row.horasSemRegistro || 0;
  acc.eficiencia = acc.horasDisponiveis > 0 ? (acc.horasEfetivas / acc.horasDisponiveis) * 100 : null;
  return acc;
}

function horaParts(row: HoraRow): BarPart[] {
  return HORA_PARTS.map((part) => ({ label: part.label, color: part.color, value: Number(row[part.key] ?? 0) }));
}

function weekStart(iso: string) {
  const date = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date.toISOString().slice(0, 10);
}

function groupDias(rows: HoraRow[], keyOf: (iso: string) => string, labelOf: (key: string) => string) {
  const map = new Map<string, HoraRow>();
  for (const row of rows) {
    const iso = row.data?.slice(0, 10);
    if (!iso) continue;
    const key = keyOf(iso);
    const acc = map.get(key) ?? blankHora();
    addHora(acc, row);
    acc.data = labelOf(key);
    map.set(key, acc);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, row]) => row);
}

function diaRows(data: Producao | null, grupo: "colhedora" | "trator") {
  if (!data) return [] as HoraRow[];
  return (grupo === "trator" ? data.horasOperacaoDiariaTrator : data.horasOperacaoDiaria) ?? [];
}

function equipRows(data: Producao | null, grupo: "colhedora" | "trator") {
  if (!data) return [] as HoraRow[];
  return (grupo === "trator" ? data.horasOperacaoPorEquipamentoTrator : data.horasOperacaoPorEquipamento) ?? [];
}

function sumRows(rows: HoraRow[]) {
  return rows.reduce((acc, row) => addHora(acc, row), blankHora());
}

function mesCurto(key: string) {
  const month = Number(key.slice(5, 7));
  return month >= 1 && month <= 12 ? MESES[month - 1]! : key;
}

function dispMeta(data: GestaoManutencaoData | null) {
  return data?.meta?.disponibilidade ?? 85;
}

function rowsProdutividade(grupo: Grupo, disp: number): MetricRow[] {
  if (grupo === "colhedora") {
    return [
      { label: "Dias de colheita", digits: 0, value: (row) => row.dias },
      { label: "% de Disponibilidade de Colhedoras", digits: 2, suffix: "%", higherBetter: true, meta: disp, value: (row) => row.disponibilidade },
      { label: "Horas de elevador", digits: 1, value: (row) => row.hrsElevador },
      { label: "Produção total de colheita", digits: 0, value: (row) => row.toneladas },
      { label: "Produção tonelada por colhedora dia", digits: 1, value: (row) => row.tonDia },
      { label: "Consumo de diesel por hora (colhedora)", digits: 2, value: (row) => row.ltHr },
      { label: "Consumo de diesel por tonelada (colhedora)", digits: 2, value: (row) => row.ltTon },
    ];
  }
  if (grupo === "trator") {
    return [
      { label: "% de Disponibilidade de Trator Transbordo", digits: 2, suffix: "%", higherBetter: true, meta: disp, value: (row) => row.disponibilidade },
      { label: "Horas do motor", digits: 1, value: (row) => row.hrsMotor },
      { label: "Produção tonelada por trator dia", digits: 1, value: (row) => row.tonDia },
      { label: "Consumo de diesel por hora (trator)", digits: 2, value: (row) => row.ltHr },
      { label: "Consumo de diesel por tonelada (trator)", digits: 2, value: (row) => row.ltTon },
    ];
  }
  return [
    { label: "% de Disponibilidade de Caminhão", digits: 2, suffix: "%", higherBetter: true, meta: disp, value: (row) => row.disponibilidade },
    { label: "Produção tonelada por caminhão dia", digits: 1, value: (row) => row.tonDia },
    { label: "Consumo de diesel por quilômetro", digits: 2, value: (row) => row.ltKm },
    { label: "Eficiência de consumo por quilômetro", digits: 2, higherBetter: true, value: (row) => row.kmLt },
  ];
}

function slideCapa(input: GestaoDeckInput): SlideSpec {
  const photo = input.capaUrl
    ? `<image href="${input.capaUrl}" x="960" y="0" width="960" height="1080" preserveAspectRatio="xMidYMid slice"/>`
    : `<rect x="960" y="0" width="960" height="1080" fill="#12324f"/>`;
  const logo = input.logoUrl
    ? `<image href="${input.logoUrl}" x="78" y="56" width="168" height="160" preserveAspectRatio="xMidYMid meet"/>`
    : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SLIDE_W}" height="${SLIDE_H}" viewBox="0 0 ${SLIDE_W} ${SLIDE_H}">
    <rect width="${SLIDE_W}" height="${SLIDE_H}" fill="${NAVY_DEEP}"/>
    ${photo}
    <rect width="980" height="${SLIDE_H}" fill="${NAVY_DEEP}"/>
    ${logo}
    ${text(80, 310, `SAFRA ${input.safraCode}`, { size: 28, weight: 700, fill: "#9ec9ef" })}
    ${text(80, 390, "Gestão de Desempenho", { size: 58, weight: 800, fill: "#ffffff" })}
    ${text(80, 460, "Manutenção Automotiva", { size: 58, weight: 800, fill: "#ffffff" })}
    ${text(80, 530, "Relatório semanal", { size: 30, weight: 600, fill: "#d5e6f5" })}
    ${text(80, 600, `Semana: ${fmtDate(input.inicio)} a ${fmtDate(input.fim)}`, { size: 28, weight: 700, fill: "#ffffff" })}
    <polygon points="0,900 260,1080 0,1080" fill="#1d4f86"/>
    <polygon points="0,980 140,1080 0,1080" fill="#2f6fed"/>
  </svg>`;
  return { title: "Capa", svg };
}

function slideAgenda(input: GestaoDeckInput): SlideSpec {
  const blocks = [
    {
      title: "Indicadores CCT",
      items: [
        "Indicadores de produtividade e eficiência",
        "Colhido/Equipamento/dia",
        "Horas trabalhadas x horas disponíveis",
        "Disponibilidade mecânica",
        "Perdas visíveis",
        "Índice de impureza vegetal",
      ],
    },
    {
      title: "Indicadores de Consumo",
      items: ["Litros por hora (L/h)", "Litros por tonelada (L/t)", "Consumo de óleo hidráulico"],
    },
    {
      title: "Indicadores de Manutenção",
      items: [
        "Disponibilidade e confiabilidade",
        "MTBF e MTTR",
        "Tipo de manutenção: corretiva e preventiva",
        "Custo preventivo e corretivo",
        "Custo de pneu por hora",
        "Motivos de perdas",
        "Recapagem x pneu novo",
      ],
    },
  ];
  let y = 170;
  const body = blocks
    .map((block) => {
      const header = text(80, y, block.title, { size: 28, weight: 800, fill: NAVY });
      const items = block.items
        .map((item, index) => text(100, y + 42 + index * 32, `•  ${item}`, { size: 22, weight: 600 }))
        .join("");
      const chunk = header + items;
      y += 56 + block.items.length * 32;
      return chunk;
    })
    .join("");
  return slide("INDICADORES OPERACIONAIS", `Safra ${input.safraCode}`, body);
}

function slideProdutividade(input: GestaoDeckInput, grupo: Grupo, titulo: string, disp: number, slideId: string, layout: DeckLayout): SlideSpec {
  const line1 = "Indicadores de produtividade e eficiência";
  const semana = buildMetrics(input.semana, grupo);
  const safra = buildMetrics(input.safra, grupo);
  if (!semana && !safra) return emptySlide(line1, titulo);
  const rows = rowsProdutividade(grupo, disp);
  const tabela = (chartId: string, metrics: ReturnType<typeof buildMetrics>, title: string) =>
    drawIn(layout, slideId, chartId, (width) => {
      if (!metrics) return text(16, 42, `${title}: sem dados.`, { size: 22, weight: 700 });
      return `${text(width / 2, 28, title, { size: 22, weight: 800, anchor: "middle" })}
        ${indicatorTable(8, 40, Math.max(width - 16, 200), rows, metrics.frentes, metrics.total)}`;
    });
  const grafico = (chartId: string, data: Producao | null) => {
    if (grupo !== "colhedora") return "";
    const points = (data?.desempenhoDiario ?? []).map((row) => ({ label: fmtDay(row.data), value: row.toneladas ?? 0 }));
    return drawIn(layout, slideId, chartId, (width, height) => lineSeries(8, 8, Math.max(width - 16, 80), Math.max(height - 16, 80), "Rendimento produtivo / tonelada", points));
  };
  const body = `${tabela("tabela-semana", semana, semanaTitulo(input.inicio, input.fim))}
    ${grafico("grafico-semana", input.semana)}
    ${tabela("tabela-safra", safra, `ACUMULADO SAFRA ${input.safraCode}`)}
    ${grafico("grafico-safra", input.safra)}`;
  return slide(line1, titulo, body);
}

function slideHoras(input: GestaoDeckInput, grupo: "colhedora" | "trator", titulo: string, slideId: string, layout: DeckLayout): SlideSpec {
  const line1 = "Produtividade e eficiência";
  const semanaEquip = equipRows(input.horasSemana, grupo);
  const safraDias = diaRows(input.horasSafra ?? input.horasSemana, grupo);
  if (!semanaEquip.length && !safraDias.length) return emptySlide(line1, titulo);
  const totais = sumRows(semanaEquip.length ? semanaEquip : safraDias);
  const diasBase = grupo === "colhedora" ? input.horasSemana?.filtros?.diasColheitaColhedora : input.horasSemana?.filtros?.dias;
  const dias = diasBase || safraDias.filter((row) => row.horasEfetivas > 0).length || input.semana?.filtros?.dias || 0;
  const meses = groupDias(safraDias, (iso) => iso.slice(0, 7), mesCurto).slice(-6);
  const semanas = groupDias(safraDias, weekStart, (key) => fmtDay(key)).slice(-8);
  const porEquip = [...semanaEquip].sort((a, b) => b.horasEfetivas - a.horasEfetivas).slice(0, 8);
  const frenteOf = new Map<number, string>();
  for (const row of input.semana?.tabelas?.[grupo]?.linhas ?? []) {
    if (row.codEquipamento) frenteOf.set(row.codEquipamento, frenteCodigo(row.frenteLabel, row.frenteKey || row.equipTag));
  }
  const frenteMap = new Map<string, HoraRow>();
  for (const row of semanaEquip) {
    const label = (row.codEquipamento != null && frenteOf.get(row.codEquipamento)) || row.equipTag || "—";
    const acc = frenteMap.get(label) ?? blankHora();
    addHora(acc, row);
    acc.equipTag = label;
    frenteMap.set(label, acc);
  }
  const frentes = [...frenteMap.values()].sort((a, b) => (a.equipTag || "").localeCompare(b.equipTag || "", "pt-BR", { numeric: true }));
  const horasArea = { top: 250, bottom: 48 };
  const coluna = (chartId: string, title: string, columns: Column[]) =>
    drawIn(
      layout,
      slideId,
      chartId,
      (width, height) => `${text(8, 22, title, { size: 18, weight: 800 })}${stackedColumns(8, 34, Math.max(width - 16, 40), Math.max(height - 42, 40), columns)}`,
      horasArea,
    );
  const body = `${kpi(40, 142, 220, 92, fmt0(totais.horasDisponiveis), "Horas disponíveis", 30)}
    ${kpi(276, 142, 220, 92, fmt0(totais.horasEfetivas), "Horas trabalhadas", 30)}
    ${kpi(512, 142, 220, 92, fmtPct(totais.eficiencia), "Eficiência operacional", 30)}
    ${kpi(748, 142, 180, 92, fmt0(dias), grupo === "colhedora" ? "Dias de colheita" : "Dias", 30)}
    ${coluna("meses", "Meses da safra", meses.map((row) => ({ label: row.data || "", parts: horaParts(row) })))}
    ${coluna("semanas", "Semanas", semanas.map((row) => ({ label: row.data || "", parts: horaParts(row) })))}
    ${coluna("frente", "Por frente", frentes.slice(0, 8).map((row) => ({ label: row.equipTag || "", parts: horaParts(row) })))}
    ${coluna("equipamento", "Por equipamento", porEquip.map((row) => ({ label: row.equipTag || String(row.codEquipamento ?? ""), parts: horaParts(row) })))}
    ${legend(40, 1048, HORA_PARTS.map((part) => ({ color: part.color, label: part.label })))}`;
  return slide(line1, titulo, body);
}

function slideDisponibilidade(
  input: GestaoDeckInput,
  safra: GestaoManutencaoData | null,
  semana: GestaoManutencaoData | null,
  titulo: string,
  slideId: string,
  layout: DeckLayout,
): SlideSpec {
  const line1 = "Gestão de Manutenção";
  if (!safra && !semana) return emptySlide(line1, titulo);
  const meta = dispMeta(safra ?? semana);
  const bloco = (data: GestaoManutencaoData | null, chartId: string, title: string, semanaUnica: boolean) =>
    drawIn(layout, slideId, chartId, (width, height) => {
      if (!data) return text(24, 48, `${title}: sem dados.`, { size: 22, weight: 700 });
      const disp = data.kpis?.disponibilidade ?? null;
      const indisp = data.kpis?.indisponibilidade ?? (disp == null ? null : Math.max(0, 100 - disp));
      const meses = (data.meses ?? []).filter((mes) => mes.disponibilidade != null);
      const items = semanaUnica
        ? [{ label: fmtDay(input.inicio), value: disp, color: BLUE }]
        : meses.map((mes) => ({ label: mesCurto(mes.key || mes.label), value: mes.disponibilidade, color: BLUE }));
      const cardW = Math.max(140, Math.min(390, (width - 72) / 2));
      return `${panel(8, 8, width - 16, height - 16)}
        ${text(width / 2, 48, title, { size: 24, weight: 800, anchor: "middle" })}
        ${kpi(24, 68, cardW, 96, fmtPct(disp), "Disponibilidade", 28)}
        ${kpi(36 + cardW, 68, cardW, 96, fmtPct(indisp), "Indisponibilidade", 28)}
        ${columnsChart(28, 190, width - 56, Math.max(140, height - 220), items.length ? items : [{ label: "Safra", value: disp, color: BLUE }], { max: 100, meta, suffix: "%" })}`;
    });
  const body = `${bloco(safra, "safra", "Acumulado Safra", false)}${bloco(semana, "semana", `Semana: ${fmtDate(input.inicio)} a ${fmtDate(input.fim)}`, true)}`;
  return slide(line1, titulo, body);
}

function slideQualidade(input: GestaoDeckInput, layout: DeckLayout): SlideSpec {
  const line1 = "Qualidade da Colheita";
  const line2 = "Colheita Mecanizada";
  const data = input.qualidade;
  if (!data) return emptySlide(line1, line2);
  const tempo = (data.linhaTempo ?? []).map((row) => ({ label: row.mesRef ? mesCurto(row.mesRef) : row.label, value: row.pctPerda ?? 0 }));
  const equips = (data.porEquipamento ?? []).slice(0, 8).map((row) => ({ label: row.label, value: row.pctPerda ?? 0, color: BLUE }));
  const tipos = (data.porTipoPerda ?? []).map((row) => ({ label: row.label, value: row.pctPerda ?? row.quantidade ?? 0 }));
  const operadores = (data.porOperador ?? []).slice(0, 6).map((row) => ({ label: row.label, value: row.pctPerda ?? 0, color: BLUE }));
  const impurezas = (data.impurezaPorEquipamento ?? []).slice(0, 6).map((row) => ({ label: row.label, value: row.impurezaMineral ?? 0, color: "#718096" }));
  const fazendas = (data.porFazenda ?? []).slice(0, 6);
  const area = { top: 186, bottom: 36 };
  const body = `${text(40, 158, `Período: ${fmtDate(input.safraInicio)} a ${fmtDate(input.fim)}`, { size: 18, weight: 700, fill: MUTED })}
    ${drawIn(layout, "qualidade", "tempo", (width, height) => `${text(8, 22, "Perda na colheita — linha do tempo", { size: 16, weight: 800 })}${lineSeries(8, 28, width - 16, height - 36, "", tempo)}`, area)}
    ${drawIn(layout, "qualidade", "equipamento", (width, height) => `${text(8, 22, "Perda por equipamento", { size: 16, weight: 800 })}${hBars(8, 36, width - 16, height - 48, equips, (value) => fmtPct(value))}`, area)}
    ${drawIn(layout, "qualidade", "tipo", (width, height) => `${text(8, 22, "Tipo de perda", { size: 16, weight: 800 })}${pie(Math.min(120, width * 0.28), height * 0.55, Math.min(width, height) * 0.22, tipos, Math.min(width * 0.5, 230), 48)}`, area)}
    ${drawIn(layout, "qualidade", "operador", (width, height) => `${text(8, 22, "Perda por operador", { size: 16, weight: 800 })}${hBars(8, 36, width - 16, height - 48, operadores, (value) => fmtPct(value))}`, area)}
    ${drawIn(layout, "qualidade", "impureza", (width, height) => `${text(8, 22, "Impureza mineral", { size: 16, weight: 800 })}${hBars(8, 36, width - 16, height - 48, impurezas, (value) => fmtPct(value))}${text(8, height - 28, `% perda ${fmtPct(data.resumo?.pctPerda)} · mineral ${fmtPct(data.resumo?.impurezaMineral)}`, { size: 14, weight: 700 })}`, area)}
    ${drawIn(layout, "qualidade", "fazenda", (width, height) => {
      const rowH = Math.max(28, Math.min(40, (height - 48) / Math.max(fazendas.length, 1)));
      const rows = fazendas
        .map((row, index) => {
          const yy = 36 + index * rowH;
          return `<rect x="8" y="${r(yy)}" width="${r(width - 16)}" height="${r(rowH)}" fill="${index % 2 ? SOFT : "#ffffff"}" stroke="${GRID}"/>
            ${text(16, yy + rowH * 0.68, clip(row.label, 24), { size: 14, weight: 700 })}
            ${text(width - 16, yy + rowH * 0.68, fmtPct(row.pctPerda), { size: 14, weight: 700, anchor: "end" })}`;
        })
        .join("");
      return `${text(8, 22, "Perda por fazenda", { size: 16, weight: 800 })}${rows}`;
    }, area)}`;
  return slide(line1, line2, body);
}

function slideCombustivel(input: GestaoDeckInput, grupo: Grupo, titulo: string, slideId: string, layout: DeckLayout): SlideSpec {
  const line1 = "Indicadores de Consumo - Combustível";
  const semana = buildMetrics(input.semana, grupo);
  const safra = buildMetrics(input.safra, grupo);
  if (!semana && !safra) return emptySlide(line1, titulo);
  const faixa = (metrics: ReturnType<typeof buildMetrics>, chartId: string, title: string, linhas: IndicadoresProducaoLinha[]) =>
    drawIn(layout, slideId, chartId, (width, height) => {
      if (!metrics) return text(16, 42, `${title}: sem dados.`, { size: 22, weight: 700 });
      const equips = [...linhas].sort((a, b) => a.equipTag.localeCompare(b.equipTag, "pt-BR", { numeric: true })).slice(0, 8);
      const ltPorKm = (row: IndicadoresProducaoLinha) => (row.kmRodados && row.kmRodados > 0 ? row.litrosCombustivel / row.kmRodados : 0);
      const cards =
        grupo === "caminhao"
          ? `${kpi(12, 40, 168, 72, fmt(metrics.total.tonDia, 1), "Ton/caminhão/dia", 20)}
             ${kpi(188, 40, 168, 72, fmt(metrics.total.km, 0), "Km rodados", 20)}
             ${kpi(12, 120, 168, 72, fmt(metrics.total.ltKm, 2), "Lt/km", 20)}
             ${kpi(188, 120, 168, 72, fmt(metrics.total.kmLt, 2), "Km/lt", 20)}`
          : `${kpi(12, 40, 168, 72, fmt(metrics.total.tonDia, 1), "Ton/máquina/dia", 20)}
             ${kpi(188, 40, 168, 72, fmt(metrics.total.hrsMotor, 0), "Horas motor", 20)}
             ${kpi(12, 120, 168, 72, fmt(metrics.total.ltTon, 2), "Lt/ton", 20)}
             ${kpi(188, 120, 168, 72, fmt(metrics.total.ltHr, 2), "Lt/hora", 20)}`;
      const plotX = width > 980 ? 390 : 16;
      const plotW = Math.max(80, width - plotX - 16);
      const base = height - 56;
      const plotH = Math.max(80, base - (width > 980 ? 48 : 210));
      const bw = 22;
      const chart = equips
        .map((row, index) => {
          const maxHr = Math.max(...equips.map((item) => (grupo === "caminhao" ? ltPorKm(item) : item.ltHr ?? 0)), 1);
          const maxTon = Math.max(...equips.map((item) => (grupo === "caminhao" ? item.kmLt ?? 0 : item.ltTon ?? 0)), 0.1);
          const hr = grupo === "caminhao" ? ltPorKm(row) : row.ltHr ?? 0;
          const ton = grupo === "caminhao" ? row.kmLt ?? 0 : row.ltTon ?? 0;
          const step = plotW / Math.max(equips.length, 1);
          const bx = plotX + index * step;
          const h1 = (hr / maxHr) * plotH;
          const h2 = (ton / maxTon) * plotH;
          return `<rect x="${r(bx)}" y="${r(base - h1)}" width="${bw}" height="${r(h1)}" fill="${BLUE}"/>
            <rect x="${r(bx + bw + 4)}" y="${r(base - h2)}" width="${bw}" height="${r(h2)}" fill="${GREEN_BAR}"/>
            ${text(bx + bw, base - h1 - 8, fmt(hr, 1), { size: 12, weight: 700, anchor: "middle" })}
            ${text(bx + bw, base + 18, row.equipTag, { size: 13, weight: 700, anchor: "middle" })}`;
        })
        .join("");
      return `${text(width / 2, 24, title, { size: 22, weight: 800, anchor: "middle" })}
        ${cards}
        ${chart}
        ${legend(plotX, height - 16, [
          { color: BLUE, label: grupo === "caminhao" ? "Lt/km" : "Lt/hora" },
          { color: GREEN_BAR, label: grupo === "caminhao" ? "Km/lt" : "Lt/ton" },
        ])}`;
    });
  const body = `${faixa(semana, "semana", semanaTitulo(input.inicio, input.fim), input.semana?.tabelas?.[grupo]?.linhas ?? [])}
    ${faixa(safra, "safra", `ACUMULADO SAFRA ${input.safraCode}`, input.safra?.tabelas?.[grupo]?.linhas ?? [])}`;
  return slide(line1, titulo, body);
}

function slideConfiabilidade(data: GestaoManutencaoData | null, titulo: string, periodo: string, slideId: string, layout: DeckLayout): SlideSpec {
  const line1 = "Indicadores de Manutenção";
  const rows = data?.confiabilidadeEquipamentos ?? [];
  if (!data || !rows.length) return emptySlide(line1, titulo);
  const metaMtbf = data.meta?.mtbfHoras ?? null;
  const metaMttr = data.meta?.mttrHoras ?? null;
  const metaDisp = data.meta?.disponibilidade ?? null;
  const headers = ["Equipamento", "Descrição", "Falhas", "MTBF", "Meta MTBF", "MTTR", "Meta MTTR", "Disponibilidade"];
  const colW = [180, 460, 140, 180, 180, 180, 180, 220];
  const head = headers
    .map((header, index) => {
      const x = 40 + colW.slice(0, index).reduce((sum, value) => sum + value, 0);
      return `<rect x="${x}" y="188" width="${colW[index]}" height="42" fill="${NAVY}"/>${text(x + 12, 216, header, { size: 15, weight: 800, fill: "#ffffff" })}`;
    })
    .join("");
  const paint = (values: string[], fills: string[], y: number, colorOverride?: string) =>
    values
      .map((value, index) => {
        const x = 40 + colW.slice(0, index).reduce((sum, item) => sum + item, 0);
        const fill = fills[index] ?? "#ffffff";
        return `<rect x="${x}" y="${y}" width="${colW[index]}" height="40" fill="${fill}" stroke="${GRID}"/>
          ${text(index === 1 ? x + 12 : x + colW[index]! - 12, y + 26, clip(value, index === 1 ? 36 : 14), {
            size: 15,
            weight: 700,
            fill: colorOverride ?? TEXT,
            anchor: index <= 1 ? "start" : "end",
          })}`;
      })
      .join("");
  const bodyRows = rows.slice(0, 14).map((row, index) => {
    const values = [
      String(row.codEquipamento),
      row.descricao || "—",
      fmt0(row.qtdFalhas),
      fmt(row.mtbfHoras, 1),
      fmt(metaMtbf, 1),
      fmt(row.mttrHoras, 1),
      fmt(metaMttr, 1),
      fmtPct(row.disponibilidade),
    ];
    const fills = [
      index % 2 ? SOFT : "#ffffff",
      index % 2 ? SOFT : "#ffffff",
      index % 2 ? SOFT : "#ffffff",
      tone(row.mtbfHoras, metaMtbf, true),
      "#e7eef6",
      tone(row.mttrHoras, metaMttr, false),
      "#e7eef6",
      tone(row.disponibilidade, metaDisp, true),
    ];
    return paint(values, fills, 230 + index * 40);
  });
  const total = data.confiabilidadeTotal;
  const totalRow = total
    ? paint(
        ["", "Total", fmt0(total.qtdFalhas), fmt(total.mtbfHoras, 1), fmt(metaMtbf, 1), fmt(total.mttrHoras, 1), fmt(metaMttr, 1), fmtPct(total.disponibilidade)],
        Array(8).fill(NAVY),
        230 + bodyRows.length * 40,
        "#ffffff",
      )
    : "";
  return slide(line1, titulo, fitBlock(layout, slideId, "conteudo", `${text(40, 160, periodo, { size: 20, weight: 700, fill: MUTED })}${head}${bodyRows.join("")}${totalRow}`));
}

function slideMttr(semana: GestaoManutencaoData | null, safra: GestaoManutencaoData | null, titulo: string, periodoSemana: string, slideId: string, layout: DeckLayout): SlideSpec {
  const line1 = "Gestão de Manutenção";
  if (!semana && !safra) return emptySlide(line1, titulo);
  const bloco = (data: GestaoManutencaoData | null, chartId: string, title: string) =>
    drawIn(layout, slideId, chartId, (width, height) => {
      if (!data) return text(16, 40, `${title}: sem dados.`, { size: 22, weight: 700 });
      const equips = [...(data.confiabilidadeEquipamentos ?? [])].sort((a, b) => b.qtdFalhas - a.qtdFalhas).slice(0, 6);
      const chartW = Math.max(120, (width - 520) / 2);
      return `${text(width / 2, 24, title, { size: 22, weight: 800, anchor: "middle" })}
        ${kpi(12, 40, 180, 84, fmtHm(data.kpis?.mttrHoras), "MTTR", 26)}
        ${kpi(204, 40, 180, 84, fmtHm(data.kpis?.mtbfHoras), "MTBF", 26)}
        ${text(400, 58, "MTTR", { size: 16, weight: 800 })}
        ${columnsChart(400, 70, chartW, Math.max(120, height - 90), equips.map((row) => ({ label: String(row.codEquipamento), value: row.mttrHoras })), { meta: data.meta?.mttrHoras ?? null })}
        ${text(420 + chartW, 58, "MTBF", { size: 16, weight: 800 })}
        ${columnsChart(420 + chartW, 70, chartW, Math.max(120, height - 90), equips.map((row) => ({ label: String(row.codEquipamento), value: row.mtbfHoras, color: "#1a365d" })), { meta: data.meta?.mtbfHoras ?? null })}`;
    });
  return slide(line1, titulo, `${bloco(semana, "semana", periodoSemana)}${bloco(safra, "safra", "Acumulado Safra")}`);
}

function slideCusto(semana: GestaoManutencaoData | null, safra: GestaoManutencaoData | null, titulo: string, periodoSemana: string, slideId: string, layout: DeckLayout): SlideSpec {
  const line1 = "Gestão de Manutenção";
  if (!semana?.custo && !safra?.custo) return emptySlide(line1, titulo);
  const cores: Record<string, string> = { corretiva: "#e24b4b", preventiva: "#2b6cb0", preditiva: "#d69e2e", melhoria: "#38a169" };
  const bloco = (data: GestaoManutencaoData | null, chartId: string, title: string) =>
    drawIn(layout, slideId, chartId, (width, height) => {
      const custo = data?.custo;
      if (!custo) return text(16, 40, `${title}: sem dados.`, { size: 22, weight: 700 });
      const tipos = [
        { key: "corretiva", label: "Corretiva" },
        { key: "preventiva", label: "Preventiva" },
        { key: "preditiva", label: "Preditiva" },
        { key: "melhoria", label: "Melhoria" },
      ] as const;
      const cardW = Math.max(120, Math.min(210, (width - 48) / 4));
      const cards = tipos.map((tipo, index) => kpi(12 + index * (cardW + 8), 36, cardW, 72, fmtMoney(custo.porTipo?.[tipo.key] ?? 0), tipo.label, 16)).join("");
      const barras = tipos.map((tipo) => ({ label: tipo.label, value: custo.porTipo?.[tipo.key] ?? 0, color: cores[tipo.key] }));
      const componentes = (custo.porComponente ?? []).slice(0, 6).map((row) => ({ label: row.label || row.componente, value: row.valor, color: NAVY }));
      const split = width > 1000;
      return `${text(width / 2, 22, title, { size: 22, weight: 800, anchor: "middle" })}
        ${cards}
        ${text(12, 132, "Por tipo de manutenção", { size: 16, weight: 800 })}
        ${hBars(12, 146, split ? width / 2 - 24 : width - 24, height - 170, barras, fmtMoney)}
        ${text(split ? width / 2 : 12, split ? 132 : height / 2, "Total por componente", { size: 16, weight: 800 })}
        ${hBars(split ? width / 2 : 12, split ? 146 : height / 2 + 16, split ? width / 2 - 24 : width - 24, split ? height - 170 : height / 2 - 30, componentes, fmtMoney)}`;
    });
  return slide(line1, titulo, `${bloco(semana, "semana", periodoSemana)}${bloco(safra, "safra", "Acumulado Safra")}`);
}

function slideOleoResumo(input: GestaoDeckInput, layout: DeckLayout): SlideSpec {
  const line1 = `Indicadores Safra ${input.safraCode}`;
  const line2 = "Consumo de Óleo Hidráulico relatório Colhedeira";
  const data = input.oleo;
  if (!data) return emptySlide(line1, line2);
  const motivos = (data.motivos ?? []).map((row) => ({ label: row.label || row.codigo, value: row.litros }));
  const area = { top: 290, bottom: 36 };
  const body = `${kpi(40, 160, 280, 110, fmt(data.resumo?.litrosTotal, 1), "Litros", 32)}
    ${kpi(340, 160, 280, 110, fmt0(data.resumo?.qtdRemontas), "Remontas", 32)}
    ${kpi(640, 160, 280, 110, fmt(data.resumo?.ltTon, 3), "Índice L/t", 32)}
    ${kpi(940, 160, 320, 110, fmt(data.resumo?.toneladas, 1), "Toneladas", 32)}
    ${drawIn(layout, "oleo-resumo", "barras", (width, height) => `${text(8, 24, "Litros por motivo", { size: 18, weight: 800 })}${columnsChart(8, 36, width - 16, height - 48, motivos.map((row) => ({ label: clip(row.label, 12), value: row.value })), { max: Math.max(...motivos.map((row) => row.value), 1) })}`, area)}
    ${drawIn(layout, "oleo-resumo", "rosca", (width, height) => `${text(8, 24, "Participação", { size: 18, weight: 800 })}${pie(width * 0.32, height * 0.55, Math.min(width, height) * 0.22, motivos, width * 0.58, height * 0.28)}`, area)}`;
  return slide(line1, line2, body);
}

function slideOleoTabela(input: GestaoDeckInput, layout: DeckLayout): SlideSpec {
  const line1 = `Indicadores Safra ${input.safraCode}`;
  const line2 = "Consumo de Óleo Hidráulico relatório Colhedeira";
  const rows = input.oleo?.equipamentos ?? [];
  if (!rows.length) return emptySlide(line1, line2, "Sem lançamentos de óleo hidráulico no período.");
  const headers = ["Equipamento", "Código", "Material", "Troca", "Remonta", "Total"];
  const colW = [420, 180, 520, 220, 220, 240];
  const head = headers
    .map((header, index) => {
      const x = 40 + colW.slice(0, index).reduce((sum, value) => sum + value, 0);
      return `<rect x="${x}" y="180" width="${colW[index]}" height="42" fill="${NAVY}"/>${text(x + colW[index]! / 2, 208, header, { size: 16, weight: 800, fill: "#ffffff", anchor: "middle" })}`;
    })
    .join("");
  const body = rows
    .slice(0, 14)
    .map((row, index) => {
      const values = [row.descricao || String(row.codEquipamento), row.codMaterial == null ? "—" : String(row.codMaterial), row.material || "—", fmt(row.troca, 1), fmt(row.remonta, 1), fmt(row.total, 1)];
      const y = 222 + index * 42;
      return values
        .map((value, col) => {
          const x = 40 + colW.slice(0, col).reduce((sum, item) => sum + item, 0);
          return `<rect x="${x}" y="${y}" width="${colW[col]}" height="42" fill="${index % 2 ? SOFT : "#ffffff"}" stroke="${GRID}"/>
            ${text(col >= 3 ? x + colW[col]! - 12 : x + 12, y + 27, clip(value, col === 2 ? 32 : 24), { size: 15, weight: 700, anchor: col >= 3 ? "end" : "start" })}`;
        })
        .join("");
    })
    .join("");
  const total = rows.reduce((sum, row) => sum + row.total, 0);
  return slide(line1, line2, fitBlock(layout, "oleo-tabela", "conteudo", `${text(40, 158, `Período: ${fmtDate(input.oleo?.filtros.dataInicio || input.safraInicio)} a ${fmtDate(input.fim)}`, { size: 18, weight: 700, fill: MUTED })}${head}${body}${text(40, 900, `Total geral: ${fmt(total, 1)} L`, { size: 22, weight: 800 })}`));
}

function slideOleoComparativo(input: GestaoDeckInput, layout: DeckLayout): SlideSpec {
  const line1 = `Indicadores Safra ${input.safraCode}`;
  const line2 = "Consumo de Óleo Hidráulico Comparativo - Colhedeira";
  const safras = input.oleo?.comparativo?.safras ?? [];
  if (!safras.length) return emptySlide(line1, line2);
  const equips = [...new Set(safras.flatMap((safra) => safra.porEquipamento.map((row) => row.codEquipamento)))].slice(0, 8);
  const max = Math.max(...safras.flatMap((safra) => safra.porEquipamento.map((row) => row.litros)), 1);
  const bars = equips
    .map((cod, index) => {
      const x = 80 + index * 210;
      return safras
        .slice(0, 3)
        .map((safra, serie) => {
          const litros = safra.porEquipamento.find((row) => row.codEquipamento === cod)?.litros ?? 0;
          const bh = (litros / max) * 460;
          const bx = x + serie * 42;
          return `<rect x="${bx}" y="${r(760 - bh)}" width="36" height="${r(bh)}" fill="${PIE[serie % PIE.length]}"/>
            ${text(bx + 18, 752 - bh, fmt0(litros), { size: 12, weight: 700, anchor: "middle" })}`;
        })
        .join("") + text(x + 40, 792, String(cod), { size: 16, weight: 800, anchor: "middle" });
    })
    .join("");
  const notes = safras
    .map((safra, index) => `${safra.label}: ${fmt(safra.litros, 1)} L · ${fmt(safra.toneladas, 0)} t · ${fmt(safra.ltTon, 3)} L/t`)
    .map((line, index) => text(80, 860 + index * 28, line, { size: 16, weight: 700 }))
    .join("");
  const body = `${text(80, 170, "Consumo de óleo hidráulico por colhedora", { size: 22, weight: 800 })}
    ${bars}
    ${legend(80, 830, safras.slice(0, 3).map((safra, index) => ({ color: PIE[index % PIE.length]!, label: safra.label })))}
    ${notes}`;
  return slide(line1, line2, fitBlock(layout, "oleo-comparativo", "conteudo", body));
}

function slideOleoCausas(input: GestaoDeckInput, layout: DeckLayout): SlideSpec {
  const line1 = `Indicadores Safra ${input.safraCode}`;
  const line2 = "Consumo de Óleo Hidráulico Safra - Colhedeira";
  const data = input.oleo;
  if (!data) return emptySlide(line1, line2);
  const motivos = (data.motivos ?? []).map((row) => ({ label: row.label || row.codigo, value: row.qtdRemontas || row.litros }));
  const trocas = (data.equipamentos ?? []).filter((row) => row.qtdTrocas > 0).slice(0, 8);
  const body = `${drawIn(layout, "oleo-causas", "causas", (width, height) => `${text(8, 24, "Causas", { size: 18, weight: 800 })}${columnsChart(8, 36, width - 16, height - 48, (data.motivos ?? []).map((row) => ({ label: clip(row.label || row.codigo, 14), value: row.litros })))}`)}
    ${drawIn(layout, "oleo-causas", "motivos", (width, height) => `${text(8, 24, "Motivos", { size: 18, weight: 800 })}${pie(width * 0.28, height * 0.55, Math.min(width, height) * 0.2, motivos.length ? motivos : (data.motivos ?? []).map((row) => ({ label: row.label, value: row.litros })), width * 0.55, height * 0.28)}`)}
    ${drawIn(layout, "oleo-causas", "trocas", (width, height) => `${text(8, 24, "Quantidade de troca por equipamento", { size: 18, weight: 800 })}${columnsChart(8, 36, width - 16, height - 48, trocas.map((row) => ({ label: String(row.codEquipamento), value: row.qtdTrocas, color: BLUE })))}`)}`;
  return slide(line1, line2, body);
}

function slideOleoMensal(input: GestaoDeckInput, layout: DeckLayout): SlideSpec {
  const line1 = `Indicadores Safra ${input.safraCode}`;
  const line2 = "Consumo de Óleo Hidráulico Mensal Colhedeira";
  const meses = input.oleo?.mensal ?? [];
  if (!meses.length) return emptySlide(line1, line2);
  const meta = input.oleo?.filtros.metaLtTon ?? META_OLEO_HIDRAULICO_LT_TON;
  const mediaLt = meses.reduce((sum, mes) => sum + (mes.ltTon ?? 0), 0) / meses.length;
  const items = [
    ...meses.map((mes) => ({ label: mes.label || mesCurto(mes.chave), value: mes.ltTon, color: BLUE })),
    { label: "Média", value: mediaLt, color: "#718096" },
  ];
  const body = `${drawIn(layout, "oleo-mensal", "grafico", (width, height) => `${text(8, 24, "Consumo de óleo hidráulico L/ton", { size: 18, weight: 800 })}${columnsChart(8, 36, width - 16, height - 48, items, { meta, suffix: "" })}`)}
    ${drawIn(layout, "oleo-mensal", "meta", (width, height) => `${panel(8, 8, width - 16, Math.min(220, height - 16))}
      ${text(24, 48, `META: ${fmt(meta, 3)} LTS/TON`, { size: 18, weight: 800 })}
      ${meses.map((mes, index) => text(24, 88 + index * 28, `${(mes.label || mes.chave).toUpperCase()} — ${fmt(mes.litros, 1)} litros`, { size: 15, weight: 700 })).join("")}`)}`;
  return slide(line1, line2, body);
}

function slideLubrificacao(input: GestaoDeckInput, layout: DeckLayout): SlideSpec {
  const line1 = `Indicadores Safra ${input.safraCode}`;
  const line2 = "Acompanhamento de lubrificações das Colhedeiras";
  const data = input.lub;
  if (!data) return emptySlide(line1, line2);
  const [year, month] = input.fim.split("-").map(Number);
  const kpis = kpisLubrificacao(data.eventos ?? [], data.horas ?? [], data.pontos ?? [], year || data.ano, month || 1);
  const mensal = montarMensalLubrificacao(data.eventos ?? [], data.horas ?? [], data.pontos ?? [], year || data.ano, month || 1);
  const status = data.status ?? { ok: 0, aVencer: 0, vencido: 0, semPlano: 0 };
  const body = `${kpi(40, 150, 250, 100, fmtPct(kpis.aderencia), "Aderência", 28)}
    ${kpi(306, 150, 200, 100, fmt0(kpis.meta), "Meta", 28)}
    ${kpi(522, 150, 250, 100, fmt0(kpis.relativoMesAnterior), "Mês anterior", 28)}
    ${kpi(788, 150, 250, 100, fmt0(kpis.quantidadeRealizada), "Realizado", 28)}
    ${kpi(1054, 150, 250, 100, fmt0(status.vencido), "Vencidos", 28)}
    ${drawIn(layout, "lubrificacao", "status", (width, height) => `${text(8, 24, "Status da lubrificação", { size: 18, weight: 800 })}${pie(width * 0.28, height * 0.5, Math.min(width, height) * 0.2, [
      { label: "Em dia", value: status.ok },
      { label: "A vencer", value: status.aVencer },
      { label: "Vencido", value: status.vencido },
      { label: "Sem plano", value: status.semPlano },
    ], width * 0.55, height * 0.28)}`, { top: 270, bottom: 36 })}
    ${drawIn(layout, "lubrificacao", "serie", (width, height) => `${text(8, 24, "Realizado x meta", { size: 18, weight: 800 })}${lineSeries(8, 36, width - 16, height - 48, "", mensal.map((row) => ({ label: row.label, value: row.realizado })))}`, { top: 270, bottom: 36 })}`;
  return slide(line1, line2, body);
}

function pneusDoPeriodo(items: PneuItem[], inicio: string, fim: string) {
  return items.filter((item) => pneusInPeriod(item.descarte ? item.descarte.slice(0, 10) : null, inicio, fim));
}

function slidePneusGeral(input: GestaoDeckInput, layout: DeckLayout): SlideSpec {
  const line1 = "Controle de Pneus";
  const line2 = "Descarte de Pneus Geral";
  const items = pneusDoPeriodo(input.pneus?.pneus ?? [], input.safraInicio, input.fim);
  if (!items.length) return emptySlide(line1, line2);
  const custo = pneusCost(items);
  const vida = pneusAverage(items.map((item) => item.vida));
  const rodado = pneusAverage(items.map((item) => item.rodado));
  const distancia = items.reduce((sum, item) => sum + (item.rodado ?? 0), 0);
  const custoHora = custo != null && distancia > 0 ? custo / distancia : null;
  const porMotivo = countBy(items, (item) => item.motivo || "Sem motivo");
  const porCausa = countBy(items, (item) => item.causa || "Sem causa");
  const porTipo = countBy(items, (item) => item.tipo || item.categoria || "Pneu");
  const body = `${kpi(40, 150, 300, 100, fmtMoney(custo), "Custo total", 22)}
    ${kpi(360, 150, 220, 100, fmt(vida, 1), "Vida média", 28)}
    ${kpi(600, 150, 240, 100, fmt(rodado, 1), "Km/hrs médio", 28)}
    ${kpi(860, 150, 200, 100, fmt0(items.length), "Quantidade", 28)}
    ${kpi(1080, 150, 260, 100, fmt(custoHora, 2), "Custo / km-hr", 24)}
    ${drawIn(layout, "pneus-geral", "motivo", (width, height) => `${text(8, 24, "Motivo do descarte", { size: 18, weight: 800 })}${hBars(8, 36, width - 16, height - 48, porMotivo, fmt0)}`, { top: 270, bottom: 36 })}
    ${drawIn(layout, "pneus-geral", "causa", (width, height) => `${text(8, 24, "Causa do descarte", { size: 18, weight: 800 })}${columnsChart(8, 36, width - 16, height - 48, porCausa.map((row) => ({ label: clip(row.label, 10), value: row.value })))}`, { top: 270, bottom: 36 })}
    ${drawIn(layout, "pneus-geral", "tipo", (width, height) => `${text(8, 24, "Tipo de pneu", { size: 18, weight: 800 })}${pie(width * 0.3, height * 0.55, Math.min(width, height) * 0.22, porTipo, width * 0.58, height * 0.3)}`, { top: 270, bottom: 36 })}`;
  return slide(line1, line2, body);
}

function slidePneusComparativo(input: GestaoDeckInput, layout: DeckLayout): SlideSpec {
  const line1 = "Indicadores de pneu";
  const line2 = "Comparativo de descartes Safra";
  const items = (input.pneus?.pneus ?? []).map((item) => ({ ...item, descarte: item.descarte ? item.descarte.slice(0, 10) : null }));
  const chart = pneusComparativoSemanal(items, input.fim);
  if (!chart.safras.length || !chart.semanas.length) return emptySlide(line1, line2);
  const semanas = chart.semanas.slice(-16);
  const offset = chart.semanas.length - semanas.length;
  const max = Math.max(...chart.safras.flatMap((safra) => safra.valores.slice(offset)), 1);
  const bw = Math.max(4, 1500 / Math.max(semanas.length * Math.max(chart.safras.length, 1), 1));
  const bars = semanas
    .map((week, index) => {
      const x = 80 + index * (bw * chart.safras.length + 8);
      const cols = chart.safras
        .map((safra, serie) => {
          const value = safra.valores[offset + index] ?? 0;
          const bh = (value / max) * 620;
          return `<rect x="${r(x + serie * bw)}" y="${r(860 - bh)}" width="${r(Math.max(bw - 1, 2))}" height="${r(bh)}" fill="${PIE[serie % PIE.length]}"/>`;
        })
        .join("");
      return `${cols}${text(x + (bw * chart.safras.length) / 2, 888, String(week), { size: 12, weight: 700, anchor: "middle" })}`;
    })
    .join("");
  const body = `${text(80, 170, "Comparativo semanal de descartes de pneus", { size: 24, weight: 800 })}
    ${bars}
    ${legend(80, 960, chart.safras.map((safra, index) => ({ color: PIE[index % PIE.length]!, label: `${safra.label} (${safra.total})` })))}`;
  return slide(line1, line2, fitBlock(layout, "pneus-comparativo", "conteudo", body));
}

function countBy(items: PneuItem[], keyOf: (item: PneuItem) => string) {
  const map = new Map<string, number>();
  for (const item of items) {
    const key = keyOf(item).trim() || "—";
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([label, value]) => ({ label, value, color: BLUE }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);
}

export function buildGestaoDesempenhoSlides(input: GestaoDeckInput, layout: DeckLayout = defaultDeckLayout()): SlideSpec[] {
  const periodoSemana = `Semana: ${fmtDate(input.inicio)} a ${fmtDate(input.fim)}`;
  const periodoSafra = `Acumulado safra ${input.safraCode} até ${fmtDate(input.fim)}`;
  const dispColhedora = dispMeta(input.colhedoraSafra ?? input.colhedoraSemana);
  const dispTrator = dispMeta(input.tratorSafra ?? input.tratorSemana);
  const dispCaminhao = dispMeta(input.caminhaoSafra ?? input.caminhaoSemana);
  const makers: Record<string, () => SlideSpec> = {
    capa: () => slideCapa(input),
    agenda: () => slideAgenda(input),
    colhedoras: () => slideProdutividade(input, "colhedora", "Colhedeiras", dispColhedora, "colhedoras", layout),
    tratores: () => slideProdutividade(input, "trator", "Tratores", dispTrator, "tratores", layout),
    caminhoes: () => slideProdutividade(input, "caminhao", "Caminhões", dispCaminhao, "caminhoes", layout),
    "horas-colhedora": () => slideHoras(input, "colhedora", "Horas trabalhadas x Horas disponíveis Colhedora", "horas-colhedora", layout),
    "horas-trator": () => slideHoras(input, "trator", "Horas trabalhadas x Horas disponíveis Trator", "horas-trator", layout),
    "disp-colhedora": () => slideDisponibilidade(input, input.colhedoraSafra, input.colhedoraSemana, "DISPONIBILIDADE COLHEDEIRA DE CANA", "disp-colhedora", layout),
    "disp-trator": () => slideDisponibilidade(input, input.tratorSafra, input.tratorSemana, "DISPONIBILIDADE TRATORES", "disp-trator", layout),
    "disp-caminhao": () => slideDisponibilidade(input, input.caminhaoSafra, input.caminhaoSemana, "DISPONIBILIDADE CAMINHÕES", "disp-caminhao", layout),
    qualidade: () => slideQualidade(input, layout),
    "combustivel-colhedora": () => slideCombustivel(input, "colhedora", "Colhedeira de cana", "combustivel-colhedora", layout),
    "combustivel-trator": () => slideCombustivel(input, "trator", "Tratores", "combustivel-trator", layout),
    "combustivel-caminhao": () => slideCombustivel(input, "caminhao", "Caminhões canavieiros", "combustivel-caminhao", layout),
    "conf-colhedora": () => slideConfiabilidade(input.colhedoraSemana ?? input.colhedoraSafra, "Confiabilidade e Disponibilidade - Colhedeira", input.colhedoraSemana ? periodoSemana : periodoSafra, "conf-colhedora", layout),
    "conf-trator": () => slideConfiabilidade(input.tratorSemana ?? input.tratorSafra, "Confiabilidade e Disponibilidade - Tratores", input.tratorSemana ? periodoSemana : periodoSafra, "conf-trator", layout),
    "mttr-colhedora": () => slideMttr(input.colhedoraSemana, input.colhedoraSafra, "MTTR-MTBF - COLHEDEIRA DE CANA", periodoSemana, "mttr-colhedora", layout),
    "mttr-trator": () => slideMttr(input.tratorSemana, input.tratorSafra, "MTTR-MTBF - TRATORES", periodoSemana, "mttr-trator", layout),
    "custo-colhedora": () => slideCusto(input.custoColhedoraSemana, input.custoColhedoraSafra, "Relatório de custo Colhedoras", periodoSemana, "custo-colhedora", layout),
    "custo-trator": () => slideCusto(input.custoTratorSemana, input.custoTratorSafra, "Relatório de custo Tratores", periodoSemana, "custo-trator", layout),
    "oleo-resumo": () => slideOleoResumo(input, layout),
    "oleo-tabela": () => slideOleoTabela(input, layout),
    "oleo-comparativo": () => slideOleoComparativo(input, layout),
    "oleo-causas": () => slideOleoCausas(input, layout),
    "oleo-mensal": () => slideOleoMensal(input, layout),
    lubrificacao: () => slideLubrificacao(input, layout),
    "pneus-geral": () => slidePneusGeral(input, layout),
    "pneus-comparativo": () => slidePneusComparativo(input, layout),
  };
  return layout.slides.filter((item) => item.enabled).flatMap((item) => {
    const make = makers[item.id];
    return make ? [make()] : [];
  });
}
