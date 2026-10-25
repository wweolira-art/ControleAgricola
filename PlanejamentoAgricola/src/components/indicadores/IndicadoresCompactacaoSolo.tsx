import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../api";
import { useApp } from "../../store";
import { COMPACTACAO_PROFUNDIDADES, type CompactacaoData } from "../../lib/compactacaoSolo";
import { corCompactacaoMatriz, gruposMatrizCompactacao, resumoCompactacaoMatriz } from "../../lib/compactacaoMatriz";
import { safraDefaultRange } from "../colheita/colheita-utils";
import { ConsultaProgressBar } from "../ConsultaProgressBar";
import { useReportAutoRefresh } from "./useReportAutoRefresh";
import { ColheitaPenetrometroImport } from "../colheita/ColheitaPenetrometroImport";
import { ReadOnlyFieldset, useCanEditItems } from "../../lib/editAccess";

const fmt = (n: number | null) => n == null ? "—" : n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
type Summary = ReturnType<typeof resumoCompactacaoMatriz>;

function MatrixHeader({ label = "Campo / Fazenda" }: { label?: string }) {
  return <thead><tr><th scope="col">{label}</th>{COMPACTACAO_PROFUNDIDADES.map((d) => <th key={d.nome} scope="col">{d.nome}</th>)}<th scope="col">Total</th></tr></thead>;
}
function MatrixCells({ summary, totalRow = false }: { summary: Summary; totalRow?: boolean }) {
  return <>{summary.profundidades.map((value, index) => <td key={COMPACTACAO_PROFUNDIDADES[index].nome} style={totalRow ? undefined : { background: corCompactacaoMatriz(value), color: value == null ? "#dce9f8" : "#07101c" }} title={`${COMPACTACAO_PROFUNDIDADES[index].nome}: ${fmt(value)} kPa`}>{fmt(value)}</td>)}<td className="compactacao-matrix-total">{fmt(summary.total)}</td></>;
}

