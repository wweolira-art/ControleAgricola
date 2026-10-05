import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  DoughnutController,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
  type ChartConfiguration,
} from "chart.js";
import ChartDataLabels from "chartjs-plugin-datalabels";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { api, type MonitoramentoOsData, type MonitoramentoOsStatus } from "../../api";
import { ConsultaProgressBar } from "../ConsultaProgressBar";
import { CopyVisualButton } from "../CopyVisualButton";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  BarController,
  LineElement,
  LineController,
  PointElement,
  ArcElement,
  DoughnutController,
  Tooltip,
  Legend,
  ChartDataLabels,
);

const COR_AZUL = "#2E75B6";
const COR_BARRA = "#0078D4";
const COR_VERDE = "#39B54A";
const STATUS_COR: Record<MonitoramentoOsStatus, string> = {
  "DENTRO DO PRAZO": "#2E75B6",
  "EM ATRASO": "#C00000",
  "INFORMAR PREVISÃO": "#FFC000",
};

function fmtInt(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(n);
}

function fmtPct(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}%`;
}

function fmtHms(horas: number | null | undefined) {
  if (horas == null || !Number.isFinite(horas)) return "—";
  const totalSec = Math.max(0, Math.round(horas * 3600));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function fmtDateBr(iso: string | null | undefined) {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function blankLabel(value: string | number | null | undefined) {
  const text = String(value ?? "").trim();
  return text || "(Em branco)";
}

function topCounts<T>(
  items: T[],
  label: (item: T) => string,
  limit = 12,
) {
  const map = new Map<string, number>();
  for (const item of items) {
    const key = blankLabel(label(item));
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([label, qtd]) => ({ label, qtd }))
    .sort((a, b) => b.qtd - a.qtd || a.label.localeCompare(b.label, "pt-BR"))
    .slice(0, limit);
}

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  return (
    <section ref={ref} className="gm-chart-card" data-copy-title={title}>
      <header>
        <span>{title}</span>
        <CopyVisualButton targetRef={ref} />
      </header>
      <div className="gm-chart-body">{children}</div>
    </section>
  );
}

function useChart(canvasRef: RefObject<HTMLCanvasElement | null>, config: ChartConfiguration | null) {
  const chartRef = useRef<ChartJS | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !config) {
      chartRef.current?.destroy();
      chartRef.current = null;
      return;
    }
    chartRef.current?.destroy();
    chartRef.current = new ChartJS(canvas, config);
    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [canvasRef, config]);
}

export function MonitoramentoOsSection({
  consultarToken = 0,
  initialTipo = null,
  initialEquip = null,
}: {
  consultarToken?: number;
  initialTipo?: number | null;
  initialEquip?: number | null;
}) {
  const [box, setBox] = useState<number | null>(null);
  const [codTipo, setCodTipo] = useState<number | null>(initialTipo);
  const [codEquipamento, setCodEquipamento] = useState<number | null>(initialEquip);
  const [data, setData] = useState<MonitoramentoOsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [statusFiltro, setStatusFiltro] = useState<MonitoramentoOsStatus | "">("");

  const load = useCallback(async (params?: {
    box?: number | null;
    codTipoEquipamento?: number | null;
    codEquipamento?: number | null;
  }) => {
    setLoading(true);
    setErr(null);
    try {
      const nextBox = params?.box === undefined ? box : params.box;
      const nextTipo = params?.codTipoEquipamento === undefined ? codTipo : params.codTipoEquipamento;
      const nextEquip = params?.codEquipamento === undefined ? codEquipamento : params.codEquipamento;
      const result = await api.indicadoresMonitoramentoOs({
        box: nextBox,
        codTipoEquipamento: nextTipo,
        codEquipamento: nextEquip,
      });
      setData(result);
      setBox(result.filtros.box);
      setCodTipo(result.filtros.codTipoEquipamento);
      setCodEquipamento(result.filtros.codEquipamento);
    } catch (e) {
      setData(null);
      setErr(e instanceof Error ? e.message : "Não foi possível carregar o monitoramento de OS.");
    } finally {
      setLoading(false);
    }
  }, [box, codTipo, codEquipamento]);

  useEffect(() => {
    if (!consultarToken) return;
    void load({
      box,
      codTipoEquipamento: initialTipo,
      codEquipamento: initialEquip,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só consulta no clique
  }, [consultarToken]);

  const prazoRef = useRef<HTMLCanvasElement>(null);
  const statusRef = useRef<HTMLCanvasElement>(null);
  const totalRef = useRef<HTMLCanvasElement>(null);
  const causaRef = useRef<HTMLCanvasElement>(null);
  const sistemaRef = useRef<HTMLCanvasElement>(null);
  const responsavelRef = useRef<HTMLCanvasElement>(null);

  const itensFiltrados = useMemo(() => {
    const rows = data?.itens ?? [];
    return statusFiltro ? rows.filter((row) => row.status === statusFiltro) : rows;
  }, [data, statusFiltro]);

  const kpisTela = useMemo(() => ({
    emAtraso: itensFiltrados.filter((row) => row.status === "EM ATRASO").length,
    semPrevisao: itensFiltrados.filter((row) => row.status === "INFORMAR PREVISÃO").length,
    totalAberta: itensFiltrados.length,
  }), [itensFiltrados]);

  const totalPorBox = useMemo(() => topCounts(itensFiltrados, (row) => String(row.box ?? "BOX NÃO INFORMADO"), 8), [itensFiltrados]);
  const causaRows = useMemo(() => topCounts(itensFiltrados, (row) => row.causa ?? "(Em branco)", 12), [itensFiltrados]);
  const sistemaRows = useMemo(() => topCounts(itensFiltrados, (row) => row.sistema ?? "(Em branco)", 12), [itensFiltrados]);
  const responsavelRows = useMemo(() => topCounts(itensFiltrados, (row) => row.responsavelTecnico ?? "(Em branco)", 8), [itensFiltrados]);
  const prazoPorBox = useMemo(() => {
    const map = new Map<string, { label: string; soma: number; qtd: number }>();
    for (const row of itensFiltrados) {
      const label = String(row.box ?? "BOX NÃO INFORMADO");
      const item = map.get(label) ?? { label, soma: 0, qtd: 0 };
      item.soma += row.prazoHoras;
      item.qtd += 1;
      map.set(label, item);
    }
    return [...map.values()]
      .map((row) => ({ label: row.label, prazoHoras: row.qtd ? row.soma / row.qtd : 0 }))
      .sort((a, b) => b.prazoHoras - a.prazoHoras)
      .slice(0, 8);
  }, [itensFiltrados]);
  const statusRows = useMemo(() => {
    const total = itensFiltrados.length || 1;
    return (["EM ATRASO", "DENTRO DO PRAZO", "INFORMAR PREVISÃO"] as MonitoramentoOsStatus[])
      .map((status) => {
        const qtd = itensFiltrados.filter((row) => row.status === status).length;
        return { status, qtd, percentual: (qtd / total) * 100 };
      })
      .filter((row) => row.qtd > 0);
  }, [itensFiltrados]);

  const prazoConfig = useMemo<ChartConfiguration | null>(() => {
    if (!prazoPorBox.length) return null;
    return {
      type: "line",
      data: {
        labels: prazoPorBox.map((row) => row.label),
        datasets: [
          {
            data: prazoPorBox.map((row) => row.prazoHoras),
            borderColor: COR_AZUL,
            backgroundColor: COR_AZUL,
            pointRadius: 4,
            tension: 0.15,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          datalabels: {
            color: "#1e3a5f",
            align: "top",
            font: { size: 9, weight: "bold" },
            formatter: (v: number) => fmtHms(v),
          },
          tooltip: { callbacks: { label: (ctx) => fmtHms(Number(ctx.raw)) } },
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 } } },
          y: { beginAtZero: true, grace: "22%", ticks: { callback: (v) => fmtHms(Number(v)) } },
        },
      },
    };
  }, [prazoPorBox]);

  const statusConfig = useMemo<ChartConfiguration | null>(() => {
    if (!statusRows.length) return null;
    const total = statusRows.reduce((acc, row) => acc + row.qtd, 0) || 1;
    return {
      type: "doughnut",
      data: {
        labels: statusRows.map((row) => row.status),
        datasets: [
          {
            data: statusRows.map((row) => row.qtd),
            backgroundColor: statusRows.map((row) => STATUS_COR[row.status]),
            borderWidth: 2,
            borderColor: "#fff",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "62%",
        plugins: {
          legend: { position: "top", labels: { boxWidth: 12, font: { size: 10 } } },
          datalabels: {
            color: "#334155",
            anchor: "end",
            align: "end",
            offset: 6,
            font: { size: 10, weight: "bold" },
            formatter: (v: number) => fmtPct((v / total) * 100),
          },
        },
      },
    };
  }, [statusRows]);

  const totalConfig = useMemo<ChartConfiguration | null>(() => {
    if (!totalPorBox.length) return null;
    return {
      type: "bar",
      data: {
        labels: totalPorBox.map((row) => row.label),
        datasets: [
          {
            data: totalPorBox.map((row) => row.qtd),
            backgroundColor: COR_BARRA,
            borderRadius: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          datalabels: {
            color: "#1e293b",
            anchor: "end",
            align: "top",
            font: { size: 11, weight: "bold" },
            formatter: (v: number) => (v ? String(v) : ""),
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 } } },
          y: { beginAtZero: true, grace: "18%", ticks: { precision: 0 } },
        },
      },
    };
  }, [totalPorBox]);

  const simpleBarConfig = useCallback((rows: Array<{ label: string; qtd: number }>, color = COR_VERDE): ChartConfiguration | null => {
    if (!rows.length) return null;
    return {
      type: "bar",
      data: {
        labels: rows.map((row) => row.label),
        datasets: [
          {
            data: rows.map((row) => row.qtd),
            backgroundColor: color,
            borderRadius: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          datalabels: {
            color: "#1e293b",
            align: "top",
            font: { size: 11, weight: "bold" },
            formatter: (v: number) => (v ? String(v) : ""),
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 } } },
          y: { beginAtZero: true, grace: "18%", ticks: { precision: 0 } },
        },
      },
    };
  }, []);

  const causaConfig = useMemo(() => simpleBarConfig(causaRows, "#45c75a"), [causaRows, simpleBarConfig]);
  const sistemaConfig = useMemo(() => simpleBarConfig(sistemaRows, "#00B050"), [sistemaRows, simpleBarConfig]);
  const responsavelConfig = useMemo(() => simpleBarConfig(responsavelRows, "#43A35A"), [responsavelRows, simpleBarConfig]);

  useChart(prazoRef, prazoConfig);
  useChart(statusRef, statusConfig);
  useChart(totalRef, totalConfig);
  useChart(causaRef, causaConfig);
  useChart(sistemaRef, sistemaConfig);
  useChart(responsavelRef, responsavelConfig);

  const tipos = data?.filtros.tipos ?? [];
  const boxes = data?.filtros.boxes ?? [];
  const equipamentos = (data?.filtros.equipamentos ?? []).filter(
    (eq) => codTipo == null || eq.codTipoEquipamento === codTipo,
  );

  return (
    <section className="gm-os-monitor">
      <header className="gm-os-head">
        <h3>
          Monitoramento de OS
          {data?.atualizadoEm ? ` - Última Atualização: ${data.atualizadoEm}` : ""}
        </h3>
      </header>

      <div className="gm-os-toolbar">
        <div className="gm-os-logo" aria-label="Grupo Luiz Jatobá">
          nj
        </div>
        <label>
          <span>Box</span>
          <select
            value={box ?? ""}
            onChange={(e) => setBox(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Todos</option>
            {boxes.map((codigo) => (
              <option key={codigo} value={codigo}>
                {codigo}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Tipo Equipamento</span>
          <select
            value={codTipo ?? ""}
            onChange={(e) => {
              setCodTipo(e.target.value ? Number(e.target.value) : null);
              setCodEquipamento(null);
            }}
          >
            <option value="">Todos</option>
            {tipos.map((tipo) => (
              <option key={tipo.codTipoEquipamento} value={tipo.codTipoEquipamento}>
                {tipo.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Frente</span>
          <select value="" disabled>
            <option value="">Todos</option>
          </select>
        </label>
        <label>
          <span>Equipamento</span>
          <select
            value={codEquipamento ?? ""}
            onChange={(e) => setCodEquipamento(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Todos</option>
            {equipamentos.map((eq) => (
              <option key={eq.codEquipamento} value={eq.codEquipamento}>
                {eq.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Status</span>
          <select value={statusFiltro} onChange={(e) => setStatusFiltro(e.target.value as MonitoramentoOsStatus | "")}>
            <option value="">Todos</option>
            <option value="EM ATRASO">Em atraso</option>
            <option value="DENTRO DO PRAZO">Dentro do prazo</option>
            <option value="INFORMAR PREVISÃO">Sem previsão</option>
          </select>
        </label>
        <div className="gm-os-kpis">
          <div className="gm-os-kpi is-red">
            <strong>{fmtInt(kpisTela.emAtraso)}</strong>
            <span>Em Atraso</span>
          </div>
          <div className="gm-os-kpi is-yellow">
            <strong>{fmtInt(kpisTela.semPrevisao)}</strong>
            <span>Sem Previsão</span>
          </div>
          <div className="gm-os-kpi is-blue">
            <strong>{fmtInt(kpisTela.totalAberta)}</strong>
            <span>Abertas</span>
          </div>
        </div>
        <button
          type="button"
          className="btn primary gm-os-consultar"
          disabled={loading}
          onClick={() => void load({ box, codTipoEquipamento: codTipo, codEquipamento })}
        >
          {loading ? "Consultando…" : "Consultar"}
        </button>
      </div>

      <ConsultaProgressBar active={loading} label="Consultando ordens de serviço abertas…" className="consulta-progress--compact" />
      {err ? (
        <p className="lead no-print" style={{ color: "var(--danger)" }}>
          {err}
        </p>
      ) : null}
      {!data && !loading ? (
        <p className="lead">Defina os filtros e clique em Consultar para exibir o monitoramento de OS.</p>
      ) : null}

      {data || loading ? (
        <>
      <div className="gm-os-grid">
        <ChartCard title="Ordens de Serviço - Total">
          {totalConfig ? <canvas ref={totalRef} /> : <p className="lead">Sem dados.</p>}
        </ChartCard>
        <ChartCard title="Prazo Médio de Atendimento">
          {prazoConfig ? <canvas ref={prazoRef} /> : <p className="lead">Sem dados.</p>}
        </ChartCard>
        <ChartCard title="Status de Ordens de Serviço">
          {statusConfig ? <canvas ref={statusRef} /> : <p className="lead">Sem dados.</p>}
        </ChartCard>
        <ChartCard title="Ordens de Serviço - Causa">
          {causaConfig ? <canvas ref={causaRef} /> : <p className="lead">Sem dados.</p>}
        </ChartCard>
        <ChartCard title="Ordens de Serviço - Sistema">
          {sistemaConfig ? <canvas ref={sistemaRef} /> : <p className="lead">Sem dados.</p>}
        </ChartCard>
        <ChartCard title="Ordens de Serviço - Responsável Técnico">
          {responsavelConfig ? <canvas ref={responsavelRef} /> : <p className="lead">Sem dados.</p>}
        </ChartCard>
      </div>

      <div className="gm-os-table-wrap">
        <table className="gm-os-table">
          <thead>
            <tr>
              <th>Ano</th>
              <th>OS</th>
              <th>Cód. Equip.</th>
              <th>Descrição Tipo Equipamento</th>
              <th>Box</th>
              <th>Data Abertura</th>
              <th>Hora Abertura</th>
              <th>Data Previsão</th>
              <th>Hora Previsão</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {itensFiltrados.map((row) => (
              <tr key={`${row.ano}-${row.os}`}>
                <td>{row.ano}</td>
                <td>{row.os}</td>
                <td>{row.codEquipamento ?? "—"}</td>
                <td className="left">{row.tipoEquipamento}</td>
                <td>{row.box ?? "—"}</td>
                <td>{fmtDateBr(row.dataAbertura)}</td>
                <td>{row.horaAbertura || ""}</td>
                <td>{fmtDateBr(row.dataPrevisao)}</td>
                <td>{row.horaPrevisao || ""}</td>
                <td>{row.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && !data.itens.length ? <p className="lead">Nenhuma OS aberta para o filtro.</p> : null}
      </div>
        </>
      ) : null}
    </section>
  );
}
