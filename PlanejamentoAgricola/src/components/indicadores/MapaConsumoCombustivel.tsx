import { useEffect, useMemo, useRef, useState } from "react";
import type { GeoJsonObject } from "geojson";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { api, type IndicadoresCombustivelLinha, type IndicadoresMapaFazendasData, type ColheitaFazendaUsinaRow } from "../../api";

import { buildTalhoes, talhaoMapaKey, type ProducaoMaquinaFazenda } from "../../lib/mapa-consumo";
import { lerMetasConsumo } from "../../lib/metas-consumo";

type Props = {
  dataInicio: string | null;
  dataFim: string | null;
};

type FeatureProps = {
  uid?: string;
  camada?: string | null;
  fazenda?: string | null;
  codFazenda?: number | null;
  codFazendaOracle?: number | null;
  codTalhao?: number | null;
  lote?: number | null;
};


function fmt(n: number | null | undefined, digits = 2) {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
}

function mixColor(from: [number, number, number], to: [number, number, number], t: number) {
  const clamp = Math.max(0, Math.min(1, t));
  const rgb = from.map((value, index) => Math.round(value + (to[index] - value) * clamp));
  return `rgb(${rgb.join(", ")})`;
}

function consumoColor(valor: number | null, meta: number | null) {
  if (valor == null || valor <= 0) return "#94a3b8";
  if (meta == null || !(meta > 0)) return "#60a5fa";
  const proporcao = valor / meta;
  // Atingir a meta inclui todo consumo igual ou menor que ela.
  return proporcao <= 1
    ? "#22c55e"
    : mixColor([250, 204, 21], [220, 38, 38], Math.min(1, proporcao - 1));
}

