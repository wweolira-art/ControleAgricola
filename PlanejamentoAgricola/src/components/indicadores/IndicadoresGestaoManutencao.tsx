import {
  BarController,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
  type ChartConfiguration,
  type Plugin,
} from "chart.js";
import ChartDataLabels from "chartjs-plugin-datalabels";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { api, type GestaoManutencaoData, type GestaoManutencaoFalha, type GestaoManutencaoOsDetalhe } from "../../api";
import { useApp } from "../../store";
import { canAccess, PERMISSION_ADMIN } from "../../lib/permissions";
import {
  readMetaDisponibilidade,
  readMetaDisponibilidadeTipo,
  readMetaMtbf,
  readMetaMttr,
  writeMetaDisponibilidadeTipo,
  writeMetaMtbf,
  writeMetaMttr,
} from "../../lib/metas-locais";
import {
  confiabilidadeFaixaLabel,
  faixaConfiabilidade,
  pctConfiabilidade,
} from "../../lib/confiabilidade-equipamento";
import { ConsultaProgressBar } from "../ConsultaProgressBar";
import { CopyGroupBar, CopyGroupCheckbox, CopyVisualButton } from "../CopyVisualButton";
import { MonitoramentoOsSection } from "./MonitoramentoOsSection";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  BarController,
  LineElement,
  LineController,
  PointElement,
  Tooltip,
  Legend,
  ChartDataLabels,
);

const COR_AZUL = "#5b9bd5";
const COR_AZUL_ESCURO = "#1e4e79";
const COR_META = "#c00000";
const COR_OK = "#15803d";
const COR_BORDA = "#2f5496";

type MetaPorTipo = { metaMttrHoras: number; metaMtbfHoras: number; metaDisponibilidade: number };

function fmtHoras(horas: number | null | undefined) {
  if (horas == null || !Number.isFinite(horas)) return "—";
  const totalMin = Math.round(Math.abs(horas) * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

function fmtPct(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)}%`;
}

function fmtMoney(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function fmtQty(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(n);
}

function fmtDateBr(iso: string | null | undefined) {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function fmtDateTimeBr(iso: string | null | undefined) {
  if (!iso) return "—";
  const date = fmtDateBr(iso);
  const time = iso.slice(11, 16);
  return time ? `${date} ${time}` : date;
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

function ChartCard({
  title,
  children,
  className,
  bodyStyle,
  extra,
}: {
  title: string;
  children: ReactNode;
  className?: string;
  bodyStyle?: CSSProperties;
  extra?: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  return (
    <section ref={ref} className={`gm-chart-card${className ? ` ${className}` : ""}`} data-copy-root data-copy-title={title}>
      <header>
        <span>{title}</span>
        <div className="gm-chart-card-tools no-print">
          {extra}
          <div className="gm-copy-actions">
            <CopyGroupCheckbox />
            <CopyVisualButton targetRef={ref} />
          </div>
        </div>
      </header>
      <div className="gm-chart-body" style={bodyStyle}>{children}</div>
    </section>
  );
}

function GmKpiCard({
  className,
  title,
  value,
}: {
  className: string;
  title: string;
  value: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div ref={ref} className={`${className} gm-kpi-copyable`} data-copy-root data-copy-title={title}>
      <div className="gm-copy-actions no-print">
        <CopyGroupCheckbox />
        <CopyVisualButton targetRef={ref} />
      </div>
      <span>{title}</span>
      <strong>{value}</strong>
    </div>
  );
}

function GmCopyable({
  className,
  title,
  head,
  children,
}: {
  className: string;
  title: string;
  head?: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  return (
    <section ref={ref} className={className} data-copy-title={title} data-copy-root>
      <div className="gm-copyable-head">
        {head ?? <h4>{title}</h4>}
        <div className="gm-copy-actions no-print">
          <CopyGroupCheckbox />
          <CopyVisualButton targetRef={ref} />
        </div>
      </div>
      {children}
    </section>
  );
}

const metaLabelPlugin = (meta: number | null, formatter: (v: number) => string, fontPx = 11): Plugin => ({
  id: "gmMetaLabel",
  afterDraw(chart) {
    if (meta == null || !Number.isFinite(meta)) return;
    const yScale = chart.scales.y;
    if (!yScale) return;
    const y = yScale.getPixelForValue(meta);
    const { ctx, chartArea } = chart;
    if (!chartArea || y < chartArea.top || y > chartArea.bottom) return;
    ctx.save();
    ctx.fillStyle = COR_META;
    ctx.font = `bold ${fontPx}px sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(formatter(meta), chartArea.right + 6, y);
    ctx.restore();
  },
});

function ConfiabilidadeDot({ faixa }: { faixa: ReturnType<typeof faixaConfiabilidade> }) {
  if (!faixa) return <span className="gm-conf-dot gm-conf-dot--na" aria-hidden />;
  return <span className={`gm-conf-dot gm-conf-dot--${faixa}`} title={confiabilidadeFaixaLabel(faixa)} />;
}

