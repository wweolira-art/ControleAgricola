/** Quantidade e preço por mês, sem depender da área ou dos dias da atividade. */
export function quantityMonths(dose: number | null | undefined, price: number | null | undefined,
  applications: number | null | undefined, months: number[] | null) {
  const quantity = Number(dose);
  const unitPrice = Number(price);
  const apps = applications == null ? 1 : Number(applications);
  if (![quantity, unitPrice, apps].every((value) => Number.isFinite(value) && value > 0)) return null;
  const monthly = quantity * unitPrice * apps;
  return Array.from({ length: 12 }, (_, month) => months == null || months.includes(month) ? monthly : 0);
}
