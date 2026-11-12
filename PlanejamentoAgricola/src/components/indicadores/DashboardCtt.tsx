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
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { api, type ColheitaCaminhaoRow, type ColheitaMaquinaRow, type IndicadoresColheitaProducaoData, type IndicadoresProducaoLinha } from "../../api";
import { INDICADORES_CTT, INDICADORES_CTT_CAMINHAO, INDICADORES_CTT_TRATOR, metaNoPeriodo, type CttIndicadorDef } from "../../lib/indicador-ctt";
import { readMetaCtt } from "../../lib/metas-locais";
import { useApp } from "../../store";
import { safraDefaultRange } from "../colheita/colheita-utils";

ChartJS.register(CategoryScale, LinearScale, BarElement, BarController, LineElement, LineController, PointElement, Tooltip, Legend);

type Categoria = "todos" | "colhedora" | "trator" | "caminhao";
type Turno = "todos" | "A" | "B" | "C";
type LinhaCtt = IndicadoresProducaoLinha & { categoria: Exclude<Categoria, "todos">; perda: number | null; mineral: number | null };

const CORES = { azul: "#1f4d7d", verde: "#16a34a", vermelho: "#dc2626", amarelo: "#d97706", cinza: "#64748b" };

function fmt(n: number | null | undefined, casas = 2, sufixo = "") {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: casas }).format(n)}${sufixo}`;
}

function soma(rows: LinhaCtt[], pick: (row: LinhaCtt) => number | null | undefined) {
  return rows.reduce((total, row) => total + (Number(pick(row)) || 0), 0);
}

function razao(num: number, den: number, casas = 2) {
  return den > 0 ? Math.round((num / den) * 10 ** casas) / 10 ** casas : null;
}

function disponibilidade(rows: LinhaCtt[]) {
  const potenciais = soma(rows, (row) => row.horasPotenciais);
  if (potenciais > 0) return razao(Math.max(potenciais - soma(rows, (row) => row.horasOficina), 0) * 100, potenciais);
  const values = rows.map((row) => row.disponibilidadePct).filter((value): value is number => value != null && Number.isFinite(value));
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

function meta(def: CttIndicadorDef, dias: number, quadro: "colhedora" | "trator" | "caminhao") {
  return metaNoPeriodo({ ...def, meta: readMetaCtt(quadro, def.id, def.meta) }, dias);
}

function tom(valor: number | null, metaValor: number | null, sentido: "maior" | "menor" = "maior") {
  if (valor == null || metaValor == null || !(metaValor > 0)) return "neutral";
  const ok = sentido === "menor" ? valor <= metaValor : valor >= metaValor;
  const atencao = sentido === "menor" ? valor <= metaValor * 1.1 : valor >= metaValor * 0.9;
  return ok ? "good" : atencao ? "warn" : "bad";
}

function ChartBar({ labels, values, label, color = CORES.azul, metaValor, horizontal = false, suffix = "" }: {
  labels: string[]; values: Array<number | null>; label: string; color?: string; metaValor?: number | null; horizontal?: boolean; suffix?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !labels.length) return;
    ChartJS.getChart(canvas)?.destroy();
    const chart = new ChartJS(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [
          { type: "bar", label, data: values.map((v) => v ?? null), backgroundColor: color, borderRadius: 5, maxBarThickness: 34 },
          ...(metaValor != null ? [{ type: "line" as const, label: "Meta", data: labels.map(() => metaValor), borderColor: CORES.vermelho, borderWidth: 2, pointRadius: 0, borderDash: [6, 4] }] : []),
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false, indexAxis: horizontal ? "y" : "x",
        plugins: { legend: { display: metaValor != null, labels: { boxWidth: 12 } }, tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmt(Number(ctx.raw), 2, suffix)}` } } },
        scales: { x: { grid: { display: false }, ticks: { autoSkip: true, maxRotation: 35 } }, y: { beginAtZero: true, grid: { color: "rgba(15, 40, 80, .08)" } } },
      },
    });
    return () => chart.destroy();
  }, [color, horizontal, label, labels, metaValor, suffix, values]);
  return labels.length ? <div className="ctt-chart"><canvas ref={ref} /></div> : <p className="lead">Sem dados para o recorte selecionado.</p>;
}

