import {
  ArcElement,
  CategoryScale,
  Chart as ChartJS,
  DoughnutController,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from "chart.js";
import ChartDataLabels from "chartjs-plugin-datalabels";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, type IndicadoresColheitaProducaoData, type IndicadoresProducaoLinha } from "../../api";
import { CopyableKpis, CopyableVisual } from "../CopyVisualButton";
import { ComparativoDisponibilidadeMensalChart } from "./ComparativoDisponibilidadeMensal";
import { HorasTrabalhadasParadasBoard } from "./HorasTrabalhadasParadasBoard";
import { IndicadorCttBoard } from "./IndicadorCttBoard";
import { TabelaCaminhao, TabelaColhedora, TabelaTrator } from "./ColheitaProducaoTabelas";
import type { ComparativoDisponibilidadeMensal } from "../../lib/comparativo-disponibilidade";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  LineController,
  ArcElement,
  DoughnutController,
  Tooltip,
  Legend,
  ChartDataLabels,
);

function fmt2(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function fmt0(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(n);
}

function fmtRotuloGrafico(n: number) {
  if (!Number.isFinite(n)) return "";
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: n >= 100 ? 0 : 1,
  }).format(n);
}

function fmtMinutosRelogio(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n) || n < 0) return "";
  const total = Math.round(n);
  const h = Math.floor(total / 60);
  const m = String(total % 60).padStart(2, "0");
  return `${h}:${m}`;
}

function tempoPatioMedio(row: { tempoPatioMinutos?: number; tempoPatioQtd?: number }) {
  const qtd = row.tempoPatioQtd ?? 0;
  const minutos = row.tempoPatioMinutos ?? 0;
  if (!(qtd > 0) || !(minutos > 0)) return null;
  return minutos / qtd;
}

function fmtPeriodo(from?: string | null, to?: string | null) {
  if (!from && !to) return "—";
  const fmt = (value: string) => {
    const date = new Date(`${value}T12:00:00`);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("pt-BR");
  };
  if (from && to) return `${fmt(from)} a ${fmt(to)}`;
  return fmt(from || to || "");
}

function mesNome(iso?: string | null) {
  if (!iso) return "";
  const date = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("pt-BR", { month: "long" });
}

function mesChave(iso: string) {
  return iso.slice(0, 7);
}

const STORAGE_METAS_DIARIAS = "colheita-meta-diaria-por-mes";

function readMetasDiarias() {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_METAS_DIARIAS) || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([mes, valor]) => /^\d{4}-\d{2}$/.test(mes) && typeof valor === "string",
      ),
    ) as Record<string, string>;
  } catch {
    return {};
  }
}

function cadaDia(inicio: string, fim: string) {
  const dias: string[] = [];
  const cursor = new Date(`${inicio}T12:00:00`);
  const end = new Date(`${fim}T12:00:00`);
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(end.getTime()) || cursor > end) return dias;
  while (cursor <= end) {
    const mes = String(cursor.getMonth() + 1).padStart(2, "0");
    const dia = String(cursor.getDate()).padStart(2, "0");
    dias.push(`${cursor.getFullYear()}-${mes}-${dia}`);
    cursor.setDate(cursor.getDate() + 1);
  }
  return dias;
}

function serieVazia(data: string): SerieDia {
  return {
    data,
    toneladas: 0,
    viagens: 0,
    horasTratorA: 0,
    horasTratorB: 0,
    horasTratorC: 0,
    tempoPatioMinutos: 0,
    tempoPatioQtd: 0,
  };
}

function agruparPorSemana(rows: SerieDia[]) {
  const weeks = new Map<string, SerieDia>();
  for (const row of rows) {
    const key = isoWeek(row.data);
    const acc = weeks.get(key) ?? serieVazia(key);
    acc.toneladas += row.toneladas;
    acc.viagens += row.viagens;
    acc.horasTratorA += row.horasTratorA;
    acc.horasTratorB += row.horasTratorB;
    acc.horasTratorC += row.horasTratorC;
    acc.tempoPatioMinutos += row.tempoPatioMinutos;
    acc.tempoPatioQtd += row.tempoPatioQtd;
    weeks.set(key, acc);
  }
  return [...weeks.values()];
}

