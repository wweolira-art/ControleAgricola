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
  | "precoMedio"
  | "valorTotal";

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

function fmtQty(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function fmtMoney(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
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
    const result = String(av).localeCompare(String(bv), "pt-BR", { numeric: true, sensitivity: "base" });
    return result * dir;
  }
  if (av === bv) return materialLabel(a).localeCompare(materialLabel(b), "pt-BR", { numeric: true, sensitivity: "base" });
  return (av < bv ? -1 : 1) * dir;
}

function DetalheMaterial({
  item,
  onClose,
}: {
  item: GestaoMateriaisItem;
  onClose: () => void;
}) {
  const prio = PRIORIDADE_META[item.prioridade];
  return (
    <aside className="indicadores-mapa-float indicadores-mapa-overlay gm-overlay">
      <header className="gm-overlay-head">
        <div>
          <h3>{materialLabel(item)}</h3>
          <p>Cód. {item.codMaterial} · {item.tipo}</p>
        </div>
        <button type="button" className="indicadores-mapa-close" onClick={onClose} aria-label="Fechar detalhes">
          ×
        </button>
      </header>
      <div className="gm-overlay-body">
        <dl className="indicadores-mapa-dl indicadores-mapa-dl-grid">
          <dt>Grupo</dt>
          <dd>{item.grupo}</dd>
          <dt>Saída (período)</dt>
          <dd>{fmtQty(item.saida)}</dd>
          <dt>Média mês</dt>
          <dd>{fmtQty(item.mediaMes)}</dd>
          <dt>Estoque atual</dt>
          <dd>{fmtQty(item.estoqueAtual)}</dd>
          <dt>Cobertura (meses)</dt>
          <dd>{item.coberturaMeses != null ? fmtQty(item.coberturaMeses) : "—"}</dd>
          <dt>Última entrada</dt>
          <dd>{fmtDate(item.ultimaEntrada)}</dd>
          <dt>Quantidade sugerida</dt>
          <dd>{fmtQty(item.qtdSugerida)}</dd>
          <dt>Prioridade</dt>
          <dd>
            <span className={`gm-prioridade ${prio.className}`}>{prio.label}</span>
          </dd>
          <dt>Preço médio</dt>
          <dd>{fmtMoney(item.precoMedio)}</dd>
          <dt>Valor total</dt>
          <dd>{fmtMoney(item.valorTotal)}</dd>
          <dt>Quantidade pendente de entrega</dt>
          <dd>{fmtQty(item.quantidadePendenteEntrega)}</dd>
        </dl>
      </div>
    </aside>
  );
}

