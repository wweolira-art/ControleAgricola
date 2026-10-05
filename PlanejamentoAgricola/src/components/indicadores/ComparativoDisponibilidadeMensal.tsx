import {
  BarController,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip,
} from "chart.js";
import ChartDataLabels from "chartjs-plugin-datalabels";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ComparativoDisponibilidadeMensal } from "../../lib/comparativo-disponibilidade";
import {
  filtrarMesesComparativo,
  montarSeriesComparativo,
  tipoComparativoCurto,
} from "../../lib/comparativo-disponibilidade";
import { readMetaDisponibilidade, readMetaDisponibilidadeTipo } from "../../lib/metas-locais";
import { CopyableVisual } from "../CopyVisualButton";

ChartJS.register(CategoryScale, LinearScale, BarElement, BarController, Tooltip, Legend, ChartDataLabels);

function fmtPct(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "";
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function fmtMeta(n: number) {
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

export function ComparativoDisponibilidadeMensalChart({
  data,
  safraLabel,
}: {
  data: ComparativoDisponibilidadeMensal | null;
  safraLabel?: string | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tiposSelecionados, setTiposSelecionados] = useState<number[]>([81]);
  const [mesesSelecionados, setMesesSelecionados] = useState<string[]>([]);

  useEffect(() => {
    if (!data?.tipos.length) return;
    setTiposSelecionados((atual) => {
      const validos = atual.filter((cod) => data.tipos.some((tipo) => tipo.codTipo === cod));
      if (validos.length) return validos;
      const colhedora = data.tipos.find((tipo) => tipo.codTipo === 81);
      return [colhedora?.codTipo ?? data.tipos[0].codTipo];
    });
  }, [data]);

  useEffect(() => {
    if (!data?.meses.length) return;
    setMesesSelecionados((atual) => {
      const keys = data.meses.map((mes) => mes.key);
      const kept = atual.filter((key) => keys.includes(key));
      return kept.length ? kept : keys;
    });
  }, [data]);

  const tiposAtivos = (data?.tipos ?? []).filter((tipo) => tiposSelecionados.includes(tipo.codTipo));
  const meta = tiposAtivos.length === 1
    ? readMetaDisponibilidadeTipo(tiposAtivos[0].codTipo, data?.meta ?? readMetaDisponibilidade(85))
    : (data?.meta ?? readMetaDisponibilidade(85));
  const tipoNome = tiposAtivos.length === 1
    ? tipoComparativoCurto(tiposAtivos[0].label)
    : tiposAtivos.length
      ? tiposAtivos.map((tipo) => tipoComparativoCurto(tipo.label)).join(", ")
      : "Equipamento";
  const safraTitulo = safraLabel?.replace(/^Safra\s+/i, "") || data?.safraAtual || "";

  const recorte = useMemo(
    () => (data ? filtrarMesesComparativo(data, mesesSelecionados) : null),
    [data, mesesSelecionados],
  );

  const series = useMemo(() => {
    if (!data || !recorte) return [];
    return montarSeriesComparativo({ ...data, meses: recorte.meses, safras: recorte.safras }, tiposSelecionados);
  }, [data, recorte, tiposSelecionados]);

  function toggleTipo(codTipo: number) {
    setTiposSelecionados((atual) => {
      const next = atual.includes(codTipo) ? atual.filter((item) => item !== codTipo) : [...atual, codTipo];
      return (data?.tipos ?? []).map((tipo) => tipo.codTipo).filter((item) => next.includes(item));
    });
  }

  function toggleMes(key: string) {
    setMesesSelecionados((atual) => {
      const next = atual.includes(key) ? atual.filter((item) => item !== key) : [...atual, key];
      return (data?.meses ?? []).map((mes) => mes.key).filter((item) => next.includes(item));
    });
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    ChartJS.getChart(canvas)?.destroy();
    if (!recorte?.meses.length || !series.length) return;
    const instance = new ChartJS(canvas, {
      type: "bar",
      data: {
        labels: recorte.meses.map((m) => m.label),
        datasets: series.map((serie) => ({
          label: serie.label,
          data: serie.values.map((v) => (v == null ? null : v)),
          backgroundColor: serie.color,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 11 }, color: "#0c2a4d" } },
          datalabels: {
            anchor: "end",
            align: "end",
            color: "#0c2a4d",
            font: { size: 10, weight: "bold" },
            formatter: (v: number | null) => (v == null || !Number.isFinite(v) ? "" : fmtPct(v)),
          },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const v = Number(ctx.raw);
                return `${ctx.dataset.label}: ${Number.isFinite(v) ? `${fmtPct(v)}%` : "—"}`;
              },
            },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: "#0c2a4d", font: { size: 10, weight: 700 } } },
          y: {
            beginAtZero: true,
            suggestedMax: 100,
            ticks: { color: "#0c2a4d", callback: (v) => `${v}` },
            grid: { color: "#e2e8f0" },
          },
        },
      },
      plugins: [
        {
          id: "disp-comp-meta-line",
          afterDraw(chart) {
            const yScale = chart.scales.y;
            if (!yScale) return;
            const y = yScale.getPixelForValue(meta);
            const { ctx, chartArea } = chart;
            if (y < chartArea.top || y > chartArea.bottom) return;
            ctx.save();
            ctx.strokeStyle = "#94a3b8";
            ctx.setLineDash([5, 4]);
            ctx.beginPath();
            ctx.moveTo(chartArea.left, y);
            ctx.lineTo(chartArea.right, y);
            ctx.stroke();
            ctx.restore();
          },
        },
      ],
    });
    return () => instance.destroy();
  }, [meta, recorte, series]);

  if (!data) {
    return <p className="lead">Consulte o período para ver o comparativo de disponibilidade.</p>;
  }

  return (
    <CopyableVisual className="disp-comp-board" title={`Disponibilidade ${tipoNome} ao mês`}>
      <header className="disp-comp-head">
        <div>
          <p>Indicadores Safra {safraTitulo}</p>
          <p>Disponibilidade</p>
          <h3>
            {tipoNome} Comparativo Mês/Safras.
          </h3>
        </div>
        <img src="/elejota-agro-logo.png" alt="Elejota Agro" className="disp-comp-logo" />
      </header>
      <div className="disp-comp-toolbar no-print">
        <fieldset className="disp-comp-meses">
          <legend>
            Equipamentos
            <span className="disp-comp-meses-actions">
              <button type="button" onClick={() => setTiposSelecionados(data.tipos.map((tipo) => tipo.codTipo))}>
                Marcar todos
              </button>
              <button type="button" onClick={() => setTiposSelecionados([])}>
                Limpar
              </button>
            </span>
          </legend>
          <div className="disp-comp-meses-grid">
            {data.tipos.map((item) => (
              <label key={item.codTipo} title={item.label}>
                <input
                  type="checkbox"
                  checked={tiposSelecionados.includes(item.codTipo)}
                  onChange={() => toggleTipo(item.codTipo)}
                />
                {item.label}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="disp-comp-meses">
          <legend>
            Meses
            <span className="disp-comp-meses-actions">
              <button type="button" onClick={() => setMesesSelecionados(data.meses.map((mes) => mes.key))}>
                Marcar todos
              </button>
              <button type="button" onClick={() => setMesesSelecionados([])}>
                Limpar
              </button>
            </span>
          </legend>
          <div className="disp-comp-meses-grid">
            {data.meses.map((mes) => (
              <label key={mes.key}>
                <input
                  type="checkbox"
                  checked={mesesSelecionados.includes(mes.key)}
                  onChange={() => toggleMes(mes.key)}
                />
                {mes.label}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      <div className="disp-comp-chart-wrap">
        <h4>DISPONIBILIDADE {tipoNome.toUpperCase()} AO MÊS</h4>
        {recorte?.meses.length && series.length ? (
          <div className="disp-comp-chart-body">
            <canvas ref={canvasRef} />
            <aside className="disp-comp-meta">
              META
              <br />
              &gt;= {fmtMeta(meta)}%
            </aside>
          </div>
        ) : (
          <p className="lead">
            {!series.length
              ? "Selecione ao menos um equipamento para exibir o comparativo."
              : "Selecione ao menos um mês para exibir o comparativo."}
          </p>
        )}
      </div>
    </CopyableVisual>
  );
}
