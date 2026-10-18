export function custoHoraEquipamentos(
  custos: Array<{ codEquipamento: number | null; valor: number }>,
  horas: Array<{ codEquipamento: number; dia: string; horas: number }>,
  segmentos: Array<{ codEquipamento: number; codTipo: number; categoria: string; segIni: string; segFim: string }>,
  filtros: { categoria?: string | null; codTipoEquipamento?: number | null },
) {
  const totais = new Map<number, number>();
  for (const custo of custos) {
    if (custo.codEquipamento == null) continue;
    totais.set(custo.codEquipamento, (totais.get(custo.codEquipamento) ?? 0) + custo.valor);
  }
  const porEquipamento = new Map<number, number>();
  for (const hora of horas) {
    if (!totais.has(hora.codEquipamento) || !Number.isFinite(hora.horas) || hora.horas <= 0) continue;
    if (!segmentos.some((seg) => seg.codEquipamento === hora.codEquipamento &&
      (!filtros.categoria || seg.categoria === filtros.categoria) &&
      (filtros.codTipoEquipamento == null || seg.codTipo === filtros.codTipoEquipamento) &&
      hora.dia >= seg.segIni && hora.dia <= seg.segFim)) continue;
    porEquipamento.set(hora.codEquipamento, (porEquipamento.get(hora.codEquipamento) ?? 0) + hora.horas);
  }
  return [...totais].map(([codEquipamento, custo]) => {
    const horas = porEquipamento.get(codEquipamento) ?? 0;
    return { codEquipamento, label: String(codEquipamento), custo, horas,
      valor: horas > 0 ? Math.round(custo / horas * 100) / 100 : null };
  }).sort((a, b) => (b.valor ?? -1) - (a.valor ?? -1) || a.codEquipamento - b.codEquipamento);
}