function ChartLine({ labels, realizado, metaValor }: { labels: string[]; realizado: number[]; metaValor: number | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !labels.length) return;
    ChartJS.getChart(canvas)?.destroy();
    const acumulado = realizado.reduce<number[]>((out, value) => [...out, (out.at(-1) ?? 0) + value], []);
    const chart = new ChartJS(canvas, {
      type: "line",
      data: { labels, datasets: [
        { label: "Produção diária", data: realizado, borderColor: CORES.azul, backgroundColor: "rgba(31,77,125,.12)", fill: true, tension: .25, yAxisID: "y" },
        { label: "Produção acumulada", data: acumulado, borderColor: CORES.verde, tension: .25, yAxisID: "y1" },
        ...(metaValor != null ? [{ label: "Meta diária", data: labels.map(() => metaValor), borderColor: CORES.vermelho, pointRadius: 0, borderDash: [6, 4], yAxisID: "y" }] : []),
      ] },
      options: { responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false }, plugins: { legend: { position: "bottom", labels: { boxWidth: 12 } } }, scales: {
        x: { grid: { display: false } }, y: { beginAtZero: true, grid: { color: "rgba(15,40,80,.08)" } },
        y1: { position: "right", beginAtZero: true, grid: { drawOnChartArea: false } },
      } },
    });
    return () => chart.destroy();
  }, [labels, metaValor, realizado]);
  return labels.length ? <div className="ctt-chart ctt-chart--wide"><canvas ref={ref} /></div> : <p className="lead">Sem apontamentos diários no período.</p>;
}

function Card({ label, value, metaValor, sentido, suffix = "", help }: { label: string; value: number | null; metaValor?: number | null; sentido?: "maior" | "menor"; suffix?: string; help?: string }) {
  const pct = value != null && metaValor != null && metaValor > 0 ? (value / metaValor) * 100 : null;
  const tone = tom(value, metaValor ?? null, sentido);
  return <article className={`ctt-kpi ctt-kpi--${tone}`} title={help}>
    <span>{label}</span><strong>{fmt(value, 2, suffix)}</strong>
    {metaValor != null ? <small>Meta: {fmt(metaValor, 2, suffix)} · {pct == null ? "—" : `${fmt(pct, 1)}%`}</small> : <small>{help ?? "Sem meta cadastrada"}</small>}
    {pct != null ? <i><b style={{ width: `${Math.min(100, Math.max(0, sentido === "menor" ? 100 - Math.max(0, pct - 100) : pct))}%` }} /></i> : null}
  </article>;
}

