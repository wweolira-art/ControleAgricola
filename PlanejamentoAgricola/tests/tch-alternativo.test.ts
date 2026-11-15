import assert from "node:assert/strict";
import { test } from "node:test";
import { criarConsultaTchBiometrico, resolverTchAmostra } from "../server/indicadores/tch-alternativo.js";

test("consulta biometrica usa ultimo dia da mesma fazenda e talhao, sem dados futuros ou outra safra", () => {
  const consultar = criarConsultaTchBiometrico([
    { fazenda: 72000, talhao: 1, data: "2026-09-21", tch: 85.2826 },
    { fazenda: 72000, talhao: 1, data: "2026-09-30", tch: 79.5698 },
    { fazenda: 72000, talhao: 3, data: "2026-09-21", tch: 76.1981 },
    { fazenda: 42100, talhao: 5, data: "2026-09-09", tch: 79.7482 },
    { fazenda: 42100, talhao: 6, data: "2025-09-09", tch: 100 },
  ]);
  assert.equal(consultar(72000, 1, "2026-09-29"), 85.2826);
  assert.equal(consultar(72000, 1, "2026-09-30"), 79.5698);
  assert.equal(consultar(72000, 3, "2026-09-29"), 76.1981);
  assert.equal(consultar(42100, 5, "2026-09-08"), null);
  assert.equal(consultar(42100, 6, "2026-09-12"), null);
});

test("fallback ignora TCH invalido e devolve null sem bases positivas", () => {
  assert.equal(resolverTchAmostra({ rendimentoagricola: 0, tchBiometrico: NaN, tchPlanejado: 85 }), 85);
  assert.equal(resolverTchAmostra({ rendimentoagricola: 0, tchBiometrico: 0, tchPlanejado: 0 }), null);
});

test("prioridade e realizado, planejado, biometria e historico", () => {
  assert.equal(resolverTchAmostra({ rendimentoagricola: 90, tchPlanejado: 85, tchBiometrico: 80, tchHistorico: 75 }), 90);
  assert.equal(resolverTchAmostra({ rendimentoagricola: 0, tchPlanejado: 85, tchBiometrico: 80, tchHistorico: 75 }), 85);
  assert.equal(resolverTchAmostra({ rendimentoagricola: 0, tchPlanejado: 0, tchBiometrico: 80, tchHistorico: 75 }), 80);
  assert.equal(resolverTchAmostra({ rendimentoagricola: 0, tchPlanejado: 0, tchBiometrico: 0, tchHistorico: 75 }), 75);
});

test("TCH acima do limite plausivel usa o historico do mesmo talhao", () => {
  assert.equal(resolverTchAmostra({
    rendimentoagricola: 596.92,
    tchBiometrico: null,
    tchPlanejado: 596.92,
    tchHistorico: 95,
  }), 95);
});
