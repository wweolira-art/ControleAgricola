import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
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
  type ChartConfiguration,
} from "chart.js";
import ChartDataLabels from "chartjs-plugin-datalabels";
import { api, type AnaliseBiometricaData, type AnaliseBiometricaPonto, type AnaliseBiometricaRegistro } from "../../api";
import { ConsultaProgressBar } from "../ConsultaProgressBar";
import { PrintButton } from "../PrintButton";

ChartJS.register(CategoryScale, LinearScale, BarElement, BarController, LineController, LineElement, PointElement, Tooltip, Legend, ChartDataLabels);

type SortKey = keyof Pick<
  AnaliseBiometricaPonto,
  "fazenda" | "talhao" | "data" | "ponto" | "tamanhoCana" | "canaPorMetro" | "tamanhoEntrenos" | "pesoPorCana" | "diametro" | "tch"
>;
type TalhaoChartMode = "maiores" | "menores" | "todos";

function fmt(n: number | null | undefined, digits = 2) {
  if (n == null || !Number.isFinite(n)) return "-";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function fmtInt(n: number) {
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

function dateLabel(iso: string) {
  const [year, month, day] = iso.split("-");
  return year && month && day ? `${day}/${month}/${year}` : iso || "-";
}

function avg(values: Array<number | null | undefined>) {
  const nums = values.filter((value): value is number => value != null && Number.isFinite(value));
  if (!nums.length) return null;
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

function uniqueCount(values: string[]) {
  return new Set(values.filter(Boolean)).size;
}

function classificarTch(tch: number | null | undefined) {
  if (tch == null || !Number.isFinite(tch)) return { label: "Sem TCH", tone: "empty" };
  if (tch >= 95) return { label: "Alta produtividade", tone: "high" };
  if (tch >= 80) return { label: "Produtividade média", tone: "mid" };
  return { label: "Atenção produtiva", tone: "low" };
}

function groupAvg(rows: AnaliseBiometricaRegistro[], key: "fazenda" | "talhao") {
  const map = new Map<string, { label: string; values: number[] }>();
  for (const row of rows) {
    if (row.tch == null) continue;
    const rawLabel = row[key];
    const label = key === "fazenda" ? row.fazendaLabel : rawLabel;
    const item = map.get(rawLabel) ?? { label, values: [] };
    item.values.push(row.tch);
    map.set(rawLabel, item);
  }
  return [...map.entries()]
    .map(([, item]) => ({ label: item.label, value: avg(item.values) ?? 0 }))
    .sort((a, b) => b.value - a.value);
}

function fazendaWeightedRows(rows: AnaliseBiometricaRegistro[]) {
  const talhoes = new Map<
    string,
    {
      fazenda: string;
      label: string;
      talhao: string;
      areaHa: number | null;
      values: number[];
    }
  >();
  for (const row of rows) {
    if (row.tch == null) continue;
    const key = `${row.fazenda}|${row.talhao}`;
    const item =
      talhoes.get(key) ??
      {
        fazenda: row.fazenda,
        label: row.fazendaLabel,
        talhao: row.talhao,
        areaHa: row.areaHa,
        values: [],
      };
    item.values.push(row.tch);
    if (!(item.areaHa != null && item.areaHa > 0) && row.areaHa != null && row.areaHa > 0) item.areaHa = row.areaHa;
    talhoes.set(key, item);
  }

  const fazendas = new Map<string, { label: string; weighted: number; area: number; fallback: number[]; talhoes: number }>();
  for (const talhao of talhoes.values()) {
    const tch = avg(talhao.values);
    if (tch == null) continue;
    const bucket = fazendas.get(talhao.fazenda) ?? { label: talhao.label, weighted: 0, area: 0, fallback: [], talhoes: 0 };
    const area = talhao.areaHa ?? null;
    if (area != null && area > 0) {
      bucket.weighted += tch * area;
      bucket.area += area;
    } else {
      bucket.fallback.push(tch);
    }
    bucket.talhoes += 1;
    fazendas.set(talhao.fazenda, bucket);
  }

  return [...fazendas.values()]
    .map((row) => ({
      label: row.label,
      value: row.area > 0 ? row.weighted / row.area : avg(row.fallback) ?? 0,
      areaHa: row.area > 0 ? row.area : null,
      talhoes: row.talhoes,
      ponderada: row.area > 0,
    }))
    .sort((a, b) => b.value - a.value);
}

function talhaoChartRows(rows: AnaliseBiometricaRegistro[], fazendaSelecionada: string, mode: TalhaoChartMode) {
  const map = new Map<
    string,
    {
      fazenda: string;
      fazendaNome: string;
      talhao: string;
      values: number[];
      datas: string[];
    }
  >();
  for (const row of rows) {
    if (row.tch == null) continue;
    const key = `${row.fazenda}|${row.talhao}`;
    const item =
      map.get(key) ??
      {
        fazenda: row.fazendaLabel,
        fazendaNome: row.fazendaNome || row.fazenda,
        talhao: row.talhao,
        values: [],
        datas: [],
      };
    item.values.push(row.tch);
    if (row.data) item.datas.push(row.data);
    map.set(key, item);
  }
  const sorted = [...map.values()]
    .map((item) => {
      const datas = [...new Set(item.datas)].sort((a, b) => a.localeCompare(b));
      return {
        fazenda: item.fazenda,
        fazendaNome: item.fazendaNome,
        talhao: item.talhao,
        label: fazendaSelecionada ? `T ${item.talhao}` : `${item.fazendaNome} • T ${item.talhao}`,
        value: avg(item.values) ?? 0,
        dataAnalise:
          datas.length === 0
            ? null
            : datas.length === 1
              ? dateLabel(datas[0])
              : `${dateLabel(datas[0])} a ${dateLabel(datas[datas.length - 1])}`,
      };
    })
    .sort((a, b) => b.value - a.value);
  if (mode === "menores") return sorted.slice().reverse().slice(0, 10);
  if (mode === "todos") return sorted;
  return sorted.slice(0, 10);
}

function useChart(canvasRef: RefObject<HTMLCanvasElement | null>, config: ChartConfiguration | null) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !config) return;
    ChartJS.getChart(canvas)?.destroy();
    const chart = new ChartJS(canvas, config);
    return () => chart.destroy();
  }, [canvasRef, config]);
}