export function IndicadoresCompactacaoSolo({ onOpenMap }: { onOpenMap?: (filters: { inicio: string; fim: string; fazenda: string }) => void } = {}) {
  const [importOpen, setImportOpen] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const importDialog = useRef<HTMLDialogElement | null>(null);
  useEffect(() => { if (importOpen) importDialog.current?.showModal(); }, [importOpen]);
  const canImport = useCanEditItems();
  const { safra } = useApp();
  const defaults = useMemo(() => safraDefaultRange(safra?.code), [safra?.code]);
  const [inicio, setInicio] = useState(defaults.from), [fim, setFim] = useState(defaults.to);
  const [data, setData] = useState<CompactacaoData | null>(null);
  const [campo, setCampo] = useState(""), [fazenda, setFazenda] = useState("");
  const [loading, setLoading] = useState(false), [error, setError] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [expandedFarms, setExpandedFarms] = useState<Set<string>>(new Set());
  const sequence = useRef(0);
  useEffect(() => { setInicio(defaults.from); setFim(defaults.to); }, [defaults]);
  const load = useCallback(async () => {
    const seq = ++sequence.current;
    setLoading(true); setError("");
    try {
      const result = await api.indicadoresMapaCompactacao({ dataInicio: inicio, dataFim: fim });
      if (seq !== sequence.current) return;
      setData(result);
      setCampo((current) => result.pontos.some((p) => (p.campo || "__sem_campo__") === current) ? current : "");
      setFazenda((current) => result.pontos.some((p) => p.fazenda === current) ? current : "");
    } catch (e) { if (seq === sequence.current) { setData(null); setError(e instanceof Error ? e.message : String(e)); } }
    finally { if (seq === sequence.current) setLoading(false); }
  }, [inicio, fim]);
  useEffect(() => { void load(); return () => { sequence.current++; }; }, [load]);
  useReportAutoRefresh(() => { if (!loading) return load(); });
  const points = useMemo(() => (data?.pontos ?? []).filter((p) => (!campo || (p.campo || "__sem_campo__") === campo) && (!fazenda || p.fazenda === fazenda)), [data, campo, fazenda]);
  const fields = useMemo(() => gruposMatrizCompactacao(points, "campo"), [points]);
  const total = useMemo(() => resumoCompactacaoMatriz(points), [points]);
  const fieldOptions = useMemo(() => [...new Set((data?.pontos ?? []).map((p) => p.campo))].sort(), [data]);
  const farmOptions = useMemo(() => [...new Set((data?.pontos ?? []).filter((p) => !campo || (p.campo || "__sem_campo__") === campo).map((p) => p.fazenda))].sort((a, b) => a.localeCompare(b, "pt-BR")), [data, campo]);
  const toggle = (value: string, setter: typeof setCollapsed) => setter((current) => { const next = new Set(current); if (next.has(value)) next.delete(value); else next.add(value); return next; });
  const navigation = <div className="compactacao-report-views" aria-label="Opções de compactação do solo">
    <button type="button" className="btn primary compactacao-import-icon" aria-haspopup="dialog" aria-label="Importar dados do penetrômetro" disabled={!canImport} title={!canImport ? "É necessária permissão de edição para importar dados." : "Importar dados do penetrômetro"} onClick={() => setImportOpen(true)}>
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 16V3m-5 5 5-5 5 5M4 15v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5" />
      </svg>
    </button>
    {onOpenMap ? <button type="button" className="btn primary compactacao-import-icon" aria-label="Ver pontos do penetrômetro no Mapa fazendas" title="Ver pontos do penetrômetro no Mapa fazendas" onClick={() => onOpenMap({ inicio, fim, fazenda })}>
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m3 6 5-2 8 3 5-2v15l-5 2-8-3-5 2V6Zm5-2v15m8-12v15" />
        <circle cx="12" cy="11" r="2.5" /><path d="m12 13.5 0 3" />
      </svg>
    </button> : null}
  </div>;
  return <div className="compactacao-report">
    {importOpen ? <dialog
      ref={importDialog}
      className="compactacao-import-dialog"
      aria-labelledby="compactacao-import-title"
      onKeyDown={(event) => { if (event.key === "Escape") event.stopPropagation(); }}
      onCancel={(event) => { event.preventDefault(); if (!importBusy) setImportOpen(false); }}
    >
      <header className="compactacao-import-header"><h2 id="compactacao-import-title">Importar dados do penetrômetro</h2><button type="button" disabled={importBusy} aria-label="Fechar formulário de importação" onClick={() => setImportOpen(false)}>×</button></header>
      <div className="compactacao-import-body"><ReadOnlyFieldset><ColheitaPenetrometroImport onDataChanged={load} onBusyChange={setImportBusy} /></ReadOnlyFieldset></div>
    </dialog> : null}
    <div className="compactacao-report-toolbar">
      <label>Início<input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} /></label>
      <label>Fim<input type="date" value={fim} onChange={(e) => setFim(e.target.value)} /></label>
      <label>Campo<select value={campo} onChange={(e) => { setCampo(e.target.value); setFazenda(""); }}><option value="">Todos</option>{fieldOptions.map((name) => <option key={name} value={name || "__sem_campo__"}>{name || "Sem campo"}</option>)}</select></label>
      <label>Fazenda<select value={fazenda} onChange={(e) => setFazenda(e.target.value)}><option value="">Todas</option>{farmOptions.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
      <button type="button" className="btn primary" disabled={loading} onClick={() => void load()}>{loading ? "Consultando…" : "Consultar"}</button>
      <span className="compactacao-report-kpi">{points.length} pontos · {fmt(total.total)} kPa médio</span>
    </div>
    <ConsultaProgressBar active={loading} label="Consultando compactação do solo…" />
    {error ? <p role="alert" className="compactacao-report-error">{error}</p> : null}
    <div className="compactacao-report-title"><h3>Compactação por campo e fazenda</h3><div><button type="button" className="btn" onClick={() => { setCollapsed(new Set()); setExpandedFarms(new Set()); }}>Expandir tudo</button><button type="button" className="btn" onClick={() => { setCollapsed(new Set(fields.map((f) => f.nome))); setExpandedFarms(new Set()); }}>Recolher tudo</button>{navigation}</div></div>
    <div className="compactacao-matrix-scroll compactacao-matrix-main"><table className="compactacao-matrix" aria-label="Compactação por campo, fazenda e profundidade em kPa"><MatrixHeader /><tbody>
      {fields.map((field) => <Fragment key={field.nome}>
        <tr className="compactacao-matrix-field"><th scope="row"><button type="button" aria-expanded={!collapsed.has(field.nome)} onClick={() => toggle(field.nome, setCollapsed)}><span aria-hidden="true">{collapsed.has(field.nome) ? "⊞" : "⊟"}</span>{field.nome}</button></th><MatrixCells summary={field.resumo} totalRow /></tr>
        {!collapsed.has(field.nome) ? gruposMatrizCompactacao(field.pontos, "fazenda").map((farm) => {
          const key = `${field.nome}\u0000${farm.nome}`;
          return <Fragment key={key}><tr><th scope="row" className="compactacao-matrix-farm"><button type="button" aria-expanded={expandedFarms.has(key)} onClick={() => toggle(key, setExpandedFarms)}><span aria-hidden="true">{expandedFarms.has(key) ? "⊟" : "⊞"}</span>{farm.nome}</button></th><MatrixCells summary={farm.resumo} /></tr>
            {expandedFarms.has(key) ? gruposMatrizCompactacao(farm.pontos, "lote").map((plot) => <tr key={plot.nome}><th scope="row" className="compactacao-matrix-plot">{plot.nome}</th><MatrixCells summary={plot.resumo} /></tr>) : null}</Fragment>;
        }) : null}
      </Fragment>)}
      {!fields.length && !loading ? <tr><td colSpan={18}>Nenhuma medição encontrada no período e nos filtros selecionados.</td></tr> : null}
    </tbody><tfoot><tr><th scope="row">Total</th><MatrixCells summary={total} totalRow /></tr></tfoot></table></div>
    <div className="compactacao-report-legend"><span>Resistência média (kPa)</span><i /><span>≤ 1.600</span><span>1.800</span><span>≥ 2.000</span></div>
    <p className="compactacao-report-note">Médias por profundidade e totais calculados sobre as leituras válidas, com a mesma fonte e faixas do Power BI.</p>
  </div>;
}
