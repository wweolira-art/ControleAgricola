import {
  BarController,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
  type ChartDataset,
  type ChartOptions,
} from "chart.js";
import ChartDataLabels from "chartjs-plugin-datalabels";
import { useEffect, useMemo, useRef, useState } from "react";
import type { IndicadoresColheitaProducaoData, IndicadoresProducaoLinha } from "../../api";
import { CopyVisualButton, CopyableKpis } from "../CopyVisualButton";
import { QualidadeEquipamentoFilter } from "./QualidadeEquipamentoFilter";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  LineController,
  BarElement,
  BarController,
  Tooltip,
  Legend,
  ChartDataLabels,
);

const META = {
  colhedoraLtTon: 1.1,
  tratorLtTon: 0.6,
  tratorLtHr: 8,
  caminhaoKmLt: 1.3,
  caminhaoLtTon: 1.1,
} as const;

const COR_AZUL = "#3b82f6";
const COR_VERDE = "#22c55e";
const COR_LARANJA = "#f59e0b";
const COR_VERMELHA = "#ef4444";

function fmt2(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function fmt0(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(n);
}

function fmtMeta(n: number) {
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n);
}

function labelEquipamento(row: IndicadoresProducaoLinha) {
  if (row.codEquipamento != null && Number.isFinite(row.codEquipamento) && row.codEquipamento > 0) {
    return String(row.codEquipamento);
  }
  return row.equipTag?.trim() || "—";
}

type GrupoKind = "colhedora" | "trator" | "caminhao";

function resumoTonMaquinaDia(
  kind: GrupoKind,
  linhas: IndicadoresProducaoLinha[],
  totais: IndicadoresProducaoLinha | null,
  dias: number,
) {
  const maquinas =
    kind === "caminhao"
      ? linhas.filter((row) => (row.toneladaColhida ?? 0) > 0).length
      : linhas.filter((row) => (row.hrsMotor ?? 0) > 0).length;
  const toneladas = totais?.toneladaColhida ?? 0;
  const valor =
    maquinas > 0 && dias > 0 && toneladas > 0 ? Math.round((toneladas / dias / maquinas) * 100) / 100 : null;
  return {
    valor,
    toneladas,
    maquinas,
    dias,
    criterio: kind === "caminhao" ? "caminhões com tonelada de cana" : "máquinas com horas motor",
  };
}

type ChartSpec = {
  labels: string[];
  datasets: ChartDataset<"bar" | "line", (number | null)[]>[];
  yTitle: string;
  y1Title?: string;
};

function chartSpec(kind: GrupoKind, linhas: IndicadoresProducaoLinha[]): ChartSpec {
  const labels = linhas.map((row) => labelEquipamento(row));
  const fill = (value: number) => labels.map(() => value);
  const hideLineLabels = { datalabels: { display: false } };

  if (kind === "caminhao") {
    return {
      labels,
      yTitle: "Km / Lt",
      y1Title: "Lt / ton",
      datasets: [
        {
          type: "bar",
          label: "Km/ Lt",
          data: linhas.map((row) => row.kmLt),
          backgroundColor: COR_AZUL,
          borderRadius: 3,
          yAxisID: "y",
          order: 2,
        },
        {
          type: "bar",
          label: "Lt/Ton — Caminhão",
          data: linhas.map((row) => row.ltTon),
          backgroundColor: COR_VERDE,
          borderRadius: 3,
          yAxisID: "y1",
          order: 2,
        },
        {
          type: "line",
          label: `Meta Km/lt: ${fmtMeta(META.caminhaoKmLt)}`,
          data: fill(META.caminhaoKmLt),
          borderColor: COR_LARANJA,
          backgroundColor: COR_LARANJA,
          borderWidth: 2,
          pointRadius: 0,
          yAxisID: "y",
          order: 1,
          ...hideLineLabels,
        },
        {
          type: "line",
          label: `Meta Lt/ton: ${fmtMeta(META.caminhaoLtTon)}`,
          data: fill(META.caminhaoLtTon),
          borderColor: COR_VERMELHA,
          backgroundColor: COR_VERMELHA,
          borderWidth: 2,
          pointRadius: 0,
          yAxisID: "y1",
          order: 1,
          ...hideLineLabels,
        },
      ],
    };
  }

  if (kind === "trator") {
    return {
      labels,
      yTitle: "Lt / ton",
      y1Title: "Lt / hrs",
      datasets: [
        {
          type: "bar",
          label: "Lt/hrs",
          data: linhas.map((row) => row.ltHr),
          backgroundColor: COR_AZUL,
          borderRadius: 3,
          yAxisID: "y1",
          order: 2,
        },
        {
          type: "bar",
          label: "Lt/ton",
          data: linhas.map((row) => row.ltTon),
          backgroundColor: COR_VERDE,
          borderRadius: 3,
          yAxisID: "y",
          order: 2,
        },
        {
          type: "line",
          label: `Meta Lt/hrs: ${fmtMeta(META.tratorLtHr)}`,
          data: fill(META.tratorLtHr),
          borderColor: COR_LARANJA,
          backgroundColor: COR_LARANJA,
          borderWidth: 2,
          pointRadius: 0,
          yAxisID: "y1",
          order: 1,
          ...hideLineLabels,
        },
        {
          type: "line",
          label: `Meta Lt/ton: ${fmtMeta(META.tratorLtTon)}`,
          data: fill(META.tratorLtTon),
          borderColor: COR_VERMELHA,
          backgroundColor: COR_VERMELHA,
          borderWidth: 2,
          pointRadius: 0,
          yAxisID: "y",
          order: 1,
          ...hideLineLabels,
        },
      ],
    };
  }

  return {
    labels,
    yTitle: "Lt / ton",
    y1Title: "Lt / hrs",
    datasets: [
      {
        type: "bar",
        label: "Litros / hrs",
        data: linhas.map((row) => row.ltHr),
        backgroundColor: COR_AZUL,
        borderRadius: 3,
        yAxisID: "y1",
        order: 2,
      },
      {
        type: "bar",
        label: "Lt/Ton",
        data: linhas.map((row) => row.ltTon),
        backgroundColor: COR_VERDE,
        borderRadius: 3,
        yAxisID: "y",
        order: 2,
      },
      {
        type: "line",
        label: `Meta Lt/ton: ${fmtMeta(META.colhedoraLtTon)}`,
        data: fill(META.colhedoraLtTon),
        borderColor: COR_VERMELHA,
        backgroundColor: COR_VERMELHA,
        borderWidth: 2,
        pointRadius: 0,
        yAxisID: "y",
        order: 1,
        ...hideLineLabels,
      },
    ],
  };
}

