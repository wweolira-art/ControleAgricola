import {
  ArcElement,
  CategoryScale,
  Chart as ChartJS,
  DoughnutController,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from "chart.js";
import ChartDataLabels from "chartjs-plugin-datalabels";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "../../api";
import { CopyGroupBar, CopyGroupCheckbox, CopyVisualButton } from "../CopyVisualButton";
import {
  diasDoMes,
  indexarRealizadosMes,
  kpisLubrificacao,
  lubrificacaoSituacaoLabel,
  montarMensalLubrificacao,
  realizadoComponenteNoMes,
  type LubrificacaoDashboardData,
  type LubrificacaoRealizadoMes,
  type LubrificacaoSituacao,
} from "../../lib/lubrificacao";
import { ConsultaProgressBar } from "../ConsultaProgressBar";
import { useReportAutoRefresh } from "./useReportAutoRefresh";
import "./lubrificacao.css";

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

const WEEKDAYS = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
const MESES_NOME = [
  "JANEIRO",
  "FEVEREIRO",
  "MARÇO",
  "ABRIL",
  "MAIO",
  "JUNHO",
  "JULHO",
  "AGOSTO",
  "SETEMBRO",
  "OUTUBRO",
  "NOVEMBRO",
  "DEZEMBRO",
];

type LubView = "acompanhamento" | "vencimentos";
type FiltroVencimento = "todos" | LubrificacaoSituacao;

const fmtInt = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? "—" : new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(n);

const fmtHs = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n)
    ? "—"
    : new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 1 }).format(n);

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

const fmtPct = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n)
    ? "—"
    : `${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}%`;

function LubCopyable({ className, title, children }: { className?: string; title: string; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  return (
    <section ref={ref} className={className} data-copy-root data-copy-title={title}>
      <div className="lub-copy-head no-print">
        <CopyGroupCheckbox />
        <CopyVisualButton targetRef={ref} />
      </div>
      {children}
    </section>
  );
}

function LubKpi({ label, value }: { label: string; value: string }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div ref={ref} className="lub-kpi lub-kpi-copyable" data-copy-root data-copy-title={label}>
      <div className="lub-copy-head no-print">
        <CopyGroupCheckbox />
        <CopyVisualButton targetRef={ref} />
      </div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function weekdayLabel(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? "" : WEEKDAYS[d.getDay()] ?? "";
}

function dayMonth(iso: string) {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${Number(m[3])}/${Number(m[2])}` : iso;
}

function StatusDonut({ ok, aVencer, vencido }: { ok: number; aVencer: number; vencido: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const total = ok + aVencer + vencido;
  const destaque = useMemo(() => {
    const items = [
      { key: "OK", value: ok, color: "#22c55e" },
      { key: "A vencer", value: aVencer, color: "#9ca3af" },
      { key: "Vencido", value: vencido, color: "#ef4444" },
    ];
    return items.slice().sort((a, b) => b.value - a.value)[0] ?? items[0]!;
  }, [ok, aVencer, vencido]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const chart = new ChartJS(canvas, {
      type: "doughnut",
      data: {
        labels: ["A vencer", "OK", "Vencido"],
        datasets: [
          {
            data: [aVencer, ok, vencido],
            backgroundColor: ["#9ca3af", "#22c55e", "#ef4444"],
            borderWidth: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "72%",
        plugins: {
          legend: {
            position: "right",
            labels: {
              color: "#0c1d4a",
              boxWidth: 10,
              font: { size: 11, weight: 600 },
              padding: 10,
            },
          },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.label}: ${fmtInt(Number(ctx.raw))}`,
            },
          },
          datalabels: { display: false },
        },
      },
    });
    return () => chart.destroy();
  }, [ok, aVencer, vencido]);

  return (
    <LubCopyable className="lub-panel lub-status-panel" title="Status da lubrificação">
      <h4>STATUS DA LUBRIFICAÇÃO</h4>
      <div className="lub-donut-box">
        <canvas ref={canvasRef} />
        <div className="lub-donut-center">
          <small>{destaque.key}</small>
          <strong>{fmtInt(destaque.value)}</strong>
        </div>
      </div>
      {total === 0 ? <div className="lub-empty">Sem pontos de lubrificação na frota.</div> : null}
    </LubCopyable>
  );
}

