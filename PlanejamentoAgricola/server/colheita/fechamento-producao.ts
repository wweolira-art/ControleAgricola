import { db } from "../db.js";
import { listarEntradaCanaCaminhao } from "./entrada-cana-caminhao-list.js";
import { listarEntradaCanaMaquinaList } from "./entrada-cana-maquina-list.js";

type GrupoProducao = "colhedeiras" | "tratores";
type OpKey = "op01" | "op02" | "op03" | "op04" | "op05" | "op06" | "op07" | "op08" | "op09" | "op10" | "op11" | "op12";
const GRUPOS: { grupo: GrupoProducao; ops: OpKey[] }[] = [
  { grupo: "colhedeiras", ops: ["op01", "op02", "op03", "op04"] },
  { grupo: "tratores", ops: ["op05", "op06", "op07", "op08", "op09", "op10", "op11", "op12"] },
];

export type CadastroFuncionarioEquipamento = {
  id: number; codFuncionario: string; equipamento: string; dataInicial: string; dataFinal: string | null;
};
export type FaixaPrecoProducao = {
  id: number; grupo: GrupoProducao | "todos"; equipamento: string | null; ordem: number; faixaToneladas: number;
  precoTonelada: number; dataInicial: string; dataFinal: string | null;
};

const asText = (value: unknown) => String(value ?? "").trim();
const asNumber = (value: unknown) => {
  const number = Number(String(value ?? "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(number) ? number : 0;
};

function parseOp(value: string | null | undefined) {
  const text = asText(value);
  if (!text) return { codigo: "", viagens: 0 };
  const match = text.match(/^(.+?)\s*-\s*(.+)$/);
  return { codigo: asText(match?.[1] ?? text), viagens: asNumber(match?.[2]) };
}

function rowCadastro(row: Record<string, unknown>): CadastroFuncionarioEquipamento {
  return {
    id: Number(row.id), codFuncionario: asText(row.cod_funcionario), equipamento: asText(row.equipamento),
    dataInicial: asText(row.data_inicial), dataFinal: row.data_final == null ? null : asText(row.data_final),
  };
}
function rowFaixa(row: Record<string, unknown>): FaixaPrecoProducao {
  const grupo = asText(row.grupo);
  return {
    id: Number(row.id), grupo: grupo === "colhedeiras" || grupo === "tratores" ? grupo : "todos",
    equipamento: row.equipamento == null || asText(row.equipamento) === "" ? null : asText(row.equipamento), ordem: Math.max(1, Number(row.ordem ?? 1)),
    faixaToneladas: Number(row.meta_inicial ?? 0), precoTonelada: Number(row.preco_tonelada ?? 0),
    dataInicial: asText(row.data_inicial), dataFinal: row.data_final == null ? null : asText(row.data_final),
  };
}

export function listarCadastrosFuncionarioEquipamento() {
  return (db.prepare("SELECT * FROM producao_funcionario_equipamento ORDER BY cod_funcionario, data_inicial DESC, id DESC").all() as Record<string, unknown>[]).map(rowCadastro);
}
export function salvarCadastroFuncionarioEquipamento(input: Partial<CadastroFuncionarioEquipamento>) {
  const codFuncionario = asText(input.codFuncionario);
  const equipamento = asText(input.equipamento);
  const dataInicial = asText(input.dataInicial);
  const dataFinal = asText(input.dataFinal) || null;
  if (!codFuncionario || !equipamento || !dataInicial) throw new Error("Informe código do funcionário, equipamento e data inicial.");
  if (dataFinal && dataFinal < dataInicial) throw new Error("A data final não pode ser anterior à data inicial.");
  if (input.id) {
    db.prepare("UPDATE producao_funcionario_equipamento SET cod_funcionario=?, equipamento=?, data_inicial=?, data_final=? WHERE id=?")
      .run(codFuncionario, equipamento, dataInicial, dataFinal, input.id);
    return { id: input.id };
  }
  return { id: Number(db.prepare("INSERT INTO producao_funcionario_equipamento (cod_funcionario, equipamento, data_inicial, data_final) VALUES (?, ?, ?, ?)")
    .run(codFuncionario, equipamento, dataInicial, dataFinal).lastInsertRowid) };
}
export function excluirCadastroFuncionarioEquipamento(id: number) {
  db.prepare("DELETE FROM producao_funcionario_equipamento WHERE id=?").run(id);
}

export function listarFaixasPrecoProducao() {
  return (db.prepare("SELECT * FROM producao_preco_faixas ORDER BY grupo, equipamento, ordem, data_inicial DESC, id DESC").all() as Record<string, unknown>[]).map(rowFaixa);
}
export function salvarFaixaPrecoProducao(input: Partial<FaixaPrecoProducao>) {
  const grupo = input.grupo === "colhedeiras" || input.grupo === "tratores" ? input.grupo : "todos";
  const equipamento = asText(input.equipamento) || null;
  const ordem = Math.max(1, Math.floor(Number(input.ordem)) || 1);
  const dataInicial = asText(input.dataInicial);
  const dataFinal = asText(input.dataFinal) || null;
  const faixaToneladas = Number(input.faixaToneladas);
  const precoTonelada = Number(input.precoTonelada);
  if (!dataInicial || !Number.isFinite(faixaToneladas) || faixaToneladas < 0 || !Number.isFinite(precoTonelada) || precoTonelada < 0) {
    throw new Error("Informe faixa em toneladas, período e preço por tonelada válidos.");
  }
  if (dataFinal && dataFinal < dataInicial) throw new Error("A data final não pode ser anterior à data inicial.");
  // As colunas antigas de meta permanecem na base somente por compatibilidade.
  const values = [grupo, equipamento, ordem, `Faixa ${faixaToneladas.toLocaleString("pt-BR")} t`, faixaToneladas, null, precoTonelada, dataInicial, dataFinal];
  if (input.id) {
    db.prepare("UPDATE producao_preco_faixas SET grupo=?, equipamento=?, ordem=?, descricao=?, meta_inicial=?, meta_final=?, preco_tonelada=?, data_inicial=?, data_final=? WHERE id=?")
      .run(...values, input.id);
    return { id: input.id };
  }
  return { id: Number(db.prepare("INSERT INTO producao_preco_faixas (grupo, equipamento, ordem, descricao, meta_inicial, meta_final, preco_tonelada, data_inicial, data_final) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(...values).lastInsertRowid) };
}
export function excluirFaixaPrecoProducao(id: number) { db.prepare("DELETE FROM producao_preco_faixas WHERE id=?").run(id); }

function vigente<T extends { dataInicial: string; dataFinal: string | null }>(items: T[], inicio: string, fim: string) {
  return items.filter((item) => item.dataInicial <= fim && (!item.dataFinal || item.dataFinal >= inicio));
}

export async function gerarFechamentoProducao(dataInicio: string, dataFim: string) {
  if (!dataInicio || !dataFim || dataFim < dataInicio) throw new Error("Informe um período válido para o fechamento.");
  const [entrada, colhedeiras] = await Promise.all([
    listarEntradaCanaCaminhao({ dataInicio, dataFim }),
    listarEntradaCanaMaquinaList({ dataInicio, dataFim, somenteColhedeiras: true }),
  ]);
  const totalColhedeiras = colhedeiras.resumo.pesoTotal;
  const cadastros = vigente(listarCadastrosFuncionarioEquipamento(), dataInicio, dataFim);
  const faixas = vigente(listarFaixasPrecoProducao(), dataInicio, dataFim);
  const linhas: Array<{ grupo: GrupoProducao; codFuncionario: string; funcionario: string; toneladasParaFaixa: number; toneladasInformadas: number }> = [];
  for (const { grupo, ops } of GRUPOS) {
    const porFuncionario = new Map<string, number>();
    for (const row of entrada.dados) {
      const operacoes = ops.map((op) => parseOp(row[op])).filter((op) => op.codigo);
      const viagens = operacoes.reduce((sum, op) => sum + op.viagens, 0);
      if (!(viagens > 0)) continue;
      const toneladaViagem = (row.pesoLiquido ?? 0) / viagens;
      for (const op of operacoes) porFuncionario.set(op.codigo, (porFuncionario.get(op.codigo) ?? 0) + op.viagens * toneladaViagem);
    }
    const totalInformado = [...porFuncionario.values()].reduce((sum, value) => sum + value, 0);
    for (const [codFuncionario, toneladasParaFaixa] of porFuncionario) {
      linhas.push({
        grupo,
        codFuncionario,
        funcionario: entrada.funcionarios[codFuncionario] ?? "",
        toneladasParaFaixa,
        toneladasInformadas: totalInformado > 0 ? totalColhedeiras * toneladasParaFaixa / totalInformado : 0,
      });
    }
  }
  const dados = linhas.map((linha) => {
    const cadastro = cadastros.filter((item) => item.codFuncionario === linha.codFuncionario)
      .sort((a, b) => b.dataInicial.localeCompare(a.dataInicial))[0] ?? null;
    const candidatas = faixas.filter((faixa) =>
      (faixa.grupo === "todos" || faixa.grupo === linha.grupo) &&
      (!faixa.equipamento || faixa.equipamento === cadastro?.equipamento),
    );
    const maiorEspecificidade = Math.max(
      -1,
      ...candidatas.map((faixa) => Number(Boolean(faixa.equipamento)) * 2 + Number(faixa.grupo !== "todos")),
    );
    const escopo = candidatas
      .filter((faixa) => Number(Boolean(faixa.equipamento)) * 2 + Number(faixa.grupo !== "todos") === maiorEspecificidade)
      .sort((a, b) => a.ordem - b.ordem || a.faixaToneladas - b.faixaToneladas || b.dataInicial.localeCompare(a.dataInicial) || b.id - a.id);
    // A primeira faixa é o preço-base. Cada faixa seguinte passa a valer
    // quando a tonelagem do operador ultrapassa a tonelagem da faixa anterior.
    let faixa = escopo[0] ?? null;
    for (let index = 1; index < escopo.length; index += 1) {
      if (linha.toneladasParaFaixa > escopo[index - 1].faixaToneladas) faixa = escopo[index];
      else break;
    }
    const precoTonelada = faixa?.precoTonelada ?? 0;
    return {
      ...linha, equipamento: cadastro?.equipamento ?? null, faixa: faixa ? `${faixa.ordem}ª faixa (${faixa.faixaToneladas.toLocaleString("pt-BR")} t)` : "Sem faixa atingida",
      precoTonelada, producao: linha.toneladasInformadas * precoTonelada,
    };
  }).sort((a, b) => a.grupo.localeCompare(b.grupo) || String(a.equipamento ?? "").localeCompare(String(b.equipamento ?? ""), "pt-BR", { numeric: true }) || a.funcionario.localeCompare(b.funcionario));
  return { periodo: { dataInicio, dataFim }, totalColhedeiras, totalProducao: dados.reduce((sum, row) => sum + row.producao, 0), dados };
}
