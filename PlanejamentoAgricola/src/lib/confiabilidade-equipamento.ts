export type FaixaConfiabilidade = "excelente" | "atencao" | "critico";

export const CONFIABILIDADE_EXCELENTE = 85;
export const CONFIABILIDADE_ATENCAO = 70;

/** Horizonte da fórmula em horas: 1 dia estimado = 22 h de operação. */
export const HORAS_DIA_CONFIABILIDADE = 22;

export function horasHorizonteConfiabilidade(diasEstimados: number) {
  if (!Number.isFinite(diasEstimados) || !(diasEstimados > 0)) return 0;
  return diasEstimados * HORAS_DIA_CONFIABILIDADE;
}

/**
 * Confiabilidade em t horas, falha constante: e^(-t / MTBF) × 100.
 * Sem falha e com horas de operação, assume 100%.
 */
export function pctConfiabilidade(
  mtbfHoras: number | null | undefined,
  diasEstimados: number,
  opts?: { semFalha?: boolean; operou?: boolean },
) {
  if (opts?.semFalha && opts.operou) return 100;
  if (mtbfHoras == null || !(mtbfHoras > 0)) return null;
  const t = horasHorizonteConfiabilidade(diasEstimados);
  if (!(t > 0)) return null;
  return Math.round(Math.exp(-t / mtbfHoras) * 10000) / 100;
}

export function faixaConfiabilidade(pct: number | null | undefined): FaixaConfiabilidade | null {
  if (pct == null || !Number.isFinite(pct)) return null;
  if (pct >= CONFIABILIDADE_EXCELENTE) return "excelente";
  if (pct >= CONFIABILIDADE_ATENCAO) return "atencao";
  return "critico";
}

export function confiabilidadeFaixaLabel(faixa: FaixaConfiabilidade | null) {
  if (faixa === "excelente") return "Excelente";
  if (faixa === "atencao") return "Atenção";
  if (faixa === "critico") return "Crítico";
  return "";
}
