import { test } from "node:test";
import assert from "node:assert/strict";
import { contractPaymentStatus, loadContractPayments, loadContractPendingPayments } from "./contract-payments";

test("uma parcela pendente mantém o contrato pendente mesmo com pagamentos anteriores", () => {
  assert.equal(contractPaymentStatus(141, 0), "Pago");
  assert.equal(contractPaymentStatus(117, 1), "Pendente");
  assert.equal(contractPaymentStatus(55, 2), "Pendente");
  assert.equal(contractPaymentStatus(1, 1), "Pendente");
});

test("não apresenta contrato sem informação financeira como pago", async () => {
  assert.equal(contractPaymentStatus(0, 0), null);
  assert.equal((await loadContractPayments(["Sem contrato", ""])).size, 0);
  assert.deepEqual(await loadContractPendingPayments("Sem contrato"), []);
  assert.deepEqual(await loadContractPendingPayments(""), []);
});
