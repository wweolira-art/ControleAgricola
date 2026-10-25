import { test } from "node:test";
import assert from "node:assert/strict";
import { horasFixasHistoricasControle, horasTotaisControle } from "./irrigacao-horas";

test("horas totais históricas são 20h de segunda a sexta e 24h sábado e domingo", () => {
  assert.equal(horasFixasHistoricasControle("2026-10-09", "2026-10-09"), 20);
  assert.equal(horasFixasHistoricasControle("2026-10-10", "2026-10-11"), 48);
  assert.equal(horasTotaisControle("2026-10-09", "2026-10-11", 30, 30, [{ dia: "2026-10-10", horas: 4 }]), 68);
});

test("09 a 15/10/2026 soma 148 horas iguais para todos os equipamentos", () => {
  assert.equal(horasFixasHistoricasControle("2026-10-09", "2026-10-15"), 148);
  for (const horas of [0, 80, 125.86, 138.78, 142.15, 200]) {
    assert.equal(horasTotaisControle("2026-10-09", "2026-10-15", horas, horas, [{ dia: "2026-10-15", horas: 8 }]), 148);
  }
  assert.equal(horasTotaisControle("2026-10-15", "2026-10-15", 18, 18, [{ dia: "2026-10-15", horas: 4 }]), 20);
});

test("16/10 mantém a soma atual e períodos mistos combinam os dois cálculos", () => {
  assert.equal(horasFixasHistoricasControle("2026-10-16", "2026-10-17"), 0);
  assert.equal(horasTotaisControle("2026-10-16", "2026-10-16", 18, 0, [{ dia: "2026-10-16", horas: 4 }]), 22);
  const arredondado = Math.round(horasTotaisControle("2026-10-16", "2026-10-16", 1.2344, 0, [{ dia: "2026-10-16", horas: .0004 }]) * 1000) / 1000;
  assert.equal(arredondado, 1.234);
  assert.equal(horasTotaisControle("2026-10-15", "2026-10-16", 36, 18, [{ dia: "2026-10-15", horas: 3 }, { dia: "2026-10-16", horas: 4 }]), 42);
});
