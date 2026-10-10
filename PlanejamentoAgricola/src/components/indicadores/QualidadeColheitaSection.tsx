import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  DoughnutController,
  Legend,
  LinearScale,
  Tooltip,
} from "chart.js";
import ChartDataLabels from "chartjs-plugin-datalabels";
import { useEffect, useMemo, useRef } from "react";
import type {
  IndicadoresColheitaQualidadeData,
  IndicadoresColheitaQualidadeOperadorLinha,
} from "../../api";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  BarController,
  ArcElement,
  DoughnutController,
  Tooltip,
  Legend,
  ChartDataLabels,
);

const PERDA_BAR = "rgba(43, 125, 216, 0.88)";
const IMPUREZA_BAR = "rgba(43, 125, 216, 0.88)";
const DONUT_COLORS = ["#1a5f2a", "#c9a227", "#3b82f6", "#1e3a5f", "#22c55e", "#ef4444", "#a855f7", "#f59e0b"];

const legendGap = {
  id: "qualidadeLegendGap",
  beforeInit(chart: ChartJS) {
    const legend = chart.legend;
    if (!legend) return;
    const fit = legend.fit;
    legend.fit = function fitWithGap() {
      fit.bind(this)();
      if (this.options?.position === "right" || this.options?.position === "left") {
        this.width += 28;
      } else {
        this.height += 36;
      }
    };
  },
};

