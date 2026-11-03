export type RendimentoOpcao = { codigo: number; descricao: string };
export type RendimentoParametro = {
  codObjetoCusto: number; objetoCusto: string; codOperacao: number; operacao: string;
  rendimentoPrevisto: number; consumoPrevisto: number;
};
export type RendimentoLancamento = {
  origem: string; idAbastecimento: string; dataAbastecimento: string | null; dataOperacao?: string | null;
  codEquipamento: number | null; codOperacaoAgricola: number | null; descricaoOperacao: string | null;
  codObjetoCusto?: number | null; objetoCusto?: string | null;
  areaHa: number; horasTrabalho: number; qtdeLitros: number;
};
export type RendimentoResumo = {
  chave: string; codObjetoCusto: number | null; objetoCusto: string;
  codOperacao: number | null; operacao: string; areaHa: number; horas: number; litros: number;
  abastecimentos: number; rendimentoPrevisto: number | null; consumoPrevisto: number | null;
  rendimentoRealizado: number | null; consumoRealizado: number | null; litrosPorHa: number | null;
};
export type RendimentoOpcoes = {
  operacoes: RendimentoOpcao[]; objetosCusto: RendimentoOpcao[];
  parametros: RendimentoParametro[]; podeEditar: boolean;
};
export type RendimentoData = {
  inicio: string; fim: string; atualizadoEm: string; dados: RendimentoLancamento[];
  parametros: RendimentoParametro[]; avisos: string[];
};
export const RENDIMENTO_PERMISSION = "nativeTab:indicadores:rendimento-agricola";
export const rendimentoChave = (objeto: number | null | undefined, operacao: number | null) => `${objeto ?? "sem"}:${operacao ?? "sem"}`;

export function validarPeriodoRendimento(inicio: string, fim: string) {
  const valido = (dia: string) => /^\d{4}-\d{2}-\d{2}$/.test(dia) && Number.isFinite(Date.parse(`${dia}T12:00:00Z`)) && new Date(`${dia}T12:00:00Z`).toISOString().slice(0, 10) === dia;
  if (!valido(inicio) || !valido(fim) || inicio > fim) throw Object.assign(new Error("Informe um período válido, com início anterior ou igual ao fim."), { status: 400 });
}

export function validarParametroRendimento(input: unknown): Pick<RendimentoParametro, "codObjetoCusto" | "codOperacao" | "rendimentoPrevisto" | "consumoPrevisto"> {
  const value = input as RendimentoParametro | null;
  if (!value || !Number.isSafeInteger(value.codObjetoCusto) || value.codObjetoCusto <= 0 || !Number.isSafeInteger(value.codOperacao) || value.codOperacao <= 0) {
    throw Object.assign(new Error("Selecione o objeto de custo e a operação cadastrados."), { status: 400 });
  }
  if (!Number.isFinite(value.rendimentoPrevisto) || value.rendimentoPrevisto <= 0 || !Number.isFinite(value.consumoPrevisto) || value.consumoPrevisto <= 0) {
    throw Object.assign(new Error("Informe rendimento (ha/h) e consumo (L/h) previstos maiores que zero."), { status: 400 });
  }
  return { codObjetoCusto: value.codObjetoCusto, codOperacao: value.codOperacao, rendimentoPrevisto: value.rendimentoPrevisto, consumoPrevisto: value.consumoPrevisto };
}

/** Taxas calculadas sobre os totais, sem tirar a média das taxas individuais. */
export function resumirRendimento(dados: RendimentoLancamento[], parametros: RendimentoParametro[]): RendimentoResumo[] {
  const grupos = new Map<string, RendimentoResumo>();
  const metas = new Map(parametros.map((p) => [rendimentoChave(p.codObjetoCusto, p.codOperacao), p]));
  const iniciar = (objeto: number | null, objetoNome: string | null | undefined, operacao: number | null, operacaoNome: string | null) => {
    const chave = rendimentoChave(objeto, operacao);
    let row = grupos.get(chave);
    if (!row) {
      const meta = metas.get(chave);
      row = { chave, codObjetoCusto: objeto, objetoCusto: objetoNome || meta?.objetoCusto || "Sem objeto de custo",
        codOperacao: operacao, operacao: operacaoNome || meta?.operacao || "Sem operação identificada",
        areaHa: 0, horas: 0, litros: 0, abastecimentos: 0,
        rendimentoPrevisto: meta?.rendimentoPrevisto ?? null, consumoPrevisto: meta?.consumoPrevisto ?? null,
        rendimentoRealizado: null, consumoRealizado: null, litrosPorHa: null };
      grupos.set(chave, row);
    }
    return row;
  };
  const vistos = new Set<string>();
  for (const item of dados) {
    const id = `${item.origem}:${item.idAbastecimento}`;
    if (vistos.has(id)) continue;
    vistos.add(id);
    const row = iniciar(item.codObjetoCusto ?? null, item.objetoCusto, item.codOperacaoAgricola, item.descricaoOperacao);
    row.areaHa += item.areaHa;
    row.horas += item.horasTrabalho;
    row.litros += item.qtdeLitros;
    row.abastecimentos++;
  }
  for (const p of parametros) iniciar(p.codObjetoCusto, p.objetoCusto, p.codOperacao, p.operacao);
  for (const row of grupos.values()) {
    row.rendimentoRealizado = row.horas > 0 ? row.areaHa / row.horas : null;
    row.consumoRealizado = row.horas > 0 ? row.litros / row.horas : null;
    row.litrosPorHa = row.areaHa > 0 ? row.litros / row.areaHa : null;
  }
  return [...grupos.values()].sort((a, b) => a.objetoCusto.localeCompare(b.objetoCusto, "pt-BR") || a.operacao.localeCompare(b.operacao, "pt-BR"));
}
