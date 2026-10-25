import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import L from "leaflet";
import type { GeoJsonObject } from "geojson";
import { contornosCompactacao, corLeituraCompactacao, gruposCompactacao, mediaCompactacao, type CompactacaoData, type CompactacaoPonto } from "../../lib/compactacaoSolo";

export type CompactacaoMapControls = { zoomIn: () => void; zoomOut: () => void; fit: () => void };
const fmt = (value: number | null, decimals = 1) => value == null ? "—" : new Intl.NumberFormat("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
const pointColor = (p: CompactacaoPonto) => p.descompactar > 0 ? "#D20000" : "#049D06";

function CompactacaoHoverChart({ point, x, y, mapWidth, mapHeight }: { point: CompactacaoPonto; x: number; y: number; mapWidth: number; mapHeight: number }) {
  const width = Math.min(960, mapWidth - 24);
  const height = Math.min(310, mapHeight - 24);
  const left = Math.max(12, Math.min(mapWidth - width - 12, x - width / 2));
  const top = Math.max(12, Math.min(mapHeight - height - 12, y > height + 24 ? y - height - 16 : y + 18));
  const maximum = Math.max(1, ...point.leituras.map((row) => row.kpa)) * 1.15;
  const step = 930 / point.leituras.length;
  return <section className="mapa-compactacao-hover" style={{ width, left, top }} role="tooltip" aria-label="Perfil de compactação por profundidade">
    <div className="mapa-compactacao-hover-header">
      <div className="mapa-compactacao-color-scale"><b>Referência</b><span>0,0 Mil</span><i /><span>2,5 Mil</span></div>
      <span>Fazenda: <b>{point.fazenda}</b></span><span>Lote: <b>{point.lote ?? "—"}</b></span>
      <span>Longitude: {point.longitude.toFixed(6)}</span><span>Latitude: {point.latitude.toFixed(6)}</span>
    </div>
    <svg viewBox="0 0 960 230" role="img" aria-label={`Resistência em kPa por profundidade do talhão ${point.lote ?? ""}`}>
      {point.leituras.map((row, index) => {
        const barHeight = row.kpa / maximum * 160;
        const center = 15 + step * (index + .5);
        return <g key={row.profundidade}>
          <rect x={center - step * .39} y={185 - barHeight} width={step * .78} height={Math.max(0, barHeight)} fill={corLeituraCompactacao(row.kpa)} />
          <text x={center} y={177 - barHeight} textAnchor="middle" className="mapa-compactacao-hover-value">{fmt(row.kpa)}</text>
          <text x={center} y={202} textAnchor="middle" className="mapa-compactacao-hover-depth">{row.profundidade}</text>
        </g>;
      })}
      <text x="480" y="225" textAnchor="middle" className="mapa-compactacao-hover-axis">Profundidade · resistência em kPa</text>
    </svg>
  </section>;
}

export const MapaCompactacaoSolo = forwardRef<CompactacaoMapControls, {
  data: CompactacaoData | null; loading: boolean; error: string | null; fazenda: string; lote: string;
  sideOpen: boolean; onCloseTable: () => void; onFilter: (fazenda: string, lote: string) => void;
  onOpenTable: () => void;
  showLabels?: boolean;
}>(function MapaCompactacaoSolo({ data, loading, error, fazenda, lote, sideOpen, onCloseTable, onOpenTable, onFilter, showLabels = true }, ref) {
  const canvas = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.FeatureGroup | null>(null);
  const [selected, setSelected] = useState<CompactacaoPonto | null>(null);
  const [hovered, setHovered] = useState<{ point: CompactacaoPonto; x: number; y: number; mapWidth: number; mapHeight: number } | null>(null);
  const pontos = useMemo(() => (data?.pontos ?? []).filter((p) => (!fazenda || p.fazenda === fazenda) && (!lote || String(p.lote) === lote)), [data, fazenda, lote]);
  const contornos = useMemo(() => contornosCompactacao(data?.geojson?.features ?? [], pontos, Boolean(lote)), [data?.geojson, pontos, lote]);
  const groups = useMemo(() => gruposCompactacao(pontos, "fazenda"), [pontos]);
  const mean = useMemo(() => mediaCompactacao(pontos), [pontos]);
  const compacted = pontos.filter((p) => p.descompactar > 0).length;
  const fit = useCallback(() => {
    const bounds = layer.current?.getBounds();
    if (!bounds?.isValid() || !map.current) return;
    map.current.fitBounds(bounds, { paddingTopLeft: [sideOpen && map.current.getSize().x > 700 ? 320 : 24, 76], paddingBottomRight: [64, 100], maxZoom: 17 });
  }, [sideOpen]);
  useImperativeHandle(ref, () => ({ zoomIn: () => map.current?.zoomIn(), zoomOut: () => map.current?.zoomOut(), fit }), [fit]);
  useEffect(() => {
    if (!canvas.current) return;
    map.current = L.map(canvas.current, { zoomControl: false }).setView([-9.84, -36.06], 12);
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: "Tiles © Esri" }).addTo(map.current);
    const observer = new ResizeObserver(() => map.current?.invalidateSize()); observer.observe(canvas.current);
    return () => { observer.disconnect(); map.current?.remove(); map.current = null; layer.current = null; };
  }, []);
  useEffect(() => { setSelected(null); setHovered(null); }, [data, fazenda, lote]);
  useEffect(() => {
    if (!map.current) return;
    layer.current?.remove();
    const group = L.featureGroup().addTo(map.current);
    const currentMap = map.current;
    const outlines = L.geoJSON({ type: "FeatureCollection", features: contornos } as GeoJsonObject, {
      interactive: false,
      style: { color: "#e7efff", weight: 1.5, opacity: .85, fillColor: "#a9c6ee", fillOpacity: .04 },
      onEachFeature: (feature, polygon) => {
        const props = feature.properties ?? {};
        const number = props.Lote ?? props.lote ?? props.cod_talhao;
        if (number == null) return;
        const text = document.createElement("span"); text.textContent = String(number);
        polygon.bindTooltip(text, { permanent: true, direction: "center", className: "indicadores-mapa-talhao-label", opacity: 1 });
      },
    }).addTo(group);
    const syncLabels = () => outlines.eachLayer((polygon) => {
      if (showLabels && currentMap.getZoom() >= 14) polygon.openTooltip(); else polygon.closeTooltip();
    });
    currentMap.on("zoomend", syncLabels); syncLabels();
    pontos.forEach((point) => {
      const marker = L.circleMarker([point.latitude, point.longitude], { radius: selected?.id === point.id ? 8 : 5, color: selected?.id === point.id ? "#fff" : "#14283b", weight: 1, fillColor: pointColor(point), fillOpacity: .9 });
      const showProfile = (event: L.LeafletMouseEvent) => {
        const size = map.current?.getSize();
        if (!size) return;
        setHovered({ point, x: event.containerPoint.x, y: event.containerPoint.y, mapWidth: size.x, mapHeight: size.y });
      };
      marker.on("mouseover", showProfile);
      marker.on("mousemove", showProfile);
      marker.on("mouseout", () => setHovered(null));
      marker.on("click", () => { setHovered(null); setSelected(point); }); marker.addTo(group);
      const element = marker.getElement();
      if (element) {
        element.setAttribute("tabindex", "0");
        element.setAttribute("role", "button");
        element.setAttribute("aria-label", `Medição ${point.id}: ${point.fazenda}, talhão ${point.lote ?? "—"}`);
        element.addEventListener("focus", () => {
          const position = map.current?.latLngToContainerPoint([point.latitude, point.longitude]);
          const size = map.current?.getSize();
          if (position && size) setHovered({ point, x: position.x, y: position.y, mapWidth: size.x, mapHeight: size.y });
        });
        element.addEventListener("blur", () => setHovered(null));
        element.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setHovered(null); setSelected(point); }
        });
      }
    });
    layer.current = group;
    return () => { currentMap.off("zoomend", syncLabels); group.remove(); };
  }, [pontos, contornos, selected?.id, showLabels]);
  useEffect(() => { fit(); }, [pontos, contornos, fit]);
  return <div className="mapa-compactacao-root">
    <div className="indicadores-mapa-canvas" ref={canvas} aria-label="Mapa de pontos de compactação do solo" />
    {hovered ? <CompactacaoHoverChart {...hovered} /> : null}
    {!sideOpen ? <button type="button" className="indicadores-mapa-float indicadores-mapa-open-details" onClick={onOpenTable}>Fazendas</button> : null}
    <div className="indicadores-mapa-float mapa-active-activity" role="status" aria-live="polite"><strong>Compactação do solo</strong><div className="mapa-compactacao-summary">{loading ? "Carregando medições…" : `${pontos.length} pontos · ${fmt(mean)} kPa médio`}</div></div>
    {sideOpen ? <aside className="indicadores-mapa-float indicadores-mapa-overlay has-application-list" aria-label="Compactação por fazenda">
      <header className="indicadores-mapa-side-head"><h3>Compactação do solo</h3><button type="button" className="indicadores-mapa-close" aria-label="Ocultar tabela de compactação" onClick={onCloseTable}>×</button></header>
      <div className="indicadores-mapa-side-body">
        {fazenda || lote ? <button type="button" className="mapa-compactacao-clear" onClick={() => onFilter("", "")}>← Exibir todas as medições</button> : null}
        <div className="mapa-application-list"><div className="mapa-application-table-scroll">
          <table className="mapa-application-table"><thead><tr><th scope="col">Fazenda</th><th scope="col">Pontos</th><th scope="col">kPa</th><th scope="col" title="Percentual de pontos com excedência de 2.000 kPa até 44cm">Comp. %</th></tr></thead><tbody>
            {groups.map((g) => <tr key={g.key}><td><button type="button" className="mapa-application-item" title={`${g.fazenda} · Média ${fmt(g.mediaKpa)} kPa`} onClick={() => onFilter(g.fazenda, "")}><span className="mapa-application-farm-name">{g.nome}</span></button></td><td>{g.pontos}</td><td>{fmt(g.mediaKpa, 0)}</td><td>{fmt(g.compactados / g.pontos * 100, 0)}%</td></tr>)}
          </tbody></table>
        </div></div>
        {!loading && !groups.length ? <p className="indicadores-mapa-hint">{error ? "Não foi possível consultar a fonte de compactação." : "Nenhuma medição encontrada nos filtros selecionados."}{!error && data?.periodoDisponivel.inicio ? ` Fonte com medições de ${data.periodoDisponivel.inicio.split("-").reverse().join("/")} a ${data.periodoDisponivel.fim?.split("-").reverse().join("/")}.` : ""}</p> : null}
      </div>
    </aside> : null}
    <div className="indicadores-mapa-float indicadores-mapa-legend mapa-compactacao-legend" aria-label="Legenda de compactação">
      <span className="indicadores-mapa-legend-title">Excedência até 44 cm</span>
      <span className="indicadores-mapa-legend-item"><i style={{ background: "#049D06" }} />Sem faixa acima de 2.000 kPa <em>({pontos.length - compacted})</em></span>
      <span className="indicadores-mapa-legend-item"><i style={{ background: "#D20000" }} />Alguma faixa acima de 2.000 kPa <em>({compacted})</em></span>
      <small>A classificação considera as profundidades selecionadas, como no Power BI.</small>
    </div>
    {selected ? <section className="indicadores-mapa-float mapa-compactacao-detail" aria-label="Detalhes da medição de compactação">
      <header className="indicadores-mapa-side-head"><div><h3>{selected.fazenda} · Talhão {selected.lote ?? "—"}</h3><p>{new Date(selected.dataHora).toLocaleString("pt-BR")} · {selected.equipamento} · Média {fmt(selected.mediaKpa)} kPa</p></div><button type="button" className="indicadores-mapa-close" aria-label="Fechar medição" onClick={() => setSelected(null)}>×</button></header>
      <div className="mapa-compactacao-readings">{selected.leituras.map((row) => <div key={row.profundidade}><span>{row.profundidade}</span><b>{fmt(row.kpa)} kPa</b><i style={{ width: `${Math.min(100, row.kpa / 5000 * 100)}%`, background: row.ordem <= 40 && row.kpa > 2000 ? "#D20000" : "#049D06" }} /></div>)}</div>
    </section> : null}
  </div>;
});