function fmtPct(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}%`;
}

function fmtNum(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function fmtNum4(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(n);
}

function fmtDateInput(iso: string) {
  return iso || "";
}

function firstTwoNames(raw: string) {
  const cleaned = raw.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
  const parts = cleaned.split(" ").filter(Boolean);
  if (!parts.length) return "Operador";
  return parts.slice(0, 2).join(" ");
}

function agruparOperadoresPorEquipamento(rows: IndicadoresColheitaQualidadeOperadorLinha[]) {
  const grupos = new Map<string, { nome: string; pct: number }[]>();
  for (const row of rows) {
    const nome = firstTwoNames(row.label || "");
    const equipamentos = row.equipamentos?.length
      ? row.equipamentos
      : [{ label: "Sem equipamento", pctPerda: row.pctPerda }];
    for (const equipamento of equipamentos) {
      const chave = equipamento.label?.trim() || "Sem equipamento";
      const lista = grupos.get(chave) ?? [];
      lista.push({ nome, pct: equipamento.pctPerda ?? 0 });
      grupos.set(chave, lista);
    }
  }
  return [...grupos.entries()]
    .map(([equipamento, operadores]) => ({
      equipamento,
      operadores: operadores.sort((a, b) => b.pct - a.pct || a.nome.localeCompare(b.nome, "pt-BR")),
    }))
    .sort((a, b) => a.equipamento.localeCompare(b.equipamento, "pt-BR", { numeric: true }));
}

function PerdasPorOperadorChart({ rows }: { rows: IndicadoresColheitaQualidadeOperadorLinha[] }) {
  const grupos = useMemo(() => agruparOperadoresPorEquipamento(rows), [rows]);
  const maior = Math.max(1, ...grupos.flatMap((grupo) => grupo.operadores.map((op) => op.pct)));
  const escala = maior * 1.18;
  return (
    <div className="qualidade-dash-card qualidade-dash-card--operador">
      <h4>Perdas por operador</h4>
      {grupos.length ? (
        <div className="qualidade-op-grupos">
          {grupos.map((grupo) => (
            <section key={grupo.equipamento} className="qualidade-op-grupo">
              <h5>{grupo.equipamento}</h5>
              {grupo.operadores.map((op) => (
                <div key={`${grupo.equipamento}-${op.nome}`} className="qualidade-op-row">
                  <span className="qualidade-op-nome">{op.nome}</span>
                  <div className="qualidade-op-track">
                    <div className="qualidade-op-bar" style={{ width: `${Math.min(100, (op.pct / escala) * 100)}%` }} />
                  </div>
                  <span className="qualidade-op-valor">{fmtNum(op.pct)}%</span>
                </div>
              ))}
            </section>
          ))}
        </div>
      ) : (
        <p className="qualidade-dash-empty">Sem dados no período.</p>
      )}
    </div>
  );
}

function HorizontalBarChart({
  title,
  labels,
  values,
  suffix = "%",
  barColor = PERDA_BAR,
  embedded = false,
}: {
  title: string;
  labels: string[];
  values: number[];
  suffix?: string;
  barColor?: string;
  embedded?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hasAnyValue = values.some((v) => Number.isFinite(v) && v > 0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !labels.length || !hasAnyValue) return;
    ChartJS.getChart(canvas)?.destroy();
    const chart = new ChartJS(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [{ data: values, backgroundColor: barColor, borderRadius: 3 }],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { right: 48 } },
        plugins: {
          legend: { display: false },
          datalabels: {
            clip: false,
            anchor: "end",
            align: "end",
            color: "#1a241c",
            font: { weight: "bold", size: 11 },
            formatter: (v: number) => `${fmtNum(v)}${suffix}`,
          },
        },
        scales: {
          x: {
            grace: "18%",
            ticks: { color: "#5a6b7d" },
            grid: { color: "rgba(0,0,0,0.06)" },
          },
          y: {
            ticks: { color: "#1a241c", font: { size: 11 }, autoSkip: false, crossAlign: "far" },
            afterFit(axis) {
              axis.width = Math.max(axis.width, 160);
            },
            grid: { display: false },
          },
        },
      },
    });
    return () => chart.destroy();
  }, [labels, values, suffix, barColor, hasAnyValue]);

  const canvas = (
    <div className="qualidade-dash-canvas" style={{ height: Math.max(220, labels.length * 36) }}>
      {labels.length && hasAnyValue ? (
        <canvas ref={canvasRef} />
      ) : (
        <p className="qualidade-dash-empty">Sem dados no período.</p>
      )}
    </div>
  );
  if (embedded) return canvas;
  return (
    <div className="qualidade-dash-card">
      <h4>{title}</h4>
      {canvas}
    </div>
  );
}

function VerticalBarChart({ title, labels, values }: { title: string; labels: string[]; values: number[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hasAnyValue = values.some((v) => Number.isFinite(v) && v > 0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !labels.length || !hasAnyValue) return;
    ChartJS.getChart(canvas)?.destroy();
    const chart = new ChartJS(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [{ data: values, backgroundColor: PERDA_BAR, borderRadius: 3 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          datalabels: {
            anchor: "end",
            align: "end",
            color: "#1a241c",
            font: { weight: "bold", size: 10 },
            formatter: (v: number) => fmtPct(v),
          },
        },
        scales: {
          x: { ticks: { color: "#1a241c", maxRotation: 45, minRotation: 45 }, grid: { display: false } },
          y: { ticks: { color: "#5a6b7d" }, grid: { color: "rgba(0,0,0,0.06)" } },
        },
      },
    });
    return () => chart.destroy();
  }, [labels, values, hasAnyValue]);

  return (
    <div className="qualidade-dash-card">
      <h4>{title}</h4>
      <div className="qualidade-dash-canvas qualidade-dash-canvas--tall">
        {labels.length && hasAnyValue ? (
          <canvas ref={canvasRef} />
        ) : (
          <p className="qualidade-dash-empty">Sem dados no período.</p>
        )}
      </div>
    </div>
  );
}

function TipoPerdaDonut({ items }: { items: IndicadoresColheitaQualidadeData["porTipoPerda"] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labels = items.map((row) => row.label);
  const values = items.map((row) => row.pctPerda ?? 0);
  const hasAnyValue = values.some((v) => Number.isFinite(v) && v > 0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !labels.length || !hasAnyValue) return;
    ChartJS.getChart(canvas)?.destroy();
    const chart = new ChartJS(canvas, {
      type: "doughnut",
      plugins: [legendGap],
      data: {
        labels,
        datasets: [
          {
            data: values,
            backgroundColor: labels.map((_, i) => DONUT_COLORS[i % DONUT_COLORS.length]),
            borderWidth: 1,
            borderColor: "#fff",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "52%",
        plugins: {
          legend: {
            position: "right",
            labels: { color: "#1a241c", boxWidth: 12, font: { size: 11 }, padding: 14 },
          },
          datalabels: {
            color: "#fff",
            font: { weight: "bold", size: 10 },
            formatter: (v: number) => (v >= 4 ? `${fmtNum(v)}%` : ""),
          },
        },
      },
    });
    return () => chart.destroy();
  }, [labels, values, hasAnyValue]);

  return (
    <div className="qualidade-dash-card">
      <h4>Tipo de perda</h4>
      <div className="qualidade-dash-canvas qualidade-dash-canvas--donut">
        {labels.length && hasAnyValue ? (
          <canvas ref={canvasRef} />
        ) : (
          <p className="qualidade-dash-empty">Sem dados no período.</p>
        )}
      </div>
    </div>
  );
}

function FazendaPerdaVisual({
  rows,
  totais,
}: {
  rows: IndicadoresColheitaQualidadeData["porFazenda"];
  totais: IndicadoresColheitaQualidadeData["resumo"];
}) {
  const fazendas = useMemo(
    () => [...rows].sort((a, b) => (b.pctPerda ?? 0) - (a.pctPerda ?? 0)),
    [rows],
  );

  return (
    <div className="qualidade-dash-card qualidade-dash-card--fazenda">
      <h4>Perda na colheita — fazenda</h4>
      <div className="table-wrap qualidade-fazenda-table-wrap">
        <table className="data qualidade-fazenda-table">
          <thead>
            <tr>
              <th>DESCRIÇÃO</th>
              <th className="num">Perdas/Amostra<br />(Ton/ha)</th>
              <th className="num">%Perdas</th>
            </tr>
          </thead>
          <tbody>
            {fazendas.map((row) => (
              <tr key={row.label}>
                <td className="qualidade-fazenda-desc">{row.label}</td>
                <td className="num">{fmtNum4(row.tonHaPerda)}</td>
                <td className="num">{fmtPct(row.pctPerda)}</td>
              </tr>
            ))}
            {fazendas.length ? (
              <tr className="qualidade-fazenda-total">
                <td>
                  <strong>Total</strong>
                </td>
                <td className="num">
                  <strong>{fmtNum4(totais.tonHaPerda)}</strong>
                </td>
                <td className="num">
                  <strong>{fmtPct(totais.pctPerda)}</strong>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function QualidadeColheitaSection({
  data,
  dataInicio,
  dataFim,
  equipamentoLabel = "COLHEDORA DE CANA",
}: {
  data: IndicadoresColheitaQualidadeData;
  dataInicio?: string;
  dataFim?: string;
  equipamentoLabel?: string;
}) {
  const timeline = useMemo(
    () => ({
      labels: data.linhaTempo.map((row) => row.label),
      values: data.linhaTempo.map((row) => row.pctPerda ?? 0),
    }),
    [data.linhaTempo],
  );

  const equipamento = useMemo(
    () => ({
      labels: data.porEquipamento.map((row) => row.label),
      values: data.porEquipamento.map((row) => row.pctPerda ?? 0),
    }),
    [data.porEquipamento],
  );

  const impureza = useMemo(
    () => ({
      labels: (data.impurezaPorEquipamento ?? []).map((row) => row.label),
      values: (data.impurezaPorEquipamento ?? []).map((row) => row.impurezaMineral ?? 0),
    }),
    [data.impurezaPorEquipamento],
  );

  return (
    <section className="qualidade-dashboard">
      <header className="qualidade-dashboard-header">
        <img src="/elejota-agro-logo.png" alt="Elejota Agro" className="qualidade-dashboard-logo" />
        <div className="qualidade-dashboard-filters">
          <label>
            <strong>TIPO EQUIPAMENTO:</strong>
            <span className="qualidade-fake-select">{equipamentoLabel}</span>
          </label>
          <label>
            <strong>DATA:</strong>
            <input type="date" value={fmtDateInput(dataInicio ?? "")} readOnly />
          </label>
          <input type="date" value={fmtDateInput(dataFim ?? "")} readOnly />
        </div>
      </header>

      <div className="qualidade-dashboard-grid">
        <VerticalBarChart title="Perda na colheita — linha do tempo" labels={timeline.labels} values={timeline.values} />
        <HorizontalBarChart
          title="Perda na colheita — equipamento"
          labels={equipamento.labels}
          values={equipamento.values}
        />
        <TipoPerdaDonut items={data.porTipoPerda} />
        <PerdasPorOperadorChart rows={data.porOperador} />
        <HorizontalBarChart
          title="Impureza mineral — equipamento"
          labels={impureza.labels}
          values={impureza.values}
          barColor={IMPUREZA_BAR}
        />
        <div className="qualidade-dashboard-side">
          <div className="qualidade-kpi-card">
            <span>Impureza mineral</span>
            <strong>{fmtPct(data.resumo.impurezaMineral)}</strong>
          </div>
          <div className="qualidade-kpi-card">
            <span>% Perda</span>
            <strong>{fmtPct(data.resumo.pctPerda)}</strong>
          </div>
        </div>
        <FazendaPerdaVisual rows={data.porFazenda} totais={data.resumo} />
      </div>
    </section>
  );
}
