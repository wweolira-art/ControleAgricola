import assert from "node:assert/strict";
import { test } from "node:test";
import { buildTalhoes, talhaoMapaKey, selecionarProducaoMapa } from "../src/lib/mapa-consumo.js";

const poligonos = [
  { codFazenda: 40800, codTalhao: 2, fazenda: "Pitomba" },
  { codFazenda: 40800, codTalhao: 3, fazenda: "Pitomba" },
  { codFazenda: 40200, codTalhao: 2, fazenda: "Tibirica" },
];

test("L/h usa horas rateadas e metas por tipo ponderadas, sem misturar a meta L/t", () => {
  const result = buildTalhoes([
    { dataAbastecimento: "2026-11-01", codEquipamento: 5001, codTipoEquipamento: 81, qtdeLitros: 100, kmhsRodados: 5 },
    { dataAbastecimento: "2026-11-01", codEquipamento: 4017, codTipoEquipamento: 93, origem: "posto", qtdeLitros: 40, kmhsRodados: 5 },
  ], [
    { data: "2026-11-01", codEquipamento: 5001, fazenda: "Pitomba", talhao: 2, toneladas: 25 },
    { data: "2026-11-01", codEquipamento: 5001, fazenda: "Pitomba", talhao: 3, toneladas: 25 },
    { data: "2026-11-01", codEquipamento: 4017, fazenda: "Pitomba", talhao: 2, toneladas: 50 },
  ], poligonos, [], { colhedora: { ltHora: 30, ltTon: 1 }, trator: { ltHora: 10, ltTon: 0.5 } });
  const mixed = result.talhoes.get("40800::2")!;
  assert.equal(mixed.horas, 7.5);
  assert.equal(mixed.litrosPorHora, 90 / 7.5);
  assert.equal(mixed.metaLitrosPorHora, (2.5 * 30 + 5 * 10) / 7.5);
  assert.equal(mixed.metaLitrosPorTonelada, (25 * 1 + 50 * 0.5) / 75);
  const colhedora = result.talhoes.get("40800::3")!;
  assert.equal(colhedora.litrosPorHora, 20);
  assert.equal(colhedora.metaLitrosPorHora, 30);
});

test("L/h do trator usa somente posto com horas validas; L/t conserva todos os litros", () => {
  const result = buildTalhoes([
    { dataAbastecimento: "2026-11-01", codEquipamento: 4017, codTipoEquipamento: 93, origem: "posto", qtdeLitros: 40, kmhsRodados: 5 },
    { dataAbastecimento: "2026-11-01", codEquipamento: 4017, codTipoEquipamento: 93, origem: "automotivo", qtdeLitros: 100, kmhsRodados: 2 },
    { dataAbastecimento: "2026-11-01", codEquipamento: 4017, codTipoEquipamento: 93, origem: "posto", qtdeLitros: 60, kmhsRodados: 0 },
  ], [{ data: "2026-11-01", codEquipamento: 4017, fazenda: "Pitomba", talhao: 2, toneladas: 100 }], poligonos);
  const row = result.talhoes.get("40800::2")!;
  assert.equal(row.litrosPorHora, 8);
  assert.equal(row.litrosPorTonelada, 2);
});

test("caminhao canavieiro rateia combustivel pela producao transportada do talhao", () => {
  const result = buildTalhoes([
    { dataAbastecimento: "2026-11-01", codEquipamento: 3014, codTipoEquipamento: 30, qtdeLitros: 120, kmhsRodados: 80 },
  ], [
    { data: "2026-11-01", codEquipamento: 3014, fazenda: "Pitomba", talhao: 2, toneladas: 40 },
    { data: "2026-11-01", codEquipamento: 3014, fazenda: "Pitomba", talhao: 3, toneladas: 20 },
  ], poligonos, [], {
    colhedora: { ltHora: 35, ltTon: 1.1 },
    trator: { ltHora: 8, ltTon: 0.6 },
    caminhao: { ltHora: 0, ltTon: 1.1 },
  });
  assert.equal(result.talhoes.get("40800::2")?.litros, 80);
  assert.equal(result.talhoes.get("40800::2")?.litrosPorTonelada, 2);
  assert.equal(result.talhoes.get("40800::2")?.metaLitrosPorTonelada, 1.1);
  assert.equal(result.talhoes.get("40800::2")?.litrosPorHora, null);
  assert.equal(result.talhoes.get("40800::3")?.litros, 40);
});

