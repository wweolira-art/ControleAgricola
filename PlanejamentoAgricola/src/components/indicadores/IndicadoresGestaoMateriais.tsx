import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  api,
  type GestaoMateriaisData,
  type GestaoMateriaisItem,
  type GestaoMateriaisOpcoes,
  type GestaoMateriaisPrioridade,
} from "../../api";
import { ConsultaProgressBar } from "../ConsultaProgressBar";
import { PrintButton } from "../PrintButton";
import { useReportAutoRefresh } from "./useReportAutoRefresh";

const TIPOS = [
  "Combustível",
  "Lubrificante",
  "Pneu",
  "Servico",
  "Filtro",
  "Graxa",
  "Aditivo",
  "Peças e Acessórios",
];

const PRIORIDADE_META: Record<GestaoMateriaisPrioridade, { label: string; className: string }> = {
  critico: { label: "CRÍTICO", className: "gm-prio-critico" },
  alto: { label: "ALTO", className: "gm-prio-alto" },
  medio: { label: "MÉDIO", className: "gm-prio-medio" },
  ok: { label: "OK", className: "gm-prio-ok" },
};

const PRIORIDADE_ORDER: Record<GestaoMateriaisPrioridade, number> = {
  critico: 1,
  alto: 2,
  medio: 3,
  ok: 4,
};

type SortKey =
  | "descricao"
  | "saida"
  | "mediaMes"
  | "estoqueAtual"
  | "coberturaMeses"
  | "ultimaEntrada"
  | "qtdSugerida"
  | "prioridade"
  | "precoMedio";

type SortState = { key: SortKey; dir: "asc" | "desc" };

function defaultRange() {
  const now = new Date();
  const from = new Date(now.getFullYear() - 3, 0, 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return { from: iso(from), to: iso(now) };
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

const quantityFormatter = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const materialCollator = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });

function fmtQty(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return quantityFormatter.format(n);
}

function materialLabel(item: GestaoMateriaisItem) {
  return `${item.codMaterial}-${item.descricao}`;
}

function extractLeadingCode(value: string) {
  const match = value.trim().match(/^\d+/);
  return match?.[0] ?? "";
}

function sortValue(item: GestaoMateriaisItem, key: SortKey) {
  if (key === "descricao") return materialLabel(item);
  if (key === "prioridade") return PRIORIDADE_ORDER[item.prioridade];
  if (key === "ultimaEntrada") return item.ultimaEntrada ?? "";
  return item[key] ?? Number.NEGATIVE_INFINITY;
}

function compareItems(a: GestaoMateriaisItem, b: GestaoMateriaisItem, sort: SortState) {
  const av = sortValue(a, sort.key);
  const bv = sortValue(b, sort.key);
  const dir = sort.dir === "asc" ? 1 : -1;
  if (typeof av === "string" || typeof bv === "string") {
    const result = materialCollator.compare(String(av), String(bv));
    return result * dir;
  }
  if (av === bv) return materialCollator.compare(materialLabel(a), materialLabel(b));
  return (av < bv ? -1 : 1) * dir;
}

function DetalheMaterial({
  item,
  onClose,
}: {
  item: GestaoMateriaisItem;
  onClose: () => void;
}) {
  const [pendencias, setPendencias] = useState<Awaited<ReturnType<typeof api.indicadoresPendenciasMaterial>>>([]);
  const [carregando, setCarregando] = useState(false);
  const [erroPendencias, setErroPendencias] = useState("");
  const [tentativa, setTentativa] = useState(0);
  useEffect(() => {
    let ativo = true;
    setPendencias([]);
    setErroPendencias("");
    setCarregando(item.quantidadePendenteEntrega > 0);
    if (item.quantidadePendenteEntrega > 0) {
      api.indicadoresPendenciasMaterial(item.codMaterial).then((result) => {
        if (ativo) setPendencias(result);
      }).catch((e) => {
        if (ativo) setErroPendencias(e instanceof Error ? e.message : "Falha ao consultar solicitações.");
      }).finally(() => { if (ativo) setCarregando(false); });
    }
    return () => { ativo = false; };
  }, [item.codMaterial, item.quantidadePendenteEntrega, tentativa]);
  return (
    <aside className="indicadores-mapa-float indicadores-mapa-overlay gm-overlay">
      <header className="gm-overlay-head">
        <div>
          <h3>{materialLabel(item)}</h3>
        </div>
        <button type="button" className="indicadores-mapa-close" onClick={onClose} aria-label="Fechar detalhes">
          ×
        </button>
      </header>
      <div className="gm-overlay-body">
        <h4>Solicitações pendentes de entrega</h4>
        {carregando ? <p role="status">Consultando solicitações e acompanhamento de pedido…</p> : erroPendencias ? <p role="alert">{erroPendencias} <button type="button" className="btn" onClick={() => setTentativa((n) => n + 1)}>Tentar novamente</button></p> : pendencias.length ? (
          <div className="table-wrap gm-pendencias-wrap"><table className="data gm-pendencias-table">
            <thead><tr><th>Solicitação</th><th>OC</th><th>Data</th><th>Qtd. pendente</th><th>Situação no acompanhamento</th></tr></thead>
            <tbody>{pendencias.map((p, i) => <tr key={`${p.solicitacao}-${p.ordemCompra}-${i}`}><td>{p.solicitacao}</td><td>{p.ordemCompra}</td><td>{fmtDate(p.data)}</td><td>{fmtQty(p.quantidade)}</td><td>{p.situacao}</td></tr>)}</tbody>
          </table></div>
        ) : <p>Nenhuma solicitação pendente encontrada.</p>}
      </div>
    </aside>
  );
}