function AcompanhamentoChart({
  labels,
  realizado,
  meta,
  previsto,
}: {
  labels: string[];
  realizado: number[];
  meta: number[];
  previsto: number[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const chart = new ChartJS(canvas, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Realizado",
            data: realizado,
            borderColor: "#1e4a8a",
            backgroundColor: "#1e4a8a",
            pointBackgroundColor: "#1e4a8a",
            pointRadius: 4,
            borderWidth: 2,
            tension: 0.15,
            datalabels: {
              align: "top",
              anchor: "end",
              offset: 4,
              color: "#0c1d4a",
              font: { size: 10, weight: 700 },
              formatter: (v: number) => (v > 0 ? fmtInt(v) : ""),
            },
          },
          {
            label: "Meta",
            data: meta,
            borderColor: "#4eb5e8",
            backgroundColor: "#fff",
            pointBackgroundColor: "#fff",
            pointBorderColor: "#0c1d4a",
            pointBorderWidth: 2,
            pointRadius: 5,
            borderWidth: 0,
            showLine: false,
            datalabels: {
              align: "bottom",
              anchor: "start",
              offset: 6,
              color: "#1e4a8a",
              font: { size: 10, weight: 700 },
              formatter: (v: number) => (v > 0 ? fmtInt(v) : ""),
            },
          },
          {
            label: "Previsto",
            data: previsto,
            borderColor: "#8aa4c2",
            backgroundColor: "#8aa4c2",
            pointBackgroundColor: "#8aa4c2",
            pointRadius: 3,
            borderWidth: 2,
            tension: 0.15,
            datalabels: {
              align: "left",
              anchor: "center",
              offset: 6,
              color: "#4a6584",
              font: { size: 10, weight: 700 },
              formatter: (v: number, ctx) => {
                const real = realizado[ctx.dataIndex] ?? 0;
                return v > 0 && v !== real ? fmtInt(v) : "";
              },
            },
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "bottom",
            labels: { color: "#0c1d4a", boxWidth: 10, font: { size: 11, weight: 600 } },
          },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.dataset.label}: ${fmtInt(Number(ctx.raw))}`,
            },
          },
        },
        scales: {
          x: {
            ticks: { color: "#0c1d4a", font: { size: 11, weight: 700 } },
            grid: { display: false },
          },
          y: {
            beginAtZero: true,
            ticks: { color: "#6b7280", font: { size: 10 } },
            grid: { color: "rgba(27, 59, 90, 0.08)" },
          },
        },
      },
    });
    return () => chart.destroy();
  }, [labels, realizado, meta, previsto]);

  return (
    <LubCopyable className="lub-panel lub-chart-panel" title="Acompanhamento lubrificação colhedoras">
      <h4>ACOMPANHAMENTO LUBRIFICAÇÃO COLHEDORAS</h4>
      <div className="lub-line-chart">
        <canvas ref={canvasRef} />
      </div>
    </LubCopyable>
  );
}

function VencimentosTable({
  itens,
  realizados,
  status,
  ano,
  mes,
  onAno,
  onMes,
  anos,
}: {
  itens: NonNullable<LubrificacaoDashboardData["vencimentos"]>;
  realizados: LubrificacaoRealizadoMes[];
  status: NonNullable<LubrificacaoDashboardData["status"]>;
  ano: number;
  mes: number;
  onAno: (ano: number) => void;
  onMes: (mes: number) => void;
  anos: number[];
}) {
  const [filtro, setFiltro] = useState<FiltroVencimento>("todos");
  const [busca, setBusca] = useState("");
  const periodoLabel = `${MESES_NOME[mes - 1]} / ${ano}`;
  const realizadoIndex = useMemo(() => indexarRealizadosMes(realizados), [realizados]);
  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return itens.filter((row) => {
      if (filtro !== "todos" && row.status !== filtro) return false;
      if (!q) return true;
      return (
        String(row.codEquipamento).includes(q) ||
        (row.descricao ?? "").toLowerCase().includes(q) ||
        (row.componenteDescricao ?? "").toLowerCase().includes(q) ||
        String(row.codComponente).includes(q)
      );
    });
  }, [busca, filtro, itens]);

  return (
    <LubCopyable
      className="lub-panel lub-venc-panel"
      title={`Vencimentos dos componentes de lubrificação — ${periodoLabel}`}
    >
      <div className="lub-venc-head">
        <div>
          <h4>VENCIMENTOS DOS COMPONENTES DE LUBRIFICAÇÃO</h4>
          <p className="lub-venc-period">Quantidade e litros em {periodoLabel}</p>
        </div>
        <div className="lub-venc-chips">
          <span className="lub-chip lub-chip-ok">{status.ok} Em dia</span>
          <span className="lub-chip lub-chip-warn">{status.aVencer} A vencer</span>
          <span className="lub-chip lub-chip-bad">{status.vencido} Vencido</span>
          <span className="lub-chip">{status.semPlano ?? 0} Sem histórico</span>
        </div>
      </div>
      <div className="lub-venc-filters no-print">
        <label>
          Ano
          <select value={String(ano)} onChange={(e) => onAno(Number(e.target.value))}>
            {anos.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <label>
          Mês
          <select value={String(mes)} onChange={(e) => onMes(Number(e.target.value))}>
            {MESES_NOME.map((nome, i) => (
              <option key={nome} value={i + 1}>
                {nome}
              </option>
            ))}
          </select>
        </label>
        <label>
          Situação
          <select value={filtro} onChange={(e) => setFiltro(e.target.value as FiltroVencimento)}>
            <option value="todos">Todas</option>
            <option value="vencido">Vencido</option>
            <option value="a_vencer">A vencer</option>
            <option value="em_dia">Em dia</option>
            <option value="sem_plano">Sem histórico</option>
          </select>
        </label>
        <label>
          Buscar
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Equipamento ou componente"
          />
        </label>
      </div>
      <div className="lub-venc-scroll">
        <table className="lub-venc-table">
          <thead>
            <tr>
              <th>Situação</th>
              <th>Equipamento</th>
              <th>Componente</th>
              <th>Intervalo (h)</th>
              <th>Horas rodadas</th>
              <th>Horas restantes</th>
              <th>Última lubrificação</th>
              <th>Qtd no mês</th>
              <th>Litros no mês</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((row) => {
              const realizado = realizadoComponenteNoMes(
                realizadoIndex,
                row.codEquipamento,
                row.codComponente,
                ano,
                mes,
              );
              return (
              <tr key={`${row.codEquipamento}-${row.codComponente}`} className={`lub-row-${row.status}`}>
                <td>
                  <span className={`lub-status lub-status-${row.status}`}>
                    {lubrificacaoSituacaoLabel(row.status)}
                  </span>
                </td>
                <td title={row.descricao ?? undefined}>
                  <strong>{row.codEquipamento}</strong>
                  {row.descricao ? <small>{row.descricao}</small> : null}
                </td>
                <td>
                  {row.componenteDescricao || `Componente ${row.codComponente}`}
                </td>
                <td>{fmtHs(row.limiteHs)}</td>
                <td>{fmtHs(row.horasRodadas)}</td>
                <td>
                  {row.horasRestantes == null
                    ? "—"
                    : row.horasRestantes < 0
                      ? `${fmtHs(Math.abs(row.horasRestantes))} h em atraso`
                      : `${fmtHs(row.horasRestantes)} h`}
                </td>
                <td>{fmtDate(row.dataUltima)}</td>
                <td>{fmtInt(realizado.qtd)}</td>
                <td>{fmtHs(realizado.litros)}</td>
              </tr>
              );
            })}
          </tbody>
        </table>
        {!filtrados.length ? <div className="lub-empty">Nenhum componente para o filtro.</div> : null}
      </div>
    </LubCopyable>
  );
}

export function IndicadoresLubrificacao() {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const [ano, setAno] = useState(currentYear);
  const [mes, setMes] = useState(currentMonth);
  const [view, setView] = useState<LubView>("acompanhamento");
  const [data, setData] = useState<LubrificacaoDashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.indicadoresLubrificacao({ ano }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [ano]);

  useEffect(() => {
    void load();
  }, [load]);

  useReportAutoRefresh(load);

  const frota = data?.frota ?? [];
  const eventos = data?.eventos ?? [];
  const pontos = data?.pontos ?? [];
  const horas = data?.horas ?? [];
  const kpis = useMemo(() => kpisLubrificacao(eventos, horas, pontos, ano, mes), [eventos, horas, pontos, ano, mes]);
  const mensal = useMemo(
    () => montarMensalLubrificacao(eventos, horas, pontos, ano, mes),
    [eventos, horas, pontos, ano, mes],
  );
  const dias = useMemo(() => diasDoMes(ano, mes), [ano, mes]);
  const eventoSet = useMemo(() => {
    const map = new Map<string, number>();
    for (const ev of eventos) map.set(`${ev.codEquipamento}|${ev.data}`, ev.quantidade);
    return map;
  }, [eventos]);
  const horasSet = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of horas) map.set(`${row.codEquipamento}|${row.data}`, row.horas);
    return map;
  }, [horas]);
  const horasPorEquipamentoMes = useMemo(() => {
    const map = new Map<number, number>();
    const prefixoMes = `${ano}-${String(mes).padStart(2, "0")}-`;
    for (const row of horas) {
      if (!row.data.startsWith(prefixoMes)) continue;
      map.set(row.codEquipamento, (map.get(row.codEquipamento) ?? 0) + row.horas);
    }
    return map;
  }, [ano, horas, mes]);
  const pontosPorEquipamentoMes = useMemo(() => {
    const realizadoIndex = indexarRealizadosMes(data?.realizados ?? []);
    const map = new Map<
      number,
      Array<{
        codComponente: number;
        componenteDescricao: string;
        limiteHs: number | null;
        meta: number | null;
        realizado: number;
      }>
    >();
    for (const row of data?.vencimentos ?? []) {
      const arr = map.get(row.codEquipamento) ?? [];
      const horasMes = horasPorEquipamentoMes.get(row.codEquipamento) ?? 0;
      const meta = row.limiteHs && row.limiteHs > 0 ? Math.round((horasMes / row.limiteHs) * 10) / 10 : null;
      const realizado = realizadoComponenteNoMes(
        realizadoIndex,
        row.codEquipamento,
        row.codComponente,
        ano,
        mes,
      );
      arr.push({
        codComponente: row.codComponente,
        componenteDescricao: row.componenteDescricao || `Ponto ${row.codComponente}`,
        limiteHs: row.limiteHs,
        meta,
        realizado: realizado.qtd,
      });
      map.set(row.codEquipamento, arr);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => a.codComponente - b.codComponente);
    }
    return map;
  }, [ano, data?.realizados, data?.vencimentos, horasPorEquipamentoMes, mes]);
  const [pontoTip, setPontoTip] = useState<{
    x: number;
    y: number;
    equipamento: number;
    data: string;
    horas: number;
    quantidade: number;
  } | null>(null);
  const [equipTip, setEquipTip] = useState<{
    x: number;
    y: number;
    equipamento: number;
    horas: number;
    pontos: NonNullable<ReturnType<typeof pontosPorEquipamentoMes["get"]>>;
  } | null>(null);
  const copyScopeRef = useRef<HTMLDivElement>(null);

  return (
    <div className="lub-root">
      <div className="lub-toolbar no-print">
        <small>
          {data ? `Atualizado em ${new Date(data.atualizadoEm).toLocaleString("pt-BR")}` : "Consultando Oracle…"}
          <button type="button" className="ghost" disabled={loading} onClick={() => void load()}>
            {loading ? "Atualizando…" : "Atualizar"}
          </button>
        </small>
      </div>

      <ConsultaProgressBar active={loading} label="Consultando lubrificação…" className="consulta-progress--compact" />
      {error ? (
        <div role="alert" className="lub-alert-error">
          Não foi possível atualizar: {error}
          {data ? ". Os dados anteriores continuam exibidos." : ""}
        </div>
      ) : null}

      <nav className="lub-views no-print" aria-label="Visões de lubrificação">
        <button
          type="button"
          className={view === "acompanhamento" ? "active" : ""}
          onClick={() => setView("acompanhamento")}
        >
          Acompanhamento
        </button>
        <button
          type="button"
          className={view === "vencimentos" ? "active" : ""}
          onClick={() => setView("vencimentos")}
        >
          Vencimentos
        </button>
      </nav>

      <div className="lub-dashboard" ref={copyScopeRef}>
        <header className="lub-head">
          <div className="lub-head-brand">
            <img src="/elejota-agro-logo.png" alt="Elejota Agro" className="lub-logo" />
            <div>
              <h2>LUBRIFICAÇÃO COLHEDORAS</h2>
              <p>
                {view === "vencimentos"
                  ? "VENCIMENTOS DOS COMPONENTES DE LUBRIFICAÇÃO"
                  : "ACOMPANHAMENTO LUBRIFICAÇÕES REALIZADAS"}
              </p>
            </div>
          </div>
          <div className="lub-period">
            <label className="lub-year">
              Ano
              <select value={String(ano)} onChange={(e) => setAno(Number(e.target.value))}>
                {[currentYear, currentYear - 1, currentYear - 2].map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
            {view === "vencimentos" ? (
              <label className="lub-year">
                Mês
                <select value={String(mes)} onChange={(e) => setMes(Number(e.target.value))}>
                  {MESES_NOME.map((nome, i) => (
                    <option key={nome} value={i + 1}>
                      {nome}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
        </header>
        {data ? <CopyGroupBar scopeRef={copyScopeRef} /> : null}

        {view === "vencimentos" ? (
          <VencimentosTable
            itens={data?.vencimentos ?? []}
            realizados={data?.realizados ?? []}
            status={data?.status ?? { ok: 0, aVencer: 0, vencido: 0, semPlano: 0 }}
            ano={ano}
            mes={mes}
            onAno={setAno}
            onMes={setMes}
            anos={[currentYear, currentYear - 1, currentYear - 2]}
          />
        ) : (
          <>
        <div className="lub-kpi-row">
          <div className="lub-kpis">
            <LubKpi label="ADERÊNCIA LUBRIFICAÇÃO" value={fmtPct(kpis.aderencia)} />
            <LubKpi label="META" value={fmtInt(kpis.meta)} />
            <LubKpi label="RELATIVO AO MÊS ANTERIOR" value={fmtInt(kpis.relativoMesAnterior)} />
            <LubKpi label="QUANTIDADE REALIZADA" value={fmtInt(kpis.quantidadeRealizada)} />
            <LubKpi label="MÉDIA LUB. MAQ. MÊS" value={fmtInt(kpis.mediaLubMaqMes)} />
          </div>
          <div className="lub-month-slicer" aria-label="Mês">
            <small>MÊS</small>
            <div>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <button
                  key={m}
                  type="button"
                  className={m === mes ? "active" : ""}
                  onClick={() => setMes(m)}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        </div>

        <LubCopyable className="lub-panel lub-grid-panel" title={`Lubrificação da frota — ${MESES_NOME[mes - 1]}`}>
          <div className="lub-grid-scroll">
            <table className="lub-frota-grid">
              <thead>
                <tr className="lub-grid-month">
                  <th>FROTA</th>
                  <th colSpan={dias.length}>{MESES_NOME[mes - 1]}</th>
                </tr>
                <tr className="lub-grid-days">
                  <th />
                  {dias.map((dia) => (
                    <th key={`d-${dia}`}>{dayMonth(dia)}</th>
                  ))}
                </tr>
                <tr className="lub-grid-week">
                  <th />
                  {dias.map((dia) => (
                    <th key={`w-${dia}`}>{weekdayLabel(dia)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {frota.map((eq) => (
                  <tr key={eq.codEquipamento}>
                    <th
                      scope="row"
                      title={eq.descricao ?? undefined}
                      onMouseEnter={(event) =>
                        setEquipTip({
                          x: event.clientX,
                          y: event.clientY,
                          equipamento: eq.codEquipamento,
                          horas: horasPorEquipamentoMes.get(eq.codEquipamento) ?? 0,
                          pontos: pontosPorEquipamentoMes.get(eq.codEquipamento) ?? [],
                        })
                      }
                      onMouseMove={(event) =>
                        setEquipTip((atual) =>
                          atual
                            ? { ...atual, x: event.clientX, y: event.clientY }
                            : atual,
                        )
                      }
                      onMouseLeave={() => setEquipTip(null)}
                    >
                      <span className="lub-frota-code">{eq.codEquipamento}</span>
                      <span className="lub-frota-horas">{fmtHs(horasPorEquipamentoMes.get(eq.codEquipamento))} h</span>
                    </th>
                    {dias.map((dia) => {
                      const chave = `${eq.codEquipamento}|${dia}`;
                      const qtd = eventoSet.get(chave) ?? 0;
                      const horasDia = horasSet.get(chave) ?? 0;
                      return (
                        <td key={`${eq.codEquipamento}-${dia}`}>
                          {qtd > 0 ? (
                            <i
                              className="lub-dot"
                              onMouseEnter={(event) =>
                                setPontoTip({
                                  x: event.clientX,
                                  y: event.clientY,
                                  equipamento: eq.codEquipamento,
                                  data: dia,
                                  horas: horasDia,
                                  quantidade: qtd,
                                })
                              }
                              onMouseMove={(event) =>
                                setPontoTip((atual) =>
                                  atual
                                    ? { ...atual, x: event.clientX, y: event.clientY }
                                    : atual,
                                )
                              }
                              onMouseLeave={() => setPontoTip(null)}
                            />
                          ) : null}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && !frota.length ? (
              <div className="lub-empty">Nenhuma colhedora com plano de lubrificação.</div>
            ) : null}
          </div>
        </LubCopyable>

        {equipTip ? (
          <div
            className="lub-equip-tip"
            style={{
              left: Math.min(equipTip.x, window.innerWidth - 360),
              top: Math.min(equipTip.y, window.innerHeight - 260),
            }}
          >
            <strong>
              Equipamento {equipTip.equipamento}
              <span>{fmtHs(equipTip.horas)} h rodadas</span>
            </strong>
            {equipTip.pontos.length ? (
              <table>
                <thead>
                  <tr>
                    <th>Ponto</th>
                    <th>Meta</th>
                    <th>Realizadas</th>
                  </tr>
                </thead>
                <tbody>
                  {equipTip.pontos.map((ponto) => (
                    <tr key={ponto.codComponente}>
                      <td>
                        {ponto.componenteDescricao}
                        {ponto.limiteHs ? <small>{fmtHs(ponto.limiteHs)} h</small> : null}
                      </td>
                      <td>{ponto.meta == null ? "—" : fmtHs(ponto.meta)}</td>
                      <td>{fmtInt(ponto.realizado)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <span>Sem pontos de lubrificação no plano.</span>
            )}
          </div>
        ) : null}

        {pontoTip ? (
          <div
            className="lub-dot-tip"
            style={{
              left: Math.min(pontoTip.x, window.innerWidth - 180),
              top: Math.min(pontoTip.y, window.innerHeight - 88),
            }}
          >
            <strong>
              {pontoTip.equipamento} · {dayMonth(pontoTip.data)}
            </strong>
            <span>{fmtHs(pontoTip.horas)} h rodadas</span>
            <span>
              {pontoTip.quantidade === 1
                ? "1 lubrificação"
                : `${pontoTip.quantidade} lubrificações`}
            </span>
          </div>
        ) : null}

        <div className="lub-bottom">
          <StatusDonut
            ok={data?.status.ok ?? 0}
            aVencer={data?.status.aVencer ?? 0}
            vencido={data?.status.vencido ?? 0}
          />
          <AcompanhamentoChart
            labels={mensal.map((row) => row.label)}
            realizado={mensal.map((row) => row.realizado)}
            meta={mensal.map((row) => row.meta)}
            previsto={mensal.map((row) => row.previsto)}
          />
        </div>
          </>
        )}
      </div>
    </div>
  );
}