test("consulta propria do mapa agrega o periodo e conserva apenas o ultimo dia anterior por maquina", () => {
  const rows = selecionarProducaoMapa([
    { data: "2026-08-29", codEquipamento: 5001, fazenda: "Pitomba", talhao: 1, toneladas: 10 },
    { data: "2026-08-31", codEquipamento: 5001, fazenda: "Pitomba", talhao: 2, toneladas: 20 },
    { data: "2026-08-31", codEquipamento: 5001, fazenda: "Pitomba", talhao: 3, toneladas: 30 },
    { data: "2026-09-02", codEquipamento: 5001, fazenda: "Pitomba", talhao: 2, toneladas: 40 },
    { data: "2026-09-02", codEquipamento: 5001, fazenda: "Pitomba", talhao: 2, toneladas: 50 },
    { data: "2026-11-14", codEquipamento: 5001, fazenda: "Pitomba", talhao: 4, toneladas: 100 },
  ], "2026-09-01", "2026-11-13");
  assert.equal(rows.length, 3);
  assert.equal(rows.filter(row => row.somenteReferencia).length, 2);
  assert.equal(rows.find(row => row.data === "2026-09-02")?.toneladas, 90);
  assert.equal(rows.some(row => row.talhao === 1 || row.talhao === 4), false);
});

test("usa producao do dia ou ultima anterior e nunca usa producao futura", () => {
  const result = buildTalhoes([
    { dataAbastecimento: "2026-11-01T10:00:00", codEquipamento: 5001, qtdeLitros: 100 },
    { dataAbastecimento: "2026-11-02", codEquipamento: 5001, qtdeLitros: 300 },
    { dataAbastecimento: "2026-11-03", codEquipamento: 5001, qtdeLitros: 50 },
    { dataAbastecimento: "2026-10-31", codEquipamento: 5001, qtdeLitros: 60 },
  ], [
    { data: "2026-11-01", codEquipamento: 5001, fazenda: "Pitomba", talhao: 2, toneladas: 50 },
    { data: "2026-11-02", codEquipamento: 5001, fazenda: "Pitomba", talhao: 3, toneladas: 100 },
    { data: "2026-11-04", codEquipamento: 5001, fazenda: "Pitomba", talhao: 2, toneladas: 900 },
  ], poligonos);
  assert.equal(result.talhoes.get("40800::2")?.litrosPorTonelada, 2);
  assert.equal(result.talhoes.get("40800::3")?.litrosPorTonelada, 3.5);
  assert.equal(result.litrosSemProducao, 60);
  assert.equal(result.litrosUltimaProducao, 50);
  assert.equal(result.toneladasSemConsumo, 900);
});

test("varios abastecimentos posteriores rateiam pela ultima producao sem repetir toneladas", () => {
  const result = buildTalhoes([
    { dataAbastecimento: "2026-11-02", codEquipamento: 5001, qtdeLitros: 100 },
    { dataAbastecimento: "2026-11-03", codEquipamento: 5001, qtdeLitros: 200 },
    { dataAbastecimento: "2026-11-03", codEquipamento: 4017, qtdeLitros: 50 },
  ], [
    { data: "2026-11-01", codEquipamento: 5001, fazenda: "Pitomba", talhao: 2, toneladas: 25 },
    { data: "2026-11-01", codEquipamento: 5001, fazenda: "Pitomba", talhao: 3, toneladas: 75 },
    { data: "2026-10-30", codEquipamento: 4017, fazenda: "Pitomba", talhao: 2, toneladas: 100, somenteReferencia: true },
  ], poligonos);
  assert.equal(result.talhoes.get("40800::2")?.litros, 125);
  assert.equal(result.talhoes.get("40800::2")?.toneladas, 25);
  assert.equal(result.talhoes.get("40800::3")?.litros, 225);
  assert.equal(result.talhoes.get("40800::3")?.toneladas, 75);
  assert.equal(result.litrosUltimaProducao, 350);
});

test("producao anterior ao periodo localiza litros sem incluir toneladas antigas", () => {
  const result = buildTalhoes([{ dataAbastecimento: "2026-11-02", codEquipamento: 5001, qtdeLitros: 100 }], [
    { data: "2026-10-31", codEquipamento: 5001, fazenda: "Pitomba", talhao: 2, toneladas: 50, somenteReferencia: true },
  ], poligonos);
  assert.equal(result.talhoes.get("40800::2")?.litros, 100);
  assert.equal(result.talhoes.get("40800::2")?.toneladas, 0);
  assert.equal(result.talhoes.get("40800::2")?.litrosPorTonelada, null);
});