function isoWeek(iso: string) {
  const date = new Date(`${iso}T12:00:00`);
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

type SerieDia = {
  data: string;
  toneladas: number;
  viagens: number;
  horasTratorA: number;
  horasTratorB: number;
  horasTratorC: number;
  tempoPatioMinutos: number;
  tempoPatioQtd: number;
};

type LineSeries = {
  label: string;
  color: string;
  values: Array<number | null>;
  pointRadius?: number;
  yAxisID?: "y" | "y1";
  format?: "number" | "time";
};

function filtrarLinhas(linhas: IndicadoresProducaoLinha[], tag: string) {
  if (!tag) return linhas;
  return linhas.filter((row) => row.equipTag === tag);
}

function qtdMaquinasComElevador(linhas: IndicadoresProducaoLinha[]) {
  return linhas.filter((row) => (row.hrsElevador ?? 0) > 0).length;
}

function tonDiaTotalColhedora(ton: number, dias: number, linhas: IndicadoresProducaoLinha[]) {
  if (!(dias > 0)) return null;
  const maquinas = qtdMaquinasComElevador(linhas);
  return maquinas > 0 ? ton / dias / maquinas : ton / dias;
}

function LineChart({
  labels,
  series,
  ySuggestedMax,
}: {
  labels: string[];
  series: LineSeries[];
  ySuggestedMax?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hasY1 = series.some((item) => item.yAxisID === "y1");
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !labels.length) return;
    ChartJS.getChart(canvas)?.destroy();
    const chart = new ChartJS(canvas, {
      type: "line",
      data: {
        labels,
        datasets: series.map((item) => ({
          label: item.label,
          data: item.values,
          borderColor: item.color,
          backgroundColor: item.color,
          pointBackgroundColor: item.color,
          pointRadius: item.pointRadius ?? 3,
          pointHoverRadius: 4,
          borderWidth: 2,
          tension: 0,
          yAxisID: item.yAxisID ?? "y",
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 22, right: 8, left: 4, bottom: 4 } },
        plugins: {
          legend: {
            display: series.length > 1,
            position: "right",
            labels: { boxWidth: 10, font: { size: 10 }, color: "#1e3a5f" },
          },
          tooltip: {
            mode: "index",
            intersect: false,
            callbacks: {
              label: (ctx) => {
                const spec = series[ctx.datasetIndex];
                const value = Number(ctx.parsed.y);
                if (!Number.isFinite(value)) return `${ctx.dataset.label}: —`;
                const formatted = spec?.format === "time" ? fmtMinutosRelogio(value) : fmtRotuloGrafico(value);
                return `${ctx.dataset.label}: ${formatted}`;
              },
            },
          },
          datalabels: {
            clip: false,
            clamp: false,
            display: (ctx) => {
              const spec = series[ctx.datasetIndex];
              const label = String(ctx.dataset.label ?? "");
              if (/meta/i.test(label)) return false;
              const value = Number(ctx.dataset.data[ctx.dataIndex] ?? 0);
              if (!Number.isFinite(value) || (spec?.format !== "time" && value === 0 && spec?.yAxisID === "y1")) return false;
              if (spec?.format === "time") return value > 0;
              const valueSeries = series.filter((item) => !/meta/i.test(item.label) && item.format !== "time").length;
              return valueSeries <= 1;
            },
            formatter: (value: number, ctx) => {
              const spec = series[ctx.datasetIndex];
              if (spec?.format === "time") return fmtMinutosRelogio(value);
              return fmtRotuloGrafico(value);
            },
            color: (ctx) => series[ctx.datasetIndex]?.color || "#0c2a4d",
            font: { weight: "bold", size: 10 },
            textStrokeColor: "#ffffff",
            textStrokeWidth: 4,
            anchor: "end",
            align: "top",
            offset: 8,
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: "#5b6b7c", font: { size: 10 }, maxRotation: 0 },
          },
          y: {
            beginAtZero: true,
            suggestedMax: ySuggestedMax,
            grace: "22%",
            grid: { color: "rgba(15, 40, 80, 0.08)" },
            ticks: { color: "#5b6b7c", font: { size: 10 } },
          },
          ...(hasY1
            ? {
                y1: {
                  position: "right" as const,
                  beginAtZero: true,
                  grace: "22%",
                  grid: { drawOnChartArea: false },
                  ticks: {
                    color: "#c2410c",
                    font: { size: 10 },
                    callback: (value: string | number) => fmtMinutosRelogio(Number(value)),
                  },
                },
              }
            : {}),
        },
      },
    });
    return () => chart.destroy();
  }, [hasY1, labels, series, ySuggestedMax]);
  if (!labels.length) return <p className="lead">Sem dados no recorte.</p>;
  return <canvas ref={canvasRef} />;
}

