import { oracleText, withOracle } from "./oracle.js";

export function nextContractEmission(lastEmission: string | null): string | null {
  if (!lastEmission || !/^\d{4}-\d{2}-\d{2}$/.test(lastEmission)) return null;
  const date = new Date(`${lastEmission}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== lastEmission) return null;
  date.setUTCDate(date.getUTCDate() + 30);
  return date.toISOString().slice(0, 10);
}

/** Vínculo fiscal do ERP, igual ao utilizado pela visão CSREINF.VW_R2010. */
export async function loadContractEmissions(contractNumbers: string[]) {
  const numbers = [...new Set(contractNumbers.filter((value) => /^\d+$/.test(value.trim())).map(Number))];
  const values = new Map<string, { ultimaEmissao: string | null; emissao: string | null }>();
  if (!numbers.length) return values;
  await withOracle(async (conn) => {
    // Limita cada IN para também atender versões do Oracle com limite de 1.000 itens.
    for (let offset = 0; offset < numbers.length; offset += 500) {
      const binds: Record<string, number> = {};
      const names = numbers.slice(offset, offset + 500).map((number, index) => {
        const key = `contract${index}`;
        binds[key] = number;
        return `:${key}`;
      });
      const result = await conn.execute(
        `SELECT a.numerocontrato,
                TO_CHAR(MAX(n.dataemissao), 'YYYY-MM-DD') AS ultima_emissao
           FROM financeiro.parcelascontrato a
           JOIN material.itensentrada i
             ON i.cod_grupoempresa = a.cod_grupoempresa
            AND i.cod_tipocontaspagar = a.cod_tipocontaspagar
            AND i.documento = a.numerocontrato
            AND i.parcela = a.parcela
           JOIN material.notafiscal n
             ON n.sequencia_nf = i.sequencia_nf
            AND n.nrnf = i.nrnf
            AND n.serie = i.serie
           JOIN material.sequencianotafiscal s ON s.sequencia_nf = n.sequencia_nf
          WHERE a.numerocontrato IN (${names.join(", ")})
            AND s.entrada_confirmada = 'S'
            AND n.dataemissao IS NOT NULL
          GROUP BY a.numerocontrato`, binds,
      );
      for (const item of (result.rows ?? []) as Record<string, unknown>[]) {
        const last = oracleText(item, "ultima_emissao");
        values.set(String(oracleText(item, "numerocontrato")), { ultimaEmissao: last || null, emissao: nextContractEmission(last) });
      }
    }
  });
  return values;
}