export function IndicadoresGestaoMateriais() {
  const defaults = useMemo(() => defaultRange(), []);
  const [dataInicio, setDataInicio] = useState(defaults.from);
  const [dataFim, setDataFim] = useState(defaults.to);
  const [tipos, setTipos] = useState<string[]>([]);
  const [almoxarifado, setAlmoxarifado] = useState("");
  const [materiaisSelecionados, setMateriaisSelecionados] = useState<Set<number>>(() => new Set());
  const [buscaMaterial, setBuscaMaterial] = useState("");
  const [codObjetoCusto, setCodObjetoCusto] = useState("");
  const [mesesEstoque, setMesesEstoque] = useState("12");
  const [data, setData] = useState<GestaoMateriaisData | null>(null);
  const [opcoes, setOpcoes] = useState<GestaoMateriaisOpcoes | null>(null);
  const [opcoesLoading, setOpcoesLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [consultado, setConsultado] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<GestaoMateriaisItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(true);
  const [sort, setSort] = useState<SortState>({ key: "descricao", dir: "asc" });

  useEffect(() => {
    let active = true;
    api.indicadoresGestaoMateriaisOpcoes().then(
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
  }, []);

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
        codObjetoCusto: extractLeadingCode(codObjetoCusto) || undefined,
        mesesEstoque: mesesEstoque || undefined,
      });
      setData(result);
      setConsultado(true);
      setCollapsed(new Set());
      setSelected(null);
    } catch (e) {
      setData(null);
      setConsultado(true);
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [dataInicio, dataFim, tipos, almoxarifado, materiaisSelecionados, codObjetoCusto, mesesEstoque]);

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
      (data?.grupos ?? []).map((grupo) => ({
        ...grupo,
        itens: [...grupo.itens].sort((a, b) => compareItems(a, b, sort)),
      })),
    [data, sort],
  );

  function toggleTipo(name: string) {
    setTipos((current) => (current.includes(name) ? current.filter((item) => item !== name) : [...current, name]));
  }

  function toggleGroup(key: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function sortBy(key: SortKey) {
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
            {TIPOS.map((t) => (
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
          <span className="gm-filter-label-line">
            Objeto custo
            <span
              className="gm-filter-warning"
              role="img"
              aria-label="Alerta: ao filtrar por objeto de custo, a quantidade sugerida pode não ser recomendada se o mesmo material atender outros equipamentos ou objetos de custo."
              title="Ao filtrar por objeto de custo, a quantidade sugerida pode não ser recomendada se o mesmo material atender outros equipamentos ou objetos de custo. Verifique outros objetos de custo que usam o mesmo material."
            >
              !
            </span>
          </span>
          <input
            list="gm-objeto-custo-options"
            value={codObjetoCusto}
            onChange={(e) => setCodObjetoCusto(e.target.value)}
            placeholder="Todos"
          />
          <datalist id="gm-objeto-custo-options">
            {(data?.objetosCusto ?? opcoes?.objetosCusto ?? []).map((row) => (
              <option key={row.codigo} value={`${row.codigo} — ${row.descricao}`} />
            ))}
          </datalist>
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
        {TIPOS.map((name) => (
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
                <SortHeader label="Última entrada" sortKey="ultimaEntrada" />
                <SortHeader label="Qtd. sugerida" sortKey="qtdSugerida" className="num" />
                <SortHeader label="Prioridade" sortKey="prioridade" />
                <SortHeader label="Preço médio" sortKey="precoMedio" className="num" />
                <SortHeader label="Valor total" sortKey="valorTotal" className="num" />
                <th className="num">Qtd. pendente de entrega</th>
              </tr>
            </thead>
            <tbody>
              {gruposOrdenados.map((grupo) => {
                const open = !collapsed.has(grupo.tipo);
                return (
                  <Fragment key={grupo.tipo}>
                    <tr className="gm-group-row" onClick={() => toggleGroup(grupo.tipo)}>
                      <td colSpan={11}>
                        <strong>{open ? "[−]" : "[+]"} {grupo.label}</strong>
                        <span className="gm-group-totals">
                          {fmtQty(grupo.totais.saida)} · {fmtQty(grupo.totais.estoqueAtual)} est. · {fmtMoney(grupo.totais.valorTotal)}
                        </span>
                      </td>
                    </tr>
                    {open
                      ? grupo.itens.map((item) => {
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
                              <td>{fmtDate(item.ultimaEntrada)}</td>
                              <td className="num">{fmtQty(item.qtdSugerida)}</td>
                              <td>
                                <span className={`gm-prioridade ${prio.className}`}>{prio.label}</span>
                              </td>
                              <td className="num">{fmtMoney(item.precoMedio)}</td>
                              <td className="num">{fmtMoney(item.valorTotal)}</td>
                              <td className={`num${item.quantidadePendenteEntrega > 0 ? " gm-pendente-entrega" : ""}`}>
                                {fmtQty(item.quantidadePendenteEntrega)}
                              </td>
                            </tr>
                          );
                        })
                      : null}
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
                  <td />
                  <td className="num"><strong>{fmtQty(data.totais.qtdSugerida)}</strong></td>
                  <td />
                  <td />
                  <td className="num"><strong>{fmtMoney(data.totais.valorTotal)}</strong></td>
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
