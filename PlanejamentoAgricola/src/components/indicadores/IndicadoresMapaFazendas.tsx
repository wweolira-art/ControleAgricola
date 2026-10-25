import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GeoJsonObject } from "geojson";
import { ConsultaProgressBar } from "../ConsultaProgressBar";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { api, type IndicadoresMapaAreaStatus, type IndicadoresMapaEntomoFaixa, type IndicadoresMapaEntomoIndice, type IndicadoresMapaFazendasAreaAplicada, type IndicadoresMapaFazendasData, type IndicadoresMapaFazendasEntomologico, type IndicadoresMapaFazendasIrrigacao } from "../../api";
import { useApp } from "../../store";
import { safraDefaultRange } from "../colheita/colheita-utils";
import { useReportAutoRefresh } from "./useReportAutoRefresh";
import { MapaFazendasSettings } from "./MapaFazendasSettings";
import { canConfigureFarmMap } from "../../lib/permissions";
import { filterApplicationFarms } from "../../lib/mapaApplicationFarms";
import { percentualTocosDanificados } from "../../lib/mapaEntomologia";
import { COMPACTACAO_PROFUNDIDADES, type CompactacaoData } from "../../lib/compactacaoSolo";
import { MapaCompactacaoSolo, type CompactacaoMapControls } from "./MapaCompactacaoSolo";

type FeatureProps = {
  uid?: string;
  fazenda?: string | null;
  codFazenda?: number | null;
  codFazendaOracle?: number | null;
  codTalhao?: number | null;
  lote?: number | null;
  areaHa?: number | null;
  areaMapaHa?: number | null;
  camada?: string | null;
  camadaLabel?: string | null;
  variedade?: string | null;
  tipoCana?: string | null;
  areaAplicada?: number | null;
  pctAplicado?: number | null;
  statusArea?: IndicadoresMapaAreaStatus | null;
  areaAplicadaInfo?: IndicadoresMapaFazendasAreaAplicada | null;
  entomologico?: IndicadoresMapaFazendasEntomologico | null;
  faixaEntomologica?: IndicadoresMapaEntomoFaixa | null;
  entomologicoIndiceAtivo?: IndicadoresMapaEntomoIndice | null;
  irrigacao?: IndicadoresMapaFazendasIrrigacao | null;
  insumoTalhao?: { qtdAplicacoes: number; valorTotal: number } | null;
  insumoFazenda?: {
    qtdAplicacoes: number;
    valorTotal: number;
    materiais: Array<{ descricao: string; quantidade: number; valor: number }>;
  } | null;
  operacoesTalhao?: string[];
};

const LAYER_COLORS: Record<string, string> = {
  LOTES: "#22c55e",
  MATA: "#166534",
  MANGUE: "#0f766e",
  COQUEIROS: "#65a30d",
  "ENCOSTA MARITMA": "#a16207",
  ALAGADO: "#2563eb",
  PASTO: "#84cc16",
  URBANIZACAO: "#64748b",
  URB: "#475569",
};

const AREA_STATUS_META: Record<
  IndicadoresMapaAreaStatus,
  { label: string; color: string; legend?: boolean }
> = {
  concluido: { label: "Concluído (±0,5 ha)", color: "#22c55e", legend: true },
  parcial: { label: "Aplicação parcial", color: "#facc15", legend: true },
  renovacao: { label: "Área de Renovação", color: "#3b82f6", legend: true },
  acima: { label: "Acima da área", color: "#ef4444", legend: true },
  sem: { label: "Sem aplicação", color: "#94a3b8", legend: true },
};

const ENTOMO_FAIXA_META: Record<
  IndicadoresMapaEntomoFaixa,
  { label: string; color: string; legend?: boolean }
> = {
  verde: { label: "Baixo", color: "#22c55e", legend: true },
  amarelo: { label: "Médio", color: "#facc15", legend: true },
  vermelho: { label: "Alto", color: "#ef4444", legend: true },
  sem: { label: "Sem análise", color: "#94a3b8", legend: true },
};

const ENTOMO_INDICE_META: Record<IndicadoresMapaEntomoIndice, { label: string; formula: string }> = {
  broca_comum: {
    label: "Índice entre-nós brocados",
    formula: "Entre-nós brocados ÷ Entre-nós analisados",
  },
  broca_gigante: {
    label: "% Infest. B. Gigante",
    formula: "Touceiras brocadas ÷ Touceiras analisadas × 100",
  },
};

const ENTOMO_INDICE_LIMITES: Record<
  IndicadoresMapaEntomoIndice,
  Record<Exclude<IndicadoresMapaEntomoFaixa, "sem">, string>
> = {
  broca_comum: {
    verde: "≤ 2,50",
    amarelo: "> 2,50 e < 5,00",
    vermelho: "≥ 5,00",
  },
  broca_gigante: {
    verde: "≤ 1,00%",
    amarelo: "> 1,00% e < 2,50%",
    vermelho: "≥ 2,50%",
  },
};

