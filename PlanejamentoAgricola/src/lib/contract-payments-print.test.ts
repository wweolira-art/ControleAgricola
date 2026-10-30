import { test } from "node:test";
import assert from "node:assert/strict";
import { contractPaymentsPrintHtml } from "./contract-payments-print";

test("impressão inclui os seis campos, vencimento brasileiro e uma linha por parcela", () => {
  const html = contractPaymentsPrintHtml([
    { contratoJatoba: "928", empresa: "Empresa A", vencimento: "2026-10-26", parcela: 57, gef: "1.1.2", local: "Fazenda" },
    { contratoJatoba: "928", empresa: "Empresa A", vencimento: null, parcela: 58, gef: "1.1.2", local: "Fazenda" },
  ]);
  for (const value of ["Contrato Jatobá", "Empresa", "Data de vencimento", "Parcela", "G.E.F.", "Local", "26/10/2026", "<td>57</td>", "<td>58</td>", "2 parcela(s)"]) assert.ok(html.includes(value));
});

test("textos do cadastro são escapados e relatório vazio informa ausência de pendências", () => {
  const html = contractPaymentsPrintHtml([{ contratoJatoba: "<script>alert(1)</script>", empresa: 'A & B', vencimento: null, parcela: 1, gef: "", local: '"Local"' }]);
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("A &amp; B"));
  assert.ok(contractPaymentsPrintHtml([]).includes("Nenhuma parcela pendente encontrada."));
});
