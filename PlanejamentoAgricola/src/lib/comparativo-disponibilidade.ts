export const MESES_SAFRA = [
  { month: 9, label: "SETEMBRO" },
  { month: 10, label: "OUTUBRO" },
  { month: 11, label: "NOVEMBRO" },
  { month: 12, label: "DEZEMBRO" },
  { month: 1, label: "JANEIRO" },
  { month: 2, label: "FEVEREIRO" },
  { month: 3, label: "MARÇO" },
  { month: 4, label: "ABRIL" },
  { month: 5, label: "MAIO" },
  { month: 6, label: "JUNHO" },
  { month: 7, label: "JULHO" },
  { month: 8, label: "AGOSTO" },
] as const;

export const COMPARATIVO_DISP_COLORS = ["#c5c5c5", "#3b82f6", "#22c55e"];
export const COMPARATIVO_TIPO_COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#8b5cf6", "#ef4444", "#14b8a6", "#6366f1", "#84cc16", "#0ea5e9", "#f97316"];
export const COMPARATIVO_DISP_LOOKBACK = 2;

export type ComparativoDisponibilidadeMensal = {
  meta: number;
  safraAtual: string;
  dataInicio: string;
  dataFim: string;
  meses: { key: string; label: string }[];
  tipos: { codTipo: number; label: string }[];
  safras: {
    codigo: string;
    porTipo: Record<string, (number | null)[]>;
  }[];
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export function safraStartYearFromIso(iso: string) {
  const [year, month] = iso.split("-").map(Number);
  if (!year || !month) return new Date().getFullYear();
  return month >= 9 ? year : year - 1;
}

export function safraStartYearFromCode(code?: string | null, fallbackIso?: string) {
  const match = String(code ?? "").trim().match(/^(\d{2})\/(\d{2})$/);
  if (match) {
    const y1 = Number(match[1]) >= 90 ? 1900 + Number(match[1]) : 2000 + Number(match[1]);
    return y1;
  }
  return safraStartYearFromIso(fallbackIso ?? new Date().toISOString().slice(0, 10));
}

export function safraCodigoFromStartYear(startYear: number) {
  return `${String(startYear).slice(-2)}/${String(startYear + 1).slice(-2)}`;
}

export function monthLastDay(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

export function comparativoMesesSafra(startYear: number, capTo?: string) {
  const out: { key: string; label: string; month: number }[] = [];
  for (const mes of MESES_SAFRA) {
    const year = mes.month >= 9 ? startYear : startYear + 1;
    const from = `${year}-${pad2(mes.month)}-01`;
    if (capTo && from > capTo) break;
    out.push({ key: pad2(mes.month), label: mes.label, month: mes.month });
  }
  return out;
}

/** Recorta só os meses vazios no fim; mantém outubro–agosto se alguma safra tiver valor. */
export function recortarMesesComparativo(
  meses: { key: string; label: string }[],
  safras: { porTipo: Record<string, (number | null)[]> }[],
) {
  let last = -1;
  for (let i = 0; i < meses.length; i += 1) {
    const temValor = safras.some((safra) =>
      Object.values(safra.porTipo).some((valores) => valores[i] != null && Number.isFinite(valores[i])),
    );
    if (temValor) last = i;
  }
  if (last < 0) return { meses, safras };
  const tamanho = last + 1;
  return {
    meses: meses.slice(0, tamanho),
    safras: safras.map((safra) => ({
      ...safra,
      porTipo: Object.fromEntries(
        Object.entries(safra.porTipo).map(([cod, valores]) => [cod, valores.slice(0, tamanho)]),
      ),
    })),
  };
}

export function comparativoMesWindow(startYear: number, month: number, capTo?: string) {
  const year = month >= 9 ? startYear : startYear + 1;
  const from = `${year}-${pad2(month)}-01`;
  const last = monthLastDay(year, month);
  let to = `${year}-${pad2(month)}-${pad2(last)}`;
  if (capTo && from > capTo) return null;
  if (capTo && to > capTo) to = capTo;
  if (from > to) return null;
  return { from, to };
}

export function tipoComparativoCurto(label: string) {
  return label.split(" - ")[0].trim() || label;
}

export function serieComparativoLabel(tipoLabel: string, codigo: string) {
  return `${tipoComparativoCurto(tipoLabel)} (${codigo})`;
}

export function montarSeriesComparativo(
  data: Pick<ComparativoDisponibilidadeMensal, "tipos" | "safras" | "meses">,
  tiposSelecionados: number[],
) {
  const tipos = data.tipos.filter((tipo) => tiposSelecionados.includes(tipo.codTipo));
  const series: { label: string; color: string; values: (number | null)[] }[] = [];
  tipos.forEach((tipo, tipoIndex) => {
    data.safras.forEach((safra, safraIndex) => {
      const color =
        tipos.length === 1
          ? COMPARATIVO_DISP_COLORS[safraIndex % COMPARATIVO_DISP_COLORS.length]
          : COMPARATIVO_TIPO_COLORS[(tipoIndex * data.safras.length + safraIndex) % COMPARATIVO_TIPO_COLORS.length];
      series.push({
        label: serieComparativoLabel(tipo.label, safra.codigo),
        color,
        values: safra.porTipo[String(tipo.codTipo)] ?? data.meses.map(() => null),
      });
    });
  });
  return series;
}

export function filtrarMesesComparativo(
  data: Pick<ComparativoDisponibilidadeMensal, "meses" | "safras">,
  mesesSelecionados: string[],
) {
  const escolhidos = new Set(mesesSelecionados);
  const indices = data.meses
    .map((mes, index) => (escolhidos.has(mes.key) ? index : -1))
    .filter((index) => index >= 0);
  return {
    meses: indices.map((index) => data.meses[index]),
    safras: data.safras.map((safra) => ({
      ...safra,
      porTipo: Object.fromEntries(
        Object.entries(safra.porTipo).map(([cod, valores]) => [cod, indices.map((index) => valores[index] ?? null)]),
      ),
    })),
  };
}
