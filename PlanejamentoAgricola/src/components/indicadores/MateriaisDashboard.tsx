import { useEffect, useMemo, useRef, useState } from "react";
import { api, type DashboardMateriaisData } from "../../api";
import { ConsultaProgressBar } from "../ConsultaProgressBar";

type Filtro = {
  dataInicio: string;
  dataFim: string;
  solicitantes: string[];
  situacoes: string[];
  gruposOperacionais: string[];
  gruposMaterial: string[];
  tiposSolicitacao: string[];
  fornecedores: string[];
};

const BAR_COLOR: Record<string, string> = {
  Entregue: "#2f7edb",
  Cancelada: "#d64545",
};

const AVAL_COLOR = ["#2f6fdb", "#e23b3b", "#f0b429", "#7f93ad"];

function isoHoje() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function periodoPadrao(): Pick<Filtro, "dataInicio" | "dataFim"> {
  const fim = isoHoje();
  const year = Number(fim.slice(0, 4));
  const month = Number(fim.slice(5, 7));
  const startYear = month > 3 || (month === 3 && Number(fim.slice(8, 10)) >= 21) ? year : year - 1;
  return { dataInicio: `${startYear}-03-21`, dataFim: fim };
}

function brl(value: number, digits = 0) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function num(value: number | null | undefined, digits = 0) {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function dataBr(iso: string | null) {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

function atualizado(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("pt-BR", { hour12: false });
}

function MultiFiltro({
  label,
  options,
  value,
  onChange,
  emptyHint = "Sem opções no período.",
}: {
  label: string;
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
  emptyHint?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const caption = value.length === 0 ? "Todos" : value.length === 1 ? value[0] : `${value.length} selecionados`;

  return (
    <div className="gm-dash-field">
      <span>{label}</span>
      <div className={`gm-dash-multi${open ? " is-open" : ""}`} ref={ref}>
        <button type="button" onClick={() => setOpen((current) => !current)}>
          {caption}
        </button>
        {open ? (
          <div className="gm-dash-multi-panel">
            <button type="button" className="gm-dash-clear" onClick={() => onChange([])}>
              Todos
            </button>
            {options.map((option) => (
              <label key={option}>
                <input
                  type="checkbox"
                  checked={value.includes(option)}
                  onChange={() =>
                    onChange(value.includes(option) ? value.filter((item) => item !== option) : [...value, option])
                  }
                />
                <span>{option}</span>
              </label>
            ))}
            {!options.length ? <p>{emptyHint}</p> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Donut({ itens }: { itens: DashboardMateriaisData["avaliacaoEntrega"] }) {
  const total = itens.reduce((acc, item) => acc + item.quantidade, 0);
  if (!total) return <div className="gm-dash-donut is-empty" />;
  let cursor = 0;
  const stops = itens.map((item, index) => {
    const start = (cursor / total) * 100;
    cursor += item.quantidade;
    const end = (cursor / total) * 100;
    return `${AVAL_COLOR[index % AVAL_COLOR.length]} ${start}% ${end}%`;
  });
  return <div className="gm-dash-donut" style={{ background: `conic-gradient(${stops.join(", ")})` }} />;
}

export function MateriaisDashboard() {
  const inicial = periodoPadrao();
  const [filtro, setFiltro] = useState<Filtro>({
    ...inicial,
    solicitantes: [],
    situacoes: [],
    gruposOperacionais: [],
    gruposMaterial: [],
    tiposSolicitacao: [],
    fornecedores: [],
  });
  const [data, setData] = useState<DashboardMateriaisData | null>(null);
  const [opcoes, setOpcoes] = useState<DashboardMateriaisData["opcoes"]>({
    solicitantes: [],
    situacoes: [
      "Entregue",
      "Cancelada",
      "Aguardando aprovação",
      "Aguardando Pagamento",
      "Aguardando entrega",
      "Sem cotação",
      "Em cotação",
      "Em negociação",
    ],
    gruposOperacionais: [],
    gruposMaterial: [],
    tiposSolicitacao: ["Aplicação direta", "Compra", "Estoque", "Serviço"],
    fornecedores: [],
  });
  const [loading, setLoading] = useState(false);
  const [opcoesLoading, setOpcoesLoading] = useState(true);
  const [opcoesFalha, setOpcoesFalha] = useState(false);
  const [consultado, setConsultado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);
  const opcoesReq = useRef(0);

  useEffect(() => {
    const requestId = ++opcoesReq.current;
    setOpcoesLoading(true);
    setOpcoesFalha(false);
    api
      .indicadoresDashboardMateriaisOpcoes({ dataInicio: filtro.dataInicio, dataFim: filtro.dataFim })
      .then((next) => {
        if (requestId !== opcoesReq.current) return;
        setOpcoes(next);
      })
      .catch(() => {
        if (requestId !== opcoesReq.current) return;
        setOpcoesFalha(true);
      })
      .finally(() => {
        if (requestId === opcoesReq.current) setOpcoesLoading(false);
      });
  }, [filtro.dataInicio, filtro.dataFim]);

  const consultar = () => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setError(null);
    api
      .indicadoresDashboardMateriais(filtro)
      .then((result) => {
        if (requestId !== requestRef.current) return;
        setData(result);
        setOpcoes(result.opcoes);
        setConsultado(true);
      })
      .catch((err: unknown) => {
        if (requestId !== requestRef.current) return;
        setError(err instanceof Error ? err.message : "Não foi possível carregar o dashboard.");
      })
      .finally(() => {
        if (requestId === requestRef.current) setLoading(false);
      });
  };

  const maxSituacao = useMemo(
    () => Math.max(1, ...(data?.porSituacao.map((item) => item.quantidade) ?? [1])),
    [data],
  );
  const totalSemana = data?.entregasSemana.reduce((acc, item) => acc + item.quantidade, 0) ?? 0;

  const setLista = (key: keyof Omit<Filtro, "dataInicio" | "dataFim">) => (next: string[]) =>
    setFiltro((current) => ({ ...current, [key]: next }));

  return (
    <section className="gm-dash">
      <header className="gm-dash-head">
        <img src="/elejota-agro-logo.png" alt="Elejota Agro" />
        <div>
          <h2>GESTÃO DE MATERIAIS</h2>
          <p>AGRÍCOLA</p>
        </div>
        <strong>
          {loading ? "Consultando…" : data ? `Atualizado em ${atualizado(data.atualizadoEm)}` : "Aguardando consulta"}
        </strong>
      </header>

      <div className="gm-dash-body">
        <aside className="gm-dash-filters">
          <h3>Filtros:</h3>
          <div className="gm-dash-field">
            <span>Período data Solicitação</span>
            <div className="gm-dash-dates">
              <input
                type="date"
                value={filtro.dataInicio}
                onChange={(event) => setFiltro((current) => ({ ...current, dataInicio: event.target.value }))}
              />
              <input
                type="date"
                value={filtro.dataFim}
                onChange={(event) => setFiltro((current) => ({ ...current, dataFim: event.target.value }))}
              />
            </div>
          </div>
          <MultiFiltro
            label="Solicitante"
            options={opcoes.solicitantes}
            value={filtro.solicitantes}
            onChange={setLista("solicitantes")}
            emptyHint={opcoesLoading ? "Carregando opções…" : opcoesFalha ? "Não foi possível carregar." : "Sem opções no período."}
          />
          <MultiFiltro
            label="Situação Pedido"
            options={opcoes.situacoes}
            value={filtro.situacoes}
            onChange={setLista("situacoes")}
          />
          <MultiFiltro
            label="Grupo Operativo"
            options={opcoes.gruposOperacionais}
            value={filtro.gruposOperacionais}
            onChange={setLista("gruposOperacionais")}
            emptyHint={opcoesLoading ? "Carregando opções…" : opcoesFalha ? "Não foi possível carregar." : "Sem opções no período."}
          />
          <MultiFiltro
            label="Grupo Material"
            options={opcoes.gruposMaterial}
            value={filtro.gruposMaterial}
            onChange={setLista("gruposMaterial")}
            emptyHint={opcoesLoading ? "Carregando opções…" : opcoesFalha ? "Não foi possível carregar." : "Sem tipos cadastrados."}
          />
          <MultiFiltro
            label="Tipo Solicitação"
            options={opcoes.tiposSolicitacao}
            value={filtro.tiposSolicitacao}
            onChange={setLista("tiposSolicitacao")}
            emptyHint={opcoesLoading ? "Carregando opções…" : opcoesFalha ? "Não foi possível carregar." : "Sem opções no período."}
          />
          <MultiFiltro
            label="Fornecedor"
            options={opcoes.fornecedores}
            value={filtro.fornecedores}
            onChange={setLista("fornecedores")}
            emptyHint={opcoesLoading ? "Carregando opções…" : opcoesFalha ? "Não foi possível carregar." : "Sem opções no período."}
          />
          <div className="gm-dash-actions">
            <button type="button" className="btn primary" disabled={loading} onClick={consultar}>
              {loading ? "Consultando…" : "Consultar"}
            </button>
          </div>
        </aside>

        <div className="gm-dash-main">
          <ConsultaProgressBar
            active={loading}
            label="Consultando dashboard de materiais…"
            className="consulta-progress--inline"
          />
          {error ? <p className="gm-dash-error">{error}</p> : null}
          {!consultado && !loading ? (
            <p className="gm-dash-wait">Defina os filtros e clique em Consultar para exibir o dashboard.</p>
          ) : null}
          {consultado ? (
          <>
          <div className={`gm-dash-kpis${loading ? " is-loading" : ""}`}>
            <article>
              <span className="gm-dash-ico">R$</span>
              <div>
                <strong>{data ? brl(data.kpis.valorEstimado) : "—"}</strong>
                <small>Valor estimado</small>
              </div>
            </article>
            <article className="is-blue">
              <span className="gm-dash-ico">✓</span>
              <div>
                <strong>
                  {data ? num(data.kpis.atendidas) : "—"} <em>{data?.kpis.pctAtendidas != null ? `${data.kpis.pctAtendidas}%` : ""}</em>
                </strong>
                <small>Solicitações atendidas</small>
              </div>
            </article>
            <article className="is-red">
              <span className="gm-dash-ico">!</span>
              <div>
                <strong>
                  {data ? num(data.kpis.naoAtendidas) : "—"}{" "}
                  <em>{data?.kpis.pctNaoAtendidas != null ? `${data.kpis.pctNaoAtendidas}%` : ""}</em>
                </strong>
                <small>Solicitações não atendidas</small>
              </div>
            </article>
            <article>
              <span className="gm-dash-ico">⏱</span>
              <div>
                <strong>{data ? num(data.kpis.leadTimeGeral) : "—"}</strong>
                <small>Média lead time em dias</small>
              </div>
            </article>
          </div>

          <div className="gm-dash-grid">
            <section className="gm-dash-card gm-dash-bars">
              <div className="gm-dash-cols">
                {(data?.porSituacao ?? []).map((item) => (
                  <div key={item.situacao} className="gm-dash-col">
                    <b>{num(item.quantidade)}</b>
                    <div>
                      <i
                        style={{
                          height: `${Math.max(6, (item.quantidade / maxSituacao) * 100)}%`,
                          background: BAR_COLOR[item.situacao] ?? "#8ea0b5",
                        }}
                      />
                    </div>
                    <span>{item.situacao}</span>
                  </div>
                ))}
                {!data?.porSituacao.length && !loading ? <p className="gm-dash-empty">Sem solicitações no período.</p> : null}
              </div>
            </section>

            <section className="gm-dash-card">
              <h3>Avaliação previsão de entrega</h3>
              <div className="gm-dash-aval">
                <Donut itens={data?.avaliacaoEntrega ?? []} />
                <ul>
                  {(data?.avaliacaoEntrega ?? []).map((item, index) => (
                    <li key={item.aval}>
                      <i style={{ background: AVAL_COLOR[index % AVAL_COLOR.length] }} />
                      {item.aval} {num(item.quantidade)}
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            <section className="gm-dash-card gm-dash-lead">
              <h3>Lead time até a emissão da O.C.</h3>
              <div>
                <i />
                <strong>{data ? num(data.leadTimeOc) : "—"}</strong>
              </div>
              <h3>Lead time até entrega do material</h3>
              <div>
                <i />
                <strong>{data ? num(data.leadTimeEntrega) : "—"}</strong>
              </div>
            </section>

            <section className="gm-dash-card gm-dash-table-card">
              <h3>Acompanhamento Grupo Operacional</h3>
              <div className="gm-dash-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Categoria</th>
                      <th>Entregues</th>
                      <th>Não atendidas</th>
                      <th>%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.porCategoria ?? []).map((row) => (
                      <tr key={row.categoria}>
                        <td>{row.categoria}</td>
                        <td>{num(row.entregues)}</td>
                        <td>{num(row.naoAtendidas)}</td>
                        <td>{row.pct != null ? `${row.pct}%` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="gm-dash-card gm-dash-week">
              <h3>Solicitações entregues na semana</h3>
              <table>
                <thead>
                  <tr>
                    <th>Dia</th>
                    <th>Qtde entregue</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.entregasSemana ?? []).map((row) => (
                    <tr key={row.dia}>
                      <td>{row.dia}</td>
                      <td>{num(row.quantidade)}</td>
                    </tr>
                  ))}
                  <tr className="is-total">
                    <td>Total</td>
                    <td>{num(totalSemana)}</td>
                  </tr>
                </tbody>
              </table>
            </section>

            <section className="gm-dash-card gm-dash-detail">
              <div className="gm-dash-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Cod material</th>
                      <th>Descrição Material</th>
                      <th>Qtde Solicitada</th>
                      <th>Preço</th>
                      <th>Valor Total</th>
                      <th>Situação</th>
                      <th>Aval Entrega</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.detalhes ?? []).map((row, index) => (
                      <tr key={`${row.data}-${row.codMaterial}-${index}`}>
                        <td>{dataBr(row.data)}</td>
                        <td>{row.codMaterial ?? "—"}</td>
                        <td>{row.descricao}</td>
                        <td>{num(row.qtde, 2)}</td>
                        <td>{row.preco != null ? num(row.preco, 2) : "—"}</td>
                        <td>{num(row.valor, 2)}</td>
                        <td>{row.situacao}</td>
                        <td>{row.aval ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
          </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
