import assert from "node:assert/strict";
import test from "node:test";
import { filtrarCustosEquipamentoPeriodo } from "../server/indicadores/custos-equipamento-periodo.ts";

const segmentos = [
  { codEquipamento: 1, codTipo: 93, categoria: "TRATORES", segIni: "2026-10-01", segFim: "2026-10-15" },
  { codEquipamento: 1, codTipo: 80, categoria: "TRATORES", segIni: "2026-10-16", segFim: "2026-10-31" },
  { codEquipamento: 2, codTipo: 93, categoria: "TRATORES", segIni: "2026-10-01", segFim: "2026-10-31" },
];
const custos = [
  { id: 1, codEquipamento: 1, data: "2026-10-01", codObjetoCusto: 45 },
  { id: 2, codEquipamento: 1, data: "2026-10-15", codObjetoCusto: 116 },
  { id: 3, codEquipamento: 1, data: "2026-10-16", codObjetoCusto: 116 },
  { id: 4, codEquipamento: null, data: "2026-10-10", codObjetoCusto: 116 },
  { id: 5, codEquipamento: 2, data: "2026-10-10", codObjetoCusto: 116 },
  { id: 6, codEquipamento: 3, data: "2026-10-10", codObjetoCusto: 116 },
  { id: 7, codEquipamento: 1, data: "2026-09-30", codObjetoCusto: 116 },
];

test("tipo considera equipamento e vigência na data do custo, independentemente do objeto", () => {
  assert.deepEqual(filtrarCustosEquipamentoPeriodo(custos, segmentos, { codTipoEquipamento: 93 }).map((r) => r.id), [1, 2, 5]);
});

test("combina tipo, categoria e seleção de equipamentos", () => {
  assert.deepEqual(filtrarCustosEquipamentoPeriodo(custos, segmentos, {
    codTipoEquipamento: 93, categoria: "TRATORES", codEquipamentos: [1],
  }).map((r) => r.id), [1, 2]);
  assert.deepEqual(filtrarCustosEquipamentoPeriodo(custos, segmentos, { codTipoEquipamento: 93, codEquipamento: 3 }), []);
});

test("consulta sem filtro de frota preserva lançamentos por objeto sem equipamento", () => {
  assert.deepEqual(filtrarCustosEquipamentoPeriodo(custos, segmentos, {}), custos);
});