export function DashboardCtt() {
  const { safras, safra } = useApp();
  const defaults = useMemo(() => safraDefaultRange(safra?.code), [safra?.code]);
  const [safraId, setSafraId] = useState(String(safra?.id ?? ""));
  const [inicio, setInicio] = useState(defaults.from); const [fim, setFim] = useState(defaults.to);
  const [fazenda, setFazenda] = useState("todos"); const [frente, setFrente] = useState("todos");
  const [turno, setTurno] = useState<Turno>("todos"); const [categoria, setCategoria] = useState<Categoria>("todos"); const [equipamento, setEquipamento] = useState("todos");
  const [metricProd, setMetricProd] = useState<"Motor" | "Elevador">("Motor"); const [metricDiesel, setMetricDiesel] = useState<"L/t" | "L/h">("L/t");
  const [data, setData] = useState<IndicadoresColheitaProducaoData | null>(null); const [maquina, setMaquina] = useState<ColheitaMaquinaRow[]>([]); const [caminhao, setCaminhao] = useState<ColheitaCaminhaoRow[]>([]);
  const [loading, setLoading] = useState(false); const [erro, setErro] = useState<string | null>(null);

  const consultar = async () => { try { setLoading(true); setErro(null); const [result, m, c] = await Promise.all([
    api.indicadoresColheitaProducao({ dataInicio: inicio, dataFim: fim, refDate: fim }), api.colheitaEntradaMaquina({ dataInicio: inicio, dataFim: fim }), api.colheitaEntradaCaminhao({ dataInicio: inicio, dataFim: fim }),
  ]); setData(result); setMaquina(m.dados); setCaminhao(c.dados); } catch (e) { setErro(e instanceof Error ? e.message : String(e)); } finally { setLoading(false); } };
  useEffect(() => { void consultar(); }, []); // consulta inicial da safra ativa
  useEffect(() => { setInicio(defaults.from); setFim(defaults.to); }, [defaults.from, defaults.to]);

  const all = useMemo<LinhaCtt[]>(() => {
    if (!data) return [];
    const perdas = new Map(data.qualidade?.porEquipamento.filter((x) => x.codEquipamento != null).map((x) => [x.codEquipamento!, x.pctPerda]) ?? []);
    const mineral = new Map(data.qualidade?.impurezaPorEquipamento?.filter((x) => x.codEquipamento != null).map((x) => [x.codEquipamento, x.impurezaMineral]) ?? []);
    return (["colhedora", "trator", "caminhao"] as const).flatMap((kind) => data.tabelas[kind].linhas.map((row) => ({ ...row, categoria: kind, perda: perdas.get(row.codEquipamento) ?? null, mineral: mineral.get(row.codEquipamento) ?? null })));
  }, [data]);
  const fazendas = useMemo(() => [...new Set([...maquina.map((x) => x.fazenda), ...caminhao.map((x) => x.fazenda)].filter((x): x is string => Boolean(x)))].sort(), [maquina, caminhao]);
  const frentes = useMemo(() => [...new Map(all.map((x) => [x.frenteKey ?? "sem-frente", x.frenteLabel ?? "Sem frente"])).entries()], [all]);
  const equipamentosFazenda = useMemo(() => new Set<number>([
    ...maquina.filter((x) => fazenda === "todos" || x.fazenda === fazenda).map((x) => x.codEquipamento),
    ...caminhao.filter((x) => fazenda === "todos" || x.fazenda === fazenda).map((x) => x.codEquipamento),
  ].filter((x): x is number => x != null)), [caminhao, fazenda, maquina]);
  const rows = useMemo(() => all.filter((x) => (categoria === "todos" || x.categoria === categoria) && (frente === "todos" || x.frenteKey === frente) && (equipamento === "todos" || String(x.codEquipamento) === equipamento) && (fazenda === "todos" || equipamentosFazenda.has(x.codEquipamento)) && (turno === "todos" || (x.producaoPorTurno ?? []).some((t) => t.turno === turno))), [all, categoria, equipamento, equipamentosFazenda, fazenda, frente, turno]);
  const colhedoras = rows.filter((x) => x.categoria === "colhedora"); const tratores = rows.filter((x) => x.categoria === "trator"); const caminhoes = rows.filter((x) => x.categoria === "caminhao");
  const dias = data?.filtros.dias ?? 1;
  const producao = soma(rows, (x) => x.toneladaColhida); const litros = soma(rows, (x) => x.litrosCombustivel); const ltTon = razao(litros, producao);
  const defProd = INDICADORES_CTT.find((x) => x.id === "tonDia")!; const metaProd = meta(defProd, dias, "colhedora") * Math.max(1, colhedoras.length);
  const defDisp = (kind: "colhedora" | "trator" | "caminhao") => ({ colhedora: INDICADORES_CTT, trator: INDICADORES_CTT_TRATOR, caminhao: INDICADORES_CTT_CAMINHAO }[kind].find((x) => x.id === "disponibilidade")!);
  const metaDisp = (kind: "colhedora" | "trator" | "caminhao") => meta(defDisp(kind), dias, kind);
  const op = rows.filter((x) => !x.parado).length;
  const daily = useMemo(() => {
    const allowed = new Set(colhedoras.map((x) => x.codEquipamento)); const map = new Map<string, number>();
    for (const x of data?.producaoDiariaPorEquipamento ?? []) if (allowed.has(x.codEquipamento)) map.set(x.data, (map.get(x.data) ?? 0) + x.toneladaColhida);
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [colhedoras, data?.producaoDiariaPorEquipamento]);
  const disponibilidadeCategoria = [
    { label: "Colhedoras", value: disponibilidade(colhedoras), meta: metaDisp("colhedora") }, { label: "Tratores", value: disponibilidade(tratores), meta: metaDisp("trator") }, { label: "Caminhões", value: disponibilidade(caminhoes), meta: metaDisp("caminhao") },
  ];
  const rankingRows = useMemo(() => [...rows].sort((a, b) => (b.toneladaColhida ?? 0) - (a.toneladaColhida ?? 0)).slice(0, 8), [rows]);
  const alertas = useMemo(() => rows.flatMap((row) => {
    const defs = row.categoria === "colhedora" ? [defDisp("colhedora"), ...INDICADORES_CTT.filter((x) => ["tonHrMotor", "dieselTon", "perdasHa", "impurezaMineral"].includes(x.id))] : row.categoria === "trator" ? [defDisp("trator"), ...INDICADORES_CTT_TRATOR.filter((x) => ["dieselHr", "dieselTon"].includes(x.id))] : [defDisp("caminhao"), ...INDICADORES_CTT_CAMINHAO.filter((x) => ["dieselKm"].includes(x.id))];
    const values: Record<string, number | null> = { disponibilidade: row.disponibilidadePct ?? null, tonHrMotor: row.tonHrMotor, dieselTon: row.ltTon, perdasHa: row.perda, impurezaMineral: row.mineral, dieselHr: row.ltHr, dieselKm: row.kmRodados && row.litrosCombustivel ? row.litrosCombustivel / row.kmRodados : null };
    return defs.flatMap((def) => { const value = values[def.id]; const target = meta(def, dias, row.categoria); return value != null && ((def.sentido === "maior" && value < target) || (def.sentido === "menor" && value > target)) ? [{ row, label: def.label, value, target, sentido: def.sentido }] : []; });
  }), [dias, rows]);
  const limpar = () => { setFazenda("todos"); setFrente("todos"); setTurno("todos"); setCategoria("todos"); setEquipamento("todos"); };

  return <div className="ctt-dashboard">
    <section className="ctt-dashboard__hero"><div><p>GESTÃO DE COLHEITA</p><h2>Dashboard CTT — Visão Gerencial</h2><span>Indicadores reais de Entrada de Cana e Indicadores CTT.</span></div><button className="btn" onClick={limpar}>Limpar filtros</button></section>
    <section className="panel ctt-dashboard__filters"><label>Safra<select value={safraId} onChange={(e) => { const next = safras.find((x) => String(x.id) === e.target.value); setSafraId(e.target.value); const range = safraDefaultRange(next?.code); setInicio(range.from); setFim(range.to); }}><option value="">Atual</option>{safras.map((x) => <option value={x.id} key={x.id}>{x.label}</option>)}</select></label><label>Início<input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} /></label><label>Fim<input type="date" value={fim} onChange={(e) => setFim(e.target.value)} /></label><label>Fazenda<select value={fazenda} onChange={(e) => { setFazenda(e.target.value); setEquipamento("todos"); }}><option value="todos">Todas</option>{fazendas.map((x) => <option key={x}>{x}</option>)}</select></label><label>Frente<select value={frente} onChange={(e) => setFrente(e.target.value)}><option value="todos">Todas</option>{frentes.map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label><label>Turno<select value={turno} onChange={(e) => setTurno(e.target.value as Turno)}><option value="todos">Todos</option><option value="A">Turno A</option><option value="B">Turno B</option><option value="C">Turno C</option></select></label><label>Tipo<select value={categoria} onChange={(e) => { setCategoria(e.target.value as Categoria); setEquipamento("todos"); }}><option value="todos">Todos</option><option value="colhedora">Colhedoras</option><option value="trator">Tratores</option><option value="caminhao">Caminhões</option></select></label><label>Equipamento<select value={equipamento} onChange={(e) => setEquipamento(e.target.value)}><option value="todos">Todos</option>{all.filter((x) => categoria === "todos" || x.categoria === categoria).map((x) => <option value={x.codEquipamento} key={x.codEquipamento}>{x.equipTag} · {x.categoria}</option>)}</select></label><button className="btn primary" disabled={loading} onClick={() => void consultar()}>{loading ? "Atualizando…" : "Atualizar"}</button></section>
    {erro ? <p className="lead" style={{ color: "var(--danger)" }}>{erro}</p> : null}
    {!data && !loading ? <p className="lead">Consulte um período para carregar o dashboard.</p> : null}
    {data ? <>
      <section className="ctt-kpis"><Card label="Produção total" value={producao} metaValor={metaProd} suffix=" t" /><Card label="Disponibilidade colhedoras" value={disponibilidade(colhedoras)} metaValor={metaDisp("colhedora")} suffix="%" /><Card label="Disponibilidade tratores" value={disponibilidade(tratores)} metaValor={metaDisp("trator")} suffix="%" /><Card label="Disponibilidade caminhões" value={disponibilidade(caminhoes)} metaValor={metaDisp("caminhao")} suffix="%" /><Card label="Diesel consumido" value={litros || null} suffix=" L" help="Soma dos abastecimentos disponíveis no período" /><Card label="Diesel por tonelada" value={ltTon} metaValor={categoria === "colhedora" ? meta(INDICADORES_CTT.find((x) => x.id === "dieselTon")!, dias, "colhedora") : null} sentido="menor" suffix=" L/t" /><Card label="Equipamentos em operação" value={op} help={`${rows.length} equipamentos no recorte`} /></section>
      <section className="ctt-grid ctt-grid--main"><article className="panel"><h3>Evolução da produção</h3><ChartLine labels={daily.map(([day]) => day.slice(5).split("-").reverse().join("/"))} realizado={daily.map(([, value]) => value)} metaValor={colhedoras.length ? meta(defProd, 1, "colhedora") * colhedoras.length : null} /></article><article className="panel"><h3>Disponibilidade por categoria</h3><ChartBar labels={disponibilidadeCategoria.map((x) => x.label)} values={disponibilidadeCategoria.map((x) => x.value)} label="Disponibilidade" metaValor={85} horizontal suffix="%" /></article></section>
      <Section title="Colhedoras" count={colhedoras.length}><div className="ctt-grid"><article className="panel"><h3>Produção por colhedora</h3><ChartBar labels={colhedoras.map((x) => x.equipTag)} values={colhedoras.map((x) => x.toneladaColhida)} label="Toneladas" metaValor={meta(defProd, dias, "colhedora")} suffix=" t" /></article><article className="panel"><h3>Disponibilidade por colhedora</h3><ChartBar labels={colhedoras.map((x) => x.equipTag)} values={colhedoras.map((x) => x.disponibilidadePct)} label="Disponibilidade" metaValor={metaDisp("colhedora")} horizontal suffix="%" /></article><article className="panel"><h3>Produtividade operacional</h3><MetricToggle value={metricProd} onChange={setMetricProd} a="Motor" b="Elevador" /><ChartBar labels={colhedoras.map((x) => x.equipTag)} values={colhedoras.map((x) => metricProd === "Motor" ? x.tonHrMotor : x.tonHrElevador)} label={metricProd === "Motor" ? "t/h motor" : "t/h elevador"} metaValor={meta(INDICADORES_CTT.find((x) => x.id === (metricProd === "Motor" ? "tonHrMotor" : "tonHrElevador"))!, dias, "colhedora")} /></article><article className="panel"><h3>Consumo de diesel</h3><MetricToggle value={metricDiesel} onChange={setMetricDiesel} a="L/t" b="L/h" /><ChartBar labels={colhedoras.map((x) => x.equipTag)} values={colhedoras.map((x) => metricDiesel === "L/t" ? x.ltTon : x.ltHr)} label={metricDiesel} color={CORES.amarelo} metaValor={meta(INDICADORES_CTT.find((x) => x.id === (metricDiesel === "L/t" ? "dieselTon" : "dieselHr"))!, dias, "colhedora")} /></article><article className="panel"><h3>Perdas operacionais</h3><ChartBar labels={colhedoras.map((x) => x.equipTag)} values={colhedoras.map((x) => x.perda)} label="Perdas (%)" color={CORES.vermelho} metaValor={meta(INDICADORES_CTT.find((x) => x.id === "perdasHa")!, dias, "colhedora")} suffix="%" /></article><article className="panel"><h3>Impureza mineral</h3><ChartBar labels={colhedoras.map((x) => x.equipTag)} values={colhedoras.map((x) => x.mineral)} label="Impureza mineral (%)" color={CORES.amarelo} metaValor={meta(INDICADORES_CTT.find((x) => x.id === "impurezaMineral")!, dias, "colhedora")} suffix="%" /></article></div></Section>
      <Section title="Tratores transbordo" count={tratores.length}><div className="ctt-grid"><article className="panel"><h3>Disponibilidade por trator</h3><ChartBar labels={tratores.map((x) => x.equipTag)} values={tratores.map((x) => x.disponibilidadePct)} label="Disponibilidade" metaValor={metaDisp("trator")} horizontal suffix="%" /></article><article className="panel"><h3>Produção transportada</h3><ChartBar labels={tratores.map((x) => x.equipTag)} values={tratores.map((x) => x.toneladaColhida)} label="Toneladas" suffix=" t" /></article><article className="panel"><h3>Diesel por hora</h3><ChartBar labels={tratores.map((x) => x.equipTag)} values={tratores.map((x) => x.ltHr)} label="L/h" color={CORES.amarelo} metaValor={meta(INDICADORES_CTT_TRATOR.find((x) => x.id === "dieselHr")!, dias, "trator")} /></article><article className="panel"><h3>Óleo hidráulico por tonelada</h3><ChartBar labels={tratores.map((x) => x.equipTag)} values={tratores.map((x) => razao(x.litrosOleoHidraulico ?? 0, x.toneladaColhida))} label="L/t" color={CORES.amarelo} metaValor={meta(INDICADORES_CTT_TRATOR.find((x) => x.id === "oleoTon")!, dias, "trator")} /></article></div></Section>
      <Section title="Caminhões CTT" count={caminhoes.length}><div className="ctt-grid"><article className="panel"><h3>Disponibilidade por caminhão</h3><ChartBar labels={caminhoes.map((x) => x.equipTag)} values={caminhoes.map((x) => x.disponibilidadePct)} label="Disponibilidade" metaValor={metaDisp("caminhao")} horizontal suffix="%" /></article><article className="panel"><h3>Produção transportada</h3><ChartBar labels={caminhoes.map((x) => x.equipTag)} values={caminhoes.map((x) => x.toneladaColhida)} label="Toneladas" suffix=" t" /></article><article className="panel"><h3>Diesel por quilômetro</h3><ChartBar labels={caminhoes.map((x) => x.equipTag)} values={caminhoes.map((x) => razao(x.litrosCombustivel, x.kmRodados ?? 0, 3))} label="L/km" color={CORES.amarelo} metaValor={meta(INDICADORES_CTT_CAMINHAO.find((x) => x.id === "dieselKm")!, dias, "caminhao")} /></article><article className="panel"><h3>Eficiência de consumo</h3><ChartBar labels={caminhoes.map((x) => x.equipTag)} values={caminhoes.map((x) => razao(x.kmRodados ?? 0, x.litrosCombustivel))} label="km/L" color={CORES.verde} metaValor={meta(INDICADORES_CTT_CAMINHAO.find((x) => x.id === "eficienciaKm")!, dias, "caminhao")} /></article></div></Section>
      <section className="ctt-grid"><article className="panel"><h3>Ranking — maior produção</h3><table className="data ctt-table"><thead><tr><th>Equipamento</th><th>Tipo</th><th className="num">Produção</th><th className="num">Disponibilidade</th></tr></thead><tbody>{rankingRows.map((x) => <tr key={`${x.categoria}-${x.codEquipamento}`}><td>{x.equipTag}</td><td>{x.categoria}</td><td className="num">{fmt(x.toneladaColhida)} t</td><td className="num">{fmt(x.disponibilidadePct, 1)}%</td></tr>)}</tbody></table></article><article className="panel"><h3>Pontos de atenção</h3>{alertas.length ? <ul className="ctt-alerts">{alertas.slice(0, 12).map((x, i) => <li key={`${x.row.codEquipamento}-${x.label}-${i}`}><button onClick={() => { setCategoria(x.row.categoria); setEquipamento(String(x.row.codEquipamento)); }}><b>{x.row.equipTag}</b> · {x.label}: {fmt(x.value, 2)} (meta {fmt(x.target, 2)})</button></li>)}</ul> : <p className="lead">Nenhum desvio identificado nas metas disponíveis.</p>}</article></section>
      <section className="panel"><h3>Análise de metas</h3><table className="data ctt-table"><thead><tr><th>Indicador</th><th className="num">Meta</th><th className="num">Realizado</th><th className="num">% atingimento</th><th>Situação</th></tr></thead><tbody>{[
        ["Produção de cana", metaProd, producao, "maior"], ["Disponibilidade colhedoras", metaDisp("colhedora"), disponibilidade(colhedoras), "maior"], ["Disponibilidade tratores", metaDisp("trator"), disponibilidade(tratores), "maior"], ["Disponibilidade caminhões", metaDisp("caminhao"), disponibilidade(caminhoes), "maior"], ["Diesel por tonelada", categoria === "colhedora" ? meta(INDICADORES_CTT.find((x) => x.id === "dieselTon")!, dias, "colhedora") : null, ltTon, "menor"],
      ].map(([label, target, value, sentido]) => { const p = target && value != null ? (Number(value) / Number(target)) * 100 : null; const status = tom(value as number | null, target as number | null, sentido as "maior" | "menor"); return <tr key={String(label)}><td>{label}</td><td className="num">{fmt(target as number | null)}</td><td className="num">{fmt(value as number | null)}</td><td className="num">{p == null ? "—" : `${fmt(p, 1)}%`}</td><td><span className={`ctt-status ctt-status--${status}`}>{status === "good" ? "Dentro da meta" : status === "warn" ? "Atenção" : status === "bad" ? "Abaixo da meta" : "Sem meta"}</span></td></tr>; })}</tbody></table></section>
    </> : null}
  </div>;
}

function MetricToggle<T extends string>({ value, onChange, a, b }: { value: T; onChange: (value: T) => void; a: T; b: T }) { return <div className="ctt-toggle"><button className={value === a ? "active" : ""} onClick={() => onChange(a)}>{a}</button><button className={value === b ? "active" : ""} onClick={() => onChange(b)}>{b}</button></div>; }
function Section({ title, count, children }: { title: string; count: number; children: ReactNode }) { return <section className="ctt-section"><div><h2>{title}</h2><span>{count} equipamento(s) no recorte</span></div>{children}</section>; }