/** A barra mais alta de Lt/ton ocupa esta fração do gráfico; Litros/Hrs segue até perto do topo. */
const LT_TON_ALTURA = 0.58;

function isEixoLtTon(title?: string) {
  return (title ?? "").toLowerCase().includes("ton");
}

function valoresDoEixo(spec: ChartSpec, axisId: string) {
  const values: number[] = [];
  for (const dataset of spec.datasets) {
    if ((dataset.yAxisID ?? "y") !== axisId) continue;
    for (const value of dataset.data) {
      if (typeof value === "number" && Number.isFinite(value)) values.push(value);
    }
  }
  return values;
}

function maxEixoLtTon(spec: ChartSpec, axisId: string) {
  const peak = Math.max(0, ...valoresDoEixo(spec, axisId));
  return peak > 0 ? peak / LT_TON_ALTURA : undefined;
}

function maxEixo(spec: ChartSpec, axisId: string) {
  const peak = Math.max(0, ...valoresDoEixo(spec, axisId));
  return peak > 0 ? peak * 1.22 : undefined;
}

function ConsumoChart({ kind, linhas }: { kind: GrupoKind; linhas: IndicadoresProducaoLinha[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const spec = useMemo(() => chartSpec(kind, linhas), [kind, linhas]);
  const maxY = isEixoLtTon(spec.yTitle) ? maxEixoLtTon(spec, "y") : maxEixo(spec, "y");
  const maxY1 = spec.y1Title ? (isEixoLtTon(spec.y1Title) ? maxEixoLtTon(spec, "y1") : maxEixo(spec, "y1")) : undefined;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !spec.labels.length) return;
    ChartJS.getChart(canvas)?.destroy();

    const options: ChartOptions<"bar"> = {
      responsive: true,
      maintainAspectRatio: false,
      clip: false,
      interaction: { mode: "index", intersect: false },
      layout: { padding: { top: 22, right: 6, left: 4 } },
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            boxWidth: 12,
            boxHeight: 12,
            font: { size: 11 },
            color: "#1a241c",
            padding: 12,
          },
        },
        tooltip: {
          callbacks: {
            label(ctx) {
              const v = ctx.parsed.y;
              if (v == null || !Number.isFinite(v)) return `${ctx.dataset.label}: —`;
              return `${ctx.dataset.label}: ${fmt2(v)}`;
            },
            afterBody(items) {
              const index = items[0]?.dataIndex;
              const row = index == null ? undefined : linhas[index];
              if (!row || !items.some((item) => (item.dataset.label ?? "").toLowerCase().includes("ton"))) return [];
              const litros = row.litrosCombustivel;
              const toneladas = row.toneladaColhida;
              return [
                `Litros: ${fmt2(litros)} L`,
                `Toneladas: ${fmt2(toneladas)} t`,
                toneladas > 0
                  ? `${fmt2(litros)} ÷ ${fmt2(toneladas)} = ${fmt2(row.ltTon)} Lt/ton`
                  : "Sem toneladas para calcular o Lt/ton.",
              ];
            },
          },
        },
        datalabels: {
          display: (ctx) => ctx.dataset.type !== "line",
          color: "#1a241c",
          font: { weight: "bold", size: 10 },
          anchor: "end",
          align: "end",
          offset: 2,
          clamp: false,
          clip: false,
          formatter: (v: number | null) => (v == null || !Number.isFinite(v) ? "" : fmt2(v)),
        },
      },
      scales: {
        x: {
          ticks: {
            color: "#1a241c",
            font: { size: 11, weight: 600 },
            autoSkip: false,
            maxRotation: 0,
            minRotation: 0,
          },
          grid: { display: false },
        },
        y: {
          position: "left",
          title: { display: true, text: spec.yTitle, color: "#64748b", font: { size: 11 } },
          ticks: { color: "#5a6b7d" },
          grid: { color: "rgba(0,0,0,0.08)" },
          beginAtZero: true,
          ...(maxY != null ? { max: maxY } : { grace: "22%" }),
        },
        ...(spec.y1Title
          ? {
              y1: {
                position: "right" as const,
                title: { display: true, text: spec.y1Title, color: "#64748b", font: { size: 11 } },
                ticks: { color: "#5a6b7d" },
                grid: { drawOnChartArea: false },
                beginAtZero: true,
                ...(maxY1 != null ? { max: maxY1 } : { grace: "22%" }),
              },
            }
          : {}),
      },
    };

    const chart = new ChartJS(canvas, {
      type: "bar",
      data: { labels: spec.labels, datasets: spec.datasets },
      options,
    });
    return () => chart.destroy();
  }, [spec, maxY, maxY1, linhas]);

  if (!linhas.length) {
    return <p className="consumo-chart-empty">Nenhum equipamento associado no período.</p>;
  }

  return (
    <div className="consumo-chart-wrap">
      <div className="consumo-chart-canvas" style={{ minWidth: spec.labels.length * 80 }}>
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}

