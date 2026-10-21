import { useEffect, useRef, useState } from "react";
import { api, type AcompanhamentoPedidoData, type DashboardMateriaisData } from "../../api";
import { ConsultaProgressBar } from "../ConsultaProgressBar";

type Filtro = {
  dataInicio: string;
  dataFim: string;
  busca: string;
  campoPesquisa: "nrSolicitacao" | "nroc" | "codMaterial" | "descricao" | "observacao";
  solicitantes: string[];
  situacoes: string[];
  gruposOperacionais: string[];
  gruposMaterial: string[];
  tiposSolicitacao: string[];
  fornecedores: string[];
};

function hoje() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function periodoInicial() {
  const dataFim = hoje();
  const ano = Number(dataFim.slice(0, 4));
  const mes = Number(dataFim.slice(5, 7));
  return { dataInicio: `${mes >= 4 ? ano : ano - 1}-03-21`, dataFim };
}

function dataBr(value: string | null) {
  if (!value) return "—";
  const [ano, mes, dia] = value.slice(0, 10).split("-");
  return `${dia}/${mes}/${ano}`;
}

function numero(value: number | null | undefined, casas = 2) {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

function Seletor({ label, options, value, onChange, loading }: { label: string; options: string[]; value: string[]; onChange: (next: string[]) => void; loading?: boolean }) {
  return (
    <label className="gm-dash-field">
      <span>{label}</span>
      <select value={value[0] ?? ""} onChange={(event) => onChange(event.target.value ? [event.target.value] : [])}>
        <option value="">{loading ? "Carregando opções…" : "Todos"}</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

export function AcompanhamentoPedido() {
  const periodo = periodoInicial();
  const [filtro, setFiltro] = useState<Filtro>({
    ...periodo, busca: "", campoPesquisa: "nrSolicitacao", solicitantes: [], situacoes: [], gruposOperacionais: [], gruposMaterial: [], tiposSolicitacao: [], fornecedores: [],
  });
  const [opcoes, setOpcoes] = useState<DashboardMateriaisData["opcoes"]>({
    solicitantes: [],
    situacoes: ["Entregue", "Cancelada", "Aguardando aprovação", "Aguardando Pagamento", "Aguardando entrega", "Sem cotação", "Em cotação", "Em negociação"],
    gruposOperacionais: [],
    gruposMaterial: ["Combustível", "Lubrificante", "Pneu", "Servico", "Filtro", "Graxa", "Aditivo", "Peças e Acessórios"],
    tiposSolicitacao: ["Aplicação direta", "Compra", "Estoque", "Serviço"],
    fornecedores: [],
  });
  const [data, setData] = useState<AcompanhamentoPedidoData | null>(null);
  const [detalhe, setDetalhe] = useState<AcompanhamentoPedidoData["pedidos"][number] | null>(null);
  const [loading, setLoading] = useState(false);
  const [opcoesLoading, setOpcoesLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const optionsRequest = useRef(0);

  const carregarOpcoes = (dataInicio: string, dataFim: string) => {
    const request = ++optionsRequest.current;
    setOpcoesLoading(true);
    api.indicadoresDashboardMateriaisOpcoes({ dataInicio, dataFim })
      .then((result) => { if (request === optionsRequest.current) setOpcoes(result); })
      .catch(() => { if (request === optionsRequest.current) setError("Não foi possível carregar as opções dos filtros."); })
      .finally(() => { if (request === optionsRequest.current) setOpcoesLoading(false); });
  };

  // Carrega somente ao abrir a aba; mudanças de período não disparam consultas automáticas.
  useEffect(() => { carregarOpcoes(periodo.dataInicio, periodo.dataFim); }, []);

  const setLista = (campo: keyof Pick<Filtro, "solicitantes" | "situacoes" | "gruposOperacionais" | "gruposMaterial" | "tiposSolicitacao" | "fornecedores">) => (valor: string[]) =>
    setFiltro((atual) => ({ ...atual, [campo]: valor }));

  const consultar = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.indicadoresAcompanhamentoPedido(filtro);
      setData(result);
      setOpcoes(result.opcoes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível consultar os pedidos.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="gm-dash acompanhamento-pedido">
      <header className="gm-dash-head">
        <img src="/elejota-agro-logo.png" alt="Elejota Agro" />
        <div><h2>ACOMPANHAMENTO PEDIDO</h2><p>GESTÃO DE MATERIAIS</p></div>
        <strong>{data ? `Atualizado em ${new Date(data.atualizadoEm).toLocaleString("pt-BR")}` : "Aguardando consulta"}</strong>
      </header>
      <div className="gm-dash-body">
        <aside className="gm-dash-filters">
          <h3>Filtros:</h3>
          <label className="gm-dash-field"><span>Período</span><div className="gm-dash-dates"><input type="date" value={filtro.dataInicio} onChange={(e) => setFiltro((v) => ({ ...v, dataInicio: e.target.value }))} /><input type="date" value={filtro.dataFim} onChange={(e) => setFiltro((v) => ({ ...v, dataFim: e.target.value }))} /></div></label>
          <div className="gm-dash-field acompanhamento-pesquisa">
            <span>Pesquisar</span>
            <input value={filtro.busca} onChange={(e) => setFiltro((v) => ({ ...v, busca: e.target.value }))} placeholder="Digite para pesquisar" />
            <div className="acompanhamento-campos" aria-label="Campo da pesquisa">
              {([
                ["nrSolicitacao", "Nr solicitação"],
                ["nroc", "NROC"],
                ["codMaterial", "Cód. material"],
                ["descricao", "Descrição material"],
                ["observacao", "Observação"],
              ] as const).map(([campo, texto]) => (
                <button key={campo} type="button" className={filtro.campoPesquisa === campo ? "is-active" : ""} onClick={() => setFiltro((v) => ({ ...v, campoPesquisa: campo }))}>{texto}</button>
              ))}
            </div>
          </div>
          <Seletor label="Fornecedor" options={opcoes.fornecedores} value={filtro.fornecedores} onChange={setLista("fornecedores")} loading={opcoesLoading} />
          <Seletor label="Grupo operacional" options={opcoes.gruposOperacionais} value={filtro.gruposOperacionais} onChange={setLista("gruposOperacionais")} loading={opcoesLoading} />
          <Seletor label="Grupo material" options={opcoes.gruposMaterial} value={filtro.gruposMaterial} onChange={setLista("gruposMaterial")} />
          <Seletor label="Tipo solicitação" options={opcoes.tiposSolicitacao} value={filtro.tiposSolicitacao} onChange={setLista("tiposSolicitacao")} />
          <Seletor label="Situação da solicitação" options={opcoes.situacoes} value={filtro.situacoes} onChange={setLista("situacoes")} />
          {opcoesLoading ? <small className="acompanhamento-opcoes-status">Carregando fornecedores e grupos operacionais…</small> : null}
          <div className="gm-dash-actions">
            <button type="button" className="btn" disabled={opcoesLoading} onClick={() => carregarOpcoes(filtro.dataInicio, filtro.dataFim)}>{opcoesLoading ? "Atualizando…" : "Atualizar filtros"}</button>
            <button type="button" className="btn primary" disabled={loading} onClick={consultar}>{loading ? "Consultando…" : "Consultar"}</button>
          </div>
        </aside>
        <div className="gm-dash-main">
          <ConsultaProgressBar active={loading} label="Consultando acompanhamento de pedidos…" className="consulta-progress--inline" />
          {error ? <p className="gm-dash-error">{error}</p> : null}
          {!data && !loading ? <p className="gm-dash-wait">Escolha os filtros e clique em Consultar para acompanhar os pedidos.</p> : null}
          {data ? <div className="table-wrap acompanhamento-pedido-table"><table><thead><tr><th>Data</th><th>Nr. Solicitação</th><th>NROC</th><th>Cód. material</th><th>Descrição material</th><th>Qtde solicitada</th><th>Qtde entregue</th><th>Preço</th><th>Valor total</th><th>Situação</th><th>Tempo total (dias)</th><th>Previsão entrega</th><th>Data entrega</th><th>Avaliação entrega</th><th aria-label="Detalhes" /></tr></thead><tbody>{data.pedidos.map((pedido, index) => <tr key={`${pedido.nrSolicitacao}-${pedido.codMaterial}-${index}`}><td>{dataBr(pedido.data)}</td><td>{pedido.nrSolicitacao ?? "—"}</td><td>{pedido.nroc ?? "—"}</td><td>{pedido.codMaterial ?? "—"}</td><td>{pedido.descricao}</td><td>{numero(pedido.qtde)}</td><td>{numero(pedido.qtdeEntregue)}</td><td>{numero(pedido.preco)}</td><td>{numero(pedido.valor)}</td><td>{pedido.situacao}</td><td>{numero(pedido.tempoTotal, 0)}</td><td>{dataBr(pedido.previsaoEntrega)}</td><td>{dataBr(pedido.dataEntrega)}</td><td>{pedido.aval ?? "—"}</td><td><button type="button" className="acompanhamento-detalhe-btn" title="Exibir mais detalhes" aria-label={`Exibir detalhes do pedido ${pedido.nrSolicitacao ?? ""}`} onClick={() => setDetalhe(pedido)}>ⓘ</button></td></tr>)}{!data.pedidos.length ? <tr><td colSpan={15}>Nenhum pedido encontrado para os filtros selecionados.</td></tr> : null}</tbody></table></div> : null}
        </div>
      </div>
      {detalhe ? <div className="acompanhamento-modal-backdrop" role="presentation" onMouseDown={() => setDetalhe(null)}><section className="acompanhamento-modal" role="dialog" aria-modal="true" aria-label="Detalhes do pedido" onMouseDown={(event) => event.stopPropagation()}><button type="button" className="acompanhamento-modal-fechar" onClick={() => setDetalhe(null)} aria-label="Fechar detalhes">×</button><h3>Detalhes do pedido</h3><div className="acompanhamento-detalhe-resumo"><div><span>Data do pedido</span><strong>{dataBr(detalhe.data)}</strong></div><div><span>Nº pedido</span><strong>{detalhe.nrSolicitacao ?? "—"}</strong></div><div><span>Tempo total</span><strong>{numero(detalhe.tempoTotal, 0)} dias</strong></div><div><span>Data entrega</span><strong>{dataBr(detalhe.dataEntrega)}</strong></div></div><div className="acompanhamento-detalhe-bloco"><span>Cód. material</span><strong>{detalhe.codMaterial ?? "—"}</strong><span>Material</span><strong>{detalhe.descricao}</strong></div><div className="acompanhamento-detalhe-bloco"><span>Observação</span><strong>{detalhe.observacao || "Sem observação."}</strong></div><div className="acompanhamento-detalhe-bloco"><span>Fornecedor</span><strong>{detalhe.codFornecedor ?? "—"} — {detalhe.fornecedor}</strong></div><p className="acompanhamento-detalhe-situacao">{detalhe.situacao}</p></section></div> : null}
    </section>
  );
}
