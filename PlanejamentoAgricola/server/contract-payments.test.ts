import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { contractPaymentStatus, contractPaymentsQuery, loadContractPayments, loadContractPendingPayments } from "./contract-payments";

test("uma parcela pendente mantém o contrato pendente mesmo com pagamentos anteriores", () => {
  assert.equal(contractPaymentStatus(141, 0), "Pago");
  assert.equal(contractPaymentStatus(117, 1), "Pendente");
  assert.equal(contractPaymentStatus(55, 2), "Pendente");
  assert.equal(contractPaymentStatus(1, 1), "Pendente");
});

test("último vencimento considera pagos antes de selecionar pendências e mantém empates", () => {
  const db = new Database(":memory:");
  try {
    db.function("NVL", (value, fallback) => value ?? fallback);
    db.function("TRUNC", (value) => value);
    db.function("TO_CHAR", (value, _format) => value);
    db.exec(`ATTACH DATABASE ':memory:' AS financeiro;
      CREATE TABLE financeiro.parcelascontrato (numerocontrato, cod_grupoempresa, cod_empresa, cod_filial, cod_tipocontaspagar, parcela);
      CREATE TABLE financeiro.parcelascontaspagar (cod_grupoempresa, cod_empresa, cod_filial, cod_tipocontaspagar, documento, parcela, valorparcela, datavcto, confirmapagamento, datapgto, pagarreceber, provisao, cod_situacao);`);
    const insert = (parcela: number, vencimento: string | null, pago: boolean, situacao = 1) => {
      db.prepare("INSERT INTO financeiro.parcelascontrato VALUES (100,1,1,1,13,?)").run(parcela);
      db.prepare("INSERT INTO financeiro.parcelascontaspagar VALUES (1,1,1,13,100,?,100,?,?,?,'P','N',?)").run(parcela, vencimento, pago ? "S" : null, pago ? "2026-10-20" : null, situacao);
    };
    const summary = (onlyLatest: number) => db.prepare(contractPaymentsQuery([":contract0"], false)).get({ contract0: 100, onlyLatest }) as { titulos: number; pendentes: number };
    const details = () => db.prepare(contractPaymentsQuery([":contract0"], true)).all({ contract0: 100, onlyLatest: 1 }) as { parcela: number }[];
    insert(1, "2026-09-20", false);
    insert(2, "2026-10-20", true);
    insert(3, "2026-12-20", false, 32); // Cancelamento não altera o último vencimento.
    assert.equal(contractPaymentStatus(summary(0).titulos, summary(0).pendentes), "Pendente");
    assert.equal(contractPaymentStatus(summary(1).titulos, summary(1).pendentes), "Pago");
    assert.deepEqual(details(), []);
    insert(4, "2026-10-20", false); // Duas parcelas no mesmo último vencimento.
    assert.equal(summary(1).titulos, 2);
    assert.equal(contractPaymentStatus(summary(1).titulos, summary(1).pendentes), "Pendente");
    assert.deepEqual(details().map((row) => row.parcela), [4]);
  } finally { db.close(); }
});

test("não apresenta contrato sem informação financeira como pago", async () => {
  assert.equal(contractPaymentStatus(0, 0), null);
  assert.equal((await loadContractPayments(["Sem contrato", ""])).size, 0);
  assert.deepEqual(await loadContractPendingPayments("Sem contrato"), []);
  assert.deepEqual(await loadContractPendingPayments(""), []);
});
