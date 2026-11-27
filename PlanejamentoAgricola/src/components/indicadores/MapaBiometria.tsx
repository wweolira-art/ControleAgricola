import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import type { GeoJsonObject } from "geojson";
import { api, type AnaliseBiometricaRegistro, type IndicadoresMapaFazendasData } from "../../api";

const codigo = (value: unknown) => {
  const text = String(value ?? "").trim();
  return /^\d+$/.test(text) ? String(Number(text)) : text.toUpperCase();
};
const chave = (fazenda: unknown, talhao: unknown) => `${codigo(fazenda)}|${codigo(talhao)}`;
const cor = (value: number | null) => value == null ? "#94a3b8" : value >= 95 ? "#16834b" : value >= 80 ? "#e9ae22" : "#dc5550";

export function MapaBiometria({ rows }: { rows: AnaliseBiometricaRegistro[] }) {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const [geojson, setGeojson] = useState<IndicadoresMapaFazendasData["geojson"] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api.indicadoresMapaFazendas({}).then((data) => { if (active) setGeojson(data.geojson); }).catch(() => { if (active) setError("Não foi possível carregar os contornos dos talhões."); });
    return () => { active = false; };
  }, []);
  const valores = useMemo(() => {
    const groups = new Map<string, { sum: number; count: number }>();
    for (const row of rows) {
      if (row.tch == null || !Number.isFinite(row.tch)) continue;
      const key = chave(row.fazenda, row.talhao);
      const item = groups.get(key) ?? { sum: 0, count: 0 };
      item.sum += row.tch; item.count++; groups.set(key, item);
    }
    return groups;
  }, [rows]);
  useEffect(() => {
    if (!element.current) return;
    const instance = L.map(element.current).setView([-9.84, -36.06], 11);
    map.current = instance;
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: "Tiles © Esri" }).addTo(instance);
    const observer = new ResizeObserver(() => instance.invalidateSize());
    observer.observe(element.current);
    return () => { observer.disconnect(); instance.remove(); map.current = null; };
  }, []);
  useEffect(() => {
    if (!map.current || !geojson) return;
    const features = geojson.features.filter((feature) => String(feature.properties.camada ?? "LOTES").toUpperCase() === "LOTES" && valores.has(chave(feature.properties.codFazenda, feature.properties.lote ?? feature.properties.codTalhao)));
    const layer = L.geoJSON({ type: "FeatureCollection", features } as GeoJsonObject, {
      style: (feature) => {
        const props = feature?.properties ?? {};
        const item = valores.get(chave(props.codFazenda, props.lote ?? props.codTalhao));
        return { color: "#fff", weight: 1.5, fillColor: cor(item ? item.sum / item.count : null), fillOpacity: .7 };
      },
      onEachFeature: (feature, polygon) => {
        const props = feature.properties ?? {};
        const item = valores.get(chave(props.codFazenda, props.lote ?? props.codTalhao));
        const text = document.createElement("span");
        text.textContent = `Fazenda ${props.codFazenda ?? "—"} · Talhão ${props.lote ?? props.codTalhao ?? "—"} · TCH ${item ? (item.sum / item.count).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " t/ha" : "sem dados"}`;
        polygon.bindTooltip(text, { sticky: true });
      },
    }).addTo(map.current);
    if (layer.getBounds().isValid()) map.current.fitBounds(layer.getBounds(), { padding: [20, 20], maxZoom: 16 });
    return () => { layer.remove(); };
  }, [geojson, valores]);
  return <div>
    <div ref={element} style={{ height: 400, width: "100%", borderRadius: 8 }} aria-label="Mapa dos talhões por TCH" />
    <p style={{ fontSize: ".82rem", margin: "8px 0" }}>🟢 ≥ 95 t/ha &nbsp; 🟡 80 a &lt; 95 t/ha &nbsp; 🔴 &lt; 80 t/ha</p>
    {error ? <p role="alert">{error}</p> : !geojson ? <p>Carregando mapa…</p> : !valores.size ? <p>Sem TCH nos filtros selecionados.</p> : null}
  </div>;
}
