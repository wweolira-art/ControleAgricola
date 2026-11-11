import { oracleNumber, withOracle } from "../oracle.js";

export type VinculoTagOracle = {
  codEquipamento: number;
  dataInicio: string | null;
  dataFim: string | null;
};

export function normalizarTagEquipamento(value: string | number | null | undefined) {
  if (value == null) return null;
  const text = String(value).trim().toUpperCase();
  if (!text) return null;
  return /^\d+$/.test(text) ? String(Number(text)) : text;
}

/** Histórico de associação TAG → equipamento registrado no Oracle. */
export async function vinculosOraclePorTag(tags: Array<string | number | null | undefined>) {
  const chaves = [...new Set(tags.map(normalizarTagEquipamento).filter((tag): tag is string => Boolean(tag)))];
  const resultado = new Map<string, VinculoTagOracle[]>();
  if (!chaves.length) return resultado;

  try {
    await withOracle(async (conn) => {
      const binds = Object.fromEntries(chaves.map((tag, index) => [`tag${index}`, tag]));
      const placeholders = chaves.map((_, index) => `:tag${index}`).join(", ");
      const consulta = await conn.execute(
        `SELECT TRIM(TO_CHAR(tag)) AS tag,
                cod_equipamento,
                TO_CHAR(TRUNC(data_inicial), 'YYYY-MM-DD') AS data_inicio,
                TO_CHAR(TRUNC(data_final), 'YYYY-MM-DD') AS data_fim
           FROM automotivo.equipamento_tag
          WHERE cod_grupoempresa = :codGrupo
            AND TRIM(TO_CHAR(tag)) IN (${placeholders})
          ORDER BY tag, data_inicial DESC NULLS LAST`,
        { codGrupo: Number(process.env.COD_GRUPOEMPRESA || 1), ...binds },
        { maxRows: 0, fetchArraySize: 500 },
      );
      for (const raw of (consulta.rows ?? []) as Record<string, unknown>[]) {
        const tag = normalizarTagEquipamento(String(raw.TAG ?? raw.tag ?? ""));
        const codEquipamento = oracleNumber(raw, "COD_EQUIPAMENTO", "cod_equipamento");
        if (!tag || codEquipamento == null) continue;
        const itens = resultado.get(tag) ?? [];
        itens.push({
          codEquipamento,
          dataInicio: raw.DATA_INICIO ?? raw.data_inicio ? String(raw.DATA_INICIO ?? raw.data_inicio) : null,
          dataFim: raw.DATA_FIM ?? raw.data_fim ? String(raw.DATA_FIM ?? raw.data_fim) : null,
        });
        resultado.set(tag, itens);
      }
    });
  } catch {
    // A listagem de entradas continua disponível se o Oracle estiver indisponível.
  }
  return resultado;
}
