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
