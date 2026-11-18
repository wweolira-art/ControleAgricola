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

function dataExcel(value: string | null) {
  if (!value) return null;
  const [ano, mes, dia] = value.slice(0, 10).split("-").map(Number);
  if (!ano || !mes || !dia) return null;
  return new Date(ano, mes - 1, dia);
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

function SeletorMultiplo({ label, options, value, onChange }: { label: string; options: string[]; value: string[]; onChange: (next: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const selected = new Set(value);
  const toggle = (option: string) => {
    const next = new Set(value);
    if (next.has(option)) next.delete(option);
    else next.add(option);
    onChange(options.filter((item) => next.has(item)));
  };
  const resumo = !value.length ? "Todos" : value.length === 1 ? value[0] : `${value.length} grupos selecionados`;
  return (
    <div className="gm-dash-field acompanhamento-multi-select">
      <span>{label}</span>
      <button type="button" className="acompanhamento-multi-trigger" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        <span>{resumo}</span><span aria-hidden="true">⌄</span>
      </button>
      {open ? (
        <div className="acompanhamento-multi-options" role="group" aria-label={label}>
          <div className="acompanhamento-multi-actions">
            <button type="button" onClick={() => onChange([...options])}>Todos</button>
            <button type="button" onClick={() => onChange([])}>Limpar</button>
          </div>
          {options.map((option) => (
            <label key={option}>
              <input type="checkbox" checked={selected.has(option)} onChange={() => toggle(option)} />
              <span>{option}</span>
            </label>
          ))}
        </div>
      ) : null}
    </div>
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
  const [exporting, setExporting] = useState(false);
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

  const exportarExcel = async () => {
    if (!data?.pedidos.length) return;
    setExporting(true);
    setError(null);
    try {
      const { default: ExcelJS } = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Controle Agrícola";
      workbook.created = new Date();
      const sheet = workbook.addWorksheet("Acompanhamento", {
        views: [{ state: "frozen", ySplit: 4, showGridLines: false }],
        pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
      });

      const headers = [
        "Data", "Nº solicitação", "NROC", "Cód. material", "Descrição material",
        "Qtde. solicitada", "Qtde. entregue", "Preço", "Valor total", "Situação",
        "Tempo total (dias)", "Previsão entrega", "Data entrega", "Avaliação entrega",
        "Observação", "Cód. fornecedor", "Fornecedor",
      ];
      sheet.columns = [
        { width: 13 }, { width: 17 }, { width: 14 }, { width: 15 }, { width: 42 },
        { width: 17 }, { width: 15 }, { width: 15 }, { width: 17 }, { width: 25 },
        { width: 19 }, { width: 18 }, { width: 15 }, { width: 20 }, { width: 45 },
        { width: 17 }, { width: 34 },
      ];

      sheet.mergeCells("A1:Q1");
      const titulo = sheet.getCell("A1");
      titulo.value = "ACOMPANHAMENTO DE PEDIDOS";
      titulo.font = { name: "Arial", size: 16, bold: true, color: { argb: "FFFFFFFF" } };
      titulo.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF163E6C" } };
      titulo.alignment = { horizontal: "center", vertical: "middle" };
      sheet.getRow(1).height = 28;

      sheet.mergeCells("A2:Q2");
      const periodo = sheet.getCell("A2");
      periodo.value = `Período: ${dataBr(data.filtros.dataInicio)} a ${dataBr(data.filtros.dataFim)}  |  Atualizado em: ${new Date(data.atualizadoEm).toLocaleString("pt-BR")}`;
      periodo.font = { name: "Arial", size: 10, bold: true, color: { argb: "FF163E6C" } };
      periodo.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E8F6" } };
      periodo.alignment = { horizontal: "center", vertical: "middle" };
      sheet.getRow(2).height = 21;

      sheet.mergeCells("A3:Q3");
      const filtrosAtivos = [
        data.filtros.busca ? `Pesquisa: ${data.filtros.busca}` : "",
        data.filtros.fornecedores.length ? `Fornecedor: ${data.filtros.fornecedores.join(", ")}` : "",
        data.filtros.gruposOperacionais.length ? `Grupo operacional: ${data.filtros.gruposOperacionais.join(", ")}` : "",
        data.filtros.gruposMaterial.length ? `Grupo material: ${data.filtros.gruposMaterial.join(", ")}` : "",
        data.filtros.tiposSolicitacao.length ? `Tipo: ${data.filtros.tiposSolicitacao.join(", ")}` : "",
        data.filtros.situacoes.length ? `Situação: ${data.filtros.situacoes.join(", ")}` : "",
      ].filter(Boolean);
      const filtros = sheet.getCell("A3");
      filtros.value = filtrosAtivos.length ? filtrosAtivos.join("  |  ") : "Filtros adicionais: Todos";
      filtros.font = { name: "Arial", size: 9, italic: true, color: { argb: "FF34495E" } };
      filtros.alignment = { vertical: "middle", wrapText: true };
      sheet.getRow(3).height = filtrosAtivos.length > 2 ? 30 : 20;

      const header = sheet.getRow(4);
      header.values = headers;
      header.height = 34;
      header.eachCell((cell) => {
        cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF245B8E" } };
        cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
        cell.border = { bottom: { style: "thin", color: { argb: "FF9EB6CE" } } };
      });

      data.pedidos.forEach((pedido, index) => {
        const row = sheet.addRow([
          dataExcel(pedido.data), pedido.nrSolicitacao ?? "", pedido.nroc ?? "", pedido.codMaterial,
          pedido.descricao, pedido.qtde, pedido.qtdeEntregue, pedido.preco, pedido.valor,
          pedido.situacao, pedido.tempoTotal, dataExcel(pedido.previsaoEntrega), dataExcel(pedido.dataEntrega),
          pedido.aval ?? "", pedido.observacao ?? "", pedido.codFornecedor, pedido.fornecedor,
        ]);
        row.font = { name: "Arial", size: 10, color: { argb: "FF1F2937" } };
        row.alignment = { vertical: "top" };
        if (index % 2) row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F7FB" } };
        row.eachCell({ includeEmpty: true }, (cell) => {
          cell.border = { bottom: { style: "hair", color: { argb: "FFD4DEE8" } } };
        });
        [1, 12, 13].forEach((coluna) => { row.getCell(coluna).numFmt = "dd/mm/yyyy"; });
        [6, 7].forEach((coluna) => { row.getCell(coluna).numFmt = "#,##0.00"; });
        [8, 9].forEach((coluna) => { row.getCell(coluna).numFmt = 'R$ #,##0.00;[Red]-R$ #,##0.00'; });
        row.getCell(11).numFmt = "0";
        [5, 10, 14, 15, 17].forEach((coluna) => { row.getCell(coluna).alignment = { vertical: "top", wrapText: true }; });
      });

      const total = sheet.addRow(["", "", "", "", "TOTAL", data.pedidos.reduce((soma, item) => soma + item.qtde, 0), data.pedidos.reduce((soma, item) => soma + item.qtdeEntregue, 0), "", data.pedidos.reduce((soma, item) => soma + item.valor, 0)]);
      total.font = { name: "Arial", size: 10, bold: true, color: { argb: "FF163E6C" } };
      total.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E8F6" } };
      total.getCell(6).numFmt = "#,##0.00";
      total.getCell(7).numFmt = "#,##0.00";
      total.getCell(9).numFmt = 'R$ #,##0.00;[Red]-R$ #,##0.00';
      sheet.autoFilter = "A4:Q4";

      const arquivo = await workbook.xlsx.writeBuffer();
      const blob = new Blob([arquivo as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `acompanhamento-pedidos-${data.filtros.dataInicio}-a-${data.filtros.dataFim}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (err) {
      setError(err instanceof Error ? `Não foi possível gerar o Excel: ${err.message}` : "Não foi possível gerar o Excel.");
    } finally {
      setExporting(false);
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
          <SeletorMultiplo label="Grupo material" options={opcoes.gruposMaterial} value={filtro.gruposMaterial} onChange={setLista("gruposMaterial")} />
          <Seletor label="Tipo solicitação" options={opcoes.tiposSolicitacao} value={filtro.tiposSolicitacao} onChange={setLista("tiposSolicitacao")} />
          <Seletor label="Situação da solicitação" options={opcoes.situacoes} value={filtro.situacoes} onChange={setLista("situacoes")} />
          {opcoesLoading ? <small className="acompanhamento-opcoes-status">Carregando fornecedores e grupos operacionais…</small> : null}
          <div className="gm-dash-actions">
            <button type="button" className="btn" disabled={opcoesLoading} onClick={() => carregarOpcoes(filtro.dataInicio, filtro.dataFim)}>{opcoesLoading ? "Atualizando…" : "Atualizar filtros"}</button>
            <button type="button" className="btn primary" disabled={loading} onClick={consultar}>{loading ? "Consultando…" : "Consultar"}</button>
            <button type="button" className="btn" disabled={loading || exporting || !data?.pedidos.length} onClick={() => void exportarExcel()}>{exporting ? "Gerando Excel…" : "Gerar Excel"}</button>
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
