import { Fragment, useEffect, useMemo, useState } from "react";
import { api, type RecursosHumanosData } from "../api";
import { useApp } from "../store";

function brl(value: number | null | undefined) {
  return (value ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function num(value: number | null | undefined, digits = 0) {
  return (value ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: digits });
}

function pct(realizado: number, orcado: number) {
  if (!(orcado > 0)) return "—";
  return `${((realizado / orcado) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

export function RecursosHumanos() {
  const { safra } = useApp();
  const [data, setData] = useState<RecursosHumanosData | null>(null);
  const defaultInicio = data?.anomesInicio ?? "";
  const defaultFim = data?.anomesFim ?? "";
  const [anomesInicio, setAnomesInicio] = useState("");
  const [anomesFim, setAnomesFim] = useState("");
  const [applied, setApplied] = useState<{ anomesInicio?: string; anomesFim?: string }>({});
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    void api
      .recursosHumanos({ safraId: safra?.id, ...applied })
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setAnomesInicio((current) => current || result.anomesInicio);
          setAnomesFim((current) => current || result.anomesFim);
        }
      })
      .catch((e) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [safra?.id, applied]);

  const aplicarFiltro = () => {
    setApplied({
      anomesInicio: anomesInicio.trim() || undefined,
      anomesFim: anomesFim.trim() || undefined,
    });
  };

  const maxCost = useMemo(
    () => Math.max(1, ...(data?.mensal.flatMap((row) => [row.orcado, row.realizado]) ?? [1])),
    [data],
  );
  const maxFunc = useMemo(() => Math.max(1, ...(data?.mensal.map((row) => row.funcionarios) ?? [1])), [data]);

  if (loading && !data) return <p className="lead">Carregando Recursos Humanos…</p>;
  if (err) return <p className="lead" style={{ color: "var(--danger)" }}>{err}</p>;
  if (!data) return null;

  return (
    <div className="page rh-page">
      <section className="panel rh-filter">
        <strong>Período</strong>
        <label>
          Anomes inicial
          <input
            value={anomesInicio || defaultInicio}
            onChange={(e) => setAnomesInicio(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="YYYYMM"
            inputMode="numeric"
          />
        </label>
        <label>
          Anomes final
          <input
            value={anomesFim || defaultFim}
            onChange={(e) => setAnomesFim(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="YYYYMM"
            inputMode="numeric"
          />
        </label>
        <button className="btn primary" type="button" onClick={aplicarFiltro} disabled={loading}>
          {loading ? "Consultando…" : "Aplicar"}
        </button>
      </section>

      <section className="rh-kpis">
        <div className="kpi">
          <span>Custo orçado</span>
          <strong>{brl(data.totais.orcado)}</strong>
        </div>
        <div className="kpi">
          <span>Custo realizado</span>
          <strong>{brl(data.totais.realizado)}</strong>
        </div>
        <div className="kpi">
          <span>Variação</span>
          <strong className={data.totais.variacao > 0 ? "danger-text" : "ok-text"}>{brl(data.totais.variacao)}</strong>
        </div>
        <div className="kpi">
          <span>Funcionários médios</span>
          <strong>{num(data.totais.funcionariosMedio, 1)}</strong>
        </div>
        <div className="kpi">
          <span>Pico de funcionários</span>
          <strong>{num(data.totais.funcionariosPico)}</strong>
        </div>
      </section>

      <section className="panel rh-panel">
        <h3>Custo Orçado x Realizado</h3>
        <div className="rh-month-bars">
          {data.mensal.map((row) => (
            <div key={row.key} className="rh-month">
              <span>{row.label}</span>
              <div className="rh-bars" title={`${row.label}: ${brl(row.orcado)} orçado / ${brl(row.realizado)} realizado`}>
                <i className="is-orcado" style={{ height: `${Math.max(4, (row.orcado / maxCost) * 100)}%` }} />
                <i className="is-realizado" style={{ height: `${Math.max(4, (row.realizado / maxCost) * 100)}%` }} />
              </div>
              <b>{pct(row.realizado, row.orcado)}</b>
            </div>
          ))}
        </div>
        <div className="rh-legend">
          <span><i className="is-orcado" /> Orçado</span>
          <span><i className="is-realizado" /> Realizado</span>
        </div>
      </section>

      <section className="panel rh-panel">
        <h3>Quantidade de funcionários mês a mês</h3>
        <div className="rh-func-bars">
          {data.mensal.map((row) => (
            <div key={row.key} className="rh-func-row">
              <span>{row.label}</span>
              <div><i style={{ width: `${(row.funcionarios / maxFunc) * 100}%` }} /></div>
              <strong>{num(row.funcionarios)}</strong>
              <em>{row.funcionariosDelta == null ? "—" : row.funcionariosDelta > 0 ? `+${num(row.funcionariosDelta)}` : num(row.funcionariosDelta)}</em>
            </div>
          ))}
        </div>
      </section>

      <section className="panel rh-panel">
        <h3>Comparativo de quantidade de funcionários</h3>
        <div className="table-wrap rh-quantity-wrap">
          <table className="data rh-quantity-table">
            <thead>
              <tr>
                <th rowSpan={2} className="rh-desc-col">Descrição</th>
                {data.quantidadeFuncionarios.meses.map((mes) => (
                  <th key={mes.anomes} colSpan={2} className="num rh-month-head">{mes.label.toLowerCase()}</th>
                ))}
              </tr>
              <tr>
                {data.quantidadeFuncionarios.meses.map((mes) => (
                  <Fragment key={`${mes.anomes}-heads`}>
                    <th key={`${mes.anomes}-orcado`} className="num rh-orcado-col">Orçado</th>
                    <th key={`${mes.anomes}-realizado`} className="num rh-realizado-col">Realizado</th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.quantidadeFuncionarios.linhas.map((row) => (
                <tr key={row.key}>
                  <td className="rh-desc-col">{row.descricao}</td>
                  {row.meses.map((mes) => (
                    <Fragment key={`${row.key}-${mes.anomes}`}>
                      <td key={`${row.key}-${mes.anomes}-orcado`} className="num rh-orcado-col">{num(mes.orcado, 2)}</td>
                      <td key={`${row.key}-${mes.anomes}-realizado`} className="num rh-realizado-col">{num(mes.realizado)}</td>
                    </Fragment>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th className="rh-desc-col">Total</th>
                {data.quantidadeFuncionarios.totais.map((mes) => (
                  <Fragment key={`${mes.anomes}-total`}>
                    <th key={`${mes.anomes}-total-orcado`} className="num rh-orcado-col">{num(mes.orcado, 2)}</th>
                    <th key={`${mes.anomes}-total-realizado`} className="num rh-realizado-col">{num(mes.realizado)}</th>
                  </Fragment>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className="panel rh-panel">
        <h3>Subempenhos por objeto de custo</h3>
        <div className="table-wrap rh-subemp-wrap">
          <table className="data rh-subemp-table">
            <thead>
              <tr>
                <th>Categoria</th>
                <th>Objeto de custo</th>
                <th>Subempenho</th>
                {data.quantidadeFuncionarios.meses.map((mes) => (
                  <th key={mes.anomes} className="num">{mes.label.toLowerCase()}</th>
                ))}
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.objetosSubempenhos.map((row) => (
                <tr key={row.key}>
                  <td>{row.categoria}</td>
                  <td>
                    <strong>{row.codObjetoCusto}</strong>
                    <span>{row.objetoCusto}</span>
                  </td>
                  <td>
                    <strong>{row.codSubempenho}</strong>
                    <span>{row.subempenho}</span>
                  </td>
                  {row.meses.map((mes) => (
                    <td key={`${row.key}-${mes.anomes}`} className="num">{num(mes.quantidade)}</td>
                  ))}
                  <td className="num"><strong>{num(row.total)}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h3>Detalhamento mensal</h3>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Mês</th>
                <th className="num">Orçado</th>
                <th className="num">Realizado</th>
                <th className="num">Variação</th>
                <th className="num">Realizado/Orçado</th>
                <th className="num">Funcionários</th>
                <th className="num">Δ mês</th>
              </tr>
            </thead>
            <tbody>
              {data.mensal.map((row) => (
                <tr key={row.key}>
                  <td>{row.label}</td>
                  <td className="num">{brl(row.orcado)}</td>
                  <td className="num">{brl(row.realizado)}</td>
                  <td className={`num ${row.variacao > 0 ? "danger-text" : "ok-text"}`}>{brl(row.variacao)}</td>
                  <td className="num">{pct(row.realizado, row.orcado)}</td>
                  <td className="num">{num(row.funcionarios)}</td>
                  <td className="num">{row.funcionariosDelta == null ? "—" : num(row.funcionariosDelta)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
