export type AnaliseGeralPeriodo = { inicio: string; fim: string };
export type AnaliseGeralPeriodos = { compactacao: AnaliseGeralPeriodo; tocos: AnaliseGeralPeriodo; tch: AnaliseGeralPeriodo };
export const ANALISE_GERAL_COLUNAS = [
  { key: "compactacao", label: "Compactação do solo" },
  { key: "tocos", label: "Tocos %" },
  { key: "tch", label: "TCH análise biométrica" },
] as const;

export function periodosAnaliseGeralPadrao(inicio: string, fim: string): AnaliseGeralPeriodos {
  return { compactacao: { inicio, fim }, tocos: { inicio, fim }, tch: { inicio, fim } };
}

export function validarPeriodosAnaliseGeral(periodos: AnaliseGeralPeriodos) {
  const valid = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
  for (const { key, label } of ANALISE_GERAL_COLUNAS) {
    const periodo = periodos[key];
    if (!valid(periodo.inicio) || !valid(periodo.fim) || periodo.inicio > periodo.fim) {
      throw Object.assign(new Error(`Informe um período válido para ${label}.`), { status: 400 });
    }
  }
  return periodos;
}

/** Também aceita os parâmetros antigos inicio/fim como período comum. */
export function resolverPeriodosAnaliseGeral(query: Record<string, unknown>): AnaliseGeralPeriodos {
  const text = (key: string) => typeof query[key] === "string" ? query[key] as string : "";
  const periodos = periodosAnaliseGeralPadrao(text("inicio"), text("fim"));
  for (const { key } of ANALISE_GERAL_COLUNAS) {
    periodos[key] = {
      inicio: text(`${key}Inicio`) || periodos[key].inicio,
      fim: text(`${key}Fim`) || periodos[key].fim,
    };
  }
  return validarPeriodosAnaliseGeral(periodos);
}