test("varios dias do mesmo talhao usam soma de litros dividida pela soma da producao", () => {
  const result = buildTalhoes([
    { dataAbastecimento: "2026-11-01", codEquipamento: 5001, qtdeLitros: 100 },
    { dataAbastecimento: "2026-11-02", codEquipamento: 5001, qtdeLitros: 300 },
  ], [
    { data: "2026-11-01", codEquipamento: 5001, fazenda: "Pitomba", talhao: 2, toneladas: 50 },
    { data: "2026-11-02", codEquipamento: 5001, fazenda: "Pitomba", talhao: 2, toneladas: 100 },
  ], poligonos);
  assert.equal(result.talhoes.get("40800::2")?.litros, 400);
  assert.equal(result.talhoes.get("40800::2")?.toneladas, 150);
  assert.equal(result.talhoes.get("40800::2")?.litrosPorTonelada, 400 / 150);
});

test("consumo separado por talhao e fazenda conserva litros e permite indices diferentes", () => {
  const { talhoes } = buildTalhoes([
    { dataAbastecimento: "2026-11-01", codEquipamento: 5001, qtdeLitros: 100 }, { dataAbastecimento: "2026-11-01", codEquipamento: 4017, qtdeLitros: 40 },
  ], [
    { data: "2026-11-01", codEquipamento: 5001, fazenda: "02.000653 - FAZENDA PITOMBA", talhao: 2, toneladas: 30 },
    { data: "2026-11-01", codEquipamento: 5001, fazenda: "02.000653 - FAZENDA PITOMBA", talhao: 3, toneladas: 70 },
    { data: "2026-11-01", codEquipamento: 4017, fazenda: "FAZENDA PITOMBA", talhao: 2, toneladas: 20 },
  ], poligonos);
  assert.equal(talhoes.size, 2);
  assert.equal(talhoes.get("40800::2")?.litros, 70);
  assert.equal(talhoes.get("40800::2")?.toneladas, 50);
  assert.equal(talhoes.get("40800::2")?.litrosPorTonelada, 1.4);
  assert.equal(talhoes.get("40800::3")?.litrosPorTonelada, 1);
  assert.equal(talhoes.has("40200::2"), false);
  assert.equal([...talhoes.values()].reduce((total, row) => total + row.litros, 0), 140);
});

test("vinculo da usina resolve codigo mesmo com nomes diferentes", () => {
  const { talhoes } = buildTalhoes([{ dataAbastecimento: "2026-11-01", codEquipamento: 5001, qtdeLitros: 100 }], [
    { data: "2026-11-01", codEquipamento: 5001, fazenda: "02.000653 - NOME ANTIGO", talhao: 2, toneladas: 50 },
  ], poligonos, [{ descricaoUsina: "02.000653 - OUTRO NOME", codSistema: 40800 }]);
  assert.equal(talhoes.get("40800::2")?.litrosPorTonelada, 2);
});

test("producao sem talhao ou poligono mantem sua parcela sem pintar outros talhoes", () => {
  const result = buildTalhoes([{ dataAbastecimento: "2026-11-01", codEquipamento: 4017, qtdeLitros: 100 }], [
    { data: "2026-11-01", codEquipamento: 4017, fazenda: "Pitomba", talhao: 2, toneladas: 25 },
    { data: "2026-11-01", codEquipamento: 4017, fazenda: "Pitomba", talhao: null, toneladas: 25 },
    { data: "2026-11-01", codEquipamento: 4017, fazenda: "Pitomba", talhao: 99, toneladas: 50 },
  ], poligonos);
  assert.equal(result.talhoes.get("40800::2")?.litros, 25);
  assert.equal(result.semVinculo, 2);
  assert.equal(result.litrosSemVinculo, 75);
});

test("filtro de combustivel nao atribui producao de outra maquina ao talhao", () => {
  const result = buildTalhoes([{ dataAbastecimento: "2026-11-01", codEquipamento: 4017, qtdeLitros: 40 }], [
    { data: "2026-11-01", codEquipamento: 5001, fazenda: "Pitomba", talhao: 2, toneladas: 100 },
    { data: "2026-11-01", codEquipamento: 4017, fazenda: "Pitomba", talhao: 3, toneladas: 20 },
  ], poligonos);
  assert.deepEqual([...result.talhoes.keys()], ["40800::3"]);
  assert.equal(result.talhoes.get("40800::3")?.litrosPorTonelada, 2);
});

test("identificacao normaliza talhao mas nao confunde numeros entre fazendas", () => {
  assert.equal(talhaoMapaKey({ codFazenda: "40800", lote: "002" }), "40800::2");
  assert.equal(talhaoMapaKey({ codFazenda: "40800", lote: "" }), null);
  const result = buildTalhoes([{ dataAbastecimento: "2026-11-01", codEquipamento: 5001, qtdeLitros: 100 }], [
    { data: "2026-11-01", codEquipamento: 5001, fazenda: "Nome repetido", talhao: 2, toneladas: 100 },
  ], poligonos.map(row => ({ ...row, fazenda: "Nome repetido" })));
  assert.equal(result.talhoes.size, 0);
  assert.equal(result.semVinculo, 1);
});
