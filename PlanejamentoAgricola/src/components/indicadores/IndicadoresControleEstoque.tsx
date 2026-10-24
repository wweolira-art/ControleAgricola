import { useReportAutoRefresh } from "./useReportAutoRefresh";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { api, type ControleEstoqueData, type ControleEstoqueItem } from "../../api";
import { ConsultaProgressBar } from "../ConsultaProgressBar";
import { PrintButton } from "../PrintButton";

function fmtQty(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(n);
}

function anomesToMonth(anomes: number | null | undefined) {
  if (!anomes) return "";
  const ano = Math.floor(anomes / 100);
  const mes = String(anomes % 100).padStart(2, "0");
  return `${ano}-${mes}`;
}

function monthToAnomes(value: string) {
  return value.trim() || undefined;
}

function materialLabel(item: ControleEstoqueItem) {
  return item.codigo ? `${item.codigo}-${item.descricao}` : item.descricao;
}

type Grupo = {
  key: string;
  label: string;
  quantidade: number;
  itens: ControleEstoqueItem[];
};

function agrupar(itens: ControleEstoqueItem[]): Grupo[] {
  const map = new Map<string, Grupo>();
  for (const item of itens) {
    const key = item.grupo || "Sem grupo";
    const prev = map.get(key) ?? { key, label: key, quantidade: 0, itens: [] };
    prev.quantidade += item.quantidade;
    prev.itens.push(item);
    map.set(key, prev);
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}

export function IndicadoresControleEstoque() {
  const [anomes, setAnomes] = useState("");
  const [almoxarifado, setAlmoxarifado] = useState("");
  const [materiaisSelecionados, setMateriaisSelecionados] = useState<Set<string>>(() => new Set());
  const [buscaMaterial, setBuscaMaterial] = useState("");
  const [data, setData] = useState<ControleEstoqueData | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const result = await api.indicadoresControleEstoque({
        anomes: monthToAnomes(anomes),
        almoxarifado: almoxarifado || undefined,
      });
      setData(result);
      setCollapsed(new Set());
      if (!anomes && result.periodo.anomes) {
        setAnomes(anomesToMonth(result.periodo.anomes));
      }
    } catch (e) {
      setData(null);
      setErr(e instanceof Error ? e.message : "Não foi possível consultar o estoque.");
    } finally {
      setLoading(false);
    }
  }, [anomes, almoxarifado]);

  useReportAutoRefresh(() => { if (!loading) return load(); });

  useEffect(() => {
    void load();
  }, []);

  const materiaisOpcoes = useMemo(
    () => [...new Map((data?.itens ?? []).map((item) => [item.codigo, materialLabel(item)])).entries()]
      .map(([codigo, label]) => ({ codigo, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { numeric: true })),
    [data],
  );
  const materiaisFiltrados = useMemo(() => {
    const termo = buscaMaterial.trim().toLocaleLowerCase("pt-BR");
    return materiaisOpcoes.filter((item) => !termo || item.label.toLocaleLowerCase("pt-BR").includes(termo));
  }, [buscaMaterial, materiaisOpcoes]);
  const itensFiltrados = useMemo(
    () => (data?.itens ?? []).filter((item) => !materiaisSelecionados.size || materiaisSelecionados.has(item.codigo)),
    [data, materiaisSelecionados],
  );
  const grupos = useMemo(() => agrupar(itensFiltrados), [itensFiltrados]);
  const totaisFiltrados = useMemo(() => ({
    materiais: new Set(itensFiltrados.map((item) => item.codigo)).size,
    quantidade: itensFiltrados.reduce((total, item) => total + item.quantidade, 0),
  }), [itensFiltrados]);
  const almoxarifados = data?.almoxarifados ?? [];

  function alternarMaterial(codigo: string) {
    setMateriaisSelecionados((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(codigo)) proximo.delete(codigo);
      else proximo.add(codigo);
      return proximo;
    });
  }

  function toggle(key: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <section className="panel mat-es-report print-report-intro">
      <h3>
        Controle de estoque
        {data?.itens.length ? (
          <span className="panel-h3-actions">
            <PrintButton />
          </span>
        ) : null}
      </h3>
      <header className="mat-es-print-header">
        <img src="/elejota-agro-logo.png" alt="Elejota Agro" className="liberacao-colheita-logo" />
        <h2 className="liberacao-colheita-title">CONTROLE DE ESTOQUE</h2>
        <div className="liberacao-colheita-brand-right">GRUPO LUIZ JATOBÁ</div>
      </header>
      <p className="print-only-meta">
        Estoque atual: {data?.periodo.label ?? "—"} — {data?.totais.materiais ?? 0} material(is) — quantidade{" "}
        {fmtQty(data?.totais.quantidade)}
      </p>
      <p className="lead no-print">
        Estoque atual = quantidade do <strong>último ano/mês</strong> em <code>material.estoque</code>. Sem filtro de
        período, usa o ANOMES mais recente. Cada linha é o material no almoxarifado naquele fechamento.
      </p>
      <form
        className="form-grid no-print"
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
      >
        <label>
          Ano/mês
          <input type="month" value={anomes} onChange={(e) => setAnomes(e.target.value)} />
        </label>
        <label>
          Material
          <details className="mat-es-material-filter">
            <summary>
              {materiaisSelecionados.size ? `${materiaisSelecionados.size} selecionado(s)` : "Todos os materiais"}
            </summary>
            <div className="mat-es-material-filter-popover">
              <input
                type="search"
                value={buscaMaterial}
                onChange={(e) => setBuscaMaterial(e.target.value)}
                placeholder="Buscar código ou descrição"
              />
              <div className="mat-es-material-filter-actions">
                <button type="button" onClick={() => setMateriaisSelecionados(new Set())}>Limpar</button>
                <span>{materiaisSelecionados.size} selecionado(s)</span>
              </div>
              <div className="mat-es-material-filter-list">
                {materiaisFiltrados.map((item) => (
                  <label key={item.codigo}>
                    <input
                      type="checkbox"
                      checked={materiaisSelecionados.has(item.codigo)}
                      onChange={() => alternarMaterial(item.codigo)}
                    />
                    {item.label}
                  </label>
                ))}
                {!materiaisFiltrados.length ? <span className="mat-es-material-empty">Nenhum material encontrado.</span> : null}
              </div>
            </div>
          </details>
        </label>
        <label>
          Almoxarifado
          <select value={almoxarifado} onChange={(e) => setAlmoxarifado(e.target.value)}>
            <option value="">Todos</option>
            {almoxarifados.map((row) => (
              <option key={row.codigo} value={row.codigo}>
                {row.codigo} — {row.descricao}
              </option>
            ))}
          </select>
        </label>
      </form>
      <div className="modal-actions no-print" style={{ padding: "0 16px 16px" }}>
        <button className="btn primary" disabled={loading} onClick={() => void load()}>
          {loading ? "Consultando…" : "Consultar estoque"}
        </button>
      </div>
      <ConsultaProgressBar active={loading} label="Consultando material.estoque…" className="consulta-progress--compact" />
      {err ? (
        <p className="lead no-print" style={{ color: "var(--danger)" }}>
          {err}
        </p>
      ) : null}

      {data ? (
        <>
          <div className="kpis">
            <div>
              <small>Período</small>
              <strong>{data.periodo.label}</strong>
            </div>
            <div>
              <small>Materiais</small>
              <strong>{totaisFiltrados.materiais}</strong>
            </div>
            <div>
              <small>Quantidade</small>
              <strong>{fmtQty(totaisFiltrados.quantidade)}</strong>
            </div>
            <div>
              <small>Almoxarifados</small>
              <strong>{data.totais.almoxarifados}</strong>
            </div>
          </div>
          {grupos.length ? (
            <div className="table-wrap">
              <table className="data mat-es">
                <thead>
                  <tr>
                    <th className="left">Grupo / material</th>
                    <th>Un</th>
                    <th>Almoxarifado</th>
                    <th className="num">Quantidade</th>
                    <th>Solicitação pendente de entrega</th>
                  </tr>
                </thead>
                <tbody>
                  {grupos.map((grupo) => (
                    <Fragment key={grupo.key}>
                      <tr className="mat-es-group">
                        <td className="left" colSpan={4}>
                          <button type="button" className="fold-btn no-print" onClick={() => toggle(grupo.key)}>
                            {collapsed.has(grupo.key) ? "+" : "−"}
                          </button>{" "}
                          {grupo.label}
                          <small> · {grupo.itens.length} item(ns)</small>
                        </td>
                        <td className="num">{fmtQty(grupo.quantidade)}</td>
                      </tr>
                      {collapsed.has(grupo.key)
                        ? null
                        : grupo.itens.map((item) => (
                            <tr key={`${item.codigo}-${item.codAlmoxarifado}`} className="mat-es-item">
                              <td className="left">
                                <span className="mat-es-item-name">{materialLabel(item)}</span>
                              </td>
                              <td>{item.unidade || "—"}</td>
                              <td>
                                {item.codAlmoxarifado != null
                                  ? `${item.codAlmoxarifado} — ${item.almoxarifado}`
                                  : item.almoxarifado}
                              </td>
                              <td className="num">{fmtQty(item.quantidade)}</td>
                              <td className={item.solicitacoesPendentesEntrega > 0 ? "mat-es-pendente" : ""}>
                                {item.solicitacoesPendentesEntrega > 0
                                  ? `Sim · ${item.solicitacoesPendentesEntrega} solic.`
                                  : "Não"}
                              </td>
                            </tr>
                          ))}
                    </Fragment>
                  ))}
                  <tr className="indicadores-producao-total">
                    <td className="left" colSpan={4}>
                      Total
                    </td>
                    <td className="num">{fmtQty(totaisFiltrados.quantidade)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <p className="lead">Nenhum estoque no período {data.periodo.label}.</p>
          )}
        </>
      ) : null}
    </section>
  );
}
