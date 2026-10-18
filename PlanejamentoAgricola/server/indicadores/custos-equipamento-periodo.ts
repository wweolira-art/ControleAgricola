type SegmentoCusto = {
  codEquipamento: number;
  codTipo: number;
  categoria: string;
  segIni: string;
  segFim: string;
};

export function filtrarCustosEquipamentoPeriodo<T extends { codEquipamento: number | null; data: string }>(
  custos: T[],
  segmentos: SegmentoCusto[],
  filtros: {
    categoria?: string | null;
    codTipoEquipamento?: number | null;
    codEquipamento?: number | null;
    codEquipamentos?: number[] | null;
  },
) {
  const categoria = filtros.categoria?.trim();
  const ids = filtros.codEquipamentos?.length ? new Set(filtros.codEquipamentos) : null;
  const ativo = Boolean(categoria || filtros.codTipoEquipamento != null || filtros.codEquipamento != null || ids);
  if (!ativo) return custos;
  const vigencias = new Map<number, SegmentoCusto[]>();
  for (const segmento of segmentos) {
    if (categoria && segmento.categoria !== categoria) continue;
    if (filtros.codTipoEquipamento != null && segmento.codTipo !== filtros.codTipoEquipamento) continue;
    if (filtros.codEquipamento != null && segmento.codEquipamento !== filtros.codEquipamento) continue;
    if (ids && !ids.has(segmento.codEquipamento)) continue;
    const lista = vigencias.get(segmento.codEquipamento) ?? [];
    lista.push(segmento);
    vigencias.set(segmento.codEquipamento, lista);
  }
  return custos.filter((custo) => custo.codEquipamento != null &&
    vigencias.get(custo.codEquipamento)?.some((segmento) =>
      custo.data >= segmento.segIni && custo.data <= segmento.segFim));
}
