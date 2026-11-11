import assert from "node:assert/strict";
import { test } from "node:test";
import { quantityMonths } from "../server/quantity-months.js";

test("quantidade por mês aplica o mesmo valor somente nos meses escolhidos", () => {
  const result = quantityMonths(2142.85, 5.6, null, [1, 4, 11])!;
  assert.equal(result.length, 12);
  result.forEach((value, month) => {
    assert.ok(Math.abs(value - ([1, 4, 11].includes(month) ? 11999.96 : 0)) < 0.000001);
  });
  assert.equal(result[0], 0);
});

test("todos os meses independe de premissa e aplicações são opcionais", () => {
  assert.deepEqual(quantityMonths(10, 5, null, null), Array(12).fill(50));
  assert.deepEqual(quantityMonths(10, 5, 2, [0]), [100, ...Array(11).fill(0)]);
  assert.deepEqual(quantityMonths(10, 5, 1, []), Array(12).fill(0));
  assert.equal(quantityMonths(10, NaN, 1, null), null);
});
