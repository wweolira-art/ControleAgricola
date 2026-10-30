import { oracleNumber, oracleText, withOracle } from "./oracle.js";

export type ContractPaymentStatus = "Pago" | "Pendente" | null;

export function contractPaymentStatus(titles: number, pending: number): ContractPaymentStatus {
  if (titles <= 0) return null;
  return pending > 0 ? "Pendente" : "Pago";
}

/** Todas as parcelas efetivas do contrato, incluindo as que ainda vão vencer. */
export async function loadContractPayments(contractNumbers: string[]) {
  const numbers = [...new Set(contractNumbers.filter((value) => /^\d+$/.test(value.trim())).map(Number))];
  const values = new Map<string, ContractPaymentStatus>();
  if (!numbers.length) return values;
  await withOracle(async (conn) => {
    for (let offset = 0; offset < numbers.length; offset += 500) {
      const binds: Record<string, number> = {};
      const names = numbers.slice(offset, offset + 500).map((number, index) => {
        const key = `contract${index}`;
        binds[key] = number;
        return `:${key}`;
      });
      const result = await conn.execute(
        `SELECT a.numerocontrato, COUNT(*) AS titulos,
                SUM(CASE WHEN p.confirmapagamento = 'S' AND p.datapgto IS NOT NULL THEN 0 ELSE 1 END) AS pendentes
           FROM financeiro.parcelascontrato a
           JOIN financeiro.parcelascontaspagar p
             ON p.cod_grupoempresa = a.cod_grupoempresa
            AND p.cod_empresa = a.cod_empresa
            AND p.cod_filial = a.cod_filial
            AND p.cod_tipocontaspagar = a.cod_tipocontaspagar
            AND p.documento = a.numerocontrato
            AND p.parcela = a.parcela
          WHERE a.numerocontrato IN (${names.join(", ")})
            AND p.pagarreceber = 'P'
            AND NVL(p.provisao, 'N') = 'N'
            AND NVL(p.cod_situacao, 1) NOT IN (9, 32)
          GROUP BY a.numerocontrato`, binds,
      );
      // Situação 9: título substituído por conversão agrupada; 32: cancelado.
      for (const item of (result.rows ?? []) as Record<string, unknown>[]) {
        values.set(String(oracleText(item, "numerocontrato")), contractPaymentStatus(
          oracleNumber(item, "titulos") ?? 0, oracleNumber(item, "pendentes") ?? 0,
        ));
      }
    }
  });
  return values;
}
