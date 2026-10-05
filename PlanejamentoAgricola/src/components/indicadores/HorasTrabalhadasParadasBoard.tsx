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
} from "chart.js";
import ChartDataLabels from "chartjs-plugin-datalabels";
import { useEffect, useMemo, useRef, useState } from "react";
import type { IndicadoresColheitaProducaoData } from "../../api";
import { CopyableKpis, CopyableVisual } from "../CopyVisualButton";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  BarController,
  PointElement,
  LineElement,
  LineController,
  Tooltip,
  Legend,
  ChartDataLabels,
);

type HoraDia = NonNullable<IndicadoresColheitaProducaoData["horasOperacaoDiaria"]>[number];
type HoraEquipamento = NonNullable<IndicadoresColheitaProducaoData["horasOperacaoDiariaPorEquipamento"]>[number];

function fmt2(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function fmtPct(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(n)}%`;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function fmtRotulo(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n) || n <= 0) return "";
  const value = round2(n);
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: value >= 100 ? 0 : 1,
    maximumFractionDigits: value >= 100 ? 0 : 1,
  }).format(value);
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

function mesCurto(iso: string) {
  const date = new Date(`${iso.slice(0, 7)}-01T12:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
}

function diaLabel(iso: string) {
  const date = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function parseIso(iso: string) {
  return new Date(`${iso}T12:00:00`);
}

function formatIso(date: Date) {
  const mes = String(date.getMonth() + 1).padStart(2, "0");
  const dia = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${mes}-${dia}`;
}

/** Semana operacional: sexta a quinta. */
function semanaSextaQuinta(iso: string) {
  const date = parseIso(iso);
  const diasDesdeSexta = (date.getDay() + 2) % 7;
  const inicio = new Date(date);
  inicio.setDate(date.getDate() - diasDesdeSexta);
  const fim = new Date(inicio);
  fim.setDate(inicio.getDate() + 6);
  return { inicio: formatIso(inicio), fim: formatIso(fim) };
}

function emptyHora(data: string): HoraDia {
  return {
    data,
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

function somar(rows: HoraDia[], data: string): HoraDia {
  const acc = emptyHora(data);
  for (const row of rows) {
    acc.horasPotenciais += row.horasPotenciais;
    acc.horasDisponiveis += row.horasDisponiveis;
    acc.horasEfetivas += row.horasEfetivas;
    acc.horasOutrasAtividades = (acc.horasOutrasAtividades ?? 0) + (row.horasOutrasAtividades ?? 0);
    acc.horasManutencao += row.horasManutencao;
    acc.horasParada += row.horasParada;
    acc.horasParadaProgramada = (acc.horasParadaProgramada ?? 0) + (row.horasParadaProgramada ?? 0);
    acc.horasSemRegistro += row.horasSemRegistro;
  }
  acc.horasPotenciais = round2(acc.horasPotenciais);
  acc.horasDisponiveis = round2(acc.horasDisponiveis);
  acc.horasEfetivas = round2(acc.horasEfetivas);
  acc.horasOutrasAtividades = round2(acc.horasOutrasAtividades ?? 0);
  acc.horasManutencao = round2(acc.horasManutencao);
  acc.horasParada = round2(acc.horasParada);
  acc.horasParadaProgramada = round2(acc.horasParadaProgramada ?? 0);
  acc.horasSemRegistro = round2(acc.horasSemRegistro);
  acc.eficiencia = acc.horasDisponiveis > 0 ? round2((acc.horasEfetivas / acc.horasDisponiveis) * 100) : null;
  return acc;
}

function agruparMes(rows: HoraDia[]) {
  const map = new Map<string, HoraDia[]>();
  for (const row of rows) {
    const key = row.data.slice(0, 7);
    map.set(key, [...(map.get(key) ?? []), row]);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, items]) => ({ label: mesCurto(key), row: somar(items, key) }));
}

function agruparSemana(rows: HoraDia[], periodoInicio?: string | null, periodoFim?: string | null) {
  const map = new Map<string, HoraDia[]>();
  for (const row of rows) {
    const semana = semanaSextaQuinta(row.data);
    map.set(semana.inicio, [...(map.get(semana.inicio) ?? []), row]);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([inicio, items]) => {
      const fim = semanaSextaQuinta(inicio).fim;
      const from = periodoInicio && periodoInicio > inicio ? periodoInicio : inicio;
      const to = periodoFim && periodoFim < fim ? periodoFim : fim;
      const ordered = items.slice().sort((a, b) => a.data.localeCompare(b.data));
      return { label: `${diaLabel(from)} → ${diaLabel(to)}`, row: somar(ordered, from) };
    });
}

const columnTotalPlugin = {
  id: "columnTotals",
  afterDatasetsDraw(chart: ChartJS) {
    const { ctx } = chart;
    const count = chart.data.labels?.length ?? 0;
    ctx.save();
    ctx.fillStyle = "#12355c";
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    for (let index = 0; index < count; index++) {
      let total = 0;
      let top = Number.POSITIVE_INFINITY;
      let x = 0;
      chart.data.datasets.forEach((dataset, datasetIndex) => {
        const meta = chart.getDatasetMeta(datasetIndex);
        if (meta.hidden || meta.type !== "bar") return;
        const value = Number(dataset.data[index] ?? 0);
        if (!Number.isFinite(value) || value <= 0) return;
        total += value;
        const bar = meta.data[index] as { x?: number; y?: number } | undefined;
        if (bar?.x == null || bar.y == null) return;
        if (bar.y < top) {
          top = bar.y;
          x = bar.x;
        }
      });
      const label = fmtRotulo(total);
      if (!label || !Number.isFinite(top)) continue;
      ctx.fillText(label, x, top - 3);
    }
    ctx.restore();
  },
};

function ComboChart({
  labels,
  disponiveis,
  efetivas,
  outras,
  eficiencia,
}: {
  labels: string[];
  disponiveis: number[];
  efetivas: number[];
  outras: number[];
  eficiencia: Array<number | null>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !labels.length) return;
    ChartJS.getChart(canvas)?.destroy();
    const chart = new ChartJS(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            type: "bar",
            label: "Horas Disponíveis",
            data: disponiveis,
            backgroundColor: "#2563eb",
            yAxisID: "y",
            order: 2,
          },
          {
            type: "bar",
            label: "Horas Efetivas",
            data: efetivas,
            backgroundColor: "#22c55e",
            yAxisID: "y",
            order: 2,
          },
          {
            type: "bar",
            label: "Horas sem produção",
            data: outras,
            backgroundColor: "#0d9488",
            yAxisID: "y",
            order: 2,
          },
          {
            type: "line",
            label: "%Eficiência",
            data: eficiencia.map((n) => n ?? 0),
            borderColor: "#f97316",
            backgroundColor: "#f97316",
            pointRadius: 3,
            yAxisID: "y1",
            order: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 28, right: 8, left: 4, bottom: 4 } },
        plugins: {
          legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 10 }, color: "#1e3a5f" } },
          datalabels: {
            clip: false,
            clamp: false,
            display: (ctx) => {
              const value = Number(ctx.dataset.data[ctx.dataIndex] ?? 0);
              return Number.isFinite(value) && value > 0;
            },
            formatter: (value: number, ctx) => {
              if (ctx.dataset.yAxisID === "y1") return fmtPct(value);
              return fmtRotulo(value);
            },
            color: (ctx) => (ctx.dataset.yAxisID === "y1" ? "#c2410c" : "#12355c"),
            font: { weight: "bold", size: 10 },
            anchor: "end",
            align: "top",
            offset: 2,
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: "#5b6b7c", font: { size: 10 }, maxRotation: 0 } },
          y: {
            beginAtZero: true,
            grace: "18%",
            grid: { color: "rgba(15, 40, 80, 0.08)" },
            ticks: { color: "#5b6b7c", font: { size: 10 } },
          },
          y1: {
            beginAtZero: true,
            max: 100,
            position: "right",
            grid: { drawOnChartArea: false },
            ticks: { color: "#f97316", font: { size: 10 }, callback: (v) => `${v}%` },
          },
        },
      },
    });
    return () => chart.destroy();
  }, [labels, disponiveis, efetivas, outras, eficiencia]);
  if (!labels.length) return <p className="lead">Sem dados no recorte.</p>;
  return <canvas ref={canvasRef} />;
}

function StackedChart({
  labels,
  semRegistro,
  manutencao,
  efetivas,
  outras,
  parada,
  paradaProgramada,
}: {
  labels: string[];
  semRegistro: number[];
  manutencao: number[];
  efetivas: number[];
  outras: number[];
  parada: number[];
  paradaProgramada: number[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !labels.length) return;
    ChartJS.getChart(canvas)?.destroy();
    const chart = new ChartJS(canvas, {
      type: "bar",
      plugins: [columnTotalPlugin],
      data: {
        labels,
        datasets: [
          { label: "Horas sem registro", data: semRegistro, backgroundColor: "#2563eb", stack: "h" },
          { label: "Manutenção", data: manutencao, backgroundColor: "#ef4444", stack: "h" },
          { label: "Horas efetivas", data: efetivas, backgroundColor: "#22c55e", stack: "h" },
          { label: "Horas sem produção", data: outras, backgroundColor: "#0d9488", stack: "h" },
          { label: "Parada na colheita", data: parada, backgroundColor: "#eab308", stack: "h" },
          { label: "Parada programada", data: paradaProgramada, backgroundColor: "#a855f7", stack: "h" },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 22, right: 8, left: 4, bottom: 4 } },
        plugins: {
          legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 10 }, color: "#1e3a5f" } },
          datalabels: {
            clip: false,
            clamp: false,
            display: (ctx) => {
              const value = Number(ctx.dataset.data[ctx.dataIndex] ?? 0);
              return Number.isFinite(value) && value >= 8;
            },
            formatter: (value: number) => fmtRotulo(value),
            color: (ctx) => {
              const bg = String(ctx.dataset.backgroundColor ?? "");
              return bg.includes("eab308") ? "#12355c" : "#fff";
            },
            font: { weight: "bold", size: 10 },
            anchor: "center",
            align: "center",
          },
        },
        scales: {
          x: { stacked: true, grid: { display: false }, ticks: { color: "#5b6b7c", font: { size: 10 }, maxRotation: 0 } },
          y: {
            stacked: true,
            beginAtZero: true,
            grace: "18%",
            grid: { color: "rgba(15, 40, 80, 0.08)" },
            ticks: { color: "#5b6b7c", font: { size: 10 } },
          },
        },
      },
    });
    return () => chart.destroy();
  }, [labels, semRegistro, manutencao, efetivas, outras, parada, paradaProgramada]);
  if (!labels.length) return <p className="lead">Sem dados no recorte.</p>;
  return <canvas ref={canvasRef} />;
}

export function HorasTrabalhadasParadasBoard({
  data,
  dataInicio,
  dataFim,
}: {
  data: IndicadoresColheitaProducaoData;
  dataInicio?: string | null;
  dataFim?: string | null;
}) {
  const [grupo, setGrupo] = useState<"colhedora" | "trator">("colhedora");
  const [equipColhedoras, setEquipColhedoras] = useState<string[]>([]);
  const [equipTratores, setEquipTratores] = useState<string[]>([]);
  const periodoInicio = dataInicio || data.filtros.dataInicio;
  const periodoFim = dataFim || data.filtros.dataFim;
  const selected = grupo === "trator" ? equipTratores : equipColhedoras;
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const diariaBase = grupo === "trator" ? (data.horasOperacaoDiariaTrator ?? []) : (data.horasOperacaoDiaria ?? []);
  const diariaPorEquipamento =
    grupo === "trator"
      ? (data.horasOperacaoDiariaPorEquipamentoTrator ?? [])
      : (data.horasOperacaoDiariaPorEquipamento ?? []);
  const serie = useMemo(() => {
    if (!selectedSet.size) return diariaBase;
    const porDia = new Map<string, HoraEquipamento[]>();
    for (const row of diariaPorEquipamento) {
      if (!selectedSet.has(row.equipTag)) continue;
      porDia.set(row.data, [...(porDia.get(row.data) ?? []), row]);
    }
    return diariaBase.map((row) => somar(porDia.get(row.data) ?? [], row.data));
  }, [diariaBase, diariaPorEquipamento, selectedSet]);
  const meses = useMemo(() => agruparMes(serie), [serie]);
  const semanas = useMemo(
    () => agruparSemana(serie, periodoInicio, periodoFim),
    [serie, periodoInicio, periodoFim],
  );
  const totais = useMemo(() => somar(serie, periodoFim || ""), [serie, periodoFim]);
  const porMaquina =
    grupo === "trator" ? (data.horasOperacaoPorEquipamentoTrator ?? []) : (data.horasOperacaoPorEquipamento ?? []);
  const porMaquinaFiltrada = selectedSet.size ? porMaquina.filter((item) => selectedSet.has(item.equipTag)) : porMaquina;
  const setSelected = grupo === "trator" ? setEquipTratores : setEquipColhedoras;
  const toggleEquipamento = (equipTag: string) => {
    setSelected((prev) =>
      prev.includes(equipTag)
        ? prev.filter((item) => item !== equipTag)
        : [...prev, equipTag].sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true })),
    );
  };
  const diasColheita = Math.max(
    0,
    grupo === "trator"
      ? data.filtros.dias || serie.filter((row) => row.horasEfetivas > 0).length
      : data.filtros.diasColheitaColhedora || data.filtros.dias || serie.filter((row) => row.horasEfetivas > 0).length,
  );

  return (
    <section className="entrada-cana-board">
      <header className="entrada-cana-head">
        <h2>HORAS TRABALHADAS X HORAS PARADAS</h2>
        <div className="entrada-cana-head-meta">
          <span>{grupo === "trator" ? "Tratores" : "Colhedeira de Cana"}</span>
          <strong>Período {fmtPeriodo(periodoInicio, periodoFim)}</strong>
        </div>
      </header>

      <nav className="kind-toggle qualidade-view-toggle no-print entrada-cana-views" aria-label="Tipo de equipamento">
        <button type="button" className={`btn${grupo === "colhedora" ? " primary" : ""}`} onClick={() => setGrupo("colhedora")}>
          Colhedoras
        </button>
        <button type="button" className={`btn${grupo === "trator" ? " primary" : ""}`} onClick={() => setGrupo("trator")}>
          Tratores
        </button>
      </nav>

      <div className="entrada-cana-equipment-filter no-print">
        <div>
          <strong>Equipamentos</strong>
          <span>{selected.length ? `${selected.length} selecionado(s)` : "Todos"}</span>
        </div>
        <button type="button" className="btn" disabled={!porMaquina.length} onClick={() => setSelected(porMaquina.map((item) => item.equipTag))}>
          Todos
        </button>
        <button type="button" className="btn" disabled={!selected.length} onClick={() => setSelected([])}>
          Limpar
        </button>
        <div className="entrada-cana-equipment-list">
          {porMaquina.map((item) => (
            <label key={item.equipTag}>
              <input
                type="checkbox"
                checked={selectedSet.has(item.equipTag)}
                onChange={() => toggleEquipamento(item.equipTag)}
              />
              <span>{item.equipTag}</span>
            </label>
          ))}
        </div>
      </div>

      <CopyableKpis className="entrada-cana-kpis entrada-cana-kpis-4" title="Indicadores">
        <article>
          <span>Horas Disponíveis</span>
          <strong>{fmt2(totais.horasDisponiveis)}</strong>
        </article>
        <article>
          <span>Horas Trabalhadas</span>
          <strong>{fmt2(totais.horasEfetivas)}</strong>
        </article>
        <article>
          <span>Eficiência Operacional</span>
          <strong>{fmtPct(totais.eficiencia)}</strong>
        </article>
        <article>
          <span>{grupo === "trator" ? "Dias no período" : "Dias de Colheita"}</span>
          <strong>{new Intl.NumberFormat("pt-BR").format(diasColheita)}</strong>
        </article>
      </CopyableKpis>

      <div className="entrada-cana-split-charts entrada-cana-split-pad">
        <CopyableVisual className="entrada-cana-panel" title="Horas trabalhadas x horas disponíveis — Meses anteriores">
          <div className="entrada-cana-chart is-tall">
            <ComboChart
              labels={meses.map((item) => item.label)}
              disponiveis={meses.map((item) => item.row.horasDisponiveis)}
              efetivas={meses.map((item) => item.row.horasEfetivas)}
              outras={meses.map((item) => item.row.horasOutrasAtividades ?? 0)}
              eficiencia={meses.map((item) => item.row.eficiencia)}
            />
          </div>
        </CopyableVisual>
        <CopyableVisual className="entrada-cana-panel" title="Horas trabalhadas x horas disponíveis — Semana">
          <div className="entrada-cana-chart is-tall">
            <ComboChart
              labels={semanas.map((item) => item.label)}
              disponiveis={semanas.map((item) => item.row.horasDisponiveis)}
              efetivas={semanas.map((item) => item.row.horasEfetivas)}
              outras={semanas.map((item) => item.row.horasOutrasAtividades ?? 0)}
              eficiencia={semanas.map((item) => item.row.eficiencia)}
            />
          </div>
        </CopyableVisual>
      </div>

      <div className="entrada-cana-split-charts entrada-cana-split-pad">
        <CopyableVisual className="entrada-cana-panel" title="Meses anteriores">
          <div className="entrada-cana-chart is-tall">
            <StackedChart
              labels={meses.map((item) => item.label)}
              semRegistro={meses.map((item) => item.row.horasSemRegistro)}
              manutencao={meses.map((item) => item.row.horasManutencao)}
              efetivas={meses.map((item) => item.row.horasEfetivas)}
              outras={meses.map((item) => item.row.horasOutrasAtividades ?? 0)}
              parada={meses.map((item) => item.row.horasParada)}
              paradaProgramada={meses.map((item) => item.row.horasParadaProgramada ?? 0)}
            />
          </div>
        </CopyableVisual>
        <CopyableVisual className="entrada-cana-panel" title="Semana">
          <div className="entrada-cana-chart is-tall">
            <StackedChart
              labels={semanas.map((item) => item.label)}
              semRegistro={semanas.map((item) => item.row.horasSemRegistro)}
              manutencao={semanas.map((item) => item.row.horasManutencao)}
              efetivas={semanas.map((item) => item.row.horasEfetivas)}
              outras={semanas.map((item) => item.row.horasOutrasAtividades ?? 0)}
              parada={semanas.map((item) => item.row.horasParada)}
              paradaProgramada={semanas.map((item) => item.row.horasParadaProgramada ?? 0)}
            />
          </div>
        </CopyableVisual>
      </div>

      {porMaquinaFiltrada.length ? (
        <div className="entrada-cana-split-charts entrada-cana-split-pad">
          <CopyableVisual className="entrada-cana-panel" title="Por máquina — Horas trabalhadas x horas disponíveis">
            <div className="entrada-cana-chart is-tall">
              <ComboChart
                labels={porMaquinaFiltrada.map((item) => item.equipTag)}
                disponiveis={porMaquinaFiltrada.map((item) => item.horasDisponiveis)}
                efetivas={porMaquinaFiltrada.map((item) => item.horasEfetivas)}
                outras={porMaquinaFiltrada.map((item) => item.horasOutrasAtividades ?? 0)}
                eficiencia={porMaquinaFiltrada.map((item) => item.eficiencia)}
              />
            </div>
          </CopyableVisual>
          <CopyableVisual className="entrada-cana-panel" title="Por máquina — Todas as horas">
            <div className="entrada-cana-chart is-tall">
              <StackedChart
                labels={porMaquinaFiltrada.map((item) => item.equipTag)}
                semRegistro={porMaquinaFiltrada.map((item) => item.horasSemRegistro)}
                manutencao={porMaquinaFiltrada.map((item) => item.horasManutencao)}
                efetivas={porMaquinaFiltrada.map((item) => item.horasEfetivas)}
                outras={porMaquinaFiltrada.map((item) => item.horasOutrasAtividades ?? 0)}
                parada={porMaquinaFiltrada.map((item) => item.horasParada)}
                paradaProgramada={porMaquinaFiltrada.map((item) => item.horasParadaProgramada ?? 0)}
              />
            </div>
          </CopyableVisual>
        </div>
      ) : null}
    </section>
  );
}
