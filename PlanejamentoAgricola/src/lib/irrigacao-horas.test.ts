import { test } from "node:test";
import assert from "node:assert/strict";
import { horasTotaisControle } from "./irrigacao-horas";

test("considera 20h em dias úteis e 24h nos fins de semana", () => {
  assert.equal(horasTotaisControle("2026-10-16", "2026-10-16"), 20);
  assert.equal(horasTotaisControle("2026-10-17", "2026-10-18"), 48);
});

test("semanas completas somam 148h antes e depois do antigo corte", () => {
  assert.equal(horasTotaisControle("2026-10-09", "2026-10-15"), 148);
  assert.equal(horasTotaisControle("2026-10-16", "2026-10-22"), 148);
  assert.equal(horasTotaisControle("2026-10-19", "2026-10-25"), 148);
});

test("soma todo o período inclusivo sem corte no dia 15", () => {
  assert.equal(horasTotaisControle("2026-10-15", "2026-10-16"), 40);
  assert.equal(horasTotaisControle("2026-10-09", "2026-10-22"), 296);
  assert.equal(horasTotaisControle("2026-10-31", "2026-11-01"), 48);
});
