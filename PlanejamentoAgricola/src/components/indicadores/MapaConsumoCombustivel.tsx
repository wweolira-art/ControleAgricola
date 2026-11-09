import { useEffect, useMemo, useRef, useState } from "react";
import type { GeoJsonObject } from "geojson";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { api, type IndicadoresCombustivelLinha, type IndicadoresMapaFazendasData, type ResumoTransporteCanaData } from "../../api";

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

type FazendaConsumo = {
  nome: string;
  litros: number;
  toneladas: number;
  litrosPorTonelada: number;
  equipamentos: number;
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

function consumoColor(litrosPorTonelada: number | null, meta: number) {
  if (litrosPorTonelada == null || litrosPorTonelada <= 0) return "#94a3b8";
  if (!(meta > 0)) return "#60a5fa";
  const proporcao = litrosPorTonelada / meta;
  // Até a meta a cor sai do verde e chega ao amarelo; acima dela, do amarelo ao vermelho.
  return proporcao <= 1
    ? mixColor([34, 197, 94], [250, 204, 21], proporcao)
    : mixColor([250, 204, 21], [220, 38, 38], Math.min(1, proporcao - 1));
}

function farmKey(value: string | null | undefined) {
  return String(value ?? "")
    .replace(/^\s*\d+(?:\.\d+)*\s*-\s*/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function buildFazendas(rows: IndicadoresCombustivelLinha[], transporte: ResumoTransporteCanaData | null) {
  const litrosPorEquipamento = new Map<number, number>();
  for (const row of rows) {
    if (row.codEquipamento == null || !(row.qtdeLitros > 0)) continue;
    litrosPorEquipamento.set(row.codEquipamento, (litrosPorEquipamento.get(row.codEquipamento) ?? 0) + row.qtdeLitros);
  }
  const toneladasPorEquipamento = new Map<number, number>();
  for (const bloco of transporte?.blocos ?? []) for (const linha of bloco.linhas) {
    for (const [equipamento, toneladas] of Object.entries(linha.equipamentos)) {
      const codigo = Number(equipamento);
      if (Number.isFinite(codigo) && toneladas > 0) toneladasPorEquipamento.set(codigo, (toneladasPorEquipamento.get(codigo) ?? 0) + toneladas);
    }
  }
  const byFarm = new Map<string, { nome: string; litros: number; toneladas: number; equipamentos: Set<number> }>();
  for (const bloco of transporte?.blocos ?? []) for (const linha of bloco.linhas) {
    const key = farmKey(linha.fazenda);
    if (!key) continue;
    const current = byFarm.get(key) ?? { nome: linha.fazenda, litros: 0, toneladas: 0, equipamentos: new Set<number>() };
    for (const [equipamento, toneladas] of Object.entries(linha.equipamentos)) {
      const codigo = Number(equipamento);
      const toneladasEquipamento = toneladasPorEquipamento.get(codigo) ?? 0;
      const litrosEquipamento = litrosPorEquipamento.get(codigo) ?? 0;
      if (!(codigo > 0) || !(toneladas > 0) || !(toneladasEquipamento > 0) || !(litrosEquipamento > 0)) continue;
      // O tanque pertence ao equipamento; seus litros são rateados pelas toneladas
      // que o mesmo equipamento levou de cada fazenda no período.
      current.litros += litrosEquipamento * (toneladas / toneladasEquipamento);
      current.toneladas += toneladas;
      current.equipamentos.add(codigo);
    }
    if (current.toneladas > 0) byFarm.set(key, current);
  }
  return new Map<string, FazendaConsumo>([...byFarm.entries()].map(([key, item]) => [key, {
    nome: item.nome,
    litros: item.litros,
    toneladas: item.toneladas,
    litrosPorTonelada: item.toneladas > 0 ? item.litros / item.toneladas : 0,
    equipamentos: item.equipamentos.size,
  }]));
}

export function MapaConsumoCombustivel({ dataInicio, dataFim }: Props) {
  const [fuelRows, setFuelRows] = useState<IndicadoresCombustivelLinha[]>([]);
  const [transporte, setTransporte] = useState<ResumoTransporteCanaData | null>(null);
  const [mapData, setMapData] = useState<IndicadoresMapaFazendasData | null>(null);
  const [tipo, setTipo] = useState("");
  const [meta, setMeta] = useState(0);
  const [metaEdited, setMetaEdited] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mapEl = useRef<HTMLDivElement | null>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.GeoJSON | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    Promise.all([
      api.indicadoresCombustivel({ dataInicio: dataInicio ?? undefined, dataFim: dataFim ?? undefined }),
      api.indicadoresMapaFazendas({ dataInicio: dataInicio ?? undefined, dataFim: dataFim ?? undefined }),
      api.colheitaResumoTransporte({ dataInicio: dataInicio ?? undefined, dataFim: dataFim ?? undefined, refDate: dataFim ?? undefined, modo: "proprios" }),
    ])
      .then(([combustivel, fazendas, resumoTransporte]) => {
        if (!active) return;
        setFuelRows(combustivel.dados);
        setMapData(fazendas);
        setTransporte(resumoTransporte);
        setMetaEdited(false);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setFuelRows([]);
        setMapData(null);
        setTransporte(null);
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
  const fazendas = useMemo(() => buildFazendas(rowsFiltradas, transporte), [rowsFiltradas, transporte]);
  const metaSugerida = useMemo(() => {
    const values = [...fazendas.values()];
    const litros = values.reduce((sum, row) => sum + row.litros, 0);
    const toneladas = values.reduce((sum, row) => sum + row.toneladas, 0);
    return toneladas > 0 ? litros / toneladas : 0;
  }, [fazendas]);
  const metaUsada = metaEdited ? meta : metaSugerida;

  useEffect(() => {
    if (!metaEdited) setMeta(metaSugerida > 0 ? Number(metaSugerida.toFixed(2)) : 0);
  }, [metaEdited, metaSugerida]);

  const features = useMemo(
    () => (mapData?.geojson.features ?? []).filter((feature) => String(feature.properties.camada ?? "LOTES").toUpperCase() === "LOTES"),
    [mapData],
  );

  useEffect(() => {
    if (!mapEl.current) return;
    if (!map.current) {
      map.current = L.map(mapEl.current, { zoomControl: true, attributionControl: false });
      L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19 }).addTo(map.current);
      L.control.attribution({ position: "bottomright", prefix: false }).addAttribution("Esri · OpenStreetMap").addTo(map.current);
    }
    layer.current?.remove();
    const collection = { type: "FeatureCollection" as const, features };
    const getConsumo = (props: FeatureProps) => {
      return fazendas.get(farmKey(props.fazenda)) ?? null;
    };
    layer.current = L.geoJSON(collection as GeoJsonObject, {
      style: (feature) => {
        const consumo = getConsumo((feature?.properties ?? {}) as FeatureProps);
        return { color: "#102b4d", weight: 1.15, fillColor: consumoColor(consumo?.litrosPorTonelada ?? null, metaUsada), fillOpacity: consumo ? 0.86 : 0.28 };
      },
      onEachFeature: (feature, leafletLayer) => {
        const props = (feature.properties ?? {}) as FeatureProps;
        const consumo = getConsumo(props);
        const talhao = props.codTalhao ?? props.lote ?? "—";
        leafletLayer.bindTooltip(String(talhao), { permanent: true, direction: "center", className: "indicadores-mapa-talhao-label", opacity: 1 });
        leafletLayer.bindPopup(`<strong>${props.fazenda ?? "Fazenda"} · Talhão ${talhao}</strong><br/>${consumo ? `Consumo da fazenda: <b>${fmt(consumo.litrosPorTonelada)} L/t</b><br/>Meta: ${fmt(metaUsada)} L/t<br/>Litros rateados: ${fmt(consumo.litros)} L · Produção: ${fmt(consumo.toneladas)} t<br/>Equipamentos: ${consumo.equipamentos}` : "Sem produção e combustível vinculados à fazenda no período."}`);
      },
    }).addTo(map.current);
    const bounds = layer.current.getBounds();
    if (bounds.isValid()) map.current.fitBounds(bounds, { padding: [20, 20], maxZoom: 16 });
    window.setTimeout(() => map.current?.invalidateSize(), 80);
  }, [features, fazendas, metaUsada]);

  useEffect(() => () => { map.current?.remove(); map.current = null; }, []);

  const associados = fazendas.size;
  const acimaMeta = [...fazendas.values()].filter((row) => metaUsada > 0 && row.litrosPorTonelada > metaUsada).length;
  return (
    <section className="consumo-mapa">
      <header className="consumo-mapa-head">
        <div><h4>Mapa de consumo por talhão</h4><p>O consumo é calculado por fazenda em L/t; seus talhões recebem a mesma cor conforme a meta.</p></div>
        <div className="consumo-mapa-filters no-print">
          <label>Tipo de equipamento<select value={tipo} onChange={(event) => setTipo(event.target.value)}><option value="">Todos</option>{tipos.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label>Meta (L/t)<input type="number" min="0" step="0.01" value={meta} onChange={(event) => { setMetaEdited(true); setMeta(Number(event.target.value) || 0); }} /></label>
        </div>
      </header>
      {loading ? <p className="consumo-mapa-message">Carregando consumo e talhões…</p> : null}
      {error ? <p className="consumo-mapa-message is-error">{error}</p> : null}
      {!loading && !error ? <>
        <div className="consumo-mapa-summary"><span><b>{associados}</b> fazendas com consumo</span><span><b>{acimaMeta}</b> acima da meta</span><span>Meta sugerida: <b>{fmt(metaSugerida)} L/t</b></span></div>
        <div className="consumo-mapa-stage" ref={mapEl} aria-label="Mapa de consumo de combustível por talhão" />
        <div className="consumo-mapa-legend"><span><i style={{ background: "#22c55e" }} />Abaixo da meta</span><span><i style={{ background: "#facc15" }} />Na meta</span><span><i style={{ background: "#dc2626" }} />Acima da meta</span><span><i style={{ background: "#94a3b8" }} />Sem consumo no período</span></div>
      </> : null}
    </section>
  );
}
