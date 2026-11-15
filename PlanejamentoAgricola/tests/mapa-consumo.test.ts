import assert from "node:assert/strict";
import { test } from "node:test";
import { buildFazendas, farmKey } from "../src/lib/mapa-consumo.js";

test("mapa inclui produção de colhedeiras e tratores e rateia litros sem multiplicar o total", () => {
  const farms = buildFazendas([
    { codEquipamento: 5001, qtdeLitros: 100 }, { codEquipamento: 4017, qtdeLitros: 40 },
  ], null, [
    { codEquipamento: 5001, fazenda: "01.001 - Fazenda A", toneladas: 30 },
    { codEquipamento: 5001, fazenda: "Fazenda B", toneladas: 70 },
    { codEquipamento: 4017, fazenda: "Fazenda A", toneladas: 20 },
  ]);
  assert.equal(farms.size, 2);
  assert.equal(farms.get(farmKey("Fazenda A"))?.litros, 70);
  assert.equal(farms.get(farmKey("Fazenda A"))?.toneladas, 50);
  assert.equal(farms.get(farmKey("Fazenda A"))?.litrosPorTonelada, 1.4);
  assert.equal([...farms.values()].reduce((total, row) => total + row.litros, 0), 140);
});

test("filtro de combustível mantém apenas produção dos equipamentos selecionados", () => {
  const farms = buildFazendas([{ codEquipamento: 4017, qtdeLitros: 40 }], null, [
    { codEquipamento: 5001, fazenda: "A", toneladas: 100 },
    { codEquipamento: 4017, fazenda: "B", toneladas: 20 },
  ]);
  assert.deepEqual([...farms.keys()], ["B"]);
  assert.equal(farms.get("B")?.litrosPorTonelada, 2);
});
