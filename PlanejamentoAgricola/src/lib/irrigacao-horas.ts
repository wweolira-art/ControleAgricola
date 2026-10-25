export const IRRIGACAO_CORTE_HORAS = "2026-10-15";
export type IrrigacaoParadaDia = { dia: string; horas: number };

export function horasParadasHistoricas(paradas: Iterable<IrrigacaoParadaDia>): number {
  let total = 0;
  for (const parada of paradas) if (parada.dia && parada.dia < IRRIGACAO_CORTE_HORAS) total += parada.horas;
  return total;
}

/** The recorded duration before the cutoff includes downtime; newer durations are already net. */
export function horasTrabalhadasControle(horasRegistradas: number, paradas: Iterable<IrrigacaoParadaDia>): number {
  return horasRegistradas - horasParadasHistoricas(paradas);
}

export function horasFixasHistoricasControle(dataInicio: string, dataFim: string): number {
  const day = new Date(`${dataInicio}T00:00:00Z`);
  const end = new Date(`${dataFim}T00:00:00Z`);
  const cutoff = new Date(`${IRRIGACAO_CORTE_HORAS}T00:00:00Z`);
  let total = 0;
  for (; day <= end && day < cutoff; day.setUTCDate(day.getUTCDate() + 1)) {
    total += day.getUTCDay() === 0 || day.getUTCDay() === 6 ? 24 : 20;
  }
  return total;
}

export function horasTotaisControle(dataInicio: string, dataFim: string, horasRegistradas: number, horasRegistradasHistoricas: number, paradas: Iterable<IrrigacaoParadaDia>): number {
  let paradasPosteriores = 0;
  for (const parada of paradas) if (parada.dia >= IRRIGACAO_CORTE_HORAS) paradasPosteriores += parada.horas;
  // Preserve the existing rounding of worked hours before adding downtime.
  const horasPosteriores = Math.round((horasRegistradas - horasRegistradasHistoricas) * 1000) / 1000;
  return horasFixasHistoricasControle(dataInicio, dataFim) + horasPosteriores + paradasPosteriores;
}
