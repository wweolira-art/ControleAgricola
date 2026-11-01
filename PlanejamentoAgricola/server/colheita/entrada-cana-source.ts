/** Filtra datas na origem, sem precisar baixar todo o histórico de pesagens. */
export function entradaCanaDateQuery(dataInicio: string | null, dataFim: string | null) {
  if (!dataInicio && !dataFim) return undefined;
  const data: Record<string, { $date: string }> = {};
  if (dataInicio) data.$gte = { $date: `${dataInicio}T00:00:00Z` };
  if (dataFim) {
    const next = new Date(`${dataFim}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    data.$lt = { $date: next.toISOString().replace(".000Z", "Z") };
  }
  return { data };
}

/** Consulta atualizada; a cópia local permite consultar durante indisponibilidade. */
export async function carregarEntradaCanaComFallback<R extends { dados: unknown[] }, L extends { dados: unknown[] }>(
  remote: () => Promise<R>, local: () => L, persist: (payload: R) => void,
) {
  let payload: R;
  try { payload = await remote(); }
  catch (error) {
    const cached = local();
    if (!cached.dados.length) throw error;
    return { payload: cached, fonte: "local" as const, aviso: "Não foi possível atualizar as pesagens. Exibindo os dados salvos anteriormente neste servidor." };
  }
  persist(payload);
  return { payload, fonte: "ords" as const, aviso: null };
}