function fmt2(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function fmtPct(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${fmt2(n)}%`;
}

function fmtIndice(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  // O relatório 9138 exibe o índice em percentual, sem o símbolo %.
  return fmt2(n * 100);
}

function fmtTocosDanificados(brocados: number | null | undefined, analisados: number | null | undefined) {
  const percentual = percentualTocosDanificados(brocados, analisados);
  return percentual == null ? "—" : `${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(percentual)}%`;
}

function fmtMoney(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR");
}

function colorForFazenda(cod: number | null | undefined) {
  if (cod == null) return "#64748b";
  const hue = (cod * 47) % 360;
  return `hsl(${hue} 62% 46%)`;
}

function colorForAreaStatus(status: IndicadoresMapaAreaStatus | null | undefined) {
  if (!status) return "#94a3b8";
  return AREA_STATUS_META[status].color;
}

function colorForEntomoFaixa(faixa: IndicadoresMapaEntomoFaixa | null | undefined) {
  if (!faixa) return "#94a3b8";
  return ENTOMO_FAIXA_META[faixa].color;
}

function colorForIrrigacaoMmHa(mmHa: number | null | undefined, maxMmHa: number) {
  if (mmHa == null || mmHa <= 0 || !Number.isFinite(mmHa)) return "#94a3b8";
  if (maxMmHa <= 0) return "#60a5fa";
  const t = Math.min(1, mmHa / maxMmHa);
  const r = Math.round(191 + (29 - 191) * t);
  const g = Math.round(219 + (78 - 219) * t);
  const b = Math.round(254 + (216 - 254) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

function entomoFaixaLabel(faixa: IndicadoresMapaEntomoFaixa | null | undefined) {
  if (!faixa) return "—";
  return ENTOMO_FAIXA_META[faixa].label;
}

function entomoFaixa(indice: number | null, tipo: IndicadoresMapaEntomoIndice): IndicadoresMapaEntomoFaixa {
  if (indice == null || !Number.isFinite(indice)) return "sem";
  if (tipo === "broca_comum") return indice <= 0.025 ? "verde" : indice < 0.05 ? "amarelo" : "vermelho";
  return indice <= 0.01 ? "verde" : indice < 0.025 ? "amarelo" : "vermelho";
}

function entomoFaixaAtivo(
  info: IndicadoresMapaFazendasEntomologico | null | undefined,
  indice: IndicadoresMapaEntomoIndice,
): IndicadoresMapaEntomoFaixa {
  if (!info) return "sem";
  return indice === "broca_gigante" ? info.faixaBrocaGigante : info.faixaBrocaComum;
}

function statusLabel(status: IndicadoresMapaAreaStatus | null | undefined) {
  if (!status) return "—";
  return AREA_STATUS_META[status].label;
}

export function IndicadoresMapaFazendas({ initialSubPath }: { initialSubPath?: string[] } = {}) {
  const openCompactacao = initialSubPath?.[0] === "compactacao-solo";
  const initialFrom = openCompactacao && /^\d{4}-\d{2}-\d{2}$/.test(initialSubPath?.[1] ?? "") ? initialSubPath![1] : undefined;
  const initialTo = openCompactacao && /^\d{4}-\d{2}-\d{2}$/.test(initialSubPath?.[2] ?? "") ? initialSubPath![2] : undefined;
  const { safra, authUser } = useApp();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [enabledActivities, setEnabledActivities] = useState<string[] | null>(null);
  const canConfigure = Boolean(authUser) && canConfigureFarmMap(authUser?.permissions);
  const defaults = useMemo(() => safraDefaultRange(safra?.code), [safra?.code]);
  const [dataInicio, setDataInicio] = useState(initialFrom ?? defaults.from);
  const [dataFim, setDataFim] = useState(initialTo ?? defaults.to);
  const [areasAplicadas, setAreasAplicadas] = useState(!openCompactacao);
  const [entomologico, setEntomologico] = useState(false);
  const [irrigacao, setIrrigacao] = useState(false);
  const [compactacao, setCompactacao] = useState(openCompactacao);
  const [compactacaoData, setCompactacaoData] = useState<CompactacaoData | null>(null);
  const [compactacaoProfundidade, setCompactacaoProfundidade] = useState("");
  const [compactacaoFazenda, setCompactacaoFazenda] = useState(openCompactacao && initialSubPath?.[3] !== "todas" ? initialSubPath?.[3] ?? "" : "");
  const [compactacaoLote, setCompactacaoLote] = useState("");
  const compactacaoControls = useRef<CompactacaoMapControls | null>(null);
  const compactacaoFazendas = useMemo(() => [...new Set((compactacaoData?.pontos ?? []).map((p) => p.fazenda))].sort((a, b) => a.localeCompare(b, "pt-BR")), [compactacaoData]);
  const compactacaoLotes = useMemo(() => [...new Set((compactacaoData?.pontos ?? []).filter((p) => !compactacaoFazenda || p.fazenda === compactacaoFazenda).map((p) => p.lote).filter((n) => n != null))].sort((a, b) => a - b), [compactacaoData, compactacaoFazenda]);
  const [entomologicoIndice, setEntomologicoIndice] = useState<IndicadoresMapaEntomoIndice>("broca_comum");
  const [operacaoFiltro, setOperacaoFiltro] = useState("");
  const [operacaoBusca, setOperacaoBusca] = useState("");
  const [operacaoOpen, setOperacaoOpen] = useState(false);
  const [autoActivities, setAutoActivities] = useState(false);
  const operacaoWrapRef = useRef<HTMLDivElement | null>(null);
  const [data, setData] = useState<IndicadoresMapaFazendasData | null>(null);
  const [selectedCod, setSelectedCod] = useState<number | "all">("all");
  const [selectedFeature, setSelectedFeature] = useState<FeatureProps | null>(null);
  const [focusUid, setFocusUid] = useState<string | null>(null);
  const [focusCodFazenda, setFocusCodFazenda] = useState<string | null>(null);
  const [sideOpen, setSideOpen] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [mostrarRotulosTalhao, setMostrarRotulosTalhao] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadingNextActivity, setLoadingNextActivity] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const loadSeq = useRef(0);

  useEffect(() => {
    let disposed = false;
    api.indicadoresMapaConfig().then((config) => {
      if (!disposed) setEnabledActivities(config.enabledActivities);
    }).catch(() => { if (!disposed) setErr("Não foi possível carregar as configurações de atividades. Atualize a página."); });
    return () => { disposed = true; };
  }, [authUser?.id]);

  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const layerRef = useRef<L.GeoJSON | null>(null);
  const overlayKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const range = safraDefaultRange(safra?.code);
    setDataInicio(initialFrom ?? range.from);
    setDataFim(initialTo ?? range.to);
  }, [safra?.code, initialFrom, initialTo]);

  const load = useCallback(async (operacaoOverride?: string) => {
    const seq = ++loadSeq.current;
    try {
      setLoading(true);
      setLoadingNextActivity(operacaoOverride != null);
      setErr(null);
      if (compactacao) {
        const result = await api.indicadoresMapaCompactacao({ dataInicio, dataFim, profundidade: compactacaoProfundidade || undefined });
        if (seq !== loadSeq.current) return;
        setCompactacaoData(result);
        setCompactacaoFazenda((current) => {
          const key = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
          return result.pontos.find((p) => key(p.fazenda) === key(current))?.fazenda ?? "";
        });
        setCompactacaoLote((current) => result.pontos.some((p) => String(p.lote) === current) ? current : "");
        return;
      }
      const result = await api.indicadoresMapaFazendas({
        safraCode: safra?.code,
        dataInicio,
        dataFim,
        areasAplicadas,
        entomologico,
        irrigacao,
        entomologicoIndice,
        operacao: (operacaoOverride ?? operacaoFiltro) || undefined,
      });
      if (seq !== loadSeq.current) return;
      const features = result.geojson.features ?? [];
      features.forEach((feature, index) => {
        const props = feature.properties as FeatureProps;
        props.uid =
          props.uid ??
          `${props.codFazenda ?? "x"}:${props.lote ?? props.codTalhao ?? index}:${index}`;
      });
      setData(result);
      if (areasAplicadas) {
        const activeFarms = new Set(filterApplicationFarms(result.geojson.features).map((f) => Number(f.properties.codFazenda)));
        setSelectedCod((current) => current === "all" || activeFarms.has(current) ? current : "all");
      }
      setSelectedFeature(null);
      setFocusUid(null);
      setFocusCodFazenda(null);
    } catch (e) {
      if (seq !== loadSeq.current) return;
      if (compactacao) setCompactacaoData(null); else setData(null);
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      if (seq === loadSeq.current) {
        setLoading(false);
        setLoadingNextActivity(false);
      }
    }
  }, [safra?.code, dataInicio, dataFim, areasAplicadas, entomologico, irrigacao, entomologicoIndice, operacaoFiltro, compactacao, compactacaoProfundidade]);

  const initialLoadRef = useRef(false);
  useReportAutoRefresh(() => {
    if (!loading) return load();
  });
  useEffect(() => {
    if (initialLoadRef.current) return;
    initialLoadRef.current = true;
    void load();
  }, [load]);

  const overlayKey = `${areasAplicadas}-${entomologico}-${irrigacao}-${compactacao}`;

  useEffect(() => {
    if (overlayKeyRef.current === null) {
      overlayKeyRef.current = overlayKey;
      return;
    }
    if (overlayKeyRef.current === overlayKey) return;
    overlayKeyRef.current = overlayKey;
    void load();
  }, [overlayKey, load]);

  const applicationFeatures = useMemo(() => {
    if (!data?.geojson.features) return [];
    if (areasAplicadas && enabledActivities != null && !enabledActivities.includes(operacaoFiltro)) return [];
    return areasAplicadas ? filterApplicationFarms(data.geojson.features) : data.geojson.features;
  }, [data, areasAplicadas, enabledActivities, operacaoFiltro]);

  const mapFazendas = useMemo(() => {
    const codes = new Set(applicationFeatures.map((f) => Number(f.properties.codFazenda)));
    return (data?.fazendas ?? []).filter((farm) => !areasAplicadas || codes.has(farm.codFazenda));
  }, [data?.fazendas, applicationFeatures, areasAplicadas]);

  const filteredFeatures = useMemo(() => selectedCod === "all" ? applicationFeatures : applicationFeatures.filter((f) => Number(f.properties.codFazenda) === selectedCod), [applicationFeatures, selectedCod]);

  const mmHaMax = data?.resumo.irrigacao?.mmHaMax ?? 0;
  const mapOverlayMode = areasAplicadas || entomologico || irrigacao;

  const fillColorForProps = useCallback(
    (props: FeatureProps) => {
      const camada = String(props.camada ?? "LOTES").toUpperCase();
      if (entomologico) return colorForEntomoFaixa(entomoFaixaAtivo(props.entomologico, entomologicoIndice));
      if (irrigacao) return colorForIrrigacaoMmHa(props.irrigacao?.mmHa, mmHaMax);
      if (areasAplicadas && camada === "LOTES") return colorForAreaStatus(props.statusArea ?? "sem");
      if (camada !== "LOTES") return LAYER_COLORS[camada] ?? "#94a3b8";
      return colorForFazenda(props.codFazenda ?? null);
    },
    [areasAplicadas, entomologico, irrigacao, entomologicoIndice, mmHaMax],
  );

  const styleForProps = useCallback(
    (props: FeatureProps): L.PathOptions => {
      const uid = String(props.uid ?? "");
      const farmFocused = focusCodFazenda != null && focusCodFazenda !== "";
      const sameFarm = farmFocused && String(props.codFazenda ?? "") === String(focusCodFazenda);
      const isClicked = focusUid != null && focusUid === uid;
      if (farmFocused && !sameFarm) {
        return {
          color: "#1e293b",
          weight: 0.5,
          fillColor: fillColorForProps(props),
          fillOpacity: 0.08,
        };
      }
      return {
        color: isClicked ? "#ffffff" : entomologico ? "#0f172a" : mapOverlayMode ? "#111827" : "#f8fafc",
        weight: isClicked ? 2.6 : sameFarm ? 1.8 : entomologico ? 1.6 : mapOverlayMode ? 1.2 : 1.5,
        fillColor: fillColorForProps(props),
        // A imagem de satélite mascara o verde com transparência baixa. Na
        // entomologia, a cor é o dado principal e deve permanecer evidente.
        fillOpacity: sameFarm ? 0.92 : entomologico ? 0.94 : mapOverlayMode ? 0.72 : 0.52,
      };
    },
    [fillColorForProps, focusCodFazenda, focusUid, mapOverlayMode],
  );

  const fitLayer = useCallback(() => {
    if (!layerRef.current || !mapInstance.current) return;
    const bounds = layerRef.current.getBounds();
    if (bounds.isValid()) {
      mapInstance.current.fitBounds(bounds, {
        paddingTopLeft: [(areasAplicadas || entomologico) && sideOpen && mapInstance.current.getSize().x > 700 ? 320 : 12, mapOverlayMode ? 56 : 24],
        paddingBottomRight: [24, 24],
        maxZoom: 17,
      });
    }
  }, [mapOverlayMode, areasAplicadas, entomologico, sideOpen]);

  useEffect(() => {
    if (!mapRef.current) return;

    if (!mapInstance.current) {
      mapInstance.current = L.map(mapRef.current, {
        zoomControl: false,
        attributionControl: false,
      });
      L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
        maxZoom: 19,
      }).addTo(mapInstance.current);
      L.control
        .attribution({ position: "bottomright", prefix: false })
        .addAttribution("Esri · OpenStreetMap")
        .addTo(mapInstance.current);
    }

    if (!data) return;

    if (layerRef.current) {
      layerRef.current.remove();
      layerRef.current = null;
    }

    const collection = {
      type: "FeatureCollection" as const,
      features: filteredFeatures,
    };

    layerRef.current = L.geoJSON(collection as GeoJsonObject, {
      style: (feature) => styleForProps((feature?.properties ?? {}) as FeatureProps),
      onEachFeature: (feature, layer) => {
        const props = (feature.properties ?? {}) as FeatureProps;
        const camada = String(props.camada ?? "LOTES").toUpperCase();
        const label = props.lote ?? props.codTalhao;
        if (camada === "LOTES" && label != null && String(label).trim()) {
          layer.bindTooltip(String(label), {
            permanent: true,
            direction: "center",
            className: "indicadores-mapa-talhao-label",
            opacity: 1,
          });
        }
        layer.on("mouseover", () => {
          if (layer instanceof L.Path && focusUid !== String(props.uid ?? "")) {
            layer.setStyle({
              ...styleForProps(props),
              weight: Math.max(2.2, Number(styleForProps(props).weight ?? 1.5) + 0.6),
            });
            layer.bringToFront?.();
          }
        });
        layer.on("mouseout", () => {
          if (layer instanceof L.Path) layer.setStyle(styleForProps(props));
        });
        layer.on("click", () => {
          const uid = String(props.uid ?? "");
          const cod = props.codFazenda != null ? String(props.codFazenda) : null;
          if (uid && focusUid === uid) {
            setFocusUid(null);
            setFocusCodFazenda(null);
          } else {
            setFocusUid(uid || null);
            setFocusCodFazenda(cod);
          }
          setSelectedFeature(props);
          setSideOpen(true);
        });
      },
    }).addTo(mapInstance.current);

    window.setTimeout(() => mapInstance.current?.invalidateSize(), 120);

    return () => {
      layerRef.current?.remove();
      layerRef.current = null;
    };
  }, [data, filteredFeatures, focusUid, fitLayer, styleForProps]);

  // Reenquadra apenas quando os dados/lotes carregados mudam. Selecionar um
  // lote deve preservar a posição e o zoom que o usuário escolheu.
  useEffect(() => {
    fitLayer();
  }, [data, filteredFeatures, fitLayer]);

  useEffect(() => {
    if (!mapInstance.current || !layerRef.current) return;
    const show = mostrarRotulosTalhao && mapInstance.current.getZoom() >= 14;
    layerRef.current.eachLayer((layer) => {
      const tooltipLayer = layer as L.Layer & { openTooltip?: () => void; closeTooltip?: () => void; getTooltip?: () => L.Tooltip | undefined };
      if (!tooltipLayer.getTooltip?.()) return;
      if (show) tooltipLayer.openTooltip?.();
      else tooltipLayer.closeTooltip?.();
    });
  }, [mostrarRotulosTalhao, data, filteredFeatures]);

  useEffect(() => {
    if (!mapInstance.current) return;
    const sync = () => {
      const show = mostrarRotulosTalhao && mapInstance.current?.getZoom() != null && mapInstance.current.getZoom() >= 14;
      layerRef.current?.eachLayer((layer) => {
        const tooltipLayer = layer as L.Layer & { openTooltip?: () => void; closeTooltip?: () => void; getTooltip?: () => L.Tooltip | undefined };
        if (!tooltipLayer.getTooltip?.()) return;
        if (show) tooltipLayer.openTooltip?.();
        else tooltipLayer.closeTooltip?.();
      });
    };
    mapInstance.current.on("zoomend", sync);
    sync();
    return () => {
      mapInstance.current?.off("zoomend", sync);
    };
  }, [mostrarRotulosTalhao]);

  useEffect(() => {
    if (!mapInstance.current || !layerRef.current) return;
    fitLayer();
    window.setTimeout(() => mapInstance.current?.invalidateSize(), 120);
  }, [areasAplicadas, entomologico, irrigacao, fitLayer]);

  useEffect(() => {
    return () => {
      mapInstance.current?.remove();
      mapInstance.current = null;
    };
  }, []);

  useEffect(() => {
    if (!operacaoOpen) return;
    const onDoc = (event: MouseEvent) => {
      if (!operacaoWrapRef.current?.contains(event.target as Node)) setOperacaoOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [operacaoOpen]);

  const allOperations = useMemo(() => {
    return (data?.operacoes ?? [])
      .map((op) => ({
        codigo: op.codigo,
        descricao: op.descricao?.trim() ?? "",
        label: op.descricao ? `${op.codigo} — ${op.descricao}` : op.codigo,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [data?.operacoes]);

  const operacaoLista = useMemo(() => allOperations.filter((op) => enabledActivities == null || enabledActivities.includes(op.codigo)), [allOperations, enabledActivities]);

  useEffect(() => {
    if (!areasAplicadas || enabledActivities == null || loading || err || enabledActivities.includes(operacaoFiltro)) return;
    const next = operacaoLista[0];
    if (!next) return;
    setOperacaoFiltro(next.codigo);
    setOperacaoBusca("");
    void load(next.codigo);
  }, [areasAplicadas, enabledActivities, loading, err, operacaoFiltro, operacaoLista, load]);

  useEffect(() => {
    if (!areasAplicadas || err) setAutoActivities(false);
  }, [areasAplicadas, err]);

  useEffect(() => {
    if (!autoActivities || !areasAplicadas || loading || err || operacaoLista.length < 2) return;
    const timer = window.setTimeout(() => {
      const current = operacaoLista.findIndex((op) => op.codigo === operacaoFiltro);
      const next = operacaoLista[(current + 1) % operacaoLista.length];
      setOperacaoFiltro(next.codigo);
      setOperacaoBusca("");
      setOperacaoOpen(false);
      void load(next.codigo);
    }, 60000);
    return () => window.clearTimeout(timer);
  }, [autoActivities, areasAplicadas, loading, err, operacaoLista, operacaoFiltro, load]);

  const operacaoFiltrada = useMemo(() => {
    const q = operacaoBusca.trim().toUpperCase();
    if (!q) return operacaoLista;
    return operacaoLista.filter(
      (op) =>
        op.codigo.toUpperCase().includes(q) ||
        op.descricao.toUpperCase().includes(q) ||
        op.label.toUpperCase().includes(q),
    );
  }, [operacaoLista, operacaoBusca]);

  const operacaoInputValue = operacaoOpen
    ? operacaoBusca
    : operacaoFiltro
      ? operacaoLista.find((op) => op.codigo === operacaoFiltro)?.label ?? operacaoFiltro
      : operacaoBusca;

  const operacaoSelecionada = operacaoFiltro
    ? allOperations.find((op) => op.codigo === operacaoFiltro) ?? null
    : null;

  const selectedFazenda = useMemo(() => {
    if (!data || selectedCod === "all") return null;
    return data.fazendas.find((f) => f.codFazenda === selectedCod) ?? null;
  }, [data, selectedCod]);

  const resumoAplicacaoFazenda = useCallback(
    (codFazenda: number | string | null | undefined) => {
      if (!data || codFazenda == null) return null;
      const vistos = new Set<string>();
      let areaTotal = 0;
      let areaAplicada = 0;
      let lotes = 0;
      let lotesComAplicacao = 0;
      for (const feature of data.geojson.features) {
        const props = feature.properties as FeatureProps;
        if (String(props.codFazenda ?? "") !== String(codFazenda)) continue;
        const camada = String(props.camada ?? "LOTES").toUpperCase();
        if (camada !== "LOTES") continue;
        const key =
          props.codFazendaOracle != null && props.codTalhao != null
            ? `${props.codFazendaOracle}:${props.codTalhao}`
            : String(props.uid ?? `${props.codFazenda}:${props.lote ?? props.codTalhao ?? lotes}`);
        if (vistos.has(key)) continue;
        vistos.add(key);
        const total = Number(props.areaHa) > 0 ? Number(props.areaHa) : Number(props.areaMapaHa) > 0 ? Number(props.areaMapaHa) : 0;
        const aplicada = Number(props.areaAplicada) > 0 ? Number(props.areaAplicada) : 0;
        lotes += 1;
        areaTotal += total;
        areaAplicada += aplicada;
        if (aplicada > 0) lotesComAplicacao += 1;
      }
      return {
        areaTotal: Math.round(areaTotal * 100) / 100,
        areaAplicada: Math.round(areaAplicada * 100) / 100,
        pctAplicado: areaTotal > 0 ? Math.round((areaAplicada / areaTotal) * 1000) / 10 : null,
        lotes,
        lotesComAplicacao,
      };
    },
    [data],
  );

  const fazendasResumo = useMemo(() => {
    return (data?.fazendas ?? [])
      .map((fazenda) => {
        const resumo = resumoAplicacaoFazenda(fazenda.codFazenda);
        return {
          ...fazenda,
          areaTotal: resumo?.areaTotal ?? fazenda.areaHa ?? 0,
          areaAplicada: resumo?.areaAplicada ?? 0,
          pctAplicado: resumo?.pctAplicado ?? null,
        };
      })
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [data?.fazendas, resumoAplicacaoFazenda]);

  const entomoFazendasResumo = useMemo(() => {
    const porFazenda = new Map<number, { analises: number; numerador: number; denominador: number; tocosAnalisados: number; tocosBrocados: number }>();
    const vistos = new Set<string>();
    for (const feature of data?.geojson.features ?? []) {
      const props = feature.properties as FeatureProps;
      if (props.codFazenda == null || !props.entomologico) continue;
      if (String(props.camada ?? "LOTES").toUpperCase() !== "LOTES") continue;
      const key = `${props.codFazenda}:${props.codTalhao ?? props.lote}`;
      if (vistos.has(key)) continue;
      vistos.add(key);
      const item = porFazenda.get(props.codFazenda) ?? { analises: 0, numerador: 0, denominador: 0, tocosAnalisados: 0, tocosBrocados: 0 };
      const isComum = entomologicoIndice === "broca_comum";
      item.analises += props.entomologico.qtdAnalises ?? 0;
      item.numerador += isComum ? props.entomologico.qtdeEntrenosBroca : props.entomologico.touceirasBrocadas;
      item.denominador += isComum ? props.entomologico.entreNosAnalisados : props.entomologico.touceirasAnalisadas;
      item.tocosAnalisados += props.entomologico.tocosAnalisados;
      item.tocosBrocados += props.entomologico.tocosBrocados;
      porFazenda.set(props.codFazenda, item);
    }
    return (data?.fazendas ?? [])
      .map((fazenda) => {
        const item = porFazenda.get(fazenda.codFazenda) ?? { analises: 0, numerador: 0, denominador: 0, tocosAnalisados: 0, tocosBrocados: 0 };
        const indice = item.denominador > 0 ? item.numerador / item.denominador : null;
        const indiceCor = entomologicoIndice === "broca_gigante"
          ? item.tocosAnalisados > 0 ? item.tocosBrocados / item.tocosAnalisados : null
          : indice;
        return { ...fazenda, ...item, indice, faixa: entomoFaixa(indiceCor, entomologicoIndice) };
      })
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [data?.fazendas, data?.geojson.features, entomologicoIndice]);

  const panelTitle = selectedFeature?.fazenda ?? selectedFazenda?.nome ?? "Mapa fazendas";
  const selectedResumo = resumoAplicacaoFazenda(selectedFeature?.codFazenda ?? selectedFazenda?.codFazenda);
  const selectedEntomoResumo = entomoFazendasResumo.find(
    (fazenda) => fazenda.codFazenda === (selectedFeature?.codFazenda ?? selectedFazenda?.codFazenda),
  );
  const sidebarFazendas = useMemo(
    () =>
      entomologico
        ? entomoFazendasResumo.map((fazenda) => ({ ...fazenda, areaTotal: fazenda.areaHa, areaAplicada: 0, pctAplicado: null as number | null }))
        : fazendasResumo.filter((fazenda) => !areasAplicadas || ((enabledActivities == null || enabledActivities.includes(operacaoFiltro)) && fazenda.areaAplicada > 0)).map((fazenda) => ({
            ...fazenda,
            analises: 0,
            tocosAnalisados: 0,
            tocosBrocados: 0,
            indice: null as number | null,
            faixa: "sem" as IndicadoresMapaEntomoFaixa,
          })),
    [entomologico, entomoFazendasResumo, fazendasResumo, areasAplicadas, enabledActivities, operacaoFiltro],
  );
  const panelArea =
    selectedResumo?.areaTotal ??
    selectedFeature?.areaHa ??
    selectedFazenda?.areaHa ??
    data?.resumo.totalAreaHa ??
    null;

  const legendItems = (Object.keys(AREA_STATUS_META) as IndicadoresMapaAreaStatus[]).filter(
    (key) => AREA_STATUS_META[key].legend,
  );

  const entomoLegendItems = (Object.keys(ENTOMO_FAIXA_META) as IndicadoresMapaEntomoFaixa[]).filter(
    (key) => ENTOMO_FAIXA_META[key].legend,
  );

  const entomoResumoAtivo = data?.resumo.entomologico?.[entomologicoIndice];
  const fmtEntomo = (value: number | null | undefined) => entomologicoIndice === "broca_gigante"
    ? fmtPct(value == null ? null : value * 100)
    : fmtIndice(value);

  const applicationTable = (
<div className="mapa-application-list">
                    <div className="mapa-application-table-scroll">
                    <table className={`mapa-application-table${entomologico && entomologicoIndice === "broca_gigante" ? " mapa-application-table--gigante" : ""}`} aria-label={entomologico ? "Entomologia por fazenda" : "Aplicação por fazenda"}>
                      <thead><tr><th scope="col">Fazenda</th>{entomologico ? <><th scope="col" title="Quantidade de análises no período">Análises</th><th scope="col" title={ENTOMO_INDICE_META[entomologicoIndice].label}>{entomologicoIndice === "broca_gigante" ? "Infest. BG" : "Índice"}</th>{entomologicoIndice === "broca_gigante" ? <th scope="col" title="Percentual de tocos danificados: tocos brocados ÷ total de tocos × 100">Tocos %</th> : null}<th scope="col">Faixa</th></> : <><th scope="col" title="Área total em hectares">Total</th><th scope="col" title="Área aplicada em hectares">Aplicada</th><th scope="col" title="Percentual de aplicação">%</th></>}</tr></thead>
                      <tbody>
                      {sidebarFazendas.map((fazenda, index) => (
                        <tr key={fazenda.codFazenda} className={focusCodFazenda === String(fazenda.codFazenda) ? "is-active" : ""}>
                          <td>
                          <button
                            type="button"
                            className={`mapa-application-item${focusCodFazenda === String(fazenda.codFazenda) ? " is-active" : ""}`}
                            aria-pressed={focusCodFazenda === String(fazenda.codFazenda)}
                            title={entomologico ? `${fazenda.nome}: ${fazenda.analises} análises · ${fmtEntomo(fazenda.indice)} · ${entomoFaixaLabel(fazenda.faixa)}` : `${fazenda.nome}: ${fmt2(fazenda.areaAplicada)} ha aplicados de ${fmt2(fazenda.areaTotal)} ha (${fmtPct(fazenda.pctAplicado)})`}
                            onClick={() => {
                              setSelectedCod("all");
                              setSelectedFeature(null);
                              setFocusUid(null);
                              setFocusCodFazenda(String(fazenda.codFazenda));
                            }}
                          >
                            <span className="mapa-application-position">{index + 1}</span>
                            <span className="mapa-application-farm-name">{fazenda.nome}</span>
                          </button>
                          </td>
                          {entomologico ? <>
                            <td>{fazenda.analises}</td>
                            <td>{fmtEntomo(fazenda.indice)}</td>
                            {entomologicoIndice === "broca_gigante" ? <td>{fmtTocosDanificados(fazenda.tocosBrocados, fazenda.tocosAnalisados)}</td> : null}
                            <td><span className="mapa-entomo-table-range" title={entomoFaixaLabel(fazenda.faixa)}><i style={{ background: ENTOMO_FAIXA_META[fazenda.faixa].color }} aria-hidden="true" />{entomoFaixaLabel(fazenda.faixa)}</span></td>
                          </> : <>
                            <td>{fmt2(fazenda.areaTotal)}</td>
                            <td>{fmt2(fazenda.areaAplicada)}</td>
                            <td>{fmtPct(fazenda.pctAplicado)}</td>
                          </>}
                        </tr>
                      ))}
                      </tbody>
                    </table>
                    </div>
                    {!sidebarFazendas.length ? <p className="indicadores-mapa-hint">{entomologico ? "Nenhuma fazenda carregada no período selecionado." : "Nenhuma fazenda com aplicação no período e operação selecionados."}</p> : null}
                  </div>
  );

  return (
    <div
      className={`indicadores-mapa-root mapa-explorer${!compactacao && (selectedFeature || selectedFazenda) ? " has-selection" : ""}${filtersOpen ? " filters-open" : ""}${compactacao ? " is-compactacao" : ""}`}
    >
      {settingsOpen && canConfigure ? (
        <MapaFazendasSettings
          operations={allOperations}
          enabled={enabledActivities}
          canEdit={canConfigure}
          initialFarm={selectedFeature?.codFazenda}
          initialPlot={selectedFeature?.codTalhao}
          onSaveActivities={async (codes) => {
            if (!canConfigure) throw new Error("Sem autorização para configurar o mapa.");
            const saved = await api.indicadoresMapaConfigSave(codes);
            setEnabledActivities(saved.enabledActivities);
            setAutoActivities(false);
            if (codes != null && !codes.includes(operacaoFiltro)) {
              const next = allOperations.find((op) => codes.includes(op.codigo))?.codigo ?? "";
              setOperacaoFiltro(next);
              setOperacaoBusca("");
              if (next) await load(next);
            }
          }}
          onMapSaved={() => load()}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
      <div id="mapa-fazendas-filters" className="indicadores-mapa-toolbar" hidden={!filtersOpen}>
          <div className="mapa-explorer-heading">
            <span>EXPLORAR</span>
            <h2>Mapa fazendas</h2>
            <p>Selecione as camadas e explore os talhões.</p>
          </div>
          <label className="indicadores-mapa-toggle">
            <input
              type="checkbox"
              checked={areasAplicadas}
              onChange={(e) => {
                const checked = e.target.checked;
                setAreasAplicadas(checked);
                if (checked) {
                  setCompactacao(false);
                  setEntomologico(false);
                  setIrrigacao(false);
                }
              }}
            />
            <span>Insumos</span>
          </label>
          <label className="indicadores-mapa-toggle">
            <input
              type="checkbox"
              checked={entomologico}
              onChange={(e) => {
                const checked = e.target.checked;
                setEntomologico(checked);
                if (checked) {
                  setCompactacao(false);
                  setAreasAplicadas(false);
                  setIrrigacao(false);
                }
              }}
            />
            <span>Entomologia</span>
          </label>
          <label className="indicadores-mapa-toggle">
            <input
              type="checkbox"
              checked={irrigacao}
              onChange={(e) => {
                const checked = e.target.checked;
                setIrrigacao(checked);
                if (checked) {
                  setCompactacao(false);
                  setAreasAplicadas(false);
                  setEntomologico(false);
                }
              }}
            />
            <span>Irrigação</span>
          </label>
          <label className="indicadores-mapa-toggle">
            <input type="checkbox" checked={compactacao} onChange={(event) => {
              setCompactacao(event.target.checked);
              if (event.target.checked) {
                setAreasAplicadas(false); setEntomologico(false); setIrrigacao(false);
                setAutoActivities(false); setSideOpen(true); setSelectedFeature(null); setSelectedCod("all");
              }
            }} />
            <span>Compactação do solo</span>
          </label>
          <label className="indicadores-mapa-toggle">
            <input
              type="checkbox"
              checked={mostrarRotulosTalhao}
              onChange={(e) => setMostrarRotulosTalhao(e.target.checked)}
            />
            <span>Rótulos</span>
          </label>
          <label className="indicadores-mapa-field">
            <span>Início</span>
            <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
          </label>
          <label className="indicadores-mapa-field">
            <span>Fim</span>
            <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
          </label>
          {entomologico ? (
            <label className="indicadores-mapa-field indicadores-mapa-field-grow">
              <span>Índice</span>
              <select
                value={entomologicoIndice}
                onChange={(e) => setEntomologicoIndice(e.target.value as IndicadoresMapaEntomoIndice)}
              >
                <option value="broca_comum">Índice entre-nós (broca comum)</option>
                <option value="broca_gigante">Broca gigante</option>
              </select>
            </label>
          ) : null}
          {areasAplicadas ? (
            <label className="indicadores-mapa-field indicadores-mapa-field-grow indicadores-mapa-field-combo">
              <span>Operação</span>
              <div className="indicadores-mapa-combo" ref={operacaoWrapRef}>
                <input
                  type="search"
                  className="indicadores-mapa-combo-input"
                  placeholder="Código ou descrição…"
                  value={operacaoInputValue}
                  onChange={(e) => {
                    setOperacaoBusca(e.target.value);
                    setOperacaoFiltro("");
                    setOperacaoOpen(true);
                  }}
                  onFocus={() => setOperacaoOpen(true)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      setOperacaoOpen(false);
                    }
                  }}
                  aria-expanded={operacaoOpen}
                  aria-label="Buscar operação por código ou descrição"
                />
                {operacaoOpen ? (
                  <div className="indicadores-mapa-combo-list" role="listbox" aria-label="Operações">
                    {operacaoLista.length ? (
                      <>
                        {enabledActivities == null ? <button
                          type="button"
                          role="option"
                          className={`indicadores-mapa-combo-item${!operacaoFiltro && !operacaoBusca.trim() ? " selected" : ""}`}
                          onClick={() => {
                            setOperacaoFiltro("");
                            setOperacaoBusca("");
                            setOperacaoOpen(false);
                          }}
                        >
                          Todas
                        </button> : null}
                        {operacaoFiltrada.length ? (
                          operacaoFiltrada.map((op) => (
                            <button
                              key={op.codigo}
                              type="button"
                              role="option"
                              aria-selected={operacaoFiltro === op.codigo}
                              className={`indicadores-mapa-combo-item${operacaoFiltro === op.codigo ? " selected" : ""}`}
                              onClick={() => {
                                setOperacaoFiltro(op.codigo);
                                setOperacaoBusca("");
                                setOperacaoOpen(false);
                              }}
                            >
                              <strong>{op.codigo}</strong>
                              {op.descricao ? <span>{op.descricao}</span> : null}
                            </button>
                          ))
                        ) : (
                          <div className="indicadores-mapa-combo-empty">Nenhuma operação para &quot;{operacaoBusca}&quot;</div>
                        )}
                      </>
                    ) : (
                      <div className="indicadores-mapa-combo-empty">
                        {loading ? "Carregando operações…" : "Nenhuma operação encontrada no período."}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            </label>
          ) : null}
          {compactacao ? <>
            <label className="indicadores-mapa-field indicadores-mapa-field-grow"><span>Profundidade</span><select value={compactacaoProfundidade} onChange={(event) => setCompactacaoProfundidade(event.target.value)}><option value="">Todas as profundidades</option>{COMPACTACAO_PROFUNDIDADES.map((d) => <option key={d.nome} value={d.nome}>{d.nome}</option>)}</select></label>
            <label className="indicadores-mapa-field indicadores-mapa-field-grow"><span>Fazenda</span><select value={compactacaoFazenda} onChange={(event) => { setCompactacaoFazenda(event.target.value); setCompactacaoLote(""); }}><option value="">Todas com medição</option>{compactacaoFazendas.map((nome) => <option key={nome} value={nome}>{nome}</option>)}</select></label>
            <label className="indicadores-mapa-field indicadores-mapa-field-grow"><span>Talhão</span><select value={compactacaoLote} onChange={(event) => setCompactacaoLote(event.target.value)}><option value="">Todos com medição</option>{compactacaoLotes.map((lote) => <option key={lote} value={lote}>{lote}</option>)}</select></label>
          </> : <label className="indicadores-mapa-field indicadores-mapa-field-grow">
            <span>Fazenda</span>
            <select
              value={selectedCod === "all" ? "" : String(selectedCod)}
              onChange={(e) => {
                const v = e.target.value;
                setSelectedCod(v ? Number(v) : "all");
                setSelectedFeature(null);
                setFocusUid(null);
                setFocusCodFazenda(v || null);
              }}
            >
              <option value="">Todas</option>
              {mapFazendas.map((f) => (
                <option key={f.codFazenda} value={f.codFazenda}>
                  {f.nome}
                </option>
              ))}
            </select>
          </label>}
          <button className="btn primary indicadores-mapa-btn" disabled={loading} onClick={() => void load()}>
            {loading ? "Consultando…" : "Consultar"}
          </button>
          <div className="indicadores-mapa-toolbar-end">
            {data && !compactacao ? (
              <div className="indicadores-mapa-chips">
                <span>{data.resumo.totalFazendas} faz.</span>
                <span>{data.resumo.totalTalhoes} lotes</span>
                <span>{fmt2(data.resumo.totalAreaHa)} ha</span>
              </div>
            ) : null}
          </div>
      </div>
      <ConsultaProgressBar active={loading} label={compactacao ? "Consultando compactação do solo…" : "Consultando mapa de fazendas…"} />

      <div className="indicadores-mapa-body">
        <div className="indicadores-mapa-stage">
          <div ref={mapRef} className="indicadores-mapa-canvas" aria-label="Mapa das fazendas" />
          {compactacao ? <MapaCompactacaoSolo
            ref={compactacaoControls}
            data={compactacaoData} loading={loading} error={err}
            showLabels={mostrarRotulosTalhao}
            fazenda={compactacaoFazenda} lote={compactacaoLote}
            sideOpen={sideOpen} onCloseTable={() => setSideOpen(false)} onOpenTable={() => setSideOpen(true)}
            onFilter={(fazenda, lote) => { setCompactacaoFazenda(fazenda); setCompactacaoLote(lote); }}
          /> : null}
          {!compactacao ? <>
          <div className="indicadores-mapa-float mapa-active-activity" role="status" aria-live="polite">
            {loadingNextActivity ? (
              <div className="mapa-next-activity-loading">
                <span className="mapa-next-activity-spinner" aria-hidden="true" />
                <span>Carregando próxima atividade…</span>
              </div>
            ) : null}
            <strong>
              {entomologico
                ? entomologicoIndice === "broca_gigante" ? "Entomologia · Broca gigante" : `Entomologia · ${ENTOMO_INDICE_META[entomologicoIndice].label}`
                : irrigacao
                  ? "Irrigação"
                  : areasAplicadas
                    ? operacaoSelecionada
                      ? operacaoSelecionada.descricao || "Sem descrição"
                      : operacaoFiltro ? "Sem descrição" : "Insumos · Todas as operações"
                    : "Todas as atividades"}
            </strong>
          </div>

        {sideOpen && (areasAplicadas || entomologico) && data ? (
          <aside className="indicadores-mapa-float indicadores-mapa-overlay has-application-list" aria-label={entomologico ? "Entomologia por fazenda" : "Áreas aplicadas por fazenda"}>
            <header className="indicadores-mapa-side-head">
              <div><h3>{entomologico ? "Entomologia" : "Áreas aplicadas"}</h3></div>
              <button type="button" className="indicadores-mapa-close" onClick={() => setSideOpen(false)} aria-label={entomologico ? "Ocultar tabela de entomologia" : "Ocultar áreas aplicadas"}>×</button>
            </header>
            <div className="indicadores-mapa-side-body">{applicationTable}</div>
          </aside>
        ) : null}

        {!sideOpen ? (
          <button
            type="button"
            className="indicadores-mapa-float indicadores-mapa-open-details"
            onClick={() => setSideOpen(true)}
          >
            Detalhes
          </button>
        ) : (!areasAplicadas && !entomologico) || selectedFeature || selectedFazenda ? (
          <aside className="indicadores-mapa-float indicadores-mapa-overlay">
            <header className="indicadores-mapa-side-head">
              <div className="indicadores-mapa-side-title">
                <button
                  type="button"
                  className="indicadores-mapa-back"
                  onClick={() => {
                    setSelectedFeature(null);
                    setSelectedCod("all");
                    setFocusUid(null);
                    setFocusCodFazenda(null);
                  }}
                  aria-label="Limpar seleção"
                >
                  ←
                </button>
                <div>
                  <h3>{panelTitle}</h3>
                  <p>
                    {selectedResumo
                      ? entomologico
                        ? `${selectedEntomoResumo?.analises ?? 0} análise(s) · índice ${fmtEntomo(selectedEntomoResumo?.indice)}`
                        : `${fmt2(selectedResumo.areaAplicada)} / ${fmt2(selectedResumo.areaTotal)} ha · ${fmtPct(selectedResumo.pctAplicado)}`
                      : `${fmt2(panelArea)} ha`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="indicadores-mapa-close"
                onClick={() => {
                  if (areasAplicadas || entomologico) {
                    setSelectedFeature(null);
                    setSelectedCod("all");
                    setFocusUid(null);
                    setFocusCodFazenda(null);
                  } else {
                    setSideOpen(false);
                  }
                }}
                aria-label="Ocultar detalhes"
              >
                ×
              </button>
            </header>

            {selectedFeature ? (
              <div className="indicadores-mapa-side-body">
                <p className="indicadores-mapa-meta">Lote/talhão {selectedFeature.lote ?? selectedFeature.codTalhao ?? "—"}</p>
                <dl className="indicadores-mapa-dl indicadores-mapa-dl-grid">
                  <dt>Área do talhão</dt>
                  <dd>{fmt2(selectedFeature.areaHa)} ha</dd>
                  {entomologico ? (
                    <>
                      <dt>Índice ativo</dt>
                      <dd>{ENTOMO_INDICE_META[entomologicoIndice].label}</dd>
                      <dt>Faixa</dt>
                      <dd>
                        <span
                          className="indicadores-mapa-status-pill"
                          style={{
                            background: colorForEntomoFaixa(
                              entomoFaixaAtivo(selectedFeature.entomologico, entomologicoIndice),
                            ),
                          }}
                        >
                          {entomoFaixaLabel(entomoFaixaAtivo(selectedFeature.entomologico, entomologicoIndice))}
                        </span>
                      </dd>
                      {entomologicoIndice === "broca_comum" ? (
                        <>
                          <dt>Entre-nós brocados</dt>
                          <dd>{fmt2(selectedFeature.entomologico?.qtdeEntrenosBroca)}</dd>
                          <dt>Entre-nós analisados</dt>
                          <dd>{fmt2(selectedFeature.entomologico?.entreNosAnalisados)}</dd>
                          <dt>Índice entre-nós</dt>
                          <dd>{fmtIndice(selectedFeature.entomologico?.indiceBrocaComum)}</dd>
                          <dt>Canas brocadas</dt>
                          <dd>{fmt2(selectedFeature.entomologico?.canasBrocadas)}</dd>
                          <dt>Canas analisadas</dt>
                          <dd>{fmt2(selectedFeature.entomologico?.numeroCana)}</dd>
                          <dt>Índice cana brocada</dt>
                          <dd>
                            {fmtIndice(
                              selectedFeature.entomologico?.numeroCana
                                ? (selectedFeature.entomologico.canasBrocadas ?? 0) /
                                    selectedFeature.entomologico.numeroCana
                                : null,
                            )}
                          </dd>
                        </>
                      ) : (
                        <>
                          <dt>Touceiras brocadas</dt>
                          <dd>{fmt2(selectedFeature.entomologico?.touceirasBrocadas)}</dd>
                          <dt>Touceiras analisadas</dt>
                          <dd>{fmt2(selectedFeature.entomologico?.touceirasAnalisadas)}</dd>
                          <dt>% Infest. B. Gigante</dt>
                          <dd>{fmtEntomo(selectedFeature.entomologico?.indiceBrocaGigante)}</dd>
                          <dt>Tocos brocados</dt>
                          <dd>{fmt2(selectedFeature.entomologico?.tocosBrocados)}</dd>
                          <dt>Total de tocos</dt>
                          <dd>{fmt2(selectedFeature.entomologico?.tocosAnalisados)}</dd>
                          <dt>% Tocos danificados</dt>
                          <dd>{fmtTocosDanificados(selectedFeature.entomologico?.tocosBrocados, selectedFeature.entomologico?.tocosAnalisados)}</dd>
                        </>
                      )}
                      <dt>Análises no período</dt>
                      <dd>{selectedFeature.entomologico?.qtdAnalises ?? 0}</dd>
                      <dt>Última análise</dt>
                      <dd>{fmtDate(selectedFeature.entomologico?.ultimaAnalise)}</dd>
                    </>
                  ) : null}
                  {areasAplicadas ? (
                    <>
                      <dt>Área aplicada</dt>
                      <dd>{fmt2(selectedFeature.areaAplicada)} ha ({fmtPct(selectedFeature.pctAplicado)})</dd>
                      <dt>Status</dt>
                      <dd>
                        <span
                          className="indicadores-mapa-status-pill"
                          style={{ background: colorForAreaStatus(selectedFeature.statusArea ?? "sem") }}
                        >
                          {statusLabel(selectedFeature.statusArea)}
                        </span>
                      </dd>
                      <dt>Operação</dt>
                      <dd>
                        {(selectedFeature.areaAplicadaInfo?.operacaoDescricao ??
                          selectedFeature.areaAplicadaInfo?.operacao ??
                          operacaoFiltro) || "Todas"}
                      </dd>
                      {selectedFeature.areaAplicadaInfo?.operacao ? (
                        <>
                          <dt>Código operação</dt>
                          <dd>{selectedFeature.areaAplicadaInfo.operacao}</dd>
                        </>
                      ) : null}
                      <dt>Última aplicação</dt>
                      <dd>{fmtDate(selectedFeature.areaAplicadaInfo?.ultimaAplicacao)}</dd>
                    </>
                  ) : null}
                  {irrigacao ? (
                    <>
                      <dt>mm/ha</dt>
                      <dd>{fmt2(selectedFeature.irrigacao?.mmHa)}</dd>
                      <dt>Área irrigada</dt>
                      <dd>{fmt2(selectedFeature.irrigacao?.areaIrrigada)} ha</dd>
                      <dt>Lâmina aplicada</dt>
                      <dd>{fmt2(selectedFeature.irrigacao?.laminaTotal)}</dd>
                      <dt>Vazão média</dt>
                      <dd>{fmt2(selectedFeature.irrigacao?.vazaoMedia)}</dd>
                      <dt>Apontamentos</dt>
                      <dd>{selectedFeature.irrigacao?.qtdApontamentos ?? 0}</dd>
                      <dt>Última irrigação</dt>
                      <dd>{fmtDate(selectedFeature.irrigacao?.ultimaIrrigacao)}</dd>
                    </>
                  ) : null}
                  <dt>Variedade</dt>
                  <dd>{selectedFeature.variedade ?? "—"}</dd>
                  <dt>Tipo de cana</dt>
                  <dd>{selectedFeature.tipoCana ?? "—"}</dd>
                  <dt>Insumo (talhão)</dt>
                  <dd>
                    {selectedFeature.insumoTalhao?.qtdAplicacoes ?? 0} aplicação(ões)
                    <br />
                    {fmtMoney(selectedFeature.insumoTalhao?.valorTotal ?? 0)}
                  </dd>
                </dl>
                {selectedFeature.insumoFazenda?.materiais.length ? (
                  <div className="indicadores-mapa-top-extra">
                    <h4>Insumos da fazenda</h4>
                    <ul className="indicadores-mapa-insumos indicadores-mapa-insumos-inline">
                      {selectedFeature.insumoFazenda.materiais.map((m) => (
                        <li key={m.descricao}>
                          <span>{m.descricao}</span>
                          <em>{fmt2(m.quantidade)} · {fmtMoney(m.valor)}</em>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : selectedFazenda ? (
              <div className="indicadores-mapa-side-body">
                <p className="indicadores-mapa-meta">Cód. {selectedFazenda.codFazenda}</p>
                <dl className="indicadores-mapa-dl indicadores-mapa-dl-grid">
                  <dt>Área total</dt>
                  <dd>{fmt2(selectedResumo?.areaTotal ?? selectedFazenda.areaHa)} ha</dd>
                  {entomologico ? (
                    <>
                      <dt>Análises no período</dt>
                      <dd>{selectedEntomoResumo?.analises ?? 0}</dd>
                      <dt>{entomologicoIndice === "broca_gigante" ? "% Infest. B. Gigante" : "Índice"}</dt>
                      <dd>{fmtEntomo(selectedEntomoResumo?.indice)}</dd>
                      {entomologicoIndice === "broca_gigante" ? <><dt>% Tocos danificados</dt><dd>{fmtTocosDanificados(selectedEntomoResumo?.tocosBrocados, selectedEntomoResumo?.tocosAnalisados)}</dd></> : null}
                      <dt>Faixa</dt>
                      <dd>{entomoFaixaLabel(selectedEntomoResumo?.faixa)}</dd>
                    </>
                  ) : (
                    <>
                      <dt>Área aplicada</dt>
                      <dd>{fmt2(selectedResumo?.areaAplicada ?? 0)} ha ({fmtPct(selectedResumo?.pctAplicado)})</dd>
                      <dt>Lotes com aplicação</dt>
                      <dd>{selectedResumo?.lotesComAplicacao ?? 0} / {selectedResumo?.lotes ?? 0}</dd>
                    </>
                  )}
                  <dt>Aplicações de insumo</dt>
                  <dd>{selectedFazenda.insumos.qtdAplicacoes}</dd>
                  <dt>Valor insumos</dt>
                  <dd>{fmtMoney(selectedFazenda.insumos.valorTotal)}</dd>
                </dl>
                {selectedFazenda.insumos.materiais.length ? (
                  <div className="indicadores-mapa-top-extra">
                    <h4>Principais insumos</h4>
                    <ul className="indicadores-mapa-insumos indicadores-mapa-insumos-inline">
                      {selectedFazenda.insumos.materiais.map((m) => (
                        <li key={m.descricao}>
                          <span>{m.descricao}</span>
                          <em>{fmt2(m.quantidade)} · {fmtMoney(m.valor)}</em>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="indicadores-mapa-side-body">
                {!areasAplicadas ? (
                  <p className="indicadores-mapa-hint">
                    {entomologico
                      ? `Mapa por índice de ${ENTOMO_INDICE_META[entomologicoIndice].label.toLowerCase()} (${ENTOMO_INDICE_META[entomologicoIndice].formula}). Verde = baixo, amarelo = médio, vermelho = alto.${
                          entomoResumoAtivo &&
                          entomoResumoAtivo.verde + entomoResumoAtivo.amarelo + entomoResumoAtivo.vermelho === 0
                            ? " Nenhuma análise encontrada nesse período — amplie as datas (ex.: safra inteira) e clique em Consultar."
                            : ""
                        }`
                      : irrigacao
                        ? "Mapa por irrigação no período. Cor azul = mm/ha (Σ Volume ÷ Σ área ÷ 10). Clique em um talhão para ver área irrigada, lâmina e vazão."
                        : "Clique em um talhão no mapa ou filtre uma fazenda para ver área, variedade, tipo de cana e insumos."}
                  </p>
                ) : null}
                {data && !areasAplicadas ? (
                  <div className="indicadores-mapa-table-wrap">
                    <table className="indicadores-mapa-table indicadores-mapa-table-farms">
                      <thead>
                        <tr>
                          <th>Fazenda</th>
                          {entomologico ? (
                            <><th>Análises</th><th>Índice</th><th>Faixa</th></>
                          ) : (
                            <><th>Total</th><th>Aplicada</th><th>%</th></>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {sidebarFazendas.length ? (
                          sidebarFazendas.map((fazenda) => (
                            <tr
                              key={fazenda.codFazenda}
                              className="indicadores-mapa-farm-row"
                              onClick={() => {
                                setSelectedCod("all");
                                setSelectedFeature(null);
                                setFocusUid(null);
                                setFocusCodFazenda(String(fazenda.codFazenda));
                              }}
                            >
                              <td>{fazenda.nome}</td>
                              {entomologico ? (
                                <>
                                  <td>{fazenda.analises}</td>
                                  <td>{fmtEntomo(fazenda.indice)}</td>
                                  <td>{entomoFaixaLabel(fazenda.faixa)}</td>
                                </>
                              ) : (
                                <>
                                  <td>{fmt2(fazenda.areaTotal)}</td>
                                  <td>{fmt2(fazenda.areaAplicada)}</td>
                                  <td>{fmtPct(fazenda.pctAplicado)}</td>
                                </>
                              )}
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={4}>Nenhuma fazenda carregada.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>
            )}
          </aside>
        ) : null}

        {entomologico ? (
          <>
            <div className="indicadores-mapa-float indicadores-mapa-legend" aria-label="Legenda entomológica">
              <span className="indicadores-mapa-legend-title">
                {entomologicoIndice === "broca_gigante" ? "Tocos danificados (%)" : `${ENTOMO_INDICE_META[entomologicoIndice].label} — talhões por índice`}
              </span>
              {entomoLegendItems.map((faixa) => (
                <span key={faixa} className="indicadores-mapa-legend-item">
                  <i style={{ background: ENTOMO_FAIXA_META[faixa].color }} />
                  {ENTOMO_FAIXA_META[faixa].label}
                  {faixa !== "sem" ? (
                    <strong className="indicadores-mapa-legend-limit">
                      {ENTOMO_INDICE_LIMITES[entomologicoIndice][faixa]}
                    </strong>
                  ) : null}
                  {entomoResumoAtivo ? <em>({entomoResumoAtivo[faixa]})</em> : null}
                </span>
              ))}
            </div>
            <div className="indicadores-mapa-float indicadores-mapa-entomo-formula" aria-label="Fórmula do índice">
              {entomologicoIndice === "broca_gigante" ? <>
                <span><strong>Tocos danificados (%)</strong> = Tocos brocados ÷ Total de tocos × 100</span>
                <span>Cor pelo percentual de tocos danificados</span>
              </> : <>
                <span><strong>BC</strong> = {ENTOMO_INDICE_META.broca_comum.formula}</span>
                <span>Cor pelo índice selecionado</span>
              </>}
            </div>
          </>
        ) : areasAplicadas ? (
          <div className="indicadores-mapa-float indicadores-mapa-legend" aria-label="Legenda de áreas aplicadas">
            <span className="indicadores-mapa-legend-title">
              Lotes (área aplicada)
            </span>
            {legendItems.map((status) => (
              <span key={status} className="indicadores-mapa-legend-item">
                <i style={{ background: AREA_STATUS_META[status].color }} />
                {AREA_STATUS_META[status].label}
                {data?.resumo.areasAplicadas ? (
                  <em>({data.resumo.areasAplicadas[status]})</em>
                ) : null}
              </span>
            ))}
          </div>
        ) : irrigacao ? (
          <>
            <div className="indicadores-mapa-float indicadores-mapa-legend" aria-label="Legenda de irrigação">
              <span className="indicadores-mapa-legend-title">Irrigação (mm/ha)</span>
              <span className="indicadores-mapa-legend-item">
                <i style={{ background: colorForIrrigacaoMmHa(null, mmHaMax) }} />
                Sem apontamento
                {data?.resumo.irrigacao ? <em>({data.resumo.irrigacao.sem})</em> : null}
              </span>
              {mmHaMax > 0 ? (
                <>
                  <span className="indicadores-mapa-legend-item">
                    <i style={{ background: colorForIrrigacaoMmHa(mmHaMax * 0.2, mmHaMax) }} />
                    Baixo
                  </span>
                  <span className="indicadores-mapa-legend-item">
                    <i style={{ background: colorForIrrigacaoMmHa(mmHaMax * 0.55, mmHaMax) }} />
                    Médio
                  </span>
                  <span className="indicadores-mapa-legend-item">
                    <i style={{ background: colorForIrrigacaoMmHa(mmHaMax, mmHaMax) }} />
                    Alto
                    <strong className="indicadores-mapa-legend-limit">até {fmt2(mmHaMax)}</strong>
                  </span>
                </>
              ) : null}
              {data?.resumo.irrigacao ? (
                <span className="indicadores-mapa-legend-item">
                  <em>{data.resumo.irrigacao.com} talhão(ões) irrigado(s)</em>
                </span>
              ) : null}
            </div>
            <div className="indicadores-mapa-float indicadores-mapa-entomo-formula" aria-label="Fórmula mm/ha">
              <span>
                <strong>Volume</strong> = m³/ha × área · <strong>mm/ha</strong> = Σ Volume ÷ Σ área ÷ 10
              </span>
              {data?.resumo.irrigacao?.mmHaMedio != null ? (
                <span>Média no período: {fmt2(data.resumo.irrigacao.mmHaMedio)} mm/ha</span>
              ) : null}
            </div>
          </>
        ) : null}

          </> : null}
        <div className="indicadores-mapa-float indicadores-mapa-tools">
          <button type="button" className="indicadores-mapa-tool" onClick={() => compactacao ? compactacaoControls.current?.zoomIn() : mapInstance.current?.zoomIn()} aria-label="Aumentar zoom">
            +
          </button>
          <button type="button" className="indicadores-mapa-tool" onClick={() => compactacao ? compactacaoControls.current?.zoomOut() : mapInstance.current?.zoomOut()} aria-label="Diminuir zoom">
            −
          </button>
          <button
            type="button"
            className="indicadores-mapa-tool"
            onClick={() => {
              if (compactacao) compactacaoControls.current?.fit(); else fitLayer();
            }}
            aria-label="Ajustar zoom"
            title="Enquadrar área"
          >
            ◫
          </button>
          <button
            type="button"
            className="indicadores-mapa-tool"
            aria-expanded={filtersOpen}
            aria-controls="mapa-fazendas-filters"
            aria-label={filtersOpen ? "Ocultar filtros" : "Exibir filtros"}
            title={filtersOpen ? "Ocultar filtros" : "Filtros"}
            onClick={() => setFiltersOpen((open) => !open)}
          >
            {filtersOpen ? "✕" : "☷"}
          </button>
          {areasAplicadas ? (
            <button
              type="button"
              className="indicadores-mapa-tool mapa-activity-play"
              disabled={!autoActivities && (operacaoLista.length < 2 || loading)}
              aria-pressed={autoActivities}
              aria-label={autoActivities ? "Pausar troca automática de atividades" : "Alternar atividades automaticamente a cada 1 minuto"}
              title={autoActivities ? "Pausar atividades" : "Alternar atividades a cada 1 minuto"}
              onClick={() => setAutoActivities((current) => !current)}
            >
              {autoActivities ? "Ⅱ" : "▶"}
            </button>
          ) : null}
          {canConfigure ? <button
            type="button"
            className="indicadores-mapa-tool"
            aria-label="Configurações do mapa"
            title="Configurações do mapa"
            onClick={() => { setAutoActivities(false); setSettingsOpen(true); }}
          >
            ⚙
          </button> : null}
        </div>

        {err ? <div className="indicadores-mapa-float indicadores-mapa-error">{err}</div> : null}
        </div>
      </div>
    </div>
  );
}
