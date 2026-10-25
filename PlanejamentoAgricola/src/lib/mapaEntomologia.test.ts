import { test } from "node:test";
import assert from "node:assert/strict";
import { percentualTocosDanificados } from "./mapaEntomologia";

test("percentual de tocos danificados coincide com exemplos do relatório", () => {
  const percent = (b: number, a: number) => Number(percentualTocosDanificados(b, a)?.toFixed(3));
  assert.equal(percent(191, 14451), 1.322);
  assert.equal(percent(176, 4033), 4.364);
  assert.equal(percent(231, 6288), 3.674);
  assert.equal(percent(0, 1458), 0);
  assert.equal(percentualTocosDanificados(0, 0), null);
  assert.equal(percentualTocosDanificados(undefined, 10), null);
  assert.equal(percentualTocosDanificados(2, Number.NaN), null);
});
