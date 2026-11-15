import assert from "node:assert/strict";
import { test } from "node:test";
import { montarConsumoAnalitico } from "../server/indicadores/consumo-analitico.js";

const abastecimento = (litros: number, kmhs: number, litrosPosto = litros, kmhsPosto = kmhs) => ({ litros, kmhs, litrosPosto, kmhsPosto });

test("relatório agrega toneladas sem multiplicar combustível e respeita dia e equipamento", () => {
  const rows = montarConsumoAnalitico({
    dias: ["2026-11-01", "2026-11-02"],
    equipamentos: [{ grupo: "colhedora", codEquipamento: 5001, equipamento: "5001", codigos: [5001] }],
    abastecimento: new Map([
      ["2026-11-01::5001", abastecimento(100, 5)],
      ["2026-11-02::5001", abastecimento(60, 3)],
      ["2026-11-01::5002", abastecimento(999, 1)],
    ]), abastecimentoTrator: new Map(),
    producaoMaquina: [
      { data: "2026-11-01", codEquipamento: 5001, toneladas: 30, fazenda: "Fazenda B" },
      { data: "2026-11-01", codEquipamento: 5001, toneladas: 15, fazenda: "Fazenda A" },
      { data: "2026-11-01", codEquipamento: 5001, toneladas: 5, fazenda: "Fazenda B" },
      { data: "2026-10-31", codEquipamento: 5001, toneladas: 900 },
    ], producaoCaminhao: [],
  });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].fazenda, "Fazenda A; Fazenda B");
  assert.equal(rows[1].fazenda, null);
  assert.deepEqual(rows.map(row => [row.litrosCombustivel, row.toneladaColhida, row.ltHr, row.ltTon]), [[100, 50, 20, 2], [60, 0, 20, null]]);
});

test("trator usa abastecimentos vigentes do tipo 93 e L/h do posto, reunindo códigos históricos", () => {
  const [row] = montarConsumoAnalitico({
    dias: ["2026-11-01"],
    equipamentos: [{ grupo: "trator", codEquipamento: 4017, equipamento: "4017", codigos: [10, 11, 11] }],
    abastecimento: new Map([["2026-11-01::10", abastecimento(999, 1)]]),
    abastecimentoTrator: new Map([["2026-11-01::10", abastecimento(60, 9, 20, 2)], ["2026-11-01::11", abastecimento(40, 5, 20, 3)]]),
    producaoMaquina: [{ data: "2026-11-01", codEquipamento: 10, toneladas: 30 }, { data: "2026-11-01", codEquipamento: 11, toneladas: 20 }], producaoCaminhao: [],
  });
  assert.equal(row.litrosCombustivel, 100);
  assert.equal(row.toneladaColhida, 50);
  assert.equal(row.ltHr, 8);
  assert.equal(row.ltTon, 2);
});

test("dia com produção sem abastecimento permanece e caminhão não converte quilômetros em horas", () => {
  const rows = montarConsumoAnalitico({
    dias: ["2026-11-01", "2026-11-02", "2026-11-03"],
    equipamentos: [{ grupo: "caminhao", codEquipamento: 3001, equipamento: "3001", codigos: [3001] }],
    abastecimento: new Map([["2026-11-02::3001", abastecimento(100, 200)]]), abastecimentoTrator: new Map(), producaoMaquina: [],
    producaoCaminhao: [{ data: "2026-11-01", codEquipamento: 3001, toneladas: 100 }],
  });
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(row => [row.ltHr, row.ltTon]), [[null, 0], [null, null]]);
});
