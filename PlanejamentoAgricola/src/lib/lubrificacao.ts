export type LubrificacaoSituacao = "em_dia" | "a_vencer" | "vencido" | "em_execucao" | "sem_plano";

export type LubrificacaoFrotaItem = {
  codEquipamento: number;
  descricao: string | null;
};

export type LubrificacaoEventoDia = {
  codEquipamento: number;
  data: string;
  quantidade: number;
};

export type LubrificacaoPontoPlano = {
  codEquipamento: number;
  limiteHs: number;
};

/** Dias da semana: 0 domingo, 1 segunda-feira, ... 6 sábado. */
export type LubrificacaoProgramacao = {
  codEquipamento: number;
  diasSemana: number[];
};

export const DIAS_LUBRIFICACAO_PADRAO = [1, 3, 5] as const;

export type LubrificacaoHoraDia = {
  codEquipamento: number;
  data: string;
  horas: number;
};

export type LubrificacaoStatusResumo = {
  ok: number;
  aVencer: number;
  vencido: number;
  semPlano: number;
};

export type LubrificacaoComponenteVencimento = {
  codEquipamento: number;
  descricao: string | null;
  codComponente: number;
  componenteDescricao: string | null;
  limiteHs: number | null;
  horasAtuais: number | null;
  horasNaUltima: number | null;
  horasRodadas: number | null;
  horasRestantes: number | null;
  dataUltima: string | null;
  qtdRealizada: number;
  litrosRealizados: number | null;
  status: LubrificacaoSituacao;
};

export type LubrificacaoRealizadoMes = {
  codEquipamento: number;
  codComponente: number;
  mes: string;
  qtd: number;
  litros: number;
};

export type LubrificacaoMensal = {
  mes: string;
  label: string;
  realizado: number;
  meta: number;
  previsto: number;
};

export type LubrificacaoDashboardData = {
  atualizadoEm: string;
  ano: number;
  frota: LubrificacaoFrotaItem[];
  eventos: LubrificacaoEventoDia[];
  pontos: LubrificacaoPontoPlano[];
  programacoes: LubrificacaoProgramacao[];
  horas: LubrificacaoHoraDia[];
  status: LubrificacaoStatusResumo;
  vencimentos: LubrificacaoComponenteVencimento[];
  realizados: LubrificacaoRealizadoMes[];
};

export const LUBRIFICACAO_ALERTA_PCT = 0.9;

export function lubrificacaoStatusPonto(
  horasRodadas: number | null,
  limiteHs: number | null,
  alertaPct = LUBRIFICACAO_ALERTA_PCT,
): LubrificacaoSituacao {
  if (limiteHs == null || !(limiteHs > 0) || horasRodadas == null) return "sem_plano";
  if (horasRodadas >= limiteHs) return "vencido";
  if (horasRodadas >= limiteHs * alertaPct) return "a_vencer";
  return "em_dia";
}

export function lubrificacaoHorasRestantes(horasRodadas: number | null, limiteHs: number | null) {
  if (horasRodadas == null || limiteHs == null || !(limiteHs > 0)) return null;
  return Math.round((limiteHs - horasRodadas) * 10) / 10;
}

export function resumoVencimentosLubrificacao(itens: Array<{ status: LubrificacaoSituacao }>): LubrificacaoStatusResumo {
  const status: LubrificacaoStatusResumo = { ok: 0, aVencer: 0, vencido: 0, semPlano: 0 };
  for (const item of itens) {
    if (item.status === "vencido") status.vencido += 1;
    else if (item.status === "a_vencer") status.aVencer += 1;
    else if (item.status === "sem_plano") status.semPlano += 1;
    else status.ok += 1;
  }
  return status;
}

const STATUS_ORDEM: Record<LubrificacaoSituacao, number> = {
  vencido: 0,
  a_vencer: 1,
  em_dia: 2,
  em_execucao: 3,
  sem_plano: 4,
};

export function ordenarVencimentosLubrificacao(itens: LubrificacaoComponenteVencimento[]) {
  return [...itens].sort((a, b) => {
    const ordem = STATUS_ORDEM[a.status] - STATUS_ORDEM[b.status];
    if (ordem) return ordem;
    const ra = a.horasRestantes ?? Number.POSITIVE_INFINITY;
    const rb = b.horasRestantes ?? Number.POSITIVE_INFINITY;
    if (ra !== rb) return ra - rb;
    return a.codEquipamento - b.codEquipamento || a.codComponente - b.codComponente;
  });
}

const MES_CURTO = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MES_CHART = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

export function lubrificacaoSituacaoLabel(status: LubrificacaoSituacao) {
  switch (status) {
    case "vencido":
      return "Vencido";
    case "a_vencer":
      return "A vencer";
    case "em_dia":
      return "OK";
    case "em_execucao":
      return "Em execução";
    default:
      return "Sem histórico";
  }
}