function InfoButton({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="bio-info-wrap">
      <button
        type="button"
        className="bio-info-btn no-print"
        aria-label="Entender cálculo do visual"
        title="Entender cálculo do visual"
        onClick={() => setOpen((current) => !current)}
      >
        !
      </button>
      {open ? (
        <span className="bio-info-popover" role="note">
          {text}
        </span>
      ) : null}
    </span>
  );
}

function ChartCard({ title, info, children }: { title: string; info?: string; children: ReactNode }) {
  return (
    <section className="bio-chart-card">
      <h3>
        {title}
        {info ? <InfoButton text={info} /> : null}
      </h3>
      {children}
    </section>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bio-kpi">
      <span>{label}</span>
      <strong>{value}</strong>
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}

export function IndicadoresAnaliseBiometrica() {
  const [data, setData] = useState<AnaliseBiometricaData | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [fazenda, setFazenda] = useState("");
  const [talhao, setTalhao] = useState("");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [busca, setBusca] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("tch");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [talhaoMode, setTalhaoMode] = useState<TalhaoChartMode>("maiores");

  const fazendaRef = useRef<HTMLCanvasElement>(null);
  const talhaoRef = useRef<HTMLCanvasElement>(null);
  const evolucaoRef = useRef<HTMLCanvasElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const result = await api.indicadoresAnaliseBiometrica();
      setData(result);
    } catch (e) {
      setData(null);
      setErr(e instanceof Error ? e.message : "Não foi possível consultar a análise biométrica.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const talhoesDisponiveis = useMemo(() => {
    const rows = data?.registros ?? [];
    return [...new Set(rows.filter((row) => !fazenda || row.fazenda === fazenda).map((row) => row.talhao))]
      .filter(Boolean)
      .sort((a, b) => Number(a) - Number(b) || a.localeCompare(b, "pt-BR"));
  }, [data, fazenda]);

  const filtered = useMemo(() => {
    const needle = busca.trim().toLowerCase();
    return (data?.registros ?? []).filter((row) => {
      if (fazenda && row.fazenda !== fazenda) return false;
      if (talhao && row.talhao !== talhao) return false;
      if (inicio && row.data < inicio) return false;
      if (fim && row.data > fim) return false;
      if (!needle) return true;
      return [row.fazenda, row.fazendaNome, row.fazendaLabel, row.talhao, row.variedade, row.dataLabel].some((value) => String(value ?? "").toLowerCase().includes(needle));
    });
  }, [data, fazenda, talhao, inicio, fim, busca]);

  const sortedRows = useMemo(() => {
    const needle = busca.trim().toLowerCase();
    const rows = (data?.pontos ?? []).filter((row) => {
      if (fazenda && row.fazenda !== fazenda) return false;
      if (talhao && row.talhao !== talhao) return false;
      if (inicio && row.data < inicio) return false;
      if (fim && row.data > fim) return false;
      if (!needle) return true;
      return [row.fazenda, row.fazendaNome, row.fazendaLabel, row.talhao, row.ponto, row.pontoDescricao, row.variedade, row.dataLabel].some((value) =>
        String(value ?? "").toLowerCase().includes(needle),
      );
    });
    rows.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const dir = sortDir === "asc" ? 1 : -1;
      if (typeof av === "number" || typeof bv === "number") return (((av as number | null) ?? -Infinity) - ((bv as number | null) ?? -Infinity)) * dir;
      return String(av ?? "").localeCompare(String(bv ?? ""), "pt-BR", { numeric: true }) * dir;
    });
    return rows;
  }, [data?.pontos, fazenda, talhao, inicio, fim, busca, sortKey, sortDir]);

  const selectedTalhao = useMemo(() => {
    if (!filtered.length) return null;
    const rows = talhao ? filtered.filter((row) => row.talhao === talhao) : filtered;
    if (!rows.length) return null;
    return {
      fazenda: fazenda || rows[0].fazenda,
      fazendaLabel: fazenda ? (rows[0].fazendaLabel ?? fazenda) : (rows[0].fazendaLabel ?? rows[0].fazenda),
      talhao: talhao || rows[0].talhao,
      tamanhoCana: avg(rows.map((row) => row.tamanhoCana)),
      canaPorMetro: avg(rows.map((row) => row.canaPorMetro)),
      tamanhoEntrenos: avg(rows.map((row) => row.tamanhoEntrenos)),
      pesoPorCana: avg(rows.map((row) => row.pesoPorCana)),
      diametro: avg(rows.map((row) => row.diametro)),
      tch: avg(rows.map((row) => row.tch)),
    };
  }, [filtered, fazenda, talhao]);

  const kpis = useMemo(
    () => ({
      tch: avg(filtered.map((row) => row.tch)),
      fazendas: uniqueCount(filtered.map((row) => row.fazenda)),
      talhoes: uniqueCount(filtered.map((row) => `${row.fazenda}-${row.talhao}`)),
      analises: filtered.length,
    }),
    [filtered],
  );

  const indicadores = useMemo(
    () => [
      ["Tamanho médio da cana", `${fmt(avg(filtered.map((row) => row.tamanhoCana)))} m`],
      ["Cana por metro", fmt(avg(filtered.map((row) => row.canaPorMetro)))],
      ["Tamanho médio dos entrenós", `${fmt(avg(filtered.map((row) => row.tamanhoEntrenos)))} cm`],
      ["Peso médio por cana", `${fmt(avg(filtered.map((row) => row.pesoPorCana)))} kg`],
      ["Diâmetro médio", `${fmt(avg(filtered.map((row) => row.diametro)))} mm`],
      ["TCH estimado", fmt(kpis.tch)],
    ],
    [filtered, kpis.tch],
  );

  const fazendaConfig = useMemo<ChartConfiguration | null>(() => {
    const rows = fazendaWeightedRows(filtered);
    if (!rows.length) return null;
    return {
      type: "bar",
      data: { labels: rows.map((row) => row.label), datasets: [{ label: "TCH médio", data: rows.map((row) => row.value), backgroundColor: "#2f8f56", borderRadius: 6 }] },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (item) => {
                const row = rows[item.dataIndex];
                if (!row) return `TCH: ${fmt(Number(item.raw), 1)} t/ha`;
                return [
                  `TCH: ${fmt(row.value, 1)} t/ha`,
                  row.areaHa != null ? `Área ponderada: ${fmt(row.areaHa, 2)} ha` : "Sem área: média simples",
                  `Talhões: ${row.talhoes}`,
                ];
              },
            },
          },
          datalabels: { anchor: "end", align: "right", formatter: (v) => `${fmt(Number(v), 1)} t/ha`, color: "#234130", font: { weight: "bold" } },
        },
        scales: { x: { beginAtZero: true, grid: { color: "rgba(32,54,42,.12)" } }, y: { grid: { display: false } } },
      },
    };
  }, [filtered]);

  const talhaoConfig = useMemo<ChartConfiguration | null>(() => {
    const rows = talhaoChartRows(filtered, fazenda, talhaoMode);
    if (!rows.length) return null;
    return {
      type: "bar",
      data: { labels: rows.map((row) => row.label), datasets: [{ label: "TCH médio", data: rows.map((row) => row.value), backgroundColor: rows.map((row) => row.value >= 95 ? "#23834d" : row.value >= 80 ? "#d59b22" : "#c94b37"), borderRadius: 6 }] },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items) => {
                const index = items[0]?.dataIndex ?? 0;
                return rows[index]?.label ?? "";
              },
              label: (item) => {
                const row = rows[item.dataIndex];
                if (!row) return "";
                return [`Fazenda: ${row.fazenda}`, `Talhão: ${row.talhao}`, `TCH: ${fmt(row.value, 1)} t/ha`, row.dataAnalise ? `Data da análise: ${row.dataAnalise}` : ""].filter(Boolean);
              },
            },
          },
          datalabels: { anchor: "end", align: "right", formatter: (v) => `${fmt(Number(v), 1)} t/ha`, color: "#1c2e24", font: { weight: "bold" } },
        },
        scales: { x: { beginAtZero: true, grid: { color: "rgba(32,54,42,.12)" } }, y: { grid: { display: false } } },
      },
    };
  }, [filtered, fazenda, talhaoMode]);

  const evolucaoConfig = useMemo<ChartConfiguration | null>(() => {
    const map = new Map<string, number[]>();
    for (const row of filtered) {
      if (row.tch == null) continue;
      const values = map.get(row.data) ?? [];
      values.push(row.tch);
      map.set(row.data, values);
    }
    const rows = [...map.entries()].map(([label, values]) => ({ label, value: avg(values) ?? 0 })).sort((a, b) => a.label.localeCompare(b.label));
    if (!rows.length) return null;
    return {
      type: "line",
      data: { labels: rows.map((row) => dateLabel(row.label)), datasets: [{ label: "TCH estimado", data: rows.map((row) => row.value), borderColor: "#1f6f46", backgroundColor: "rgba(47,143,86,.16)", pointBackgroundColor: "#1f6f46", pointRadius: 4, tension: 0.32, fill: true }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, datalabels: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: "rgba(32,54,42,.12)" } }, x: { grid: { display: false } } } },
    };
  }, [filtered]);

  useChart(fazendaRef, fazendaConfig);
  useChart(talhaoRef, talhaoConfig);
  useChart(evolucaoRef, evolucaoConfig);

  function order(key: SortKey) {
    if (sortKey === key) setSortDir((current) => (current === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "fazenda" || key === "talhao" || key === "data" || key === "ponto" ? "asc" : "desc");
    }
  }

  const tchClass = classificarTch(selectedTalhao?.tch);

  return (
    <section className="bio-root print-report-intro">
      <header className="bio-hero">
        <div>
          <span>Análise biométrica</span>
          <h2>Relatório de Análise Biométrica de Cana-de-Açúcar</h2>
          <p>Produtividade estimada por fazenda e talhão, com leitura das características biométricas ligadas ao TCH.</p>
        </div>
        <div className="bio-hero-actions no-print">
          <button className="btn" type="button" onClick={() => void load()} disabled={loading}>
            {loading ? "Atualizando..." : "Atualizar"}
          </button>
          {data ? <PrintButton /> : null}
        </div>
      </header>

      <form className="bio-filters no-print" onSubmit={(e) => e.preventDefault()}>
        <label>Fazenda<select value={fazenda} onChange={(e) => { setFazenda(e.target.value); setTalhao(""); }}><option value="">Todas</option>{data?.fazendas.map((row) => <option key={row.codigo} value={row.codigo}>{row.label}</option>)}</select></label>
        <label>Talhão<select value={talhao} onChange={(e) => setTalhao(e.target.value)}><option value="">Todos</option>{talhoesDisponiveis.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label>Data inicial<input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} /></label>
        <label>Data final<input type="date" value={fim} onChange={(e) => setFim(e.target.value)} /></label>
        <label>Pesquisar<input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Fazenda, talhão, variedade..." /></label>
      </form>
      <ConsultaProgressBar active={loading} label="Consultando análise biométrica..." className="consulta-progress--compact" />
      {err ? <p className="lead bio-error">{err}</p> : null}

      {data ? (
        <>
          <div className="bio-kpis">
            <Kpi label="TCH médio estimado" value={fmt(kpis.tch)} />
            <Kpi label="Fazendas analisadas" value={fmtInt(kpis.fazendas)} />
            <Kpi label="Talhões analisados" value={fmtInt(kpis.talhoes)} />
            <Kpi label="Análises realizadas" value={fmtInt(kpis.analises)} hint={`${fmtInt(data.registros.length)} no total`} />
          </div>

          <div className="bio-grid">
            <ChartCard
              title="TCH por Fazenda"
              info="Calcula o TCH da fazenda por média ponderada pela área dos talhões: para cada talhão, TCH médio do talhão × área do talhão; depois soma os resultados e divide pela soma das áreas. Se a área do talhão não estiver disponível, usa média simples como fallback."
            >
              {fazendaConfig ? <canvas ref={fazendaRef} /> : <p className="lead">Sem dados de TCH.</p>}
            </ChartCard>
            <ChartCard
              title="TCH por Fazenda e Talhão"
              info="Mostra a média do TCH por combinação de fazenda e talhão, evitando misturar talhões com o mesmo número em fazendas diferentes. Com uma fazenda filtrada, o rótulo mostra somente o talhão."
            >
              <div className="bio-chart-mode no-print" aria-label="Modo do gráfico TCH por Fazenda e Talhão">
                {[
                  ["maiores", "Maiores TCH"],
                  ["menores", "Menores TCH"],
                  ["todos", "Todos"],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    className={talhaoMode === key ? "is-active" : ""}
                    onClick={() => setTalhaoMode(key as TalhaoChartMode)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {talhaoConfig ? <canvas ref={talhaoRef} /> : <p className="lead">Selecione uma fazenda ou consulte registros com TCH.</p>}
            </ChartCard>
            <ChartCard
              title="Evolução do TCH"
              info="Agrupa as análises por data e calcula a média do TCH estimado em cada dia, respeitando os filtros de fazenda, talhão e período."
            >
              {evolucaoConfig ? <canvas ref={evolucaoRef} /> : <p className="lead">Sem série temporal para o filtro atual.</p>}
            </ChartCard>
            <section className="bio-indicators">
              <h3>Indicadores biométricos</h3>
              <div>{indicadores.map(([label, value]) => <p key={label}><span>{label}</span><strong>{value}</strong></p>)}</div>
            </section>
          </div>

          {selectedTalhao ? (
            <section className="bio-talhao">
              <div>
                <p className="bio-talhao-title">
                  <strong>FAZENDA:</strong> {selectedTalhao.fazendaLabel}
                  <InfoButton text="Classificação do TCH estimado: TCH maior ou igual a 95 t/ha = Alta produtividade; TCH de 80 a 94,9 t/ha = Produtividade média; TCH menor que 80 t/ha = Atenção produtiva; sem valor de TCH = Sem TCH." />
                </p>
                <p><strong>TALHÃO:</strong> {selectedTalhao.talhao}</p>
                <p><strong>TCH ESTIMADO:</strong> {fmt(selectedTalhao.tch)}</p>
              </div>
              <div className={`bio-tch-badge is-${tchClass.tone}`}>{tchClass.label}</div>
              <dl>
                <dt>Tamanho da cana</dt><dd>{fmt(selectedTalhao.tamanhoCana)} m</dd>
                <dt>Cana por metro</dt><dd>{fmt(selectedTalhao.canaPorMetro)}</dd>
                <dt>Tamanho de entrenós</dt><dd>{fmt(selectedTalhao.tamanhoEntrenos)} cm</dd>
                <dt>Peso por cana</dt><dd>{fmt(selectedTalhao.pesoPorCana)} kg</dd>
                <dt>Diâmetro</dt><dd>{fmt(selectedTalhao.diametro)} mm</dd>
              </dl>
            </section>
          ) : null}

          <section className="bio-table-section">
            <div className="bio-table-head"><h3>Tabela detalhada</h3><span>{fmtInt(sortedRows.length)} registro(s)</span></div>
            <div className="table-wrap bio-table-wrap">
              <table className="data bio-table">
                <thead><tr>{[["fazenda","Fazenda"],["talhao","Talhão"],["data","Data"],["ponto","Ponto"],["tamanhoCana","Tamanho da Cana"],["canaPorMetro","Cana/Metro"],["tamanhoEntrenos","Entrenós"],["pesoPorCana","Peso/Cana"],["diametro","Diâmetro"],["tch","TCH"]].map(([key,label]) => <th key={key} className={key === "fazenda" ? "left" : "num"}><button type="button" onClick={() => order(key as SortKey)}>{label}</button></th>)}</tr></thead>
                <tbody>
                  {sortedRows.map((row) => (
                    <tr key={row.id}>
                      <td className="left">{row.fazendaLabel}</td>
                      <td className="num">{row.talhao}</td>
                      <td className="num">{dateLabel(row.data)}</td>
                      <td className="num">{row.pontoDescricao}</td>
                      <td className="num">{fmt(row.tamanhoCana)}</td>
                      <td className="num">{fmt(row.canaPorMetro)}</td>
                      <td className="num">{fmt(row.tamanhoEntrenos)}</td>
                      <td className="num">{fmt(row.pesoPorCana)}</td>
                      <td className="num">{fmt(row.diametro)}</td>
                      <td className="num"><strong>{fmt(row.tch)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </section>
  );
}
