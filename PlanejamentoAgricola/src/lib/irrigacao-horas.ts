/** Soma os dias do período filtrado, incluindo início e fim, para cada equipamento. */
export function horasTotaisControle(dataInicio: string, dataFim: string): number {
  const day = new Date(`${dataInicio}T00:00:00Z`);
  const end = new Date(`${dataFim}T00:00:00Z`);
  let total = 0;
  for (; day <= end; day.setUTCDate(day.getUTCDate() + 1)) {
    total += day.getUTCDay() === 0 || day.getUTCDay() === 6 ? 24 : 20;
  }
  return total;
}
