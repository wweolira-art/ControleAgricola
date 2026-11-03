import { oracleNumber, oracleText, withOracle } from "../oracle.js";
import { gerarIndicadoresCombustivel } from "./combustivel.js";
import { validarPeriodoRendimento, type RendimentoData, type RendimentoOpcao } from "../../src/lib/rendimento-agricola.js";

export async function carregarRendimentoOpcoes() {
  return withOracle(async (conn) => {
    const operacoes = await conn.execute("SELECT cod_operacaoagricola AS codigo, MAX(descricao) descricao FROM rh.operacaoagricola GROUP BY cod_operacaoagricola ORDER BY descricao");
    const objetos = await conn.execute("SELECT cod_objetocusto AS codigo, MAX(descricao) descricao FROM custo.objetocusto GROUP BY cod_objetocusto ORDER BY descricao");
    const map = (rows: unknown[]) => rows.map((raw) => {
      const row = raw as Record<string, unknown>;
      return { codigo: oracleNumber(row, "CODIGO", "codigo") ?? 0, descricao: oracleText(row, "DESCRICAO", "descricao") || "Sem descrição" };
    }).filter((row) => row.codigo > 0) as RendimentoOpcao[];
    return { operacoes: map(operacoes.rows ?? []), objetosCusto: map(objetos.rows ?? []) };
  });
}

export async function carregarRendimentoAgricola(inicio: string, fim: string): Promise<Omit<RendimentoData, "parametros">> {
  validarPeriodoRendimento(inicio, fim);
  const fonte = await gerarIndicadoresCombustivel({ dataInicio: inicio, dataFim: fim, incluirObjetoCusto: true });
  // O rendimento ha/h e consumo L/h só se aplicam a equipamentos por horímetro.
  const dados = fonte.dados.filter((row) => row.funcionaPorHora).map((row) => ({ ...row,
    codOperacaoAgricola: row.codOperacaoAgricola && row.codOperacaoAgricola > 0 ? row.codOperacaoAgricola : null,
    codObjetoCusto: row.codObjetoCusto && row.codObjetoCusto > 0 ? row.codObjetoCusto : null,
  }));
  const semOperacao = dados.filter((row) => row.codOperacaoAgricola == null).length;
  const semObjeto = dados.filter((row) => row.codObjetoCusto == null).length;
  const avisos: string[] = [];
  if (semOperacao) avisos.push(`${semOperacao} abastecimento(s) sem operação identificada no intervalo entre abastecimentos.`);
  if (semObjeto) avisos.push(`${semObjeto} abastecimento(s) sem objeto de custo identificado; exibidos em grupo separado.`);
  return { inicio, fim, atualizadoEm: new Date().toISOString(), dados, avisos };
}
