export type SemanaPeriodo = {
  key: string;
  label: string;
  from: string;
  to: string;
};

function parseIso(iso: string) {
  return new Date(`${iso}T12:00:00`);
}

function formatIso(date: Date) {
  const mes = String(date.getMonth() + 1).padStart(2, "0");
  const dia = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${mes}-${dia}`;
}

function labelDia(iso: string) {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

/** Semanas operacionais de sexta a quinta, recortadas no período filtrado. */
export function weeksInRange(dataInicio: string, dataFim: string): SemanaPeriodo[] {
  const out: SemanaPeriodo[] = [];
  if (!dataInicio || !dataFim || dataInicio > dataFim) return out;
  const start = parseIso(dataInicio);
  if (!Number.isFinite(start.getTime())) return out;
  const sexta = new Date(start);
  sexta.setDate(start.getDate() - ((start.getDay() + 2) % 7));
  while (formatIso(sexta) <= dataFim) {
    const quinta = new Date(sexta);
    quinta.setDate(sexta.getDate() + 6);
    const inicio = formatIso(sexta);
    const fim = formatIso(quinta);
    const from = inicio < dataInicio ? dataInicio : inicio;
    const to = fim > dataFim ? dataFim : fim;
    if (from <= to) {
      out.push({
        key: inicio,
        label: `${labelDia(from)} → ${labelDia(to)}`,
        from,
        to,
      });
    }
    sexta.setDate(sexta.getDate() + 7);
  }
  return out;
}
