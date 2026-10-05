import assert from "node:assert/strict";
import { test } from "node:test";
import {
  faixaConfiabilidade,
  horasHorizonteConfiabilidade,
  pctConfiabilidade,
} from "../src/lib/confiabilidade-equipamento.js";

test("1 dia estimado vale 22 horas no expoente", () => {
  assert.equal(horasHorizonteConfiabilidade(1), 22);
  assert.equal(horasHorizonteConfiabilidade(0), 0);
});

test("confiabilidade de 9 h de MTBF em 1 dia de 22 h é 8,68%", () => {
  assert.equal(pctConfiabilidade(9, 1), 8.68);
});

test("sem falha e com operação a confiabilidade é 100%", () => {
  assert.equal(pctConfiabilidade(null, 1, { semFalha: true, operou: true }), 100);
  assert.equal(pctConfiabilidade(null, 1), null);
});

test("faixas excelente / atenção / crítico", () => {
  assert.equal(faixaConfiabilidade(90), "excelente");
  assert.equal(faixaConfiabilidade(75), "atencao");
  assert.equal(faixaConfiabilidade(15), "critico");
  assert.equal(faixaConfiabilidade(null), null);
});
