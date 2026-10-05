import assert from "node:assert/strict";
import test from "node:test";
import { pctPerdaMediaAmostras, pctPerdasEstimadoPeriodo, pctPerdasLinha } from "../server/indicadores/perdas-percentual.ts";

test("amostra com TCH lançado usa esse TCH no percentual da linha", () => {
  assert.equal(pctPerdasLinha(3.6, 4.55, 60), 44.17);
});

test("perda do operador no equipamento é a média das amostras, com TCH zerado valendo 0%", () => {
  assert.equal(
    pctPerdaMediaAmostras([
      { perdas: 3.507, tch: 0 },
      { perdas: 3.675, tch: 94.71 },
      { perdas: 0.56, tch: 0 },
      { perdas: 1.015, tch: 2.59 },
    ]),
    7.97,
  );
  assert.equal(
    pctPerdaMediaAmostras([
      { perdas: 4.53, tch: 94.71 },
      { perdas: 12, tch: 0 },
    ]),
    2.28,
  );
  assert.equal(
    pctPerdaMediaAmostras([
      { perdas: 4.081, tch: 0 },
      { perdas: 3.599, tch: 0 },
      { perdas: 1.365, tch: 0 },
    ]),
    0,
  );
});

test("total do período 01/09/2026 a 03/10/2026 fecha em 5,51", () => {
  const amostras = [
    { perdas: 1.34, tch: 0, tchPlanejado: 60 },
    { perdas: 3.6, tch: 4.55, tchPlanejado: 60 },
    { perdas: 4.081, tch: 0, tchPlanejado: 80 },
    { perdas: 3.507, tch: 0, tchPlanejado: 85 },
    { perdas: 3.675, tch: 94.71, tchPlanejado: 85 },
    { perdas: 4.53, tch: 94.71, tchPlanejado: 85 },
    { perdas: 12, tch: 0, tchPlanejado: 85 },
    { perdas: 3.599, tch: 0, tchPlanejado: 85 },
    { perdas: 1.41, tch: 0, tchPlanejado: 70 },
    { perdas: 1.165, tch: 0, tchPlanejado: 60 },
    { perdas: 1.584, tch: 0, tchPlanejado: 70 },
    { perdas: 1.365, tch: 0, tchPlanejado: 70 },
    { perdas: 2.007, tch: 0, tchPlanejado: 60 },
    { perdas: 1.025, tch: 0, tchPlanejado: 70 },
    { perdas: 0.56, tch: 0, tchPlanejado: 30 },
    { perdas: 1.015, tch: 2.59, tchPlanejado: 65 },
    { perdas: 0.867, tch: 4.55, tchPlanejado: 60 },
    { perdas: 0.8, tch: 30.47, tchPlanejado: 55 },
  ];
  assert.equal(pctPerdasEstimadoPeriodo(amostras), 5.51);
});