export function MapaConsumoCombustivel({ dataInicio, dataFim }: Props) {
  const [producaoMaquina, setProducaoMaquina] = useState<ProducaoMaquinaFazenda[]>([]);
  const [fuelRows, setFuelRows] = useState<IndicadoresCombustivelLinha[]>([]);
  const [vinculos, setVinculos] = useState<ColheitaFazendaUsinaRow[]>([]);
  const [mapData, setMapData] = useState<IndicadoresMapaFazendasData | null>(null);
  const [tipo, setTipo] = useState("");
  const [indicador, setIndicador] = useState<"ltTon" | "ltHora">("ltTon");
  const [metas, setMetas] = useState(lerMetasConsumo);
  const unidade = indicador === "ltHora" ? "L/h" : "L/t";
  const campoValor = indicador === "ltHora" ? "litrosPorHora" : "litrosPorTonelada";
  const campoMeta = indicador === "ltHora" ? "metaLitrosPorHora" : "metaLitrosPorTonelada";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mapEl = useRef<HTMLDivElement | null>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.GeoJSON | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    if (!dataInicio || !dataFim) {
      setLoading(false);
      setError("Informe uma data inicial e uma data final válidas.");
      return;
    }
    Promise.all([
      api.indicadoresCombustivel({ dataInicio: dataInicio ?? undefined, dataFim: dataFim ?? undefined }),
      api.indicadoresMapaFazendas({ dataInicio: dataInicio ?? undefined, dataFim: dataFim ?? undefined }),
      api.colheitaFazendaUsina(),
      api.indicadoresConsumoTalhoes({ dataInicio, dataFim }),
    ])
      .then(([combustivel, fazendas, fazendasUsina, producao]) => {
        if (!active) return;
        setFuelRows(combustivel.dados.filter(row =>
          row.codTipoEquipamento === 81 || row.codTipoEquipamento === 93 || row.codTipoEquipamento === 30,
        ));
        setMapData(fazendas);
        setVinculos(fazendasUsina.dados);
        setProducaoMaquina(producao.dados);
        setMetas(lerMetasConsumo());
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setFuelRows([]);
        setMapData(null);
        setVinculos([]);
        setProducaoMaquina([]);
        setError(cause instanceof Error ? cause.message : "Não foi possível carregar o mapa de consumo.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [dataInicio, dataFim]);

  const tipos = useMemo(() => {
    const values = new Map<string, string>();
    for (const row of fuelRows) {
      if (row.codTipoEquipamento == null) continue;
      const key = String(row.codTipoEquipamento);
      if (!values.has(key)) values.set(key, row.tipoEquipamento?.trim() || `Tipo ${key}`);
    }
    return [...values.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [fuelRows]);

  const rowsFiltradas = useMemo(
    () => fuelRows.filter((row) => !tipo || String(row.codTipoEquipamento ?? "") === tipo),
    [fuelRows, tipo],
  );
  const features = useMemo(
    () => (mapData?.geojson.features ?? []).filter((feature) => String(feature.properties.camada ?? "LOTES").toUpperCase() === "LOTES"),
    [mapData],
  );

  const consumo = useMemo(() => buildTalhoes(rowsFiltradas, producaoMaquina, features.map(feature => feature.properties), vinculos, metas), [rowsFiltradas, producaoMaquina, features, vinculos, metas]);
  const talhoes = consumo.talhoes;
  useEffect(() => {
    const atualizarMetas = () => setMetas(lerMetasConsumo());
    window.addEventListener("focus", atualizarMetas);
    window.addEventListener("storage", atualizarMetas);
    return () => {
      window.removeEventListener("focus", atualizarMetas);
      window.removeEventListener("storage", atualizarMetas);
    };
  }, []);

  useEffect(() => {
    if (loading || error || !mapEl.current) return;
    if (!map.current) {
      map.current = L.map(mapEl.current, { zoomControl: true, attributionControl: false });
      L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19 }).addTo(map.current);
      L.control.attribution({ position: "bottomright", prefix: false }).addAttribution("Esri · OpenStreetMap").addTo(map.current);
    }
    layer.current?.remove();
    const collection = { type: "FeatureCollection" as const, features };
    const getConsumo = (props: FeatureProps) => {
      const chave = talhaoMapaKey(props);
      return chave ? talhoes.get(chave) ?? null : null;
    };
    layer.current = L.geoJSON(collection as GeoJsonObject, {
      style: (feature) => {
        const consumo = getConsumo((feature?.properties ?? {}) as FeatureProps);
        return { color: "#102b4d", weight: 1.15, fillColor: consumoColor(consumo?.[campoValor] ?? null, consumo?.[campoMeta] ?? null), fillOpacity: consumo?.[campoValor] != null ? 0.86 : 0.28 };
      },
      onEachFeature: (feature, leafletLayer) => {
        const props = (feature.properties ?? {}) as FeatureProps;
        const consumo = getConsumo(props);
        const talhao = props.codTalhao ?? props.lote ?? "—";
        leafletLayer.bindTooltip(String(talhao), { permanent: true, direction: "center", className: "indicadores-mapa-talhao-label", opacity: 1 });
        leafletLayer.bindPopup(`<strong>${props.fazenda ?? "Fazenda"} · Talhão ${talhao}</strong><br/>${consumo ? `Consumo estimado do talhão: <b>${fmt(consumo[campoValor])} ${unidade}</b><br/>Meta: ${fmt(consumo[campoMeta])} ${unidade}<br/>Litros rateados: ${fmt(consumo.litros)} L · Produção: ${fmt(consumo.toneladas)} t<br/>Horas rateadas: ${fmt(consumo.horas)} h<br/>Litros com horas: ${fmt(consumo.litrosComHoras)} L<br/>Equipamentos: ${consumo.equipamentos}` : "Sem produção e combustível vinculados a este talhão no período."}`);
      },
    }).addTo(map.current);
    const bounds = layer.current.getBounds();
    if (bounds.isValid()) map.current.fitBounds(bounds, { padding: [20, 20], maxZoom: 16 });
    const currentMap = map.current;
    const syncLabels = () => {
      const mostrar = currentMap.getZoom() >= 14;
      layer.current?.eachLayer(polygon => {
        if (mostrar) polygon.openTooltip();
        else polygon.closeTooltip();
      });
    };
    currentMap.on("zoomend", syncLabels);
    syncLabels();
    const resizeTimer = window.setTimeout(() => currentMap.invalidateSize(), 80);
    return () => {
      currentMap.off("zoomend", syncLabels);
      window.clearTimeout(resizeTimer);
    };
  }, [features, talhoes, campoValor, campoMeta, unidade, loading, error]);

  useEffect(() => () => { map.current?.remove(); map.current = null; }, []);

  const associados = [...talhoes.values()].filter(row => row[campoValor] != null).length;
  const acimaMeta = [...talhoes.values()].filter((row) => row[campoValor] != null && row[campoMeta] != null && row[campoMeta]! > 0 && row[campoValor]! > row[campoMeta]!).length;
  return (
    <section className="consumo-mapa">
      <header className="consumo-mapa-head">
        <div><h4>Mapa de consumo por talhão</h4></div>
        <div className="consumo-mapa-filters no-print">
          <label>Tipo de equipamento<select value={tipo} onChange={(event) => { setTipo(event.target.value); if (event.target.value === "30") setIndicador("ltTon"); }}><option value="">Tratores, colhedeiras e caminhões</option>{tipos.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label>Pintar por<select value={indicador} onChange={event => setIndicador(event.target.value as "ltTon" | "ltHora")}><option value="ltTon">Litros/tonelada (L/t)</option><option value="ltHora" disabled={tipo === "30"}>Litros/hora (L/h)</option></select></label>
          {(!tipo || tipo === "81") && <label>Meta colhedeiras ({unidade})<input value={fmt(metas.colhedora[indicador])} readOnly title="Meta do Indicador CTT — Colhedeiras" /></label>}
          {(!tipo || tipo === "93") && <label>Meta tratores ({unidade})<input value={fmt(metas.trator[indicador])} readOnly title="Meta do Indicador CTT — Tratores" /></label>}
          {indicador === "ltTon" && (!tipo || tipo === "30") && <label>Meta caminhões ({unidade})<input value={fmt(metas.caminhao?.ltTon)} readOnly title="Meta de consumo dos caminhões" /></label>}
        </div>
      </header>
      {loading ? <p className="consumo-mapa-message">Carregando consumo e talhões…</p> : null}
      {error ? <p className="consumo-mapa-message is-error">{error}</p> : null}
      {!loading && !error ? <>
        <div className="consumo-mapa-summary"><span><b>{associados}</b> talhões com consumo</span><span><b>{acimaMeta}</b> acima da meta</span><span>Metas do Indicador CTT · <b>{unidade}</b></span></div>
      </> : null}
      <div className="consumo-mapa-stage" ref={mapEl} hidden={loading || Boolean(error)} aria-label="Mapa de consumo de combustível por talhão" />
      {!loading && !error ? <div className="consumo-mapa-legend"><span><i style={{ background: "#22c55e" }} />Igual ou abaixo da meta</span><span><i style={{ background: "#facc15" }} />Acima da meta</span><span><i style={{ background: "#dc2626" }} />Duas vezes a meta ou mais</span><span><i style={{ background: "#94a3b8" }} />Sem dados para o indicador</span></div> : null}
    </section>
  );
}