function TurnoDonut({ a, b, c }: { a: number; b: number; c: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const total = a + b + c;
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !(total > 0)) return;
    ChartJS.getChart(canvas)?.destroy();
    const chart = new ChartJS(canvas, {
      type: "doughnut",
      data: {
        labels: ["TURNO A", "TURNO B", "TURNO C"],
        datasets: [
          {
            data: [a, b, c],
            backgroundColor: ["#2563eb", "#0ea5e9", "#94a3b8"],
            borderWidth: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "62%",
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const value = Number(ctx.raw) || 0;
                const pct = total > 0 ? (value / total) * 100 : 0;
                return `${ctx.label}: ${fmt2(pct)}%`;
              },
            },
          },
        },
      },
    });
    return () => chart.destroy();
  }, [a, b, c, total]);
  if (!(total > 0)) return null;
  return <canvas ref={canvasRef} />;
}

export type DesempenhoView = "producao" | "horas" | "ctt" | "disponibilidade";

export function RelatorioDesempenhoColheita({
  data,
  dataInicio,
  dataFim,
  view,
  onViewChange,
  disponibilidade,
  safraLabel,
}: {
  data: IndicadoresColheitaProducaoData | null;
  dataInicio?: string | null;
  dataFim?: string | null;
  view: DesempenhoView;
  onViewChange: (view: DesempenhoView) => void;
  disponibilidade?: ComparativoDisponibilidadeMensal | null;
  safraLabel?: string | null;
}) {
  const periodoInicio = dataInicio || data?.filtros.dataInicio;
  const periodoFim = dataFim || data?.filtros.dataFim;
  const [previsao, setPrevisao] = useState<number | null>(null);
  const [metasPorMes, setMetasPorMes] = useState<Record<string, number>>({});
  const [metasEditadas, setMetasEditadas] = useState<Record<string, string>>(readMetasDiarias);
  const [equipColhedora, setEquipColhedora] = useState("");
  const [equipTrator, setEquipTrator] = useState("");
  const [equipCaminhao, setEquipCaminhao] = useState("");
  const [granularidade, setGranularidade] = useState<"dia" | "semana">("dia");
  const [mesRef, setMesRef] = useState("");

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_METAS_DIARIAS, JSON.stringify(metasEditadas));
    } catch {}
  }, [metasEditadas]);

  useEffect(() => {
    if (view !== "producao" || !periodoInicio || !periodoFim) return;
    let alive = true;
    api
      .indicadoresColheitaDiaria({ dataInicio: periodoInicio, dataFim: periodoFim, fonte: "colheitadiaria" })
      .then((result) => {
        if (!alive) return;
        const total = result.dados.reduce((acc, row) => acc + (row.previsao ?? 0), 0);
        setPrevisao(total > 0 ? total : null);
        const metas = new Map<string, { total: number; dias: number }>();
        for (const row of result.dados) {
          const cota = row.cotaDiaria ?? 0;
          if (!(cota > 0)) continue;
          const mes = mesChave(row.data);
          const atual = metas.get(mes) ?? { total: 0, dias: 0 };
          atual.total += cota;
          atual.dias += 1;
          metas.set(mes, atual);
        }
        setMetasPorMes(Object.fromEntries([...metas].map(([mes, meta]) => [mes, meta.total / meta.dias])));
      })
      .catch(() => {
        if (alive) {
          setPrevisao(null);
          setMetasPorMes({});
        }
      });
    return () => {
      alive = false;
    };
  }, [periodoInicio, periodoFim, view]);

  const serie = useMemo<SerieDia[]>(() => {
    if (!data) return [];
    if (data.desempenhoDiario?.length) {
      return data.desempenhoDiario.map((row) => ({
        ...row,
        tempoPatioMinutos: row.tempoPatioMinutos ?? 0,
        tempoPatioQtd: row.tempoPatioQtd ?? 0,
      }));
    }
    return (data.disponibilidadeDiaria ?? []).map((row) => ({
      data: row.data,
      toneladas: row.toneladaColhida ?? 0,
      viagens: 0,
      horasTratorA: 0,
      horasTratorB: 0,
      horasTratorC: 0,
      tempoPatioMinutos: 0,
      tempoPatioQtd: 0,
    }));
  }, [data]);

  const meses = useMemo(() => {
    const keys = [...new Set(serie.map((row) => mesChave(row.data)))].sort();
    return keys;
  }, [serie]);

  useEffect(() => {
    if (!meses.length) {
      setMesRef("");
      return;
    }
    if (!mesRef || !meses.includes(mesRef)) setMesRef(meses[meses.length - 1] ?? "");
  }, [meses, mesRef]);

  const serieRecorte = useMemo(() => {
    const base = mesRef ? serie.filter((row) => mesChave(row.data) === mesRef) : serie;
    if (granularidade === "dia") return base;
    return agruparPorSemana(base);
  }, [serie, mesRef, granularidade]);

  const serieToneladas = useMemo(() => {
    const porDia = new Map(serie.map((row) => [row.data, row]));
    const dias = periodoInicio && periodoFim ? cadaDia(periodoInicio, periodoFim) : serie.map((row) => row.data);
    const preenchida = dias.map((data) => porDia.get(data) ?? serieVazia(data));
    return granularidade === "dia" ? preenchida : agruparPorSemana(preenchida);
  }, [serie, periodoInicio, periodoFim, granularidade]);

  const labels = serieRecorte.map((row) =>
    granularidade === "semana" ? row.data.replace("-W", " S") : String(Number(row.data.slice(8, 10))),
  );
  const cruzaMes = new Set(serieToneladas.map((row) => row.data.slice(0, 7))).size > 1;
  const labelsToneladas = serieToneladas.map((row) => {
    if (granularidade === "semana") return row.data.replace("-W", " S");
    const dia = String(Number(row.data.slice(8, 10)));
    return cruzaMes ? `${dia}/${row.data.slice(5, 7)}` : dia;
  });
  const metaEditada = metasEditadas[mesRef];
  const metaInformada = metaEditada?.trim() ? Number(metaEditada) : null;
  const metaDiaria =
    metaInformada != null && Number.isFinite(metaInformada) && metaInformada >= 0
      ? metaInformada
      : metasPorMes[mesRef];
  const metaDoDia = (iso: string) => {
    const mes = mesChave(iso);
    const editada = metasEditadas[mes]?.trim();
    if (editada) {
      const valor = Number(editada);
      if (Number.isFinite(valor) && valor >= 0) return valor;
    }
    return metasPorMes[mes] ?? null;
  };
  const metasToneladas =
    granularidade === "dia"
      ? serieToneladas.map((row) => metaDoDia(row.data))
      : serieToneladas.map(() => metaDiaria ?? null);

  const diasFiltrados = Math.max(1, data?.filtros.dias || 1);
  const diasColheita = Math.max(1, data?.filtros.diasColheitaColhedora || diasFiltrados);
  const tonColhida =
    data?.tabelas.colhedora.totais?.toneladaColhida ??
    data?.tabelas.colhedora.linhas.reduce((acc, row) => acc + (row.toneladaColhida ?? 0), 0) ??
    0;
  const tonDia = tonColhida / diasFiltrados;
  const linhasColhedora = data?.tabelas.colhedora.linhas ?? [];
  const tonMaquinaDia = tonDiaTotalColhedora(tonColhida, diasFiltrados, linhasColhedora);

  const colhedoraLinhas = filtrarLinhas(linhasColhedora, equipColhedora);
  const colhedoraLinhasTabela = colhedoraLinhas.map((row) => ({
    ...row,
    tonDia: row.toneladaColhida / diasFiltrados,
  }));
  const colhedoraTotaisTabela = data?.tabelas.colhedora.totais
    ? {
        ...data.tabelas.colhedora.totais,
        tonDia: tonDiaTotalColhedora(
          data.tabelas.colhedora.totais.toneladaColhida,
          diasFiltrados,
          linhasColhedora,
        ),
      }
    : null;
  const tratorLinhas = filtrarLinhas(data?.tabelas.trator.linhas ?? [], equipTrator);
  const caminhaoLinhas = filtrarLinhas(data?.tabelas.caminhao.linhas ?? [], equipCaminhao);
  const horasA = serieRecorte.reduce((acc, row) => acc + row.horasTratorA, 0);
  const horasB = serieRecorte.reduce((acc, row) => acc + row.horasTratorB, 0);
  const horasC = serieRecorte.reduce((acc, row) => acc + row.horasTratorC, 0);

  return (
    <div className="entrada-cana-wrap">
      <nav className="kind-toggle qualidade-view-toggle no-print entrada-cana-views" aria-label="Visões de desempenho">
        <button type="button" className={`btn${view === "producao" ? " primary" : ""}`} onClick={() => onViewChange("producao")}>
          Entrada de cana máquina
        </button>
        <button type="button" className={`btn${view === "horas" ? " primary" : ""}`} onClick={() => onViewChange("horas")}>
          Horas trabalhadas x horas paradas
        </button>
        <button type="button" className={`btn${view === "ctt" ? " primary" : ""}`} onClick={() => onViewChange("ctt")}>
          Indicador CTT
        </button>
        <button type="button" className={`btn${view === "disponibilidade" ? " primary" : ""}`} onClick={() => onViewChange("disponibilidade")}>
          Disponibilidade mês/safra
        </button>
      </nav>
      {view === "disponibilidade" ? (
        <ComparativoDisponibilidadeMensalChart data={disponibilidade ?? null} safraLabel={safraLabel} />
      ) : !data ? (
        <p className="lead">
          {view === "horas"
            ? "Consulte o período para ver as horas trabalhadas e paradas."
            : view === "ctt"
              ? "Consulte o período para ver o indicador CTT."
              : "Consulte o período para ver a entrada de cana máquina."}
        </p>
      ) : view === "horas" ? (
        <HorasTrabalhadasParadasBoard data={data} dataInicio={periodoInicio} dataFim={periodoFim} />
      ) : view === "ctt" ? (
        <IndicadorCttBoard data={data} />
      ) : (
        <section className="entrada-cana-board">
      <header className="entrada-cana-head">
        <h2>ENTRADA DE CANA MÁQUINA</h2>
        <strong>Período {fmtPeriodo(periodoInicio, periodoFim)}</strong>
      </header>

      <CopyableKpis className="entrada-cana-kpis" title="Indicadores">
        <article>
          <span>Ton. Prevista até {mesNome(periodoFim) || "o período"}</span>
          <strong>{fmt2(previsao)}</strong>
        </article>
        <article>
          <span>Tonelada Colhida</span>
          <strong>{fmt2(tonColhida)}</strong>
        </article>
        <article>
          <span>Tonelada cana / diária</span>
          <strong>{fmt2(tonDia)}</strong>
        </article>
        <article>
          <span>Ton Máquina / Dia</span>
          <strong>{fmt2(tonMaquinaDia)}</strong>
        </article>
        <article>
          <span>Dias de Colheita</span>
          <strong>{fmt0(diasColheita)}</strong>
        </article>
      </CopyableKpis>

      <div className="entrada-cana-grid">
        <CopyableVisual
          className="entrada-cana-panel"
          title="COLHEDEIRA DE CANA"
          controls={
            <select value={equipColhedora} onChange={(e) => setEquipColhedora(e.target.value)}>
              <option value="">todos</option>
              {data.tabelas.colhedora.linhas.map((row) => (
                <option key={row.equipTag} value={row.equipTag}>
                  {row.equipTag}
                </option>
              ))}
            </select>
          }
        >
          <div className="table-wrap">
            {colhedoraLinhasTabela.length ? (
              <TabelaColhedora
                linhas={colhedoraLinhasTabela}
                totais={equipColhedora ? null : colhedoraTotaisTabela}
                rotuloEquip="EQUIP-TAG"
              />
            ) : (
              <p className="lead">Nenhum equipamento associado no período.</p>
            )}
          </div>
        </CopyableVisual>

        <CopyableVisual
          className="entrada-cana-panel"
          title="Tonelada Produzida / Diária"
          controls={
            <>
              <select value={mesRef} onChange={(e) => setMesRef(e.target.value)}>
                {meses.map((mes) => (
                  <option key={mes} value={mes}>
                    {mesNome(`${mes}-01`)}
                  </option>
                ))}
              </select>
              <select value={granularidade} onChange={(e) => setGranularidade(e.target.value as "dia" | "semana")}>
                <option value="dia">diária</option>
                <option value="semana">semanal</option>
              </select>
              <label className="entrada-cana-meta-input">
                Meta
                <input
                  type="number"
                  min={0}
                  step={100}
                  aria-label="Meta diária de toneladas"
                  placeholder="t/dia"
                  value={metaEditada ?? (metasPorMes[mesRef] != null ? String(Math.round(metasPorMes[mesRef])) : "")}
                  onChange={(e) => setMetasEditadas((atual) => ({ ...atual, [mesRef]: e.target.value }))}
                />
              </label>
            </>
          }
        >
          <div className="entrada-cana-chart">
            <LineChart
              labels={labelsToneladas}
              series={[
                { label: "Toneladas", color: "#2563eb", values: serieToneladas.map((row) => row.toneladas) },
                ...(metasToneladas.some((valor) => valor != null)
                  ? [{ label: "Meta diária", color: "#dc2626", values: metasToneladas, pointRadius: 0 }]
                  : []),
              ]}
            />
          </div>
        </CopyableVisual>

        <CopyableVisual
          className="entrada-cana-panel"
          title="TRATORES"
          controls={
            <select value={equipTrator} onChange={(e) => setEquipTrator(e.target.value)}>
              <option value="">todos</option>
              {data.tabelas.trator.linhas.map((row) => (
                <option key={row.equipTag} value={row.equipTag}>
                  {row.equipTag}
                </option>
              ))}
            </select>
          }
        >
          <div className="table-wrap">
            {tratorLinhas.length ? (
              <TabelaTrator
                linhas={tratorLinhas}
                totais={equipTrator ? null : data.tabelas.trator.totais}
                rotuloEquip="EQUIP-TAG"
              />
            ) : (
              <p className="lead">Nenhum equipamento associado no período.</p>
            )}
          </div>
        </CopyableVisual>

        <CopyableVisual
          className="entrada-cana-panel"
          title="Horas Produzidas Tratores"
          controls={
            <select value={granularidade} onChange={(e) => setGranularidade(e.target.value as "dia" | "semana")}>
              <option value="dia">todos</option>
              <option value="semana">semanal</option>
            </select>
          }
        >
          <div className="entrada-cana-chart-split">
            <div className="entrada-cana-chart">
              <LineChart
                labels={labels}
                series={[
                  { label: "TURNO A", color: "#2563eb", values: serieRecorte.map((row) => row.horasTratorA) },
                  { label: "TURNO B", color: "#0ea5e9", values: serieRecorte.map((row) => row.horasTratorB) },
                  { label: "TURNO C", color: "#94a3b8", values: serieRecorte.map((row) => row.horasTratorC) },
                ]}
              />
            </div>
            <div className="entrada-cana-donut">
              <TurnoDonut a={horasA} b={horasB} c={horasC} />
            </div>
          </div>
        </CopyableVisual>

        <CopyableVisual
          className="entrada-cana-panel"
          title="CAMINHÃO"
          controls={
            <select value={equipCaminhao} onChange={(e) => setEquipCaminhao(e.target.value)}>
              <option value="">todos</option>
              {data.tabelas.caminhao.linhas.map((row) => (
                <option key={row.equipTag} value={row.equipTag}>
                  {row.equipTag}
                </option>
              ))}
            </select>
          }
        >
          <div className="table-wrap">
            {caminhaoLinhas.length ? (
              <TabelaCaminhao
                linhas={caminhaoLinhas}
                totais={equipCaminhao ? null : data.tabelas.caminhao.totais}
                rotuloEquip="EQUIP-TAG"
              />
            ) : (
              <p className="lead">Nenhum equipamento associado no período.</p>
            )}
          </div>
        </CopyableVisual>

        <CopyableVisual
          className="entrada-cana-panel"
          title="Quantidade Viagens / Diária"
          controls={
            <select value={granularidade} onChange={(e) => setGranularidade(e.target.value as "dia" | "semana")}>
              <option value="dia">todos</option>
              <option value="semana">semanal</option>
            </select>
          }
        >
          <div className="entrada-cana-chart">
            <LineChart
              labels={labels}
              series={[
                { label: "Viagens", color: "#2563eb", values: serieRecorte.map((row) => row.viagens) },
                {
                  label: "Tempo médio pátio",
                  color: "#ea580c",
                  values: serieRecorte.map((row) => tempoPatioMedio(row)),
                  yAxisID: "y1",
                  format: "time",
                },
              ]}
            />
          </div>
        </CopyableVisual>
      </div>
        </section>
      )}
    </div>
  );
}
