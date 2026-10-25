import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { api, type MapaEditorData, type MapaEditorFeature, type MapaGeometry } from "../../api";

type Operation = { codigo: string; descricao: string };
const farmName = (f: MapaEditorFeature) => String(f.properties.Fazenda ?? f.properties.fazenda ?? "Sem nome");
const plotNumber = (f: MapaEditorFeature) => String(f.properties.Lote ?? f.properties.lote ?? f.properties.cod_talhao ?? "");
const farmCode = (f: MapaEditorFeature) => String(f.properties.Cod_fazend ?? f.properties.cod_fazend ?? f.properties.cod_fazenda ?? "");

function PolygonEditor({ text, onChange }: { text: string; onChange: (value: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const fitted = useRef(false);
  useEffect(() => {
    if (!ref.current) return;
    const map = L.map(ref.current, { doubleClickZoom: false }).setView([-9.8, -36.1], 12);
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { attribution: "Tiles © Esri", maxZoom: 20 }).addTo(map);
    mapRef.current = map;
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(ref.current);
    return () => { observer.disconnect(); map.remove(); mapRef.current = null; };
  }, []);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let geometry: MapaGeometry;
    try { geometry = JSON.parse(text); } catch { return; }
    if (!geometry || !["Polygon", "MultiPolygon"].includes(geometry.type)) return;
    const group = L.layerGroup().addTo(map);
    try {
      const polygons = geometry.type === "Polygon" ? [geometry.coordinates as number[][][]] : geometry.coordinates as number[][][][];
      const outline = L.geoJSON({ type: "Feature", properties: {}, geometry } as any, { style: { color: "#ffd375", weight: 3, fillOpacity: .2 } }).addTo(group);
      if (!fitted.current && outline.getBounds().isValid()) { map.fitBounds(outline.getBounds(), { padding: [30, 30] }); fitted.current = true; }
      polygons.forEach((polygon, pi) => polygon.forEach((ring, ri) => {
        const update = (nextRing: number[][]) => {
          const next = structuredClone(geometry);
          const items = next.type === "Polygon" ? [next.coordinates as number[][][]] : next.coordinates as number[][][][];
          items[pi][ri] = [...nextRing, [...nextRing[0]]];
          onChange(JSON.stringify(next, null, 2));
        };
        ring.slice(0, -1).forEach((point, vi) => {
          const marker = L.marker([point[1], point[0]], { draggable: true, icon: L.divIcon({ className: "mapa-editor-vertex", iconSize: [12, 12], iconAnchor: [6, 6] }), keyboard: true });
          marker.bindTooltip("Arraste para ajustar. Clique duas vezes para remover.");
          marker.on("dragend", () => {
            const pos = marker.getLatLng();
            const next = ring.slice(0, -1).map((p) => [...p]); next[vi] = [pos.lng, pos.lat]; update(next);
          });
          marker.on("dblclick", (event) => {
            L.DomEvent.stopPropagation(event);
            if (ring.length <= 4) return;
            update(ring.slice(0, -1).filter((_, index) => index !== vi));
          });
          marker.addTo(group);
          const end = ring[vi + 1];
          const midpoint = L.marker([(point[1] + end[1]) / 2, (point[0] + end[0]) / 2], { icon: L.divIcon({ className: "mapa-editor-midpoint", html: "+", iconSize: [12, 12], iconAnchor: [6, 6] }) });
          midpoint.bindTooltip("Adicionar vértice");
          midpoint.on("click", () => {
            const next = ring.slice(0, -1).map((p) => [...p]);
            next.splice(vi + 1, 0, [(point[0] + end[0]) / 2, (point[1] + end[1]) / 2]); update(next);
          });
          midpoint.addTo(group);
        });
      }));
    } catch { /* Invalid JSON drafts remain editable without replacing the saved geometry. */ }
    return () => { group.remove(); };
  }, [text, onChange]);
  return <div className="mapa-settings-editor-map" ref={ref} aria-label="Editor do contorno do talhão" />;
}