function money2(n: number) {
  return Math.round((n || 0) * 100) / 100;
}

function totaisDasLinhas(kind: GrupoKind, linhas: IndicadoresProducaoLinha[]): IndicadoresProducaoLinha | null {
  if (!linhas.length) return null;
  const toneladas = linhas.reduce((acc, row) => acc + row.toneladaColhida, 0);
  const litros = linhas.reduce((acc, row) => acc + row.litrosCombustivel, 0);
  const valor = linhas.reduce((acc, row) => acc + (row.custoCombustivel ?? 0), 0);
  const horas = linhas.reduce((acc, row) => acc + row.hrsMotor, 0);
  const km = linhas.reduce((acc, row) => acc + (row.kmRodados ?? 0), 0);
  return {
    equipTag: "Total",
    codEquipamento: 0,
    toneladaColhida: money2(toneladas),
    litrosCombustivel: money2(litros),
    hrsMotor: money2(horas),
    hrsElevador: null,
    kmRodados: kind === "caminhao" ? money2(km) : null,
    ltTon: toneladas > 0 ? money2(litros / toneladas) : null,
    ltHr: null,
    tonHrMotor: null,
    tonHrElevador: null,
    tonDia: null,
    kmLt: null,
    tonViagem: null,
    mediaDiaria: null,
    custoCombustivel: money2(valor),
    rsTon: toneladas > 0 ? money2(valor / toneladas) : null,
    parado: false,
    viagens: null,
  };
}