function ConfiabilidadeEquipamentosTable({
  itens,
  total,
  dataInicio,
  dataFim,
  diasEstimados,
  onDiasEstimados,
}: {
  itens: NonNullable<GestaoManutencaoData["confiabilidadeEquipamentos"]>;
  total: GestaoManutencaoData["kpis"] | null;
  dataInicio: string;
  dataFim: string;
  diasEstimados: number;
  onDiasEstimados: (dias: number) => void;
}) {
  const linhas = useMemo(
    () =>
      itens.map((row) => {
        const pct = pctConfiabilidade(row.mtbfHoras, diasEstimados, {
          semFalha: row.qtdFalhas === 0,
          operou: row.tempoOperacaoHoras > 0,
        });
        return { ...row, pct, faixa: faixaConfiabilidade(pct) };
      }),
    [diasEstimados, itens],
  );
  const totalPct = pctConfiabilidade(total?.mtbfHoras, diasEstimados, {
    semFalha: (total?.qtdFalhas ?? 0) === 0,
    operou: (total?.tempoOperacaoHoras ?? 0) > 0,
  });
  const totalFaixa = faixaConfiabilidade(totalPct);

  return (
    <GmCopyable
      className="gm-conf-board"
      title="Confiabilidade / Disponibilidade"
      head={
        <div className="gm-conf-toolbar">
          <h4>CONFIABILIDADE / DISPONIBILIDADE</h4>
          <div className="gm-conf-period">
            <span>Período MTBF</span>
            <strong>
              {fmtDateBr(dataInicio)} — {fmtDateBr(dataFim)}
            </strong>
          </div>
          <label className="gm-conf-dias no-print">
            <span>Dias estimado</span>
            <input
              type="number"
              min={0.1}
              step={0.1}
              value={Number.isFinite(diasEstimados) ? diasEstimados : 1}
              onChange={(e) => {
                const n = Number(e.target.value);
                onDiasEstimados(Number.isFinite(n) && n > 0 ? n : 1);
              }}
            />
          </label>
          <div className="gm-conf-legend" aria-label="Legenda da confiabilidade">
            <span>
              <i className="gm-conf-dot gm-conf-dot--excelente" /> Excelente
            </span>
            <span>
              <i className="gm-conf-dot gm-conf-dot--atencao" /> Atenção
            </span>
            <span>
              <i className="gm-conf-dot gm-conf-dot--critico" /> Crítico
            </span>
          </div>
        </div>
      }
    >
      <p className="gm-conf-hint">
        Confiabilidade em {diasEstimados === 1 ? "1 dia" : `${diasEstimados} dias`} (22 h/dia) = e
        <sup>−t / MTBF</sup> × 100. Só equipamentos próprios com horas em{" "}
        <code>automotivo.equipamento.disponibilidade</code>. Só entram falhas corretivas que
        interromperam o trabalho.
      </p>
      <div className="gm-conf-wrap">
        <table className="gm-conf-table">
          <thead>
            <tr>
              <th>COD_EQUIPAMENTO</th>
              <th>DESCRIÇÃO</th>
              <th className="num">MTBF</th>
              <th className="num">MTTR</th>
              <th className="num">Disponibilidade</th>
              <th className="num">% Confiabilidade</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((row) => (
              <tr key={row.codEquipamento}>
                <td>{row.codEquipamento}</td>
                <td>{row.descricao || "—"}</td>
                <td className="num">{fmtHoras(row.mtbfHoras)}</td>
                <td className="num">{fmtHoras(row.mttrHoras)}</td>
                <td className="num">{fmtPct(row.disponibilidade)}</td>
                <td className="num">
                  <span className="gm-conf-pct">
                    <ConfiabilidadeDot faixa={row.faixa} />
                    {fmtPct(row.pct)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2}>Total</td>
              <td className="num">{fmtHoras(total?.mtbfHoras)}</td>
              <td className="num">{fmtHoras(total?.mttrHoras)}</td>
              <td className="num">{fmtPct(total?.disponibilidade)}</td>
              <td className="num">
                <span className="gm-conf-pct">
                  <ConfiabilidadeDot faixa={totalFaixa} />
                  {fmtPct(totalPct)}
                </span>
              </td>
            </tr>
          </tfoot>
        </table>
        {!linhas.length ? <p className="lead">Nenhum equipamento no filtro do período.</p> : null}
      </div>
    </GmCopyable>
  );
}

function safraInicioAtual(today = new Date()) {
  return today.getMonth() >= 8 ? today.getFullYear() : today.getFullYear() - 1;
}
function safraDatas(anoInicio: number, today = new Date()) {
  const from = `${anoInicio}-09-01`;
  const toFull = `${anoInicio + 1}-08-31`;
  const hoje = today.toISOString().slice(0, 10);
  const to = hoje < toFull && hoje >= from ? hoje : hoje < from ? from : toFull;
  return { from, to };
}
export function IndicadoresGestaoManutencao() {
  const { authUser } = useApp();
  const canEditMetas = canAccess(authUser?.permissions, PERMISSION_ADMIN);
  const datasIniciais = safraDatas(safraInicioAtual());
  const [dataInicio, setDataInicio] = useState(datasIniciais.from);
  const [dataFim, setDataFim] = useState(datasIniciais.to);
  const [categoria, setCategoria] = useState<string | null>(null);
  const [codTipoEquipamento, setCodTipoEquipamento] = useState<number | null>(null);
  const [codEquipamento, setCodEquipamento] = useState<number | null>(null);
  const [codEquipamentos, setCodEquipamentos] = useState<number[]>([]);
  const [tipoMaterialCusto, setTipoMaterialCusto] = useState<string | null>(null);
  const [codObjetoCusto, setCodObjetoCusto] = useState<number | null>(null);
  const [data, setData] = useState<GestaoManutencaoData | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showMetas, setShowMetas] = useState(false);
  const [subAba, setSubAba] = useState<"indicadores" | "custo" | "monitoramento">("indicadores");
  const [loadedTabs, setLoadedTabs] = useState<Set<"indicadores" | "custo">>(new Set());
  const [osConsultToken, setOsConsultToken] = useState(0);
  const [savingMetas, setSavingMetas] = useState(false);
  const [metaMttr, setMetaMttr] = useState(() => readMetaMttr(null, 15));
  const [metaMtbf, setMetaMtbf] = useState(() => readMetaMtbf(null, 15));
  const [metaDisp, setMetaDisp] = useState(() => readMetaDisponibilidade(85));
  const [metaScopeTipo, setMetaScopeTipo] = useState<number | null>(null);
  const copyScopeRef = useRef<HTMLElement>(null);
  const [osAberta, setOsAberta] = useState<Partial<GestaoManutencaoFalha> & Pick<GestaoManutencaoFalha, "ordemServico" | "anoOs" | "numeroOs" | "codEquipamento"> | null>(null);
  const [osDetalhe, setOsDetalhe] = useState<GestaoManutencaoOsDetalhe | null>(null);
  const [osLoading, setOsLoading] = useState(false);
  const [osErr, setOsErr] = useState<string | null>(null);
  const [filtrosOpcoes, setFiltrosOpcoes] = useState<GestaoManutencaoData["filtros"] | null>(null);
  const [diasEstimados, setDiasEstimados] = useState(1);
  const [dispPorSemana, setDispPorSemana] = useState(false);
  const [mttrMtbfPorSemana, setMttrMtbfPorSemana] = useState(false);

  const load = useCallback(async (params?: {
    dataInicio?: string | null;
    dataFim?: string | null;
    categoria?: string | null;
    codTipoEquipamento?: number | null;
    codEquipamento?: number | null;
    codEquipamentos?: number[] | null;
    tipoMaterial?: string | null;
    codObjetoCusto?: number | null;
    modo?: "indicadores" | "custo";
  }) => {
    setLoading(true);
    setErr(null);
    try {
      const nextCategoria = params?.categoria === undefined ? categoria : params.categoria;
      const nextTipo =
        params?.codTipoEquipamento === undefined ? codTipoEquipamento : params.codTipoEquipamento;
      const nextEquip = params?.codEquipamento === undefined ? codEquipamento : params.codEquipamento;
      const nextEquips = params?.codEquipamentos === undefined ? codEquipamentos : params.codEquipamentos ?? [];
      const nextTipoMaterial =
        params?.tipoMaterial === undefined ? tipoMaterialCusto : params.tipoMaterial;
      const nextObjetoCusto =
        params?.codObjetoCusto === undefined ? codObjetoCusto : params.codObjetoCusto;
      const nextInicio = params?.dataInicio === undefined ? dataInicio || undefined : params.dataInicio || undefined;
      const nextFim = params?.dataFim === undefined ? dataFim || undefined : params.dataFim || undefined;

      const modo = params?.modo ?? (subAba === "custo" ? "custo" : "indicadores");
      const result = await api.indicadoresGestaoManutencao({
        dataInicio: nextInicio,
        dataFim: nextFim,
        categoria: nextCategoria,
        codTipoEquipamento: nextTipo,
        codEquipamento: nextEquip,
        codEquipamentos: nextEquips,
        tipoMaterial: nextTipoMaterial || undefined,
        codObjetoCusto: nextObjetoCusto,
        modo,
      });
      const dispLocal = readMetaDisponibilidadeTipo(result.codTipoEquipamento, 85);
      const mttrLocal = readMetaMttr(result.codTipoEquipamento, 15);
      const mtbfLocal = readMetaMtbf(result.codTipoEquipamento, 15);
      setData((prev) => {
        const base = !prev
          ? result
          : modo === "custo"
            ? {
                ...result,
                kpis: prev.kpis,
                meses: prev.meses,
                semanas: prev.semanas,
                falhasMttr: prev.falhasMttr,
                defeitosMttr: prev.defeitosMttr,
              }
            : { ...result, custo: prev.custo };
        return {
          ...base,
          meta: { ...base.meta, mttrHoras: mttrLocal, mtbfHoras: mtbfLocal, disponibilidade: dispLocal },
        };
      });
      setLoadedTabs((prev) => new Set(prev).add(modo));
      setDataInicio(result.dataInicio);
      setDataFim(result.dataFim);
      setCategoria(result.categoria);
      setCodTipoEquipamento(result.codTipoEquipamento);
      setCodEquipamento(result.codEquipamento);
      setCodEquipamentos(nextEquips);
      setTipoMaterialCusto(result.custo.tipoMaterial);
      setCodObjetoCusto(result.custo.codObjetoCusto);
      setMetaMttr(mttrLocal);
      setMetaMtbf(mtbfLocal);
      setMetaDisp(dispLocal);
      setMetaScopeTipo(result.meta.codTipoEquipamento);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível carregar a gestão de manutenção.");
    } finally {
      setLoading(false);
    }
  }, [dataInicio, dataFim, categoria, codTipoEquipamento, codEquipamento, codEquipamentos, tipoMaterialCusto, codObjetoCusto, subAba]);

  useEffect(() => {
    let alive = true;
    api
      .indicadoresGestaoManutencaoFiltros()
      .then((filtros) => {
        if (alive) setFiltrosOpcoes(filtros as GestaoManutencaoData["filtros"]);
      })
      .catch(() => {
        /* a consulta completa ainda preenche os filtros */
      });
    api
      .indicadoresGestaoManutencaoConfig()
      .then((config) => {
        if (!alive) return;
        setMetaMttr(readMetaMttr(null, config.metaMttrHoras));
        setMetaMtbf(readMetaMtbf(null, config.metaMtbfHoras));
        setMetaDisp(readMetaDisponibilidade(85));
      })
      .catch(() => {
        /* o painel de metas continua com o padrão */
      });
    return () => {
      alive = false;
    };
  }, []);

  const closeOs = useCallback(() => {
    setOsAberta(null);
    setOsDetalhe(null);
    setOsErr(null);
    setOsLoading(false);
  }, []);

  const openOs = useCallback(async (
    row: Partial<GestaoManutencaoFalha> & Pick<GestaoManutencaoFalha, "ordemServico" | "anoOs" | "numeroOs" | "codEquipamento">,
  ) => {
    setOsAberta(row);
    setOsDetalhe(null);
    setOsErr(null);
    setOsLoading(true);
    try {
      const detalhe = await api.indicadoresGestaoManutencaoOs(row.anoOs, row.numeroOs);
      setOsDetalhe(detalhe);
    } catch (e) {
      setOsErr(e instanceof Error ? e.message : "Não foi possível abrir a O.S.");
    } finally {
      setOsLoading(false);
    }
  }, []);

  const applySavedMetas = useCallback(
    (mttrHoras: number, mtbfHoras: number, disponibilidade: number, metasPorTipo: Record<string, MetaPorTipo>) => {
      setMetaMttr(mttrHoras);
      setMetaMtbf(mtbfHoras);
      setMetaDisp(disponibilidade);
      setData((prev) =>
        prev
          ? {
              ...prev,
              meta: {
                ...prev.meta,
                mttrHoras,
                mtbfHoras,
                disponibilidade,
                metasPorTipo,
              },
            }
          : prev,
      );
    },
    [],
  );

  const persistMetasLocais = useCallback(() => {
    writeMetaMttr(codTipoEquipamento, metaMttr);
    writeMetaMtbf(codTipoEquipamento, metaMtbf);
    writeMetaDisponibilidadeTipo(codTipoEquipamento, metaDisp);
  }, [codTipoEquipamento, metaDisp, metaMtbf, metaMttr]);

  const saveDisponibilidadeMeta = useCallback(async () => {
    setSavingMetas(true);
    setErr(null);
    persistMetasLocais();
    const currentMetasPorTipo = data?.meta.metasPorTipo ?? {};
    const nextMetasPorTipo =
      codTipoEquipamento != null
        ? {
            ...currentMetasPorTipo,
            [String(codTipoEquipamento)]: {
              metaMttrHoras: metaMttr,
              metaMtbfHoras: metaMtbf,
              metaDisponibilidade: metaDisp,
            },
          }
        : currentMetasPorTipo;
    applySavedMetas(metaMttr, metaMtbf, metaDisp, nextMetasPorTipo);
    try {
      const saved =
        codTipoEquipamento != null
          ? await api.indicadoresGestaoManutencaoConfigSave({ metasPorTipo: nextMetasPorTipo })
          : await api.indicadoresGestaoManutencaoConfigSave({
              metaMttrHoras: metaMttr,
              metaMtbfHoras: metaMtbf,
              metaDisponibilidade: metaDisp,
            });
      applySavedMetas(metaMttr, metaMtbf, metaDisp, saved.metasPorTipo);
    } catch {
      /* as metas já ficaram gravadas no navegador */
    } finally {
      setSavingMetas(false);
    }
  }, [applySavedMetas, codTipoEquipamento, data?.meta.metasPorTipo, metaDisp, metaMtbf, metaMttr, persistMetasLocais]);

  const saveMetas = useCallback(async () => {
    if (!canEditMetas) {
      setErr("Apenas administrador pode alterar as metas.");
      return;
    }
    setSavingMetas(true);
    setErr(null);
    try {
      const currentMetasPorTipo = data?.meta.metasPorTipo ?? {};
      const nextMetasPorTipo: Record<string, MetaPorTipo> =
        metaScopeTipo != null
          ? {
              ...currentMetasPorTipo,
              [String(metaScopeTipo)]: {
                metaMttrHoras: metaMttr,
                metaMtbfHoras: metaMtbf,
                metaDisponibilidade: metaDisp,
              },
            }
          : currentMetasPorTipo;
      writeMetaMttr(metaScopeTipo, metaMttr);
      writeMetaMtbf(metaScopeTipo, metaMtbf);
      writeMetaDisponibilidadeTipo(metaScopeTipo, metaDisp);
      setData((prev) =>
        prev
          ? {
              ...prev,
              meta: {
                ...prev.meta,
                mttrHoras: metaMttr,
                mtbfHoras: metaMtbf,
                disponibilidade: metaDisp,
                codTipoEquipamento: metaScopeTipo,
                metasPorTipo: nextMetasPorTipo,
              },
            }
          : prev,
      );
      try {
        const saved = await api.indicadoresGestaoManutencaoConfigSave(
          metaScopeTipo != null
            ? { metasPorTipo: nextMetasPorTipo }
            : {
                metaMttrHoras: metaMttr,
                metaMtbfHoras: metaMtbf,
                metaDisponibilidade: metaDisp,
                metasPorTipo: nextMetasPorTipo,
              },
        );
        const activeMeta = metaScopeTipo != null ? saved.metasPorTipo[String(metaScopeTipo)] : saved;
        setMetaMttr(activeMeta.metaMttrHoras);
        setMetaMtbf(activeMeta.metaMtbfHoras);
        setMetaDisp(activeMeta.metaDisponibilidade);
        setData((prev) =>
          prev
            ? {
                ...prev,
                meta: {
                  mttrHoras: activeMeta.metaMttrHoras,
                  mtbfHoras: activeMeta.metaMtbfHoras,
                  disponibilidade: activeMeta.metaDisponibilidade,
                  codTipoEquipamento: metaScopeTipo,
                  metasPorTipo: saved.metasPorTipo,
                },
              }
            : prev,
        );
      } catch {
        /* MTTR/MTBF no servidor podem falhar; disponibilidade já ficou no navegador */
      }
      setShowMetas(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível salvar as metas.");
    } finally {
      setSavingMetas(false);
    }
  }, [canEditMetas, data?.meta.metasPorTipo, metaDisp, metaMtbf, metaMttr, metaScopeTipo]);

  useEffect(() => {
    if (!osAberta) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeOs();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [closeOs, osAberta]);

  const labels = useMemo(() => data?.meses.map((m) => m.label) ?? [], [data]);

  const falhasConfig = useMemo<ChartConfiguration | null>(() => {
    if (!data?.meses.length) return null;
    return {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            data: data.meses.map((m) => m.qtdFalhas),
            backgroundColor: COR_AZUL,
            borderRadius: 2,
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
            font: { size: 10, weight: "bold" },
            formatter: (v: number) => (v ? String(v) : ""),
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 } } },
          y: { beginAtZero: true, grace: "18%", ticks: { precision: 0 } },
        },
      },
    };
  }, [data, labels]);

  const tempoConfig = useMemo<ChartConfiguration | null>(() => {
    if (!data?.meses.length) return null;
    return {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            data: data.meses.map((m) => m.tempoReparoHoras),
            backgroundColor: COR_AZUL,
            borderRadius: 2,
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
            font: { size: 9, weight: "bold" },
            formatter: (v: number) => (v ? fmtHoras(v) : ""),
          },
          tooltip: {
            callbacks: {
              label: (ctx) => fmtHoras(Number(ctx.raw)),
            },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 } } },
          y: {
            beginAtZero: true,
            grace: "18%",
            ticks: { callback: (v) => fmtHoras(Number(v)) },
          },
        },
      },
    };
  }, [data, labels]);

  const mttrMtbfSerie = mttrMtbfPorSemana ? (data?.semanas ?? []) : (data?.meses ?? []);
  const mttrConfig = useMemo<ChartConfiguration | null>(() => {
    if (!mttrMtbfSerie.length) return null;
    const meta = data?.meta.mttrHoras ?? 15;
    const girar = mttrMtbfPorSemana && mttrMtbfSerie.length > 3;
    return {
      type: "bar",
      data: {
        labels: mttrMtbfSerie.map((item) => item.label),
        datasets: [
          {
            data: mttrMtbfSerie.map((m) => m.mttrHoras ?? 0),
            backgroundColor: mttrMtbfSerie.map((m) =>
              m.mttrHoras != null && m.mttrHoras > meta ? COR_AZUL_ESCURO : COR_AZUL,
            ),
            borderRadius: 2,
            order: 2,
          },
          {
            type: "line",
            data: mttrMtbfSerie.map(() => meta),
            borderColor: COR_META,
            borderWidth: 2,
            pointRadius: 0,
            order: 1,
            datalabels: { display: false },
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { right: 36, top: girar ? 8 : 0 } },
        plugins: {
          legend: { display: false },
          datalabels: {
            color: (ctx) => {
              if (ctx.datasetIndex !== 0) return "#1e293b";
              const raw = mttrMtbfSerie[ctx.dataIndex]?.mttrHoras;
              if (raw == null) return "#1e293b";
              return raw > meta ? COR_META : COR_OK;
            },
            anchor: "end",
            align: "top",
            font: { size: girar ? 11 : 13, weight: "bold" },
            formatter: (v: number, ctx) => {
              if (ctx.datasetIndex !== 0) return "";
              const raw = mttrMtbfSerie[ctx.dataIndex]?.mttrHoras;
              return raw != null ? fmtHoras(raw) : "";
            },
          },
          tooltip: {
            callbacks: {
              label: (ctx) => (ctx.datasetIndex === 0 ? `MTTR ${fmtHoras(Number(ctx.raw))}` : `Meta ${fmtHoras(meta)}`),
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              font: { size: 10, weight: girar ? "bold" : undefined },
              maxRotation: girar ? 70 : 0,
              minRotation: girar ? 70 : 0,
              autoSkip: false,
            },
          },
          y: {
            beginAtZero: true,
            grace: "18%",
            ticks: { callback: (v) => fmtHoras(Number(v)) },
          },
        },
      },
      plugins: [metaLabelPlugin(meta, fmtHoras)],
    };
  }, [data?.meta.mttrHoras, mttrMtbfPorSemana, mttrMtbfSerie]);

  const mtbfConfig = useMemo<ChartConfiguration | null>(() => {
    if (!mttrMtbfSerie.length) return null;
    const meta = data?.meta.mtbfHoras ?? 15;
    const girar = mttrMtbfPorSemana && mttrMtbfSerie.length > 3;
    return {
      type: "bar",
      data: {
        labels: mttrMtbfSerie.map((item) => item.label),
        datasets: [
          {
            data: mttrMtbfSerie.map((m) => m.mtbfHoras ?? 0),
            backgroundColor: mttrMtbfSerie.map((m) =>
              m.mtbfHoras != null && m.mtbfHoras >= meta ? COR_AZUL_ESCURO : COR_AZUL,
            ),
            borderRadius: 2,
            order: 2,
          },
          {
            type: "line",
            data: mttrMtbfSerie.map(() => meta),
            borderColor: COR_META,
            borderWidth: 2,
            pointRadius: 0,
            order: 1,
            datalabels: { display: false },
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { right: 36, top: girar ? 8 : 0 } },
        plugins: {
          legend: { display: false },
          datalabels: {
            color: (ctx) => {
              if (ctx.datasetIndex !== 0) return "#1e293b";
              const raw = mttrMtbfSerie[ctx.dataIndex]?.mtbfHoras;
              if (raw == null) return "#1e293b";
              return raw >= meta ? COR_OK : COR_META;
            },
            anchor: "end",
            align: "top",
            font: { size: girar ? 11 : 13, weight: "bold" },
            formatter: (v: number, ctx) => {
              if (ctx.datasetIndex !== 0) return "";
              const raw = mttrMtbfSerie[ctx.dataIndex]?.mtbfHoras;
              return raw != null ? fmtHoras(raw) : "";
            },
          },
          tooltip: {
            callbacks: {
              label: (ctx) => (ctx.datasetIndex === 0 ? `MTBF ${fmtHoras(Number(ctx.raw))}` : `Meta ${fmtHoras(meta)}`),
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              font: { size: 10, weight: girar ? "bold" : undefined },
              maxRotation: girar ? 70 : 0,
              minRotation: girar ? 70 : 0,
              autoSkip: false,
            },
          },
          y: {
            beginAtZero: true,
            grace: "18%",
            ticks: { callback: (v) => fmtHoras(Number(v)) },
          },
        },
      },
      plugins: [metaLabelPlugin(meta, fmtHoras)],
    };
  }, [data?.meta.mtbfHoras, mttrMtbfPorSemana, mttrMtbfSerie]);

  const dispSerie = dispPorSemana ? (data?.semanas ?? []) : (data?.meses ?? []);
  const dispConfig = useMemo<ChartConfiguration | null>(() => {
    if (!dispSerie.length) return null;
    const meta = data?.meta.disponibilidade ?? 85;
    const girar = dispPorSemana ? dispSerie.length > 3 : dispSerie.length > 4;
    const dispLabels = dispSerie.map((item) => item.label);
    return {
      type: "bar",
      data: {
        labels: dispLabels,
        datasets: [
          {
            data: dispSerie.map((item) => item.disponibilidade ?? 0),
            backgroundColor: COR_AZUL_ESCURO,
            borderRadius: 2,
            order: 2,
          },
          {
            type: "line",
            data: dispSerie.map(() => meta),
            borderColor: COR_META,
            borderWidth: 2,
            pointRadius: 0,
            order: 1,
            datalabels: { display: false },
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { right: 64, top: girar ? 4 : 8 } },
        plugins: {
          legend: { display: false },
          datalabels: {
            clip: false,
            color: (ctx) => {
              const raw = dispSerie[ctx.dataIndex]?.disponibilidade ?? 0;
              return ctx.datasetIndex === 0 && raw >= 78 ? "#ffffff" : "#0f172a";
            },
            anchor: "end",
            align: (ctx) => {
              const raw = dispSerie[ctx.dataIndex]?.disponibilidade ?? 0;
              return ctx.datasetIndex === 0 && raw >= 78 ? "start" : "end";
            },
            offset: 6,
            rotation: girar ? -90 : 0,
            font: { size: girar ? 13 : 18, weight: "bold" },
            formatter: (v: number, ctx) => {
              if (ctx.datasetIndex !== 0) return "";
              const raw = dispSerie[ctx.dataIndex]?.disponibilidade;
              return raw != null ? fmtPct(raw) : "";
            },
          },
          tooltip: {
            callbacks: {
              label: (ctx) =>
                ctx.datasetIndex === 0 ? fmtPct(Number(ctx.raw)) : `Meta ${fmtPct(meta)}`,
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              font: { size: dispPorSemana ? 11 : 12, weight: "bold" },
              maxRotation: dispPorSemana ? 70 : 0,
              minRotation: dispPorSemana ? 70 : 0,
              autoSkip: false,
            },
          },
          y: {
            beginAtZero: true,
            max: 100,
            ticks: { font: { size: 12 }, callback: (v) => `${v}%` },
          },
        },
      },
      plugins: [metaLabelPlugin(meta, fmtPct, 16)],
    };
  }, [data?.meta.disponibilidade, dispPorSemana, dispSerie]);

  const indispConfig = useMemo<ChartConfiguration | null>(() => {
    if (!data?.meses.length) return null;
    const girar = labels.length > 4;
    return {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            data: data.meses.map((m) => m.indisponibilidade ?? 0),
            backgroundColor: COR_AZUL_ESCURO,
            borderRadius: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: girar ? 4 : 8 } },
        plugins: {
          legend: { display: false },
          datalabels: {
            color: "#0f172a",
            anchor: "end",
            align: "top",
            rotation: girar ? -90 : 0,
            font: { size: girar ? 14 : 18, weight: "bold" },
            formatter: (v: number, ctx) => {
              const raw = data.meses[ctx.dataIndex]?.indisponibilidade;
              return raw != null ? fmtPct(raw) : "";
            },
          },
          tooltip: {
            callbacks: {
              label: (ctx) => fmtPct(Number(ctx.raw)),
            },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 12, weight: "bold" } } },
          y: {
            beginAtZero: true,
            grace: "18%",
            ticks: { font: { size: 12 }, callback: (v) => `${v}%` },
          },
        },
      },
    };
  }, [data, labels]);

  const falhasRef = useRef<HTMLCanvasElement | null>(null);
  const tempoRef = useRef<HTMLCanvasElement | null>(null);
  const mttrRef = useRef<HTMLCanvasElement | null>(null);
  const mtbfRef = useRef<HTMLCanvasElement | null>(null);
  const dispRef = useRef<HTMLCanvasElement | null>(null);
  const indispRef = useRef<HTMLCanvasElement | null>(null);
  const defeitosRef = useRef<HTMLCanvasElement | null>(null);

  const defeitosMttr = data?.defeitosMttr ?? [];
  const defeitosConfig = useMemo<ChartConfiguration | null>(() => {
    if (!defeitosMttr.length) return null;
    return {
      type: "bar",
      data: {
        labels: defeitosMttr.map((row) =>
          row.defeito.length > 48 ? `${row.defeito.slice(0, 48).trim()}…` : row.defeito,
        ),
        datasets: [
          {
            data: defeitosMttr.map((row) => row.tempoReparoHoras),
            backgroundColor: COR_AZUL_ESCURO,
            borderRadius: 2,
          },
        ],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { right: 56 } },
        plugins: {
          legend: { display: false },
          datalabels: {
            color: "#0f172a",
            anchor: "end",
            align: "end",
            font: { size: 14, weight: "bold" },
            formatter: (v: number) => fmtHoras(v),
          },
          tooltip: {
            callbacks: {
              title: (items) => defeitosMttr[items[0]?.dataIndex ?? 0]?.defeito ?? "",
              label: (ctx) => {
                const row = defeitosMttr[ctx.dataIndex];
                if (!row) return fmtHoras(Number(ctx.raw));
                return [
                  `Tempo de reparo ${fmtHoras(row.tempoReparoHoras)}`,
                  `${row.qtd} ${row.qtd === 1 ? "ocorrência" : "ocorrências"}`,
                  `${fmtPct(row.participacaoPct)} do tempo de reparo`,
                  `MTTR do defeito ${fmtHoras(row.mttrHoras)}`,
                ];
              },
            },
          },
        },
        scales: {
          x: {
            beginAtZero: true,
            grace: "28%",
            ticks: { font: { size: 12 }, callback: (v) => fmtHoras(Number(v)) },
          },
          y: {
            grid: { display: false },
            ticks: { font: { size: 13, weight: "bold" }, color: "#0f172a" },
          },
        },
      },
    };
  }, [defeitosMttr]);

  useChart(falhasRef, falhasConfig);
  useChart(tempoRef, tempoConfig);
  useChart(mttrRef, mttrConfig);
  useChart(mtbfRef, mtbfConfig);
  useChart(dispRef, dispConfig);
  useChart(indispRef, indispConfig);
  useChart(defeitosRef, defeitosConfig);

  const categorias = filtrosOpcoes?.categorias.length ? filtrosOpcoes.categorias : data?.filtros.categorias ?? [];
  const tipos = useMemo(() => {
    const lista = filtrosOpcoes?.tipos.length ? filtrosOpcoes.tipos : data?.filtros.tipos ?? [];
    return lista.filter((tipo) => !categoria || tipo.categoria === categoria);
  }, [filtrosOpcoes, data, categoria]);
  const equipamentos = useMemo(() => {
    const lista = filtrosOpcoes?.equipamentos.length ? filtrosOpcoes.equipamentos : data?.filtros.equipamentos ?? [];
    return lista
      .filter((eq) => !categoria || eq.categoria === categoria)
      .filter((eq) => codTipoEquipamento == null || eq.codTipoEquipamento === codTipoEquipamento);
  }, [filtrosOpcoes, data, categoria, codTipoEquipamento]);
  const equipamentosSet = useMemo(() => new Set(codEquipamentos), [codEquipamentos]);
  const equipamentosFiltroResumo =
    codEquipamentos.length > 0 ? `${codEquipamentos.length} selecionado(s)` : "Todos";
  const toggleEquipamento = (cod: number) => {
    setCodEquipamento(null);
    setCodEquipamentos((prev) =>
      prev.includes(cod) ? prev.filter((item) => item !== cod) : [...prev, cod].sort((a, b) => a - b),
    );
  };
  const objetosCusto = data?.custo.objetosCusto ?? [];
  const custoMaxMes = Math.max(...(data?.custo.porMes.map((row) => row.valor) ?? [0]), 1);
  const custoMaxFrota = Math.max(...(data?.custo.porFrota.map((row) => row.valor) ?? [0]), 1);
  const custoMaxComponente = Math.max(...(data?.custo.porComponente.map((row) => row.valor) ?? [0]), 1);
  const custoMaxObjetoCusto = Math.max(...(data?.custo.porObjetoCusto.map((row) => row.valor) ?? [0]), 1);
  const applyMetaScope = (codTipo: number | null) => {
    setMetaScopeTipo(codTipo);
    if (!data) return;
    const selected = codTipo != null ? data.meta.metasPorTipo[String(codTipo)] : null;
    setMetaMttr(readMetaMttr(codTipo, selected?.metaMttrHoras ?? (codTipo == null ? data.meta.mttrHoras : 15)));
    setMetaMtbf(readMetaMtbf(codTipo, selected?.metaMtbfHoras ?? (codTipo == null ? data.meta.mtbfHoras : 15)));
    setMetaDisp(
      readMetaDisponibilidadeTipo(
        codTipo,
        selected?.metaDisponibilidade ?? (codTipo == null ? data.meta.disponibilidade : 85),
      ),
    );
  };

  return (
    <div className="gm-root">
      <ConsultaProgressBar active={loading} label="Consultando gestão de manutenção…" />
      {err ? <p className="lead" style={{ color: "var(--danger)" }}>{err}</p> : null}

      <div className="gm-layout">
        <aside className="gm-filters">
          <label className="gm-filter-field">
            <span>Data início</span>
            <input
              type="date"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
            />
          </label>

          <label className="gm-filter-field">
            <span>Data fim</span>
            <input
              type="date"
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
            />
          </label>

          <label className="gm-filter-field">
            <span>Categoria</span>
            <select
              value={categoria ?? ""}
              onChange={(e) => {
                const next = e.target.value || null;
                setCategoria(next);
                setCodTipoEquipamento(null);
                setCodEquipamento(null);
                setCodEquipamentos([]);
              }}
            >
              <option value="">Todas</option>
              {categorias.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </label>

          <label className="gm-filter-field gm-filter-field--wide">
            <span>Tipo de equipamento</span>
            <select
              value={codTipoEquipamento ?? ""}
              onChange={(e) => {
                const next = e.target.value ? Number(e.target.value) : null;
                setCodTipoEquipamento(next);
                setCodEquipamento(null);
                setCodEquipamentos([]);
                applyMetaScope(next);
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

          <label className="gm-filter-field">
            <span>Meta MTTR (horas)</span>
            <input
              type="number"
              min={0}
              step={0.5}
              value={Number.isFinite(metaMttr) ? metaMttr : ""}
              onChange={(e) => setMetaMttr(Number(e.target.value))}
              onBlur={() => {
                if (!Number.isFinite(metaMttr)) return;
                writeMetaMttr(codTipoEquipamento, metaMttr);
                setData((prev) => (prev ? { ...prev, meta: { ...prev.meta, mttrHoras: metaMttr } } : prev));
              }}
            />
          </label>
          <label className="gm-filter-field">
            <span>Meta MTBF (horas)</span>
            <input
              type="number"
              min={0}
              step={0.5}
              value={Number.isFinite(metaMtbf) ? metaMtbf : ""}
              onChange={(e) => setMetaMtbf(Number(e.target.value))}
              onBlur={() => {
                if (!Number.isFinite(metaMtbf)) return;
                writeMetaMtbf(codTipoEquipamento, metaMtbf);
                setData((prev) => (prev ? { ...prev, meta: { ...prev.meta, mtbfHoras: metaMtbf } } : prev));
              }}
            />
          </label>
          <label className="gm-filter-field">
            <span>Meta disponibilidade (%)</span>
            <input
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={Number.isFinite(metaDisp) ? metaDisp : ""}
              onChange={(e) => setMetaDisp(Number(e.target.value))}
              onBlur={() => {
                if (Number.isFinite(metaDisp)) writeMetaDisponibilidadeTipo(codTipoEquipamento, metaDisp);
              }}
            />
          </label>
          <div className="gm-filter-actions no-print">
            <button type="button" className="btn" disabled={savingMetas} onClick={() => void saveDisponibilidadeMeta()}>
              {savingMetas ? "Salvando…" : "Salvar metas"}
            </button>
          </div>

          <div className="gm-filter-field gm-equipment-picker">
            <span>Equipamentos</span>
            <div className="gm-equipment-picker-head">
              <strong>{equipamentosFiltroResumo}</strong>
              <button
                type="button"
                className="btn"
                disabled={!equipamentos.length}
                onClick={() => {
                  setCodEquipamento(null);
                  setCodEquipamentos(equipamentos.map((eq) => eq.codEquipamento));
                }}
              >
                Todos
              </button>
              <button
                type="button"
                className="btn"
                disabled={!codEquipamentos.length}
                onClick={() => {
                  setCodEquipamento(null);
                  setCodEquipamentos([]);
                }}
              >
                Limpar
              </button>
            </div>
            <div className="gm-equipment-picker-list">
              {equipamentos.map((eq) => (
                <label key={eq.codEquipamento} className="gm-equipment-picker-item">
                  <input
                    type="checkbox"
                    checked={equipamentosSet.has(eq.codEquipamento)}
                    onChange={() => toggleEquipamento(eq.codEquipamento)}
                  />
                  <span>{eq.label}</span>
                </label>
              ))}
              {!equipamentos.length ? <em>Selecione categoria ou tipo para listar.</em> : null}
            </div>
          </div>
          <div className="gm-filter-actions no-print">
            <button
              type="button"
              className="btn primary"
              disabled={loading}
              onClick={() => {
                if (subAba === "monitoramento") {
                  setOsConsultToken((n) => n + 1);
                  return;
                }
                void load({
                  dataInicio: dataInicio || undefined,
                  dataFim: dataFim || undefined,
                  categoria,
                  codTipoEquipamento,
                  codEquipamento,
                  codEquipamentos,
                  tipoMaterial: tipoMaterialCusto,
                  codObjetoCusto,
                  modo: subAba === "custo" ? "custo" : "indicadores",
                });
              }}
            >
              {loading ? "Consultando…" : "Consultar"}
            </button>
          </div>
        </aside>

        <div className="gm-main" ref={copyScopeRef}>
          <header className="gm-header">
            <div className="gm-header-row">
              <div>
                <h2>Gestão de Manutenção</h2>
                <p>
                  Defina os filtros e clique em Consultar. Só a aba selecionada é atualizada. MTBF
                  (horímetro) = horas rodadas ÷ falhas · MTTR = reparo ÷ falhas · Disponibilidade =
                  horas disponíveis − manutenção. Confiabilidade = e^(-t/MTBF), com t = dias estimado × 22 h.
                </p>
              </div>
              {canEditMetas ? (
                <button
                  type="button"
                  className={`btn gm-metas-btn${showMetas ? " active" : ""}`}
                  onClick={() => {
                    if (data) {
                      setMetaMttr(data.meta.mttrHoras);
                      setMetaMtbf(data.meta.mtbfHoras);
                      setMetaDisp(data.meta.disponibilidade);
                      setMetaScopeTipo(data.meta.codTipoEquipamento);
                    }
                    setShowMetas((open) => !open);
                  }}
                  aria-label="Configurar metas"
                  title="Configurar metas"
                >
                  ⚙ Metas
                </button>
              ) : null}
            </div>
          </header>

          {showMetas && canEditMetas ? (
            <section className="gm-metas-panel no-print">
              <div className="gm-metas-fields">
                <label>
                  <span>Aplicar metas para</span>
                  <select
                    value={metaScopeTipo ?? ""}
                    onChange={(e) => applyMetaScope(e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">Padrão geral</option>
                    {tipos.map((tipo) => (
                      <option key={tipo.codTipoEquipamento} value={tipo.codTipoEquipamento}>
                        {tipo.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Meta MTTR (horas)</span>
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={metaMttr}
                    onChange={(e) => setMetaMttr(Number(e.target.value))}
                  />
                </label>
                <label>
                  <span>Meta MTBF (horas)</span>
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={metaMtbf}
                    onChange={(e) => setMetaMtbf(Number(e.target.value))}
                  />
                </label>
                <label>
                  <span>Meta Disponibilidade (%)</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={metaDisp}
                    onChange={(e) => setMetaDisp(Number(e.target.value))}
                  />
                </label>
              </div>
              <div className="gm-metas-actions">
                <button type="button" className="btn" disabled={savingMetas} onClick={() => void saveMetas()}>
                  {savingMetas ? "Salvando…" : "Salvar metas"}
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={savingMetas}
                  onClick={() => {
                    if (data) {
                      setMetaMttr(data.meta.mttrHoras);
                      setMetaMtbf(data.meta.mtbfHoras);
                      setMetaDisp(data.meta.disponibilidade);
                      setMetaScopeTipo(data.meta.codTipoEquipamento);
                    }
                    setShowMetas(false);
                  }}
                >
                  Cancelar
                </button>
              </div>
            </section>
          ) : null}

          <nav className="kind-toggle gm-subtabs no-print" aria-label="Subabas de gestão de manutenção">
            <button
              type="button"
              className={`btn ${subAba === "indicadores" ? "primary" : ""}`}
              onClick={() => setSubAba("indicadores")}
            >
              Indicadores
            </button>
            <button
              type="button"
              className={`btn ${subAba === "custo" ? "primary" : ""}`}
              onClick={() => setSubAba("custo")}
            >
              Relatório de Custo
            </button>
            <button
              type="button"
              className={`btn ${subAba === "monitoramento" ? "primary" : ""}`}
              onClick={() => setSubAba("monitoramento")}
            >
              Monitoramento de OS
            </button>
          </nav>

          {subAba !== "monitoramento" ? <CopyGroupBar scopeRef={copyScopeRef} /> : null}

          {subAba === "indicadores" && !loadedTabs.has("indicadores") && !loading ? (
            <p className="lead">Defina os filtros e clique em Consultar para exibir os indicadores.</p>
          ) : null}

          {subAba === "indicadores" && (loadedTabs.has("indicadores") || loading) ? (
            <>
              <div className="gm-kpis">
                <GmKpiCard className="gm-kpi" title="MTTR" value={fmtHoras(data?.kpis.mttrHoras)} />
                <GmKpiCard className="gm-kpi" title="MTBF" value={fmtHoras(data?.kpis.mtbfHoras)} />
                <GmKpiCard className="gm-kpi" title="DISPONIBILIDADE" value={fmtPct(data?.kpis.disponibilidade)} />
                <GmKpiCard className="gm-kpi" title="INDISPONIBILIDADE" value={fmtPct(data?.kpis.indisponibilidade)} />
              </div>

              <div className="gm-charts-row">
                <ChartCard title="Qtd de Falhas por Mês">
                  <canvas ref={falhasRef} />
                </ChartCard>
                <ChartCard title="Tempo Total por Mês">
                  <canvas ref={tempoRef} />
                </ChartCard>
              </div>

              <div className="gm-charts-row">
                <ChartCard
                  title="MTTR"
                  bodyStyle={mttrMtbfPorSemana ? { height: 280 } : undefined}
                  extra={
                    <div className="gm-disp-visao" role="group" aria-label="Agrupar MTTR e MTBF">
                      <button
                        type="button"
                        className={`btn${mttrMtbfPorSemana ? "" : " primary"}`}
                        onClick={() => setMttrMtbfPorSemana(false)}
                      >
                        Mês
                      </button>
                      <button
                        type="button"
                        className={`btn${mttrMtbfPorSemana ? " primary" : ""}`}
                        onClick={() => setMttrMtbfPorSemana(true)}
                      >
                        Semana
                      </button>
                    </div>
                  }
                >
                  {mttrMtbfPorSemana && data && !data.semanas?.length ? (
                    <p className="lead">Consulte novamente para ver o MTTR por semana.</p>
                  ) : (
                    <canvas ref={mttrRef} />
                  )}
                </ChartCard>
                <ChartCard
                  title="MTBF"
                  bodyStyle={mttrMtbfPorSemana ? { height: 280 } : undefined}
                  extra={
                    <div className="gm-disp-visao" role="group" aria-label="Agrupar MTTR e MTBF">
                      <button
                        type="button"
                        className={`btn${mttrMtbfPorSemana ? "" : " primary"}`}
                        onClick={() => setMttrMtbfPorSemana(false)}
                      >
                        Mês
                      </button>
                      <button
                        type="button"
                        className={`btn${mttrMtbfPorSemana ? " primary" : ""}`}
                        onClick={() => setMttrMtbfPorSemana(true)}
                      >
                        Semana
                      </button>
                    </div>
                  }
                >
                  {mttrMtbfPorSemana && data && !data.semanas?.length ? (
                    <p className="lead">Consulte novamente para ver o MTBF por semana.</p>
                  ) : (
                    <canvas ref={mtbfRef} />
                  )}
                </ChartCard>
              </div>

              <div className="gm-charts-row">
                <ChartCard
                  title="DISPONIBILIDADE"
                  bodyStyle={dispPorSemana ? { height: 280 } : undefined}
                  extra={
                    <div className="gm-disp-visao" role="group" aria-label="Agrupar disponibilidade">
                      <button
                        type="button"
                        className={`btn${dispPorSemana ? "" : " primary"}`}
                        onClick={() => setDispPorSemana(false)}
                      >
                        Mês
                      </button>
                      <button
                        type="button"
                        className={`btn${dispPorSemana ? " primary" : ""}`}
                        onClick={() => setDispPorSemana(true)}
                      >
                        Semana
                      </button>
                    </div>
                  }
                >
                  {dispPorSemana && data && !(data.semanas?.length) ? (
                    <p className="lead">Consulte novamente para ver a disponibilidade por semana.</p>
                  ) : (
                    <canvas ref={dispRef} />
                  )}
                </ChartCard>
                <ChartCard title="INDISPONIBILIDADE">
                  <canvas ref={indispRef} />
                </ChartCard>
              </div>

              <GmCopyable
                className="gm-cost-card gm-cost-card--wide gm-cost-analitico gm-falhas-mttr"
                title="Falhas do MTTR"
                head={
                  <header className="gm-cost-analitico-head">
                    <h4>Falhas do MTTR</h4>
                    <span>
                      {(data?.falhasMttr ?? []).length}{" "}
                      {(data?.falhasMttr ?? []).length === 1 ? "falha" : "falhas"}
                      {data?.kpis.qtdFalhas ? ` · reparo ${fmtHoras(data.kpis.tempoReparoHoras)} · MTTR ${fmtHoras(data.kpis.mttrHoras)}` : ""}
                    </span>
                  </header>
                }
              >
                <p className="gm-falhas-mttr-hint">
                  Clique na O.S. para ver as falhas. Somente corretivas (sem plano de prevenção) entram no MTTR.
                </p>
                <div className="gm-cost-analitico-wrap">
                  <table className="gm-cost-analitico-table">
                    <thead>
                      <tr>
                        <th>O.S.</th>
                        <th>Equipamento</th>
                        <th>Tipo</th>
                        <th>Categoria</th>
                        <th>Abertura</th>
                        <th>Encerramento</th>
                        <th className="num">Tempo de reparo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data?.falhasMttr ?? []).map((row) => (
                        <tr
                          key={`${row.anoOs}-${row.numeroOs}`}
                          className="gm-falha-row"
                          onClick={() => void openOs(row)}
                        >
                          <td>
                            <button
                              type="button"
                              className="gm-os-link"
                              onClick={(e) => {
                                e.stopPropagation();
                                void openOs(row);
                              }}
                            >
                              {row.ordemServico}
                            </button>
                          </td>
                          <td>{row.codEquipamento}</td>
                          <td title={row.tipoEquipamento}>{row.tipoEquipamento || "—"}</td>
                          <td>{row.categoria || "—"}</td>
                          <td>{fmtDateTimeBr(row.dataAbertura)}</td>
                          <td>{row.aberta ? "Em aberto" : fmtDateTimeBr(row.dataEncerramento)}</td>
                          <td className="num">{fmtHoras(row.tempoReparoHoras)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {data && !(data.falhasMttr?.length) ? (
                    <p className="lead">Nenhuma falha corretiva no período filtrado.</p>
                  ) : null}
                </div>
              </GmCopyable>

              <ChartCard
                className="gm-defeitos-mttr"
                title="Defeitos que mais impactaram o MTTR"
                bodyStyle={{ height: defeitosMttr.length ? Math.max(240, defeitosMttr.length * 42 + 28) : 72 }}
              >
                {defeitosMttr.length ? (
                  <canvas ref={defeitosRef} />
                ) : data ? (
                  <p className="lead">Nenhum defeito corretivo no período filtrado.</p>
                ) : null}
              </ChartCard>

              <ConfiabilidadeEquipamentosTable
                itens={data?.confiabilidadeEquipamentos ?? []}
                total={data?.confiabilidadeTotal ?? data?.kpis ?? null}
                dataInicio={data?.dataInicio ?? dataInicio}
                dataFim={data?.dataFim ?? dataFim}
                diasEstimados={diasEstimados}
                onDiasEstimados={setDiasEstimados}
              />
            </>
          ) : null}

          {subAba === "custo" && !loadedTabs.has("custo") && !loading ? (
            <p className="lead">Defina os filtros e clique em Consultar para exibir o relatório de custo.</p>
          ) : null}

          {subAba === "custo" && (loadedTabs.has("custo") || loading) ? (
          <section className="gm-cost-dashboard">
            <header className="gm-cost-title">
              <h3>Relatório de Custo</h3>
              <span>Total: {fmtMoney(data?.custo.total)}</span>
            </header>

            <div className="gm-cost-filters no-print">
              <label>
                <span>Tipo de equipamento</span>
                <select
                  value={codTipoEquipamento ?? ""}
                  onChange={(e) => {
                    const next = e.target.value ? Number(e.target.value) : null;
                    setCodTipoEquipamento(next);
                    setCodEquipamento(null);
                    setCodEquipamentos([]);
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
                <span>Tipo de material</span>
                <select
                  value={tipoMaterialCusto ?? ""}
                  onChange={(e) => setTipoMaterialCusto(e.target.value || null)}
                >
                  <option value="">Todos</option>
                  {(data?.custo.tiposMaterial ?? []).map((tipo) => (
                    <option key={tipo} value={tipo}>
                      {tipo}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Objeto de custo</span>
                <select
                  value={codObjetoCusto ?? ""}
                  onChange={(e) => setCodObjetoCusto(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">Todos</option>
                  {objetosCusto.map((objeto) => (
                    <option key={objeto.codObjetoCusto} value={objeto.codObjetoCusto}>
                      {objeto.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="btn primary"
                disabled={loading}
                onClick={() =>
                  void load({
                    dataInicio: dataInicio || undefined,
                    dataFim: dataFim || undefined,
                    categoria,
                    codTipoEquipamento,
                    codEquipamento,
                    codEquipamentos,
                    tipoMaterial: tipoMaterialCusto,
                    codObjetoCusto,
                    modo: "custo",
                  })
                }
              >
                {loading ? "Consultando…" : "Consultar custo"}
              </button>
            </div>

            <div className="gm-cost-kpis">
              <GmKpiCard className="gm-cost-kpi" title="Total Corretiva" value={fmtMoney(data?.custo.porTipo.corretiva)} />
              <GmKpiCard className="gm-cost-kpi" title="Total Preventiva" value={fmtMoney(data?.custo.porTipo.preventiva)} />
              <GmKpiCard className="gm-cost-kpi" title="Total Preditiva" value={fmtMoney(data?.custo.porTipo.preditiva)} />
              <GmKpiCard className="gm-cost-kpi" title="Total Melhoria" value={fmtMoney(data?.custo.porTipo.melhoria)} />
            </div>

            <div className="gm-cost-grid">
              <GmCopyable className="gm-cost-card gm-cost-card--wide gm-cost-card--mes" title="Total por Mês">
                <div className="gm-cost-months">
                  {(data?.custo.porMes ?? []).map((row) => (
                    <div key={row.key} className="gm-cost-month">
                      <div className="gm-cost-vbar" style={{ height: `${Math.max(4, (row.valor / custoMaxMes) * 100)}%` }}>
                        <span>{fmtMoney(row.valor)}</span>
                      </div>
                      <small>{row.label}</small>
                    </div>
                  ))}
                </div>
              </GmCopyable>

              <GmCopyable className="gm-cost-card gm-cost-card--percentual" title="Percentual">
                <div className="gm-cost-percent-list">
                  {(data?.custo.percentual ?? []).map((row) => (
                    <div key={row.tipo} className={`gm-cost-percent gm-cost-percent--${row.tipo}`}>
                      <span>{row.label}</span>
                      <div>
                        <i style={{ width: `${Math.min(100, row.percentual)}%` }} />
                      </div>
                      <strong>{fmtPct(row.percentual)}</strong>
                    </div>
                  ))}
                </div>
              </GmCopyable>

              <GmCopyable className="gm-cost-card gm-cost-card--componentes" title="Total por Componente">
                <div className="gm-cost-component-list">
                  {(data?.custo.porComponente ?? []).map((row) => (
                    <div key={row.componente} className="gm-cost-component-row" title={row.componente}>
                      <span>{row.label}</span>
                      <div>
                        <i style={{ width: `${Math.max(2, (row.valor / custoMaxComponente) * 100)}%` }} />
                      </div>
                      <strong>{fmtMoney(row.valor)}</strong>
                    </div>
                  ))}
                  {data && !data.custo.porComponente.length ? (
                    <p className="lead">Sem componente no período filtrado.</p>
                  ) : null}
                </div>
              </GmCopyable>

              <GmCopyable className="gm-cost-card gm-cost-card--wide gm-cost-card--frota" title="Total por Número de Frota">
                <div className="gm-cost-frota-bars">
                  {(data?.custo.porFrota ?? []).map((row) => (
                    <div key={row.codEquipamento} className="gm-cost-frota-row">
                      <span>{row.label}</span>
                      <div>
                        <i style={{ width: `${Math.max(2, (row.valor / custoMaxFrota) * 100)}%` }} />
                        <b>{fmtMoney(row.valor)}</b>
                      </div>
                    </div>
                  ))}
                  {data && !data.custo.porFrota.length ? <p className="lead">Sem custo no período filtrado.</p> : null}
                </div>
              </GmCopyable>

              <GmCopyable className="gm-cost-card gm-cost-card--wide gm-cost-card--objeto" title="Custo por Objeto de Custo">
                <div className="gm-cost-frota-bars">
                  {(data?.custo.porObjetoCusto ?? []).map((row) => (
                    <div key={`${row.codObjetoCusto ?? "sem"}-${row.objetoCusto}`} className="gm-cost-frota-row" title={row.objetoCusto}>
                      <span>{row.label}</span>
                      <div>
                        <i style={{ width: `${Math.max(2, (row.valor / custoMaxObjetoCusto) * 100)}%` }} />
                        <b>{fmtMoney(row.valor)}</b>
                      </div>
                    </div>
                  ))}
                  {data && !data.custo.porObjetoCusto.length ? (
                    <p className="lead">Sem objeto de custo no período filtrado.</p>
                  ) : null}
                </div>
              </GmCopyable>
            </div>

            <GmCopyable
              className="gm-cost-card gm-cost-card--wide gm-cost-analitico"
              title="Relatório Analítico"
              head={
                <header className="gm-cost-analitico-head">
                  <h4>Relatório Analítico</h4>
                  <span>
                    {(data?.custo.analitico ?? []).length}{" "}
                    {(data?.custo.analitico ?? []).length === 1 ? "lançamento" : "lançamentos"}
                  </span>
                </header>
              }
            >
              <p className="gm-falhas-mttr-hint">Clique na O.S. para ver os defeitos registrados.</p>
              <div className="gm-cost-analitico-wrap">
                <table className="gm-cost-analitico-table">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Equipamento</th>
                      <th>Objeto de custo</th>
                      <th>Material / Componente</th>
                      <th>O.S.</th>
                      <th>Tipo</th>
                      <th className="num">Qtde</th>
                      <th className="num">Valor unit.</th>
                      <th className="num">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.custo.analitico ?? []).map((row, idx) => (
                      <tr key={`${row.data}-${row.ordemServico ?? "s"}-${row.codEquipamento ?? "e"}-${row.componente}-${idx}`}>
                        <td>{fmtDateBr(row.data)}</td>
                        <td>{row.codEquipamento ?? "—"}</td>
                        <td title={row.objetoCusto}>{row.objetoCusto}</td>
                        <td title={row.componente}>
                          <span className="gm-cost-analitico-mat">{row.componente}</span>
                          {row.tipoMaterial && row.tipoMaterial !== "NA" ? (
                            <small>{row.tipoMaterial}</small>
                          ) : null}
                        </td>
                        <td>
                          {row.anoOrdemServico != null && row.numeroOrdemServico != null ? (
                            <button
                              type="button"
                              className="gm-os-link"
                              onClick={() =>
                                void openOs({
                                  ordemServico: row.ordemServico ?? `${row.anoOrdemServico}/${row.numeroOrdemServico}`,
                                  anoOs: row.anoOrdemServico,
                                  numeroOs: row.numeroOrdemServico,
                                  codEquipamento: row.codEquipamento ?? 0,
                                  dataAbertura: row.data,
                                })
                              }
                            >
                              {row.ordemServico}
                            </button>
                          ) : (
                            (row.ordemServico ?? "—")
                          )}
                        </td>
                        <td>
                          <span className={`gm-cost-tipo gm-cost-tipo--${row.tipo}`}>{row.tipoLabel}</span>
                        </td>
                        <td className="num">{fmtQty(row.quantidade)}</td>
                        <td className="num">{fmtMoney(row.valorUnitario)}</td>
                        <td className="num">{fmtMoney(row.valor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {data && !(data.custo.analitico?.length) ? (
                  <p className="lead">Sem lançamentos analíticos no período filtrado.</p>
                ) : null}
              </div>
            </GmCopyable>
          </section>
          ) : null}

          {subAba === "monitoramento" ? (
            <MonitoramentoOsSection
              consultarToken={osConsultToken}
              initialTipo={codTipoEquipamento}
              initialEquip={codEquipamento}
            />
          ) : null}
        </div>
      </div>

      {osAberta ? (
        <div className="modal-back gm-os-modal-back" onClick={closeOs}>
          <div className="modal gm-os-modal" onClick={(e) => e.stopPropagation()}>
            <header className="gm-os-modal-head">
              <div>
                <h3>O.S. {osAberta.ordemServico}</h3>
                <p>
                  {osAberta.codEquipamento ? `Equipamento ${osAberta.codEquipamento}` : "Equipamento —"}
                  {osAberta.tipoEquipamento ? ` · ${osAberta.tipoEquipamento}` : ""}
                  {osAberta.categoria ? ` · ${osAberta.categoria}` : ""}
                </p>
              </div>
              <button type="button" className="btn" onClick={closeOs}>
                Fechar
              </button>
            </header>
            <dl className="gm-os-modal-meta">
              <div>
                <dt>Abertura</dt>
                <dd>{fmtDateTimeBr(osDetalhe?.dataAbertura ?? osAberta.dataAbertura)}</dd>
              </div>
              <div>
                <dt>Encerramento</dt>
                <dd>
                  {(osDetalhe?.aberta ?? osAberta.aberta)
                    ? "Em aberto"
                    : fmtDateTimeBr(osDetalhe?.dataEncerramento ?? osAberta.dataEncerramento)}
                </dd>
              </div>
              {osAberta.tempoReparoHoras != null && osAberta.tempoReparoHoras > 0 ? (
                <div>
                  <dt>Tempo de reparo</dt>
                  <dd>{fmtHoras(osAberta.tempoReparoHoras)}</dd>
                </div>
              ) : null}
              {osDetalhe?.box ? (
                <div>
                  <dt>Box</dt>
                  <dd>{osDetalhe.box}</dd>
                </div>
              ) : null}
            </dl>
            {osLoading ? <p className="lead">Carregando falhas da O.S.…</p> : null}
            {osErr ? <p className="lead" style={{ color: "var(--danger)" }}>{osErr}</p> : null}
            {!osLoading && osDetalhe ? (
              <div className="gm-os-falhas-wrap">
                <table className="gm-cost-analitico-table gm-os-falhas-table">
                  <thead>
                    <tr>
                      {osDetalhe.colunas.map((col) => (
                        <th key={col.key} className={col.key === "DESCRICAO" || col.key === "OBSERVACAO" ? "gm-os-col-wide" : undefined}>
                          {col.label}
                        </th>
                      ))}
                      <th>MTTR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {osDetalhe.falhas.map((falha) => (
                      <tr key={falha.sequencial} className={falha.contaNoMttr ? "gm-os-falha--mttr" : undefined}>
                        {osDetalhe.colunas.map((col) => (
                          <td
                            key={col.key}
                            className={col.key === "DESCRICAO" || col.key === "OBSERVACAO" ? "gm-os-col-wide" : undefined}
                            title={falha.values[col.key] || undefined}
                          >
                            {falha.values[col.key] || "—"}
                          </td>
                        ))}
                        <td>{falha.contaNoMttr ? "Sim" : "Não"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!osDetalhe.falhas.length ? (
                  <p className="lead">Nenhum registro em automotivo.itens_osdefeitos para esta O.S.</p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