export function MapaFazendasSettings({ operations, enabled, canEdit, initialFarm, initialPlot, onSaveActivities, onMapSaved, onClose }: {
  operations: Operation[]; enabled: string[] | null; canEdit: boolean; initialFarm?: number | null; initialPlot?: number | null;
  onSaveActivities: (codes: string[] | null) => Promise<void>; onMapSaved: () => Promise<void>; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<"activities" | "map">("activities");
  const [all, setAll] = useState(enabled == null);
  const [codes, setCodes] = useState<string[]>(enabled ?? operations.map((op) => op.codigo));
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState<MapaEditorData | null>(null);
  const [index, setIndex] = useState(-1);
  const [name, setName] = useState("");
  const [plot, setPlot] = useState("");
  const [geometry, setGeometry] = useState("");
  const [renameFarm, setRenameFarm] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const initialSelection = useRef({ initialFarm, initialPlot });
  const selected = editor?.geojson.features[index];
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    if (!canEdit) return;
    let disposed = false;
    api.indicadoresMapaEditor().then((data) => {
      if (disposed) return;
      setEditor(data);
      const match = data.geojson.features.findIndex((f) => farmCode(f) === String(initialSelection.current.initialFarm) && plotNumber(f) === String(initialSelection.current.initialPlot));
      setIndex(match >= 0 ? match : 0);
    }).catch((e) => { if (!disposed) setError(e.message); });
    return () => { disposed = true; };
  }, [canEdit]);
  useEffect(() => {
    if (!selected) return;
    setName(farmName(selected)); setPlot(plotNumber(selected)); setGeometry(JSON.stringify(selected.geometry, null, 2));
  }, [selected]);
  const features = useMemo(() => editor?.geojson.features.map((f, i) => ({ feature: f, index: i })).filter(({ feature }) => `${farmName(feature)} ${plotNumber(feature)}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())) ?? [], [editor, query]);
  const save = async () => {
    if (!selected || !editor) return;
    setError(""); setMessage("");
    try {
      const parsed = JSON.parse(geometry) as MapaGeometry;
      if (!plot.trim() || !Number.isSafeInteger(Number(plot)) || Number(plot) < 0) throw new Error("Informe um número de talhão inteiro e positivo ou zero.");
      setBusy(true);
      const result = await api.indicadoresMapaFeatureSave({ revision: editor.revision, index, fazenda: name, talhao: Number(plot), renameFarm, geometry: parsed });
      setEditor(result);
      await onMapSaved();
      setMessage("Alterações salvas no JSON. Cópia de segurança criada.");
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  return (
    <dialog ref={dialog} className="mapa-settings-dialog" aria-labelledby="mapa-settings-title" onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
      <header className="mapa-settings-head"><h2 id="mapa-settings-title">Configurações do mapa</h2><button type="button" disabled={busy} onClick={onClose} aria-label="Fechar configurações">×</button></header>
      <nav className="mapa-settings-tabs" aria-label="Configurações"><button type="button" aria-pressed={tab === "activities"} onClick={() => { setTab("activities"); setQuery(""); }}>Atividades</button><button type="button" aria-pressed={tab === "map"} onClick={() => { setTab("map"); setQuery(""); }}>Fazendas e polígonos</button></nav>
      {error ? <p className="mapa-settings-error" role="alert">{error}</p> : null}
      {message ? <p className="mapa-settings-success" role="status">{message}</p> : null}
      {tab === "activities" ? (
        <section className="mapa-settings-content">
          <p>Escolha as atividades disponíveis nos filtros e na alternância automática de 1 minuto. A configuração fica salva para todos os usuários.</p>
          <label className="mapa-settings-check"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />Exibir todas as atividades, incluindo novas</label>
          <input type="search" placeholder="Buscar atividade pela descrição" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar atividade" />
          {!operations.length ? <p>Consulte a camada Insumos para carregar as atividades do período.</p> : null}
          <div className="mapa-settings-operations">{operations.filter((op) => op.descricao.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map((op) => <label className="mapa-settings-check" key={op.codigo}><input type="checkbox" disabled={all} checked={all || codes.includes(op.codigo)} onChange={(e) => setCodes((current) => e.target.checked ? [...current, op.codigo] : current.filter((code) => code !== op.codigo))} />{op.descricao || "Sem descrição"}</label>)}</div>
          <footer><button type="button" className="btn primary" disabled={busy} onClick={async () => {
            if (!all && !operations.some((op) => codes.includes(op.codigo))) { setError("Selecione pelo menos uma atividade disponível."); return; }
            setBusy(true);
            try { await onSaveActivities(all ? null : codes); setError(""); setMessage("Atividades configuradas para todos os usuários."); }
            catch (e) { setError(e instanceof Error ? e.message : "Não foi possível salvar as configurações."); }
            finally { setBusy(false); }
          }}>{busy ? "Salvando…" : "Salvar atividades"}</button></footer>
        </section>
      ) : !canEdit ? <p className="mapa-settings-content">É necessária permissão de edição do Mapa fazendas para alterar o JSON.</p> : !editor ? <p className="mapa-settings-content">Carregando arquivo do mapa…</p> : (
        <section className="mapa-settings-content mapa-settings-map-grid">
          <div className="mapa-settings-fields">
            <input type="search" placeholder="Buscar fazenda ou talhão" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar fazenda ou talhão" />
            <label>Polígono<select value={index} disabled={busy} onChange={(e) => { setIndex(Number(e.target.value)); setMessage(""); setError(""); }}>{selected && !features.some((f) => f.index === index) ? <option value={index}>{farmName(selected)} · Talhão {plotNumber(selected)}</option> : null}{features.map((item) => <option value={item.index} key={item.index}>{farmName(item.feature)} · Talhão {plotNumber(item.feature)} · #{item.index + 1}</option>)}</select></label>
            <label>Nome da fazenda<input value={name} maxLength={160} disabled={busy} onChange={(e) => setName(e.target.value)} /></label>
            <label>Número do talhão<input type="number" min="0" step="1" value={plot} disabled={busy} onChange={(e) => setPlot(e.target.value)} /></label>
            <label className="mapa-settings-check"><input type="checkbox" checked={renameFarm} disabled={busy} onChange={(e) => setRenameFarm(e.target.checked)} />Aplicar o nome a todos os polígonos desta fazenda</label>
            <p>Arraste os pontos amarelos para ajustar o contorno. Use + para inserir um vértice e clique duas vezes em um ponto para removê-lo.</p>
            <p>O número do talhão é usado no vínculo com as aplicações do Oracle. A edição altera o JSON do mapa.</p>
            <button type="button" className="btn primary" disabled={busy || !selected} onClick={() => void save()}>{busy ? "Salvando…" : "Salvar alterações no JSON"}</button>
          </div>
          <div className="mapa-settings-preview" style={busy ? { pointerEvents: "none" } : undefined}>
            {selected ? <PolygonEditor key={index} text={geometry} onChange={setGeometry} /> : null}
            <details><summary>Editar geometria em JSON</summary><textarea value={geometry} disabled={busy} onChange={(e) => setGeometry(e.target.value)} aria-label="Geometria GeoJSON do polígono" spellCheck={false} /></details>
          </div>
        </section>
      )}
    </dialog>
  );
}