export function lubrificacaoMesLabel(mes: string) {
  const [y, m] = mes.split("-");
  const idx = Number(m) - 1;
  return idx >= 0 && idx < 12 ? `${MES_CURTO[idx]}/${y}` : mes;
}

export function lubrificacaoMesChartLabel(mes: string) {
  const idx = Number(mes.slice(5, 7)) - 1;
  return idx >= 0 && idx < 12 ? MES_CHART[idx]! : mes;
}

export function addIsoDays(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function isValidIsoDay(value: string) {
  const match = String(value ?? "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return date.getFullYear() === Number(year) && date.getMonth() === Number(month) - 1 && date.getDate() === Number(day);
}

export function inicioMes(ano: number, mes: number) {
  return `${ano}-${String(mes).padStart(2, "0")}-01`;
}

export function janelaMes(ano: number, mes: number) {
  const inicio = inicioMes(ano, mes);
  const last = new Date(ano, mes, 0).getDate();
  return { inicio, fim: `${ano}-${String(mes).padStart(2, "0")}-${String(last).padStart(2, "0")}` };
}

export function chaveMesLubrificacao(ano: number, mes: number) {
  return `${ano}-${String(mes).padStart(2, "0")}`;
}

export function indexarRealizadosMes(realizados: LubrificacaoRealizadoMes[]) {
  const map = new Map<string, LubrificacaoRealizadoMes>();
  for (const row of realizados) {
    map.set(`${row.codEquipamento}:${row.codComponente}:${row.mes}`, row);
  }
  return map;
}

export function realizadoComponenteNoMes(
  realizados: LubrificacaoRealizadoMes[] | Map<string, LubrificacaoRealizadoMes>,
  codEquipamento: number,
  codComponente: number,
  ano: number,
  mes: number,
): { qtd: number; litros: number | null } {
  const index = Array.isArray(realizados) ? indexarRealizadosMes(realizados) : realizados;
  const row = index.get(`${codEquipamento}:${codComponente}:${chaveMesLubrificacao(ano, mes)}`);
  return {
    qtd: row?.qtd ?? 0,
    litros: row && row.litros > 0 ? row.litros : null,
  };
}

export function diasDoMes(ano: number, mes: number) {
  const { inicio, fim } = janelaMes(ano, mes);
  const out: string[] = [];
  for (let d = inicio; d <= fim; d = addIsoDays(d, 1)) out.push(d);
  return out;
}

export function eventosNaJanela(eventos: LubrificacaoEventoDia[], inicio: string, fim: string) {
  return eventos.filter((ev) => ev.data >= inicio && ev.data <= fim);
}

export function realizadoNaJanela(eventos: LubrificacaoEventoDia[], inicio: string, fim: string) {
  return eventosNaJanela(eventos, inicio, fim).reduce((acc, ev) => acc + ev.quantidade, 0);
}

/** Um dia realizado corresponde a uma máquina lubrificada no dia, mesmo que
 * existam vários componentes/lubrificações lançados para a mesma máquina. */
export function diasRealizadosNaJanela(eventos: LubrificacaoEventoDia[], inicio: string, fim: string) {
  return new Set(
    eventosNaJanela(eventos, inicio, fim)
      .filter((evento) => evento.quantidade > 0)
      .map((evento) => `${evento.codEquipamento}:${evento.data}`),
  ).size;
}

export function metaNaJanela(horas: LubrificacaoHoraDia[], pontos: LubrificacaoPontoPlano[], inicio: string, fim: string) {
  const fatorPorEquip = new Map<number, number>();
  for (const ponto of pontos) {
    if (!(ponto.limiteHs > 0)) continue;
    fatorPorEquip.set(ponto.codEquipamento, (fatorPorEquip.get(ponto.codEquipamento) ?? 0) + 1 / ponto.limiteHs);
  }
  let meta = 0;
  for (const row of horas) {
    if (row.data < inicio || row.data > fim) continue;
    const fator = fatorPorEquip.get(row.codEquipamento);
    if (!fator) continue;
    meta += row.horas * fator;
  }
  return Math.round(meta * 10) / 10;
}

/** Meta de lubrificações baseada nos dias definidos para cada equipamento. */
export function metaDiasLubrificacao(
  programacoes: LubrificacaoProgramacao[],
  inicio: string,
  fim: string,
) {
  // Os inputs de data emitem temporariamente uma string vazia enquanto o
  // usuário troca o período. Não percorra dias até que o intervalo seja válido.
  if (!isValidIsoDay(inicio) || !isValidIsoDay(fim) || inicio > fim) return 0;
  const diasPorEquipamento = new Map<number, Set<number>>();
  for (const programacao of programacoes) {
    const dias = programacao.diasSemana.filter((dia) => Number.isInteger(dia) && dia >= 0 && dia <= 6);
    if (dias.length) diasPorEquipamento.set(programacao.codEquipamento, new Set(dias));
  }

  const agora = new Date();
  const hoje = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-${String(agora.getDate()).padStart(2, "0")}`;
  // Não projeta a meta para os dias que ainda não aconteceram. Assim, no
  // mês corrente o planejado acompanha apenas o período já transcorrido.
  const fimConsiderado = fim < hoje ? fim : hoje;
  if (inicio > fimConsiderado) return 0;

  let meta = 0;
  for (let data = inicio; data <= fimConsiderado; data = addIsoDays(data, 1)) {
    const diaSemana = new Date(`${data}T12:00:00`).getDay();
    for (const dias of diasPorEquipamento.values()) {
      if (dias.has(diaSemana)) meta += 1;
    }
  }
  return meta;
}

export function shiftMes(ano: number, mes: number, delta: number) {
  const d = new Date(ano, mes - 1 + delta, 1);
  return { ano: d.getFullYear(), mes: d.getMonth() + 1 };
}

export function montarMensalLubrificacao(
  eventos: LubrificacaoEventoDia[],
  horas: LubrificacaoHoraDia[],
  pontos: LubrificacaoPontoPlano[],
  ano: number,
  mes: number,
  janelas = 7,
  programacoes: LubrificacaoProgramacao[] = [],
) {
  const start = shiftMes(ano, mes, -(janelas - 2));
  const rows: LubrificacaoMensal[] = [];
  for (let i = 0; i < janelas; i++) {
    const cur = shiftMes(start.ano, start.mes, i);
    const prev = shiftMes(cur.ano, cur.mes, -1);
    const janela = janelaMes(cur.ano, cur.mes);
    const janelaPrev = janelaMes(prev.ano, prev.mes);
    const mesKey = `${cur.ano}-${String(cur.mes).padStart(2, "0")}`;
    rows.push({
      mes: mesKey,
      label: lubrificacaoMesChartLabel(mesKey),
      realizado: diasRealizadosNaJanela(eventos, janela.inicio, janela.fim),
      meta: programacoes.length
        ? metaDiasLubrificacao(programacoes, janela.inicio, janela.fim)
        : metaNaJanela(horas, pontos, janela.inicio, janela.fim),
      previsto: diasRealizadosNaJanela(eventos, janelaPrev.inicio, janelaPrev.fim),
    });
  }
  return rows;
}

export function kpisLubrificacao(
  eventos: LubrificacaoEventoDia[],
  horas: LubrificacaoHoraDia[],
  pontos: LubrificacaoPontoPlano[],
  ano: number,
  mes: number,
  programacoes: LubrificacaoProgramacao[] = [],
) {
  const janela = janelaMes(ano, mes);
  const prev = shiftMes(ano, mes, -1);
  const janelaPrev = janelaMes(prev.ano, prev.mes);
  const quantidadeRealizada = realizadoNaJanela(eventos, janela.inicio, janela.fim);
  const relativoMesAnterior = realizadoNaJanela(eventos, janelaPrev.inicio, janelaPrev.fim);
  const meta = programacoes.length
    ? metaDiasLubrificacao(programacoes, janela.inicio, janela.fim)
    : metaNaJanela(horas, pontos, janela.inicio, janela.fim);
  return {
    aderencia: meta > 0 ? (quantidadeRealizada / meta) * 100 : null,
    meta,
    relativoMesAnterior,
    quantidadeRealizada,
    mediaLubMaqMes: quantidadeRealizada,
    janela,
  };
}

/**
 * Indicadores de adesão por agenda diária. A comparação usa um dia realizado
 * por máquina, e não a quantidade de componentes lançados no mesmo dia.
 * Assim, a meta de dias programados é comparável ao realizado.
 */
export function kpisLubrificacaoPorPeriodo(
  eventos: LubrificacaoEventoDia[],
  programacoes: LubrificacaoProgramacao[],
  inicio: string,
  fim: string,
) {
  const eventosPeriodo = eventosNaJanela(eventos, inicio, fim);
  const diasRealizados = new Set(eventosPeriodo.map((evento) => `${evento.codEquipamento}:${evento.data}`)).size;
  const lancamentosRealizados = eventosPeriodo.reduce((total, evento) => total + evento.quantidade, 0);
  const meta = metaDiasLubrificacao(programacoes, inicio, fim);
  return {
    aderencia: meta > 0 ? (diasRealizados / meta) * 100 : null,
    meta,
    diasRealizados,
    lancamentosRealizados,
    pendentes: Math.max(0, meta - diasRealizados),
    janela: { inicio, fim },
  };
}
