import { test } from "node:test";
import assert from "node:assert/strict";
import { horasParadasHistoricas, horasTrabalhadasControle } from "./irrigacao-horas";

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
