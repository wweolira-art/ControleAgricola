import { useCallback, useEffect, useMemo, useState } from "react";
import ExcelJS from "exceljs";
import { api, type PremiseOption, type ResumoTransporteCanaData, type ResumoTransporteModo, type ResumoTransporteRateioProduto } from "../../api";
import { useApp } from "../../store";
import { SearchableReportFilter } from "../SearchableReportFilter";
import { ConsultaProgressBar } from "../ConsultaProgressBar";
import { PrintButton } from "../PrintButton";
import { safraDefaultRange } from "./colheita-utils";

function fmt2(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function fmtMoney(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

function parseMoneyInput(value: string) {
  const cleaned = value.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

async function carregarLogoExcel() {
  const response = await fetch("/elejota-agro-logo.png");
  if (!response.ok) return null;
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function ColheitaResumoTransporte() {
  const { safra, safras, safraId } = useApp();
  const defaults = useMemo(() => safraDefaultRange(safra?.code), [safra?.code]);
  const [dataInicio, setDataInicio] = useState(defaults.from);
  const [dataFim, setDataFim] = useState(defaults.to);
  const [reportSafraId, setReportSafraId] = useState(safraId);
  const [selectedCaminhoes, setSelectedCaminhoes] = useState<string[]>([]);
  const [selectedTerceiros, setSelectedTerceiros] = useState<string[]>([]);
  const [modo, setModo] = useState<ResumoTransporteModo>("proprios");
  const [caminhaoOptions, setCaminhaoOptions] = useState<PremiseOption[]>([]);
  const [terceiroOptions, setTerceiroOptions] = useState<PremiseOption[]>([]);
  const [data, setData] = useState<ResumoTransporteCanaData | null>(null);
  const [combustivelManual, setCombustivelManual] = useState("0,00");
  const [rateioProdutos, setRateioProdutos] = useState<Array<Pick<ResumoTransporteRateioProduto, "id" | "nome" | "percentual">>>([]);
  const [loading, setLoading] = useState(false);
  const [savingCombustivel, setSavingCombustivel] = useState(false);
  const [savingRateio, setSavingRateio] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reportSafra = safras.find((row) => row.id === reportSafraId) ?? safra;
  const reportSafraLabel = reportSafra?.code ?? safra?.code ?? "—";
  const colunas = data?.colunas ?? data?.equipamentos?.map((key) => ({ key, label: key })) ?? [];
  const colKeys = colunas.map((col) => col.key);
  const percentualDescontoCombustivel = data?.resumo.totalGeral.valorTotal
    ? (data.resumo.combustivelManual / data.resumo.totalGeral.valorTotal) * 100
    : null;
  const valorPorEquip = useMemo(() => {
    const map: Record<string, number> = {};
    for (const parte of data?.parceiros ?? []) {
      for (const [eq, val] of Object.entries(parte.equipamentos)) {
        map[eq] = (map[eq] ?? 0) + val;
      }
    }
    return map;
  }, [data]);
  const totalPercentualRateio = useMemo(
    () => rateioProdutos.reduce((total, produto) => total + (Number(produto.percentual) || 0), 0),
    [rateioProdutos],
  );
  const rateioExibido = useMemo(
    () =>
      rateioProdutos.map((produto) => ({
        ...produto,
        equipamentos: Object.fromEntries(
          colKeys.map((eq) => [eq, (valorPorEquip[eq] ?? 0) * ((Number(produto.percentual) || 0) / 100)]),
        ),
        total: (data?.resumo.totalLiquido ?? 0) * ((Number(produto.percentual) || 0) / 100),
      })),
    [colKeys, data?.resumo.totalLiquido, rateioProdutos, valorPorEquip],
  );

  useEffect(() => {
    void api.colheitaResumoTransporteRateioProdutos()
      .then(setRateioProdutos)
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, []);

  const loadOptions = useCallback(async () => {
    try {
      const opts = await api.colheitaResumoTransporteOpcoes({
        dataInicio,
        dataFim,
        modo,
      });
      setCaminhaoOptions(opts.caminhoes);
      setTerceiroOptions(opts.terceiros);
    } catch {
      setCaminhaoOptions([]);
      setTerceiroOptions([]);
    }
  }, [dataInicio, dataFim, modo]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setErr(null);
      const result = await api.colheitaResumoTransporte({
        reportSafraCode: reportSafraLabel,
        dataInicio,
        dataFim,
        refDate: dataFim,
        modo,
        caminhoes: modo !== "terceiros" && selectedCaminhoes.length ? selectedCaminhoes : undefined,
        terceiros: modo !== "proprios" && selectedTerceiros.length ? selectedTerceiros : undefined,
      });
      setData(result);
      setCombustivelManual(fmt2(result.resumo.combustivelManual));
    } catch (e) {
      setData(null);
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [reportSafraLabel, dataInicio, dataFim, modo, selectedCaminhoes, selectedTerceiros]);

  const consultar = useCallback(async () => {
    await Promise.all([loadOptions(), load()]);
  }, [loadOptions, load]);

  const salvarCombustivel = useCallback(async () => {
    try {
      setSavingCombustivel(true);
      setErr(null);
      await api.colheitaResumoTransporteCombustivelSave({
        dataInicio,
        dataFim,
        modo,
        valor: parseMoneyInput(combustivelManual),
      });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingCombustivel(false);
    }
  }, [combustivelManual, dataInicio, dataFim, modo, load]);

  const salvarRateio = useCallback(async () => {
    try {
      setSavingRateio(true);
      setErr(null);
      const saved = await api.colheitaResumoTransporteRateioProdutosSave(
        rateioProdutos.map((produto) => ({ nome: produto.nome, percentual: Number(produto.percentual) || 0 })),
      );
      setRateioProdutos(saved);
      if (data) await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingRateio(false);
    }
  }, [data, load, rateioProdutos]);

  const alterarPeriodoInicio = (value: string) => {
    setDataInicio(value);
    setSelectedCaminhoes([]);
    setSelectedTerceiros([]);
  };

  const alterarPeriodoFim = (value: string) => {
    setDataFim(value);
    setSelectedCaminhoes([]);
    setSelectedTerceiros([]);
  };

  const alterarModo = (next: ResumoTransporteModo) => {
    setModo(next);
    setSelectedCaminhoes([]);
    setSelectedTerceiros([]);
  };

  const exportarExcel = useCallback(async () => {
    if (!data) return;

    const azulEscuro = "FF0B315D";
    const azulMedio = "FF1D4E80";
    const azulClaro = "FFDCEAF7";
    const linhaAzul = "FFB8CCE4";
    const branco = "FFFFFFFF";
    const texto = "FF102A43";
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Controle Agrícola";
    workbook.created = new Date();
    const sheet = workbook.addWorksheet("Resumo transporte", {
      views: [{ showGridLines: false, state: "frozen", ySplit: 3 }],
      pageSetup: {
        orientation: "landscape",
        paperSize: 9,
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: { left: 0.2, right: 0.2, top: 0.35, bottom: 0.35, header: 0.15, footer: 0.15 },
      },
    });
    sheet.properties.defaultRowHeight = 18;
    sheet.pageSetup.horizontalCentered = true;
    sheet.headerFooter.oddFooter = "Página &P de &N";

    const cabecalho = ["Tipo colheita", "Fazenda", ...colunas.map((coluna) => coluna.label), "Colhido", "Raio", "Preço/ton", "Valor total"];
    const ultimaColuna = cabecalho.length;
    const moeda = 'R$ #,##0.00';
    const numero = '#,##0.00';
    const faixa = (row: ExcelJS.Row, inicio = 1, fim = ultimaColuna) => {
      for (let coluna = inicio; coluna <= fim; coluna += 1) row.getCell(coluna);
      return row;
    };
    const aplicarLinha = (row: ExcelJS.Row, estilo: ExcelJS.Style, inicio = 1, fim = ultimaColuna) => {
      faixa(row, inicio, fim).eachCell({ includeEmpty: true }, (cell) => {
        cell.style = { ...cell.style, ...estilo };
      });
    };
    const aplicarBordas = (row: ExcelJS.Row, inicio = 1, fim = ultimaColuna) => {
      faixa(row, inicio, fim).eachCell({ includeEmpty: true }, (cell) => {
        cell.border = { bottom: { style: "thin", color: { argb: linhaAzul } } };
      });
    };
    const adicionarLinha = (valores: Array<string | number | null>) => sheet.addRow(valores);

    sheet.getColumn(1).width = 18;
    sheet.getColumn(2).width = 42;
    for (let coluna = 3; coluna <= ultimaColuna; coluna += 1) sheet.getColumn(coluna).width = 15;
    sheet.getColumn(ultimaColuna - 2).width = 11;
    sheet.getColumn(ultimaColuna - 1).width = 14;
    sheet.getColumn(ultimaColuna).width = 16;

    sheet.mergeCells(1, 2, 1, ultimaColuna);
    const titulo = sheet.getCell(1, 2);
    titulo.value = `RESUMO TRANSPORTE DE CANA SAFRA ${reportSafraLabel}`;
    titulo.font = { name: "Arial", size: 15, bold: true, color: { argb: branco } };
    titulo.fill = { type: "pattern", pattern: "solid", fgColor: { argb: azulEscuro } };
    titulo.alignment = { horizontal: "center", vertical: "middle" };
    sheet.getRow(1).height = 34;
    sheet.getCell(1, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: branco } };
    sheet.mergeCells(2, 2, 2, ultimaColuna);
    const periodo = sheet.getCell(2, 2);
    periodo.value = `Período: ${dataInicio} a ${dataFim}`;
    periodo.font = { name: "Arial", size: 10, bold: true, color: { argb: azulEscuro } };
    periodo.alignment = { horizontal: "center", vertical: "middle" };
    sheet.getRow(2).height = 22;

    try {
      const logo = await carregarLogoExcel();
      if (logo) {
        const logoId = workbook.addImage({ base64: logo, extension: "png" });
        sheet.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 68, height: 34 } });
      }
    } catch {
      // A exportação continua mesmo se a imagem não estiver disponível.
    }

    sheet.addRow([]);
    for (const bloco of data.blocos) {
      const secao = adicionarLinha([bloco.tipoColheita]);
      sheet.mergeCells(secao.number, 1, secao.number, ultimaColuna);
      aplicarLinha(secao, {
        fill: { type: "pattern", pattern: "solid", fgColor: { argb: azulEscuro } },
        font: { name: "Arial", size: 10, bold: true, color: { argb: branco } },
        alignment: { vertical: "middle" },
      });
      secao.height = 21;

      const titulos = adicionarLinha(cabecalho);
      aplicarLinha(titulos, {
        fill: { type: "pattern", pattern: "solid", fgColor: { argb: azulMedio } },
        font: { name: "Arial", size: 10, bold: true, color: { argb: branco } },
        alignment: { horizontal: "center", vertical: "middle", wrapText: true },
      });
      titulos.height = 28;

      for (const linha of bloco.linhas) {
        const detalhe = adicionarLinha([
          bloco.tipoColheita,
          linha.fazenda,
          ...colKeys.map((equipamento) => linha.equipamentos[equipamento] ?? 0),
          linha.colhido,
          linha.raio,
          linha.precoTon,
          linha.valorTotal,
        ]);
        aplicarLinha(detalhe, {
          font: { name: "Arial", size: 10, color: { argb: texto } },
          alignment: { vertical: "middle" },
        });
        aplicarBordas(detalhe);
        detalhe.getCell(1).alignment = { horizontal: "left", vertical: "middle" };
        detalhe.getCell(2).alignment = { horizontal: "left", vertical: "middle" };
        for (let coluna = 3; coluna <= ultimaColuna; coluna += 1) detalhe.getCell(coluna).alignment = { horizontal: "right", vertical: "middle" };
        for (let coluna = 3; coluna <= ultimaColuna - 3; coluna += 1) detalhe.getCell(coluna).numFmt = numero;
        detalhe.getCell(ultimaColuna - 3).numFmt = numero;
        detalhe.getCell(ultimaColuna - 2).numFmt = numero;
        detalhe.getCell(ultimaColuna - 1).numFmt = moeda;
        detalhe.getCell(ultimaColuna).numFmt = moeda;
      }

      const total = adicionarLinha([
        "Total",
        null,
        ...colKeys.map((equipamento) => bloco.totais.equipamentos[equipamento] ?? 0),
        bloco.totais.colhido,
        bloco.totais.raioMedio,
        bloco.totais.precoTonMedio,
        bloco.totais.valorTotal,
      ]);
      aplicarLinha(total, {
        fill: { type: "pattern", pattern: "solid", fgColor: { argb: azulClaro } },
        font: { name: "Arial", size: 10, bold: true, color: { argb: azulEscuro } },
        alignment: { vertical: "middle" },
      });
      for (let coluna = 3; coluna <= ultimaColuna; coluna += 1) total.getCell(coluna).alignment = { horizontal: "right", vertical: "middle" };
      for (let coluna = 3; coluna <= ultimaColuna - 3; coluna += 1) total.getCell(coluna).numFmt = numero;
      total.getCell(ultimaColuna - 3).numFmt = numero;
      total.getCell(ultimaColuna - 2).numFmt = numero;
      total.getCell(ultimaColuna - 1).numFmt = moeda;
      total.getCell(ultimaColuna).numFmt = moeda;
      sheet.addRow([]);
    }

    const colunasResumo = 4;
    const resumoTitulos = adicionarLinha(["Produto", "Prod. ton.", "Preço unit.", "Valor total"]);
    aplicarLinha(resumoTitulos, {
      fill: { type: "pattern", pattern: "solid", fgColor: { argb: azulEscuro } },
      font: { name: "Arial", size: 10, bold: true, color: { argb: branco } },
      alignment: { horizontal: "center", vertical: "middle" },
    }, 1, colunasResumo);
    const resumoLinhas = [
      ["CANA DE AÇÚCAR", data.resumo.totalGeral.colhido, data.resumo.precoMedioTon, data.resumo.totalGeral.valorTotal],
      ["VALOR TOTAL", null, null, data.resumo.totalGeral.valorTotal],
      [`DESCONTO DE COMBUSTÍVEL (${fmt2(percentualDescontoCombustivel)}%)`, null, null, data.resumo.combustivelManual],
      ["TOTAL LÍQUIDO", null, null, data.resumo.totalLiquido],
    ];
    for (const valores of resumoLinhas) {
      const row = adicionarLinha(valores);
      const destaque = valores[0] === "TOTAL LÍQUIDO";
      aplicarLinha(row, {
        fill: { type: "pattern", pattern: "solid", fgColor: { argb: destaque ? azulClaro : branco } },
        font: { name: "Arial", size: 10, bold: destaque || valores[0] === "VALOR TOTAL", color: { argb: azulEscuro } },
        alignment: { vertical: "middle" },
      }, 1, colunasResumo);
      aplicarBordas(row, 1, colunasResumo);
      row.getCell(2).numFmt = numero;
      row.getCell(3).numFmt = moeda;
      row.getCell(4).numFmt = moeda;
      for (let coluna = 2; coluna <= colunasResumo; coluna += 1) row.getCell(coluna).alignment = { horizontal: "right", vertical: "middle" };
    }
    sheet.addRow([]);

    const cabecalhoRateio = ["Produto", "Percentual", ...colunas.map((coluna) => coluna.label), "Total"];
    const rateioTitulos = adicionarLinha(cabecalhoRateio);
    aplicarLinha(rateioTitulos, {
      fill: { type: "pattern", pattern: "solid", fgColor: { argb: azulEscuro } },
      font: { name: "Arial", size: 10, bold: true, color: { argb: branco } },
      alignment: { horizontal: "center", vertical: "middle", wrapText: true },
    });
    rateioTitulos.height = 25;
    for (const produto of rateioExibido) {
      const row = adicionarLinha([
        produto.nome,
        produto.percentual / 100,
        ...colKeys.map((equipamento) => produto.equipamentos[equipamento] ?? 0),
        produto.total,
      ]);
      aplicarLinha(row, { font: { name: "Arial", size: 10, color: { argb: texto } }, alignment: { vertical: "middle" } });
      aplicarBordas(row);
      row.getCell(1).alignment = { horizontal: "left", vertical: "middle" };
      row.getCell(2).numFmt = "0.00%";
      for (let coluna = 2; coluna <= ultimaColuna; coluna += 1) row.getCell(coluna).alignment = { horizontal: "right", vertical: "middle" };
      for (let coluna = 3; coluna <= ultimaColuna; coluna += 1) row.getCell(coluna).numFmt = moeda;
    }
    const totalRateio = adicionarLinha([
      "Total",
      null,
      ...colKeys.map((equipamento) => valorPorEquip[equipamento] ?? 0),
      Object.values(valorPorEquip).reduce((total, valor) => total + valor, 0),
    ]);
    aplicarLinha(totalRateio, {
      fill: { type: "pattern", pattern: "solid", fgColor: { argb: azulClaro } },
      font: { name: "Arial", size: 10, bold: true, color: { argb: azulEscuro } },
      alignment: { vertical: "middle" },
    });
    for (let coluna = 2; coluna <= ultimaColuna; coluna += 1) {
      totalRateio.getCell(coluna).alignment = { horizontal: "right", vertical: "middle" };
      totalRateio.getCell(coluna).numFmt = moeda;
    }

    const arquivo = await workbook.xlsx.writeBuffer();
    const blob = new Blob([arquivo as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `resumo-transporte-cana-${dataInicio || "inicio"}-${dataFim || "fim"}.xlsx`;
    link.click();
    URL.revokeObjectURL(url);
  }, [colKeys, colunas, data, dataFim, dataInicio, percentualDescontoCombustivel, rateioExibido, reportSafraLabel, valorPorEquip]);

  return (
    <>
      <p className="lead no-print">
        Resumo de transporte de cana por tipo de colheita, fazenda e equipamentos associados ou marcados como terceiro, com raio da FAZENDAUSINA e preço por faixa de frete.
      </p>
      <section className="panel no-print">
        <h3>Filtros</h3>
        <div className="form-grid">
          <label>
            Data inicial
            <input type="date" value={dataInicio} onChange={(e) => alterarPeriodoInicio(e.target.value)} />
          </label>
          <label>
            Data final
            <input type="date" value={dataFim} onChange={(e) => alterarPeriodoFim(e.target.value)} />
          </label>
          <label>
            Safra no relatório
            <select value={reportSafraId || ""} onChange={(e) => setReportSafraId(Number(e.target.value))}>
              {safras.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="kind-toggle" style={{ padding: "0 16px 12px" }}>
          <button
            type="button"
            className={`btn ${modo === "proprios" ? "primary" : ""}`}
            onClick={() => alterarModo("proprios")}
          >
            Próprios
          </button>
          <button
            type="button"
            className={`btn ${modo === "terceiros" ? "primary" : ""}`}
            onClick={() => alterarModo("terceiros")}
          >
            Terceiros
          </button>
          <button
            type="button"
            className={`btn ${modo === "ambos" ? "primary" : ""}`}
            onClick={() => alterarModo("ambos")}
          >
            Terceiros + Próprios
          </button>
        </div>
        {modo !== "terceiros" ? (
          <SearchableReportFilter
            caption="Equipamento próprio associado"
            options={caminhaoOptions}
            selected={selectedCaminhoes}
            onChange={setSelectedCaminhoes}
            placeholder="Buscar equipamento…"
            emptyLabel="Todos"
          />
        ) : null}
        {modo !== "proprios" ? (
          <SearchableReportFilter
            caption="Equipamento/caminhão terceiro"
            options={terceiroOptions}
            selected={selectedTerceiros}
            onChange={setSelectedTerceiros}
            placeholder="Buscar terceiro…"
            emptyLabel="Todos"
          />
        ) : null}
        <div className="modal-actions" style={{ padding: "0 16px 16px" }}>
          <button className="btn primary" disabled={loading} onClick={() => void consultar()}>
            {loading ? "Consultando…" : "Consultar"}
          </button>
        </div>
        <ConsultaProgressBar active={loading} label="Consultando resumo de transporte…" className="consulta-progress--compact" />
      </section>
      <div className="no-print" style={{ marginBottom: 12 }}>
        <button type="button" className="btn" disabled={!data} onClick={exportarExcel}>Gerar Excel</button>
        <PrintButton />
      </div>
      {data ? (
        <section className="panel no-print">
          <h3>Combustível manual</h3>
          <div className="form-grid">
            <label>
              Desconto de combustível
              <input
                type="text"
                inputMode="decimal"
                value={combustivelManual}
                onChange={(e) => setCombustivelManual(e.target.value)}
                onBlur={() => setCombustivelManual(fmt2(parseMoneyInput(combustivelManual)))}
              />
            </label>
          </div>
          <div className="modal-actions" style={{ padding: "0 16px 16px" }}>
            <button className="btn primary" disabled={savingCombustivel || loading} onClick={() => void salvarCombustivel()}>
              {savingCombustivel ? "Salvando…" : "Salvar combustível"}
            </button>
          </div>
        </section>
      ) : null}
      {err ? (
        <p className="lead no-print" style={{ color: "var(--danger)" }}>
          {err}
        </p>
      ) : null}
      {data && data.blocos.length ? (
        <section className="panel resumo-transporte-report print-report-intro">
          <header className="liberacao-colheita-header">
            <img src="/elejota-agro-logo.png" alt="Elejota Agro" className="liberacao-colheita-logo" />
            <h2 className="liberacao-colheita-title">RESUMO TRANSPORTE DE CANA SAFRA {reportSafraLabel}</h2>
            <div className="liberacao-colheita-brand-right">GRUPO LUIZ JATOBÁ</div>
          </header>
          {data.blocos.map((bloco) => {
            const toneladasComRaio = bloco.linhas.reduce((total, linha) => total + (linha.raio == null ? 0 : linha.colhido), 0);
            const raioMedioCalculado = toneladasComRaio > 0
              ? bloco.linhas.reduce((total, linha) => total + (linha.raio == null ? 0 : linha.raio * linha.colhido), 0) / toneladasComRaio
              : null;
            const precoTonMedioCalculado = bloco.totais.colhido > 0 ? bloco.totais.valorTotal / bloco.totais.colhido : null;
            return <div key={bloco.tipoColheita} className="resumo-transporte-bloco">
              <h3 className="resumo-transporte-grupo">{bloco.tipoColheita}</h3>
              <div className="table-wrap">
                <table className="data resumo-transporte-table">
                  <thead>
                    <tr>
                      <th>TIPOCOLHEITA</th>
                      <th>FAZENDA</th>
                      {colunas.map((col) => (
                        <th key={col.key} className="num">
                          {col.label}
                        </th>
                      ))}
                      <th className="num">COLHIDO</th>
                      <th className="num">RAIO</th>
                      <th className="num">PRECOTON</th>
                      <th className="num">VALOR TOTAL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bloco.linhas.map((linha) => (
                      <tr key={`${bloco.tipoColheita}-${linha.fazenda}`}>
                        <td>{bloco.tipoColheita}</td>
                        <td>{linha.fazenda}</td>
                        {colKeys.map((eq) => (
                          <td key={eq} className="num">
                            {fmt2(linha.equipamentos[eq])}
                          </td>
                        ))}
                        <td className="num">{fmt2(linha.colhido)}</td>
                        <td className="num">{fmt2(linha.raio)}</td>
                        <td className="num">{fmt2(linha.precoTon)}</td>
                        <td className="num">{fmtMoney(linha.valorTotal)}</td>
                      </tr>
                    ))}
                    <tr className="resumo-transporte-total">
                      <td colSpan={2}>
                        <strong>Total</strong>
                      </td>
                      {colKeys.map((eq) => (
                        <td key={eq} className="num">
                          <strong>{fmt2(bloco.totais.equipamentos[eq])}</strong>
                        </td>
                      ))}
                      <td className="num">
                        <strong>{fmt2(bloco.totais.colhido)}</strong>
                      </td>
                      <td className="num">
                        <strong>{fmt2(bloco.totais.raioMedio ?? raioMedioCalculado)}</strong>
                      </td>
                      <td className="num">
                        <strong>{fmt2(bloco.totais.precoTonMedio ?? precoTonMedioCalculado)}</strong>
                      </td>
                      <td className="num">
                        <strong>{fmtMoney(bloco.totais.valorTotal)}</strong>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>;
          })}
          <div className="table-wrap">
            <table className="data resumo-transporte-table resumo-transporte-parceiros">
              <thead>
                <tr>
                  <th>
                    Produto
                    <span className="resumo-transporte-rateio-actions no-print">
                      <button className="resumo-transporte-rateio-icon" type="button" title="Adicionar produto" aria-label="Adicionar produto" disabled={savingRateio} onClick={() => setRateioProdutos((items) => [...items, { id: 0, nome: "", percentual: 0 }])}>+</button>
                      <button className="btn primary" type="button" disabled={savingRateio || Math.abs(totalPercentualRateio - 100) > 0.01} onClick={() => void salvarRateio()}>
                        {savingRateio ? "Salvando…" : "Salvar"}
                      </button>
                    </span>
                    <small className={`resumo-transporte-rateio-total no-print${Math.abs(totalPercentualRateio - 100) <= 0.01 ? " is-valid" : ""}`}>Rateio: {fmt2(totalPercentualRateio)}%</small>
                  </th>
                  <th className="num">Prod. ton.</th>
                  <th className="num">Preço unit.</th>
                  <th className="num">Valor total</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>CANA DE AÇÚCAR</td>
                  <td className="num">{fmt2(data.resumo.totalGeral.colhido)}</td>
                  <td className="num">{fmtMoney(data.resumo.precoMedioTon)}</td>
                  <td className="num">{fmtMoney(data.resumo.totalGeral.valorTotal)}</td>
                </tr>
                <tr>
                  <td>VALOR TOTAL</td>
                  <td className="num" />
                  <td className="num" />
                  <td className="num">{fmtMoney(data.resumo.totalGeral.valorTotal)}</td>
                </tr>
                <tr>
                  <td>
                    DESCONTO DE COMBUSTÍVEL{percentualDescontoCombustivel != null ? ` (${Math.round(percentualDescontoCombustivel)}%)` : ""}
                  </td>
                  <td className="num" />
                  <td className="num" />
                  <td className="num">{fmtMoney(data.resumo.combustivelManual)}</td>
                </tr>
                <tr className="resumo-transporte-total-geral">
                  <td>
                    <strong>TOTAL LÍQUIDO</strong>
                  </td>
                  <td className="num" />
                  <td className="num" />
                  <td className="num">
                    <strong>{fmtMoney(data.resumo.totalLiquido)}</strong>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="table-wrap">
            <table className="data resumo-transporte-table resumo-transporte-parceiros">
              <thead>
                <tr>
                  <th>Produto</th>
                  {colunas.map((col) => (
                    <th key={col.key} className="num">
                      {col.label}
                    </th>
                  ))}
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {rateioExibido.map((row, index) => (
                  <tr key={row.id || `novo-${index}`}>
                    <td>
                      <span className="resumo-transporte-rateio-print">{row.nome} ({fmt2(row.percentual)}%)</span>
                      <span className="resumo-transporte-rateio-editor no-print">
                        <input aria-label="Produto" value={row.nome} onChange={(e) => setRateioProdutos((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, nome: e.target.value } : item))} />
                        <input aria-label="Percentual" type="number" min="0" max="100" step="0.01" value={row.percentual} onChange={(e) => setRateioProdutos((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, percentual: Number(e.target.value) } : item))} />
                        <button className="resumo-transporte-rateio-icon is-remove" type="button" title="Remover produto" aria-label={`Remover ${row.nome || "produto"}`} disabled={rateioProdutos.length === 1 || savingRateio} onClick={() => setRateioProdutos((items) => items.filter((_, itemIndex) => itemIndex !== index))}>×</button>
                      </span>
                    </td>
                    {colKeys.map((eq) => (
                      <td key={eq} className="num">
                        {fmtMoney(row.equipamentos[eq])}
                      </td>
                    ))}
                    <td className="num">{fmtMoney(row.total)}</td>
                  </tr>
                ))}
                <tr className="resumo-transporte-total-geral">
                  <td>
                    <strong>Total</strong>
                  </td>
                  {colKeys.map((eq) => (
                    <td key={eq} className="num">
                      <strong>{fmtMoney(valorPorEquip[eq])}</strong>
                    </td>
                  ))}
                  <td className="num">
                    <strong>{fmtMoney(Object.values(valorPorEquip).reduce((acc, v) => acc + v, 0))}</strong>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      ) : !loading && !err ? (
        <p className="lead no-print">Nenhum dado encontrado para o período selecionado.</p>
      ) : null}
    </>
  );
}
