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
import { useEffect, useMemo, useRef, useState } from "react";
import { imprimirQualidadeColheita } from "../../lib/imprimir-qualidade-colheita";
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

function agruparOperadoresPorEquipamento(rows: IndicadoresColheitaQualidadeOperadorLinha[]) {
  const grupos = new Map<string, { nome: string; pct: number }[]>();
  for (const row of rows) {
    const nome = row.label?.trim() || "Sem operador";
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
  return (
    <div className="qualidade-dash-card qualidade-dash-card--operador">
      <h4>Perdas por operador</h4>
      {grupos.length ? (
        <div className="qualidade-op-table-wrap">
          <table className="qualidade-op-table">
            <thead>
              <tr><th>Operador</th><th className="num">Perda</th></tr>
            </thead>
            <tbody>
              {grupos.flatMap((grupo) => [
                <tr key={`${grupo.equipamento}-titulo`} className="qualidade-op-table-group">
                  <td colSpan={2}>Máquina {grupo.equipamento}</td>
                </tr>,
                ...grupo.operadores.map((op) => (
                  <tr key={`${grupo.equipamento}-${op.nome}`}>
                    <td>{op.nome}</td>
                    <td className="num">{fmtNum(op.pct)}%</td>
                  </tr>
                )),
              ])}
            </tbody>
          </table>
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
  tiposEquipamento = [],
  codTipoEquipamento = 81,
  onTipoEquipamentoChange,
  filtroDisabled = false,
}: {
  data: IndicadoresColheitaQualidadeData;
  dataInicio?: string;
  dataFim?: string;
  equipamentoLabel?: string;
  tiposEquipamento?: { codTipoEquipamento: number; label: string }[];
  codTipoEquipamento?: number;
  onTipoEquipamentoChange?: (cod: number) => void;
  filtroDisabled?: boolean;
}) {
  const dashboardRef = useRef<HTMLElement>(null);
  const [gerandoPdf, setGerandoPdf] = useState(false);
  const [erroPdf, setErroPdf] = useState("");

  async function gerarPdf() {
    if (!dashboardRef.current || gerandoPdf) return;
    setGerandoPdf(true);
    setErroPdf("");
    try {
      await imprimirQualidadeColheita(dashboardRef.current);
    } catch {
      setErroPdf("Não foi possível gerar o PDF. Tente novamente.");
    } finally {
      setGerandoPdf(false);
    }
  }

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
    <section className="qualidade-dashboard" ref={dashboardRef}>
      <div className="no-print" style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginBottom: 8 }}>
        {erroPdf && <span role="alert">{erroPdf}</span>}
        <button type="button" className="btn" onClick={gerarPdf} disabled={gerandoPdf || filtroDisabled}>
          {gerandoPdf ? "Preparando PDF…" : "Gerar PDF"}
        </button>
      </div>
      <header className="qualidade-dashboard-header">
        <img src="/elejota-agro-logo.png" alt="Elejota Agro" className="qualidade-dashboard-logo" />
        <div className="qualidade-dashboard-filters">
          <label>
            <strong>TIPO EQUIPAMENTO:</strong>
            {onTipoEquipamentoChange ? (
              <select
                aria-label="Tipo de equipamento"
                className="qualidade-tipo-select"
                value={codTipoEquipamento}
                onChange={(event) => onTipoEquipamentoChange(Number(event.target.value))}
                disabled={filtroDisabled}
              >
                {!tiposEquipamento.some((tipo) => tipo.codTipoEquipamento === codTipoEquipamento) && (
                  <option value={codTipoEquipamento}>{equipamentoLabel}</option>
                )}
                {tiposEquipamento.map((tipo) => (
                  <option key={tipo.codTipoEquipamento} value={tipo.codTipoEquipamento}>{tipo.label}</option>
                ))}
              </select>
            ) : <span className="qualidade-fake-select">{equipamentoLabel}</span>}
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