function ConsumoGrupo({
  title,
  kind,
  linhas,
  totais,
  dias,
}: {
  title: string;
  kind: GrupoKind;
  linhas: IndicadoresProducaoLinha[];
  totais: IndicadoresProducaoLinha | null;
  dias: number;
}) {
  const chartRef = useRef<HTMLElement>(null);
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const opcoes = useMemo(
    () =>
      linhas
        .map((row) => ({ codEquipamento: row.codEquipamento, label: labelEquipamento(row) }))
        .sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { numeric: true })),
    [linhas],
  );
  useEffect(() => {
    setSelected((prev) => {
      if (!prev.size) return prev;
      const validos = new Set(linhas.map((row) => row.codEquipamento));
      const next = new Set([...prev].filter((cod) => validos.has(cod)));
      if (next.size === prev.size) return prev;
      return !next.size || next.size === validos.size ? new Set() : next;
    });
  }, [linhas]);
  const visiveis = useMemo(() => {
    if (!selected.size) return linhas;
    return linhas.filter((row) => selected.has(row.codEquipamento));
  }, [linhas, selected]);
  const totaisVisiveis = selected.size ? totaisDasLinhas(kind, visiveis) : totais;
  const tonDia = resumoTonMaquinaDia(kind, visiveis, totaisVisiveis, dias);
  const kpis = [
    {
      value: tonDia.valor,
      label: "Ton/ Máquina dia",
      integer: false,
      tip:
        tonDia.toneladas > 0 || tonDia.maquinas > 0
          ? {
              linhas: [
                `Toneladas colhidas: ${fmt2(tonDia.toneladas)} t`,
                `${kind === "caminhao" ? "Caminhões com tonelada de cana" : "Máquinas com horas motor"}: ${fmt0(tonDia.maquinas)}`,
                `Dias do período: ${fmt0(tonDia.dias)}`,
                tonDia.valor != null
                  ? `${fmt2(tonDia.toneladas)} ÷ ${fmt0(tonDia.dias)} ÷ ${fmt0(tonDia.maquinas)} = ${fmt2(tonDia.valor)} t/máquina/dia`
                  : `Sem ${tonDia.criterio} suficientes para calcular.`,
              ],
            }
          : null,
    },
    {
      value: kind === "caminhao" ? totaisVisiveis?.kmRodados ?? null : totaisVisiveis?.hrsMotor ?? null,
      label: kind === "caminhao" ? "Quilômetros rodados" : "Horas rodada",
      integer: true,
      tip: null,
    },
    {
      value: totaisVisiveis?.ltTon ?? null,
      label: "Lt/ ton",
      integer: false,
      tip: totaisVisiveis
        ? {
            linhas: [
              `Litros: ${fmt2(totaisVisiveis.litrosCombustivel)} L`,
              `Toneladas: ${fmt2(totaisVisiveis.toneladaColhida)} t`,
              totaisVisiveis.toneladaColhida > 0
                ? `${fmt2(totaisVisiveis.litrosCombustivel)} ÷ ${fmt2(totaisVisiveis.toneladaColhida)} = ${fmt2(totaisVisiveis.ltTon)} Lt/ton`
                : "Sem toneladas para calcular o Lt/ton.",
            ],
          }
        : null,
    },
    { value: totaisVisiveis?.rsTon ?? null, label: "R$/ ton", integer: false, tip: null },
  ];

  return (
    <section className="consumo-grupo">
      <header className="consumo-grupo-head">
        <div className="consumo-equip-filter no-print">
          <QualidadeEquipamentoFilter opcoes={opcoes} selected={selected} onChange={setSelected} />
        </div>
        <h4>{title}</h4>
        <CopyVisualButton targetRef={chartRef} />
      </header>
      <div className="consumo-grupo-body">
        <CopyableKpis className="consumo-kpi-grid" title={title}>
          {kpis.map((kpi) => (
            <article key={kpi.label} className={`consumo-kpi-card${kpi.tip ? " is-tip" : ""}`}>
              <strong>{kpi.integer ? fmt0(kpi.value) : fmt2(kpi.value)}</strong>
              <span>{kpi.label}</span>
              {kpi.tip ? (
                <div className="consumo-kpi-tip no-print" role="tooltip">
                  {kpi.tip.linhas.map((linha) => (
                    <p key={linha}>{linha}</p>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
        </CopyableKpis>
        <article ref={chartRef} className="consumo-chart-copy" data-copy-title={title}>
          <ConsumoChart kind={kind} linhas={visiveis} />
        </article>
      </div>
    </section>
  );
}

export function ConsumoCombustivelSection({ data }: { data: IndicadoresColheitaProducaoData }) {
  const dias = Math.max(1, data.filtros.dias || 1);
  return (
    <div className="consumo-dash">
      <ConsumoGrupo
        title="COLHEDEIRA DE CANA"
        kind="colhedora"
        linhas={data.tabelas.colhedora.linhas}
        totais={data.tabelas.colhedora.totais}
        dias={dias}
      />
      <ConsumoGrupo
        title="TRATORES DE TRANSBORDOS"
        kind="trator"
        linhas={data.tabelas.trator.linhas}
        totais={data.tabelas.trator.totais}
        dias={dias}
      />
      <ConsumoGrupo
        title="CAMINHÕES CANAVIEIROS"
        kind="caminhao"
        linhas={data.tabelas.caminhao.linhas}
        totais={data.tabelas.caminhao.totais}
        dias={dias}
      />
    </div>
  );
}
