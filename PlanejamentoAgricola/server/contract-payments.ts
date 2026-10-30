import { oracleNumber, oracleText, withOracle } from "./oracle.js";

export type ContractPaymentStatus = "Pago" | "Pendente" | null;

export function contractPaymentStatus(titles: number, pending: number): ContractPaymentStatus {
  if (titles <= 0) return null;
  return pending > 0 ? "Pendente" : "Pago";
}

const PAYMENTS_FROM = `FROM financeiro.parcelascontrato a
           JOIN financeiro.parcelascontaspagar p
             ON p.cod_grupoempresa = a.cod_grupoempresa
            AND p.cod_empresa = a.cod_empresa
            AND p.cod_filial = a.cod_filial
            AND p.cod_tipocontaspagar = a.cod_tipocontaspagar
            AND p.documento = a.numerocontrato
            AND p.parcela = a.parcela`;
const ACTIVE_PAYMENTS = `p.pagarreceber = 'P'
            AND NVL(p.provisao, 'N') = 'N'
            AND NVL(p.cod_situacao, 1) NOT IN (9, 32)`;

export type ContractPendingPayment = { id: string; parcela: number; valorTotal: number | null; vencimento: string | null };

/** Mesmos títulos e critério de pendência usados na coluna Pagamento. */
export async function loadContractPendingPayments(contractNumber: string): Promise<ContractPendingPayment[]> {
  const values = await loadContractPendingPaymentsBatch([contractNumber]);
  return values.get(String(Number(contractNumber))) ?? [];
}

export async function loadContractPendingPaymentsBatch(contractNumbers: string[]) {
  const numbers = [...new Set(contractNumbers.filter((value) => /^\d+$/.test(value.trim())).map(Number))];
  const values = new Map<string, ContractPendingPayment[]>();
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
        `SELECT DISTINCT a.numerocontrato, p.cod_grupoempresa, p.cod_empresa, p.cod_filial,
                p.cod_tipocontaspagar, p.documento, p.parcela, p.valorparcela AS valor_total,
                TO_CHAR(p.datavcto, 'YYYY-MM-DD') AS vencimento
           ${PAYMENTS_FROM}
          WHERE a.numerocontrato IN (${names.join(", ")})
            AND ${ACTIVE_PAYMENTS}
            AND (NVL(p.confirmapagamento, 'N') <> 'S' OR p.datapgto IS NULL)
          ORDER BY vencimento NULLS LAST, p.parcela`, binds,
      );
      for (const item of (result.rows ?? []) as Record<string, unknown>[]) {
        const key = oracleText(item, "numerocontrato");
        const rows = values.get(key) ?? [];
        rows.push({
          id: ["cod_grupoempresa", "cod_empresa", "cod_filial", "cod_tipocontaspagar", "documento", "parcela"].map((column) => oracleText(item, column)).join(":"),
          parcela: oracleNumber(item, "parcela") ?? 0,
          vencimento: oracleText(item, "vencimento") || null,
          valorTotal: oracleNumber(item, "valor_total"),
        });
        values.set(key, rows);
      }
    }
  });
  return values;
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
           ${PAYMENTS_FROM}
          WHERE a.numerocontrato IN (${names.join(", ")})
            AND ${ACTIVE_PAYMENTS}
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
