export const TCH_MAXIMO_PLAUSIVEL = 250;

export function resolverTchAmostra(sample: {
  rendimentoagricola: number | null;
  tchBiometrico?: number | null;
  tchPlanejado: number | null;
  tchHistorico?: number | null;
}) {
  return [sample.rendimentoagricola, sample.tchPlanejado, sample.tchBiometrico, sample.tchHistorico]
    .find(value => value != null && Number.isFinite(value) && value > 0 && value <= TCH_MAXIMO_PLAUSIVEL) ?? null;
}

export function criarConsultaTchBiometrico(rows: Array<{ fazenda: number; talhao: number; data: string; tch: number }>) {
  const porTalhao = new Map<string, typeof rows>();
  for (const row of rows) {
    if (!(row.tch > 0) || !Number.isFinite(row.tch)) continue;
    const key = `${row.fazenda}::${row.talhao}`;
    const values = porTalhao.get(key) ?? [];
    values.push(row); porTalhao.set(key, values);
  }
  for (const values of porTalhao.values()) values.sort((a, b) => b.data.localeCompare(a.data));
  return (fazenda: number | null, talhao: number | null, data: string) => {
    if (fazenda == null || talhao == null || !data) return null;
    const dia = data.slice(0, 10);
    const ano = Number(dia.slice(0, 4)) - (Number(dia.slice(5, 7)) < 9 ? 1 : 0);
    const inicioSafra = `${ano}-09-01`;
    return porTalhao.get(`${fazenda}::${talhao}`)?.find(row => row.data <= dia && row.data >= inicioSafra)?.tch ?? null;
  };
}
