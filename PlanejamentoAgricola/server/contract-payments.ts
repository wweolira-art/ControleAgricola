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

export type ContractPaymentScope = "all" | "latest";
export function contractPaymentScope(value: unknown): ContractPaymentScope {
  return value === "latest" ? "latest" : "all";
}

/** O máximo é calculado entre títulos pagos e pendentes, antes de filtrar pendências. */
export function contractPaymentsQuery(names: string[], details: boolean): string {
  const titles = `WITH titulos AS (
    SELECT DISTINCT a.numerocontrato, p.cod_grupoempresa, p.cod_empresa, p.cod_filial,
           p.cod_tipocontaspagar, p.documento, p.parcela, p.valorparcela AS valor_total,
           TRUNC(p.datavcto) AS data_vencimento,
           TO_CHAR(p.datavcto, 'YYYY-MM-DD') AS vencimento,
           MAX(TRUNC(p.datavcto)) OVER (PARTITION BY a.numerocontrato) AS ultimo_vencimento,
           CASE WHEN p.confirmapagamento = 'S' AND p.datapgto IS NOT NULL THEN 0 ELSE 1 END AS pendente
      ${PAYMENTS_FROM}
     WHERE a.numerocontrato IN (${names.join(", ")}) AND ${ACTIVE_PAYMENTS}
  ), selecionados AS (
    SELECT * FROM titulos
     WHERE :onlyLatest = 0 OR data_vencimento = ultimo_vencimento
        OR (data_vencimento IS NULL AND ultimo_vencimento IS NULL)
  )`;
  return details
    ? `${titles} SELECT * FROM selecionados WHERE pendente = 1 ORDER BY vencimento NULLS LAST, parcela`
    : `${titles} SELECT numerocontrato, COUNT(*) AS titulos, SUM(pendente) AS pendentes FROM selecionados GROUP BY numerocontrato`;
}

async function readContractPayments(contractNumbers: string[], scope: ContractPaymentScope, details: boolean) {
  const numbers = [...new Set(contractNumbers.filter((value) => /^\d+$/.test(value.trim())).map(Number))];
  if (!numbers.length) return [];
  return withOracle(async (conn) => {
    const rows: Record<string, unknown>[] = [];
    for (let offset = 0; offset < numbers.length; offset += 500) {
      const binds: Record<string, number> = { onlyLatest: scope === "latest" ? 1 : 0 };
      const names = numbers.slice(offset, offset + 500).map((number, index) => {
        const key = `contract${index}`;
        binds[key] = number;
        return `:${key}`;
      });
      const result = await conn.execute(contractPaymentsQuery(names, details), binds);
      rows.push(...(result.rows ?? []) as Record<string, unknown>[]);
    }
    return rows;
  });
}

export async function loadContractPendingPayments(contractNumber: string, scope: ContractPaymentScope = "all"): Promise<ContractPendingPayment[]> {
  const values = await loadContractPendingPaymentsBatch([contractNumber], scope);
  return values.get(String(Number(contractNumber))) ?? [];
}

export async function loadContractPendingPaymentsBatch(contractNumbers: string[], scope: ContractPaymentScope = "all") {
  const values = new Map<string, ContractPendingPayment[]>();
  for (const item of await readContractPayments(contractNumbers, scope, true)) {
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
  return values;
}

export async function loadContractPayments(contractNumbers: string[], scope: ContractPaymentScope = "all") {
  const values = new Map<string, ContractPaymentStatus>();
  for (const item of await readContractPayments(contractNumbers, scope, false)) {
    values.set(oracleText(item, "numerocontrato"), contractPaymentStatus(
      oracleNumber(item, "titulos") ?? 0, oracleNumber(item, "pendentes") ?? 0,
    ));
  }
  return values;
}
