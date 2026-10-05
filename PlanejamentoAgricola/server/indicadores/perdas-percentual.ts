export type AmostraPerdaPercentual = {
  perdas: number;
  /** TCH lançado na ordem/talhão. Zero quando o talhão ainda não tem TCH. */
  tch: number | null;
  /** TCH da estimativa do talhão, usado no percentual quando o TCH lançado está zerado. */
  tchPlanejado: number | null;
  encerrado?: boolean;
};

function roundPct(n: number) {
  return Math.round((n || 0) * 100) / 100;
}

/**
 * % Perdas estimado do formulário 9117.
 * O total do período soma o TCH planejado só das amostras sem TCH lançado
 * e divide o total de perdas por esse TCH mais as perdas.
 * No período 01/09/2026–03/10/2026 isso fecha em 5,51.
 */
export function pctPerdasEstimadoPeriodo(samples: AmostraPerdaPercentual[]) {
  let perdas = 0;
  let tch = 0;
  for (const sample of samples) {
    const qtd = Number.isFinite(sample.perdas) ? sample.perdas : 0;
    perdas += qtd;
    if (!((sample.tch ?? 0) > 0)) tch += sample.tchPlanejado ?? 0;
  }
  if (perdas <= 0 && tch <= 0) return null;
  return roundPct((perdas / (tch + perdas)) * 100);
}

/**
 * % do relatório por operador/equipamento.
 * Cada amostra com TCH lançado usa perdas / (TCH + perdas).
 * Amostra sem TCH entra como 0. O resultado é a média dessas amostras.
 */
export function pctPerdaMediaAmostras(samples: { perdas: number; tch: number | null }[]) {
  if (!samples.length) return null;
  const soma = samples.reduce((acc, sample) => {
    const perdas = Number.isFinite(sample.perdas) ? sample.perdas : 0;
    const tch = sample.tch ?? 0;
    if (!(tch > 0)) return acc;
    return acc + (perdas / (tch + perdas)) * 100;
  }, 0);
  return roundPct(soma / samples.length);
}

export function pctPerdasLinha(perdas: number, tch: number | null, tchPlanejado: number | null) {
  const base = (tch ?? 0) > 0 ? (tch ?? 0) : (tchPlanejado ?? 0);
  if (perdas <= 0 && base <= 0) return null;
  if (base <= 0) return perdas > 0 ? 100 : 0;
  return roundPct((perdas / (base + perdas)) * 100);
}

/** % real só entra quando a ordem/talhão está encerrado. Caso contrário o formulário mostra 0. */
export function pctPerdasRealLinha(perdas: number, tch: number | null, encerrado: boolean) {
  if (!encerrado) return 0;
  if (!((tch ?? 0) > 0)) return perdas > 0 ? 100 : 0;
  return roundPct((perdas / ((tch ?? 0) + perdas)) * 100);
}

export function pctPerdasRealPeriodo(samples: AmostraPerdaPercentual[]) {
  const fechadas = samples.filter((sample) => sample.encerrado);
  if (!fechadas.length) return 0;
  let perdas = 0;
  let tch = 0;
  for (const sample of fechadas) {
    perdas += sample.perdas;
    tch += sample.tch ?? 0;
  }
  if (perdas <= 0 && tch <= 0) return 0;
  return roundPct((perdas / (tch + perdas)) * 100);
}
