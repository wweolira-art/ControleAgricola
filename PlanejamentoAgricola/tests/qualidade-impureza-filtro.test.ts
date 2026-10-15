import assert from "node:assert/strict";
import test from "node:test";
import { enrichQualidadeImpureza, montarQualidadeColheita } from "../server/indicadores/colheita-qualidade.ts";

const entradas = [
  { codEquipamento: 1, maquina: 101, impMineral: 2, peso: 10 },
  { codEquipamento: 1, maquina: 101, impMineral: 4, peso: 30 },
  { codEquipamento: 2, maquina: 102, impMineral: 20, peso: 100 },
  { codEquipamento: null, maquina: 103, impMineral: 50, peso: 100 },
];

test("impureza por equipamento e resumo respeitam o tipo selecionado", () => {
  const resultado = enrichQualidadeImpureza(montarQualidadeColheita([]), entradas, new Map(), new Set([1]));
  assert.equal(resultado?.resumo.impurezaMineral, 3.5);
  assert.deepEqual(resultado?.impurezaPorEquipamento?.map((row) => row.codEquipamento), [1]);
});

test("tipo sem entradas não reutiliza impureza de outros equipamentos", () => {
  const resultado = enrichQualidadeImpureza(montarQualidadeColheita([]), entradas, new Map(), new Set());
  assert.equal(resultado?.resumo.impurezaMineral ?? null, null);
  assert.equal(resultado?.impurezaPorEquipamento?.length ?? 0, 0);
});
