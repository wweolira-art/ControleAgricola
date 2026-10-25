import { test } from "node:test";
import assert from "node:assert/strict";
import { horasParadasHistoricas, horasTrabalhadasControle, horasFixasHistoricasControle, horasTotaisControle } from "./irrigacao-horas";

test("desconta paradas antes de 15/10/2026", () => {
  assert.equal(horasTrabalhadasControle(12, [{ dia: "2026-10-14", horas: 3 }]), 9);
  assert.equal(horasTrabalhadasControle(12, [{ dia: "2025-09-01", horas: 2 }]), 10);
});
test("preserva o cálculo em 15/10/2026 e nos dias seguintes", () => {
  assert.equal(horasTrabalhadasControle(12, [{ dia: "2026-10-15", horas: 3 }]), 12);
  assert.equal(horasTrabalhadasControle(12, [{ dia: "2026-10-16", horas: 4 }]), 12);
});
test("períodos mistos descontam apenas as paradas históricas", () => {
  const paradas = [{ dia: "2026-10-14", horas: 3 }, { dia: "2026-10-15", horas: 4 }, { dia: "2026-10-16", horas: 2 }];
  assert.equal(horasParadasHistoricas(paradas), 3);
  assert.equal(horasTrabalhadasControle(36, paradas), 33);
  assert.equal(horasTrabalhadasControle(12, []), 12);
});

test("horas totais históricas são 20h de segunda a sexta e 24h sábado e domingo", () => {
  assert.equal(horasFixasHistoricasControle("2026-10-09", "2026-10-09"), 20);
  assert.equal(horasFixasHistoricasControle("2026-10-10", "2026-10-11"), 48);
  assert.equal(horasTotaisControle("2026-10-09", "2026-10-11", 30, 30, [{ dia: "2026-10-10", horas: 4 }]), 68);
});

test("15/10 mantém a soma atual e períodos mistos combinam os dois cálculos", () => {
  assert.equal(horasFixasHistoricasControle("2026-10-15", "2026-10-16"), 0);
  assert.equal(horasTotaisControle("2026-10-15", "2026-10-15", 18, 0, [{ dia: "2026-10-15", horas: 4 }]), 22);
  const arredondado = Math.round(horasTotaisControle("2026-10-15", "2026-10-15", 1.2344, 0, [{ dia: "2026-10-15", horas: .0004 }]) * 1000) / 1000;
  assert.equal(arredondado, 1.234);
  assert.equal(horasTotaisControle("2026-10-14", "2026-10-15", 36, 18, [{ dia: "2026-10-14", horas: 3 }, { dia: "2026-10-15", horas: 4 }]), 42);
});