export function IndicadoresGestaoMateriais({ familia }: { familia?: number } = {}) {
  const defaults = useMemo(() => defaultRange(), []);
  const [dataInicio, setDataInicio] = useState(defaults.from);
  const [dataFim, setDataFim] = useState(defaults.to);
  const [tipos, setTipos] = useState<string[]>([]);
  const [almoxarifado, setAlmoxarifado] = useState("");
  const [materiaisSelecionados, setMateriaisSelecionados] = useState<Set<number>>(() => new Set());
  const [buscaMaterial, setBuscaMaterial] = useState("");
  const [mesesEstoque, setMesesEstoque] = useState("12");
  const [data, setData] = useState<GestaoMateriaisData | null>(null);
  const [opcoes, setOpcoes] = useState<GestaoMateriaisOpcoes | null>(null);
  const [opcoesLoading, setOpcoesLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [consultado, setConsultado] = useState(false);
  const [paginas, setPaginas] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<GestaoMateriaisItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(true);
  const [sort, setSort] = useState<SortState>({ key: "descricao", dir: "asc" });

  useEffect(() => {
    let active = true;
    api.indicadoresGestaoMateriaisOpcoes(familia).then(
      (result) => {
        if (active) setOpcoes(result);
      },
      () => undefined,
    ).finally(() => {
      if (active) setOpcoesLoading(false);
    });
    return () => {
      active = false;
    };
  }, [familia]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setErr(null);
      const result = await api.indicadoresGestaoMateriais({
        dataInicio,
        dataFim,
        tipos: tipos.length ? tipos : undefined,
        almoxarifado: extractLeadingCode(almoxarifado) || undefined,
        codMateriais: [...materiaisSelecionados],
        mesesEstoque: mesesEstoque || undefined,
        familia,
      });
      setData(result);
      setConsultado(true);
      setPaginas({});
      setSelected(null);
    } catch (e) {
      setData(null);
      setConsultado(true);
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [dataInicio, dataFim, tipos, almoxarifado, materiaisSelecionados, mesesEstoque, familia]);

  useReportAutoRefresh(() => {
    if (consultado && !loading) void load();
  });

  const tiposLabel = tipos.length ? `${tipos.length} selecionado(s)` : "Todos";
  const materiaisFiltro = data?.materiais ?? opcoes?.materiais ?? [];
  const materiaisEncontrados = useMemo(
    () => materiaisFiltro
      .filter((row) => !buscaMaterial.trim() || `${row.codigo} ${row.descricao}`.toLocaleLowerCase("pt-BR").includes(buscaMaterial.trim().toLocaleLowerCase("pt-BR")))
      .slice(0, 150),
    [buscaMaterial, materiaisFiltro],
  );

  function alternarMaterial(codigo: number) {
    setMateriaisSelecionados((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(codigo)) proximo.delete(codigo);
      else proximo.add(codigo);
      return proximo;
    });
  }

  const gruposOrdenados = useMemo(
    () =>
      [{ tipo: "todos", itens: (data?.grupos ?? []).flatMap((grupo) => grupo.itens).sort((a, b) => compareItems(a, b, sort)) }],
    [data, sort],
  );

  function toggleTipo(name: string) {
    setTipos((current) => (current.includes(name) ? current.filter((item) => item !== name) : [...current, name]));
  }

  function sortBy(key: SortKey) {
    setPaginas({});
    setSort((current) => (current.key === key ? { key, dir: current.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  }

  function SortHeader({ label, sortKey, className }: { label: string; sortKey: SortKey; className?: string }) {
    const active = sort.key === sortKey;
    return (
      <th className={className} aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
        <button type="button" className="gm-sort-btn" onClick={() => sortBy(sortKey)}>
          <span>{label}</span>
          <span className="gm-sort-indicator">{active ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}</span>
        </button>
      </th>
    );
  }

  return (
    <section className="panel gm-report print-report-intro">
      <h3 className="no-print">
        Gestão de materiais
        {data?.grupos.length ? (
          <span className="panel-h3-actions">
            <PrintButton />
          </span>
        ) : null}
      </h3>

      <div className="gm-filters no-print">
        <label>
          <span>Período entrada</span>
          <div className="gm-date-range">
            <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
            <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
          </div>
        </label>
        <label>
          <span>Tipo material</span>
          <input
            list="gm-tipo-material-options"
            value={tipos.length === 1 ? tipos[0] : tipos.length ? tiposLabel : ""}
            onChange={(e) => setTipos(e.target.value.trim() ? [e.target.value] : [])}
            placeholder="Todos"
          />
          <datalist id="gm-tipo-material-options">
            {(familia === 45 ? opcoes?.tipos ?? [] : TIPOS).map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </label>
        <label>
          <span>Almoxarifado</span>
          <input
            list="gm-almoxarifado-options"
            value={almoxarifado}
            onChange={(e) => setAlmoxarifado(e.target.value)}
            placeholder="Todos"
          />
          <datalist id="gm-almoxarifado-options">
            {(data?.almoxarifados ?? opcoes?.almoxarifados ?? []).map((row) => (
              <option key={row.codigo} value={`${row.codigo} — ${row.descricao}`} />
            ))}
          </datalist>
        </label>
        <label className="gm-material-filter">
          <span>Material</span>
          <details className="gm-material-picker">
            <summary>{materiaisSelecionados.size ? `${materiaisSelecionados.size} selecionado(s)` : "Todos os materiais"}</summary>
            <div className="gm-material-picker-popover">
              <input
                type="search"
                value={buscaMaterial}
                onChange={(e) => setBuscaMaterial(e.target.value)}
                placeholder={opcoesLoading ? "Carregando materiais…" : "Buscar código ou descrição"}
              />
              <div className="gm-material-picker-actions">
                <button type="button" onClick={() => setMateriaisSelecionados(new Set())}>Limpar seleção</button>
                <span>{materiaisSelecionados.size} selecionado(s)</span>
              </div>
              <div className="gm-material-picker-list" role="listbox" aria-label="Materiais disponíveis">
                {materiaisEncontrados.map((row) => (
                  <label key={row.codigo}>
                    <input type="checkbox" checked={materiaisSelecionados.has(row.codigo)} onChange={() => alternarMaterial(row.codigo)} />
                    <strong>{row.codigo}</strong> — {row.descricao}
                  </label>
                ))}
                {!opcoesLoading && !materiaisEncontrados.length ? <span>Nenhum material encontrado.</span> : null}
              </div>
            </div>
          </details>
        </label>
        <label>
          <span>Meses de estoque</span>
          <input
            type="number"
            min={1}
            max={60}
            value={mesesEstoque}
            onChange={(e) => setMesesEstoque(e.target.value)}
          />
        </label>
        <div className="gm-filter-actions">
          <button type="button" className="btn primary" disabled={loading} onClick={() => void load()}>
            {loading ? "Consultando…" : "Consultar"}
          </button>
        </div>
      </div>
      <ConsultaProgressBar active={loading} label="Consultando gestão de materiais…" className="consulta-progress--compact" />

      <div className="kind-toggle no-print gm-tipos-toggle">
        {(familia === 45 ? opcoes?.tipos ?? [] : TIPOS).map((name) => (
          <button
            key={name}
            type="button"
            className={`btn${tipos.includes(name) ? " primary" : ""}`}
            onClick={() => toggleTipo(name)}
          >
            {name}
          </button>
        ))}
        <button type="button" className={`btn${!tipos.length ? " primary" : ""}`} onClick={() => setTipos([])}>
          Todos
        </button>
      </div>

      <div className="gm-legend no-print">
        <strong>Legenda:</strong>
        <span><i className="gm-dot gm-prio-critico" /> CRÍTICO = estoque zero ou &lt; 1 mês</span>
        <span><i className="gm-dot gm-prio-alto" /> ALTO = 1–2 meses</span>
        <span><i className="gm-dot gm-prio-medio" /> MÉDIO = 2–3 meses</span>
        <span><i className="gm-dot gm-prio-ok" /> OK = &gt; 3 meses</span>
        <span>Estoque atual = último saldo em material.estoque por material/almoxarifado (quantidade &gt; 0)</span>
        <span>Qtde sugerida = max(0, 4 × média mês − estoque atual)</span>
      </div>

      {err ? (
        <p className="lead no-print" style={{ color: "var(--danger)" }}>
          {err}
        </p>
      ) : null}

      <div className="gm-stage">
        {detailOpen && selected ? <DetalheMaterial item={selected} onClose={() => setDetailOpen(false)} /> : null}

        {!consultado && !loading ? (
          <p className="lead">Defina os filtros e clique em Consultar para exibir a gestão de materiais.</p>
        ) : null}

        {consultado || loading ? (
        <div className="table-wrap gm-table-wrap">
          <table className="data gm-table">
            <thead>
              <tr>
                <SortHeader label="Descrição" sortKey="descricao" />
                <SortHeader label="Saída" sortKey="saida" className="num" />
                <SortHeader label="Média mês" sortKey="mediaMes" className="num" />
                <SortHeader label="Estoque atual" sortKey="estoqueAtual" className="num" />
                <SortHeader label="Cobertura (meses)" sortKey="coberturaMeses" className="num" />
                <SortHeader label="Qtd. sugerida" sortKey="qtdSugerida" className="num" />
                <SortHeader label="Prioridade" sortKey="prioridade" />
                <th className="num">Qtd. pendente de entrega</th>
              </tr>
            </thead>
            <tbody>
              {gruposOrdenados.map((grupo) => {
                const open = true;
                const totalPaginas = Math.max(1, Math.ceil(grupo.itens.length / 100));
                const pagina = Math.min(paginas[grupo.tipo] ?? 0, totalPaginas - 1);
                return (
                  <Fragment key={grupo.tipo}>
                    {open
                      ? grupo.itens.slice(pagina * 100, (pagina + 1) * 100).map((item) => {
                          const prio = PRIORIDADE_META[item.prioridade];
                          const isSelected = selected?.codMaterial === item.codMaterial;
                          return (
                            <tr
                              key={item.codMaterial}
                              className={`gm-item-row${isSelected ? " is-selected" : ""}`}
                              onClick={() => {
                                setSelected(item);
                                setDetailOpen(true);
                              }}
                            >
                              <td>{materialLabel(item)}</td>
                              <td className="num">{fmtQty(item.saida)}</td>
                              <td className="num">{fmtQty(item.mediaMes)}</td>
                              <td className="num">{fmtQty(item.estoqueAtual)}</td>
                              <td className="num">{item.coberturaMeses != null ? fmtQty(item.coberturaMeses) : "—"}</td>
                              <td className="num">{fmtQty(item.qtdSugerida)}</td>
                              <td>
                                <span className={`gm-prioridade ${prio.className}`}>{prio.label}</span>
                              </td>
                              <td className={`num${item.quantidadePendenteEntrega > 0 ? " gm-pendente-entrega" : ""}`}>
                                {item.quantidadePendenteEntrega > 0 ? <button type="button" className="btn" title="Ver solicitações pendentes e situação no acompanhamento" onClick={(event) => { event.stopPropagation(); setSelected(item); setDetailOpen(true); }}>{fmtQty(item.quantidadePendenteEntrega)}</button> : fmtQty(item.quantidadePendenteEntrega)}
                              </td>
                            </tr>
                          );
                        })
                      : null}
                    {open && totalPaginas > 1 ? (
                      <tr className="no-print">
                        <td colSpan={8}>
                          <button type="button" className="btn" disabled={pagina === 0} onClick={() => setPaginas((atual) => ({ ...atual, [grupo.tipo]: pagina - 1 }))}>Anterior</button>
                          {" "}Página {pagina + 1} de {totalPaginas} · {grupo.itens.length} materiais{" "}
                          <button type="button" className="btn" disabled={pagina + 1 >= totalPaginas} onClick={() => setPaginas((atual) => ({ ...atual, [grupo.tipo]: pagina + 1 }))}>Próxima</button>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
              {data?.totais ? (
                <tr className="gm-total-row">
                  <td><strong>Total</strong></td>
                  <td className="num"><strong>{fmtQty(data.totais.saida)}</strong></td>
                  <td className="num"><strong>{fmtQty(data.totais.mediaMes)}</strong></td>
                  <td className="num"><strong>{fmtQty(data.totais.estoqueAtual)}</strong></td>
                  <td />
                  <td className="num"><strong>{fmtQty(data.totais.qtdSugerida)}</strong></td>
                  <td />
                  <td />
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        ) : null}
      </div>
    </section>
  );
}
