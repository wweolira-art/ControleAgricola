import { test } from "node:test";
import assert from "node:assert/strict";
import { consolidarAnaliseGeralFazendas } from "../src/lib/analiseGeralFazendas";
import type { CompactacaoPonto } from "../src/lib/compactacaoSolo";

const point = (fazenda: string, values: number[]): CompactacaoPonto => ({
  id: `${fazenda}-${values.join()}`, fazenda, campo: "A", lote: 1, dataHora: "2026-10-01",
  latitude: 0, longitude: 0, altitude: null, equipamento: "teste", mediaKpa: 0, descompactar: 0,
  leituras: values.map((kpa, index) => ({ profundidade: String(index), ordem: index, kpa })),
});
test("consolida por fazenda sem calcular média de percentuais ou de médias de pontos", () => {
  const rows = consolidarAnaliseGeralFazendas({
    cadastro: [{ codigo: "001", nome: "São João" }, { codigo: "1", nome: "São João" }, { codigo: "2", nome: "Sem análises" }],
    compactacao: { pontos: [point("Sao Joao", [1000, 2000]), point("SÃO JOÃO", [3000])] },
    entomologia: [{ codFazenda: 1, tocosAnalisados: 100, tocosBrocados: 10 }, { codFazenda: 1, tocosAnalisados: 900, tocosBrocados: 0 }],
    biometria: [
      { fazenda: "1", fazendaNome: "São João", talhao: "1", areaHa: 10, tch: 80 },
      { fazenda: "1", fazendaNome: "São João", talhao: "1", areaHa: 10, tch: 100 },
      { fazenda: "1", fazendaNome: "São João", talhao: "2", areaHa: 30, tch: 110 },
    ],
  });
  assert.equal(rows.length, 2);
  const row = rows.find((item) => item.codigo === "1")!;
  assert.equal(row.compactacaoTotal, 2000);
  assert.equal(row.tocosPercentual, 1);
  assert.equal(row.tch, 105);
  assert.equal(rows.find((item) => item.codigo === "2")!.compactacaoTotal, null);
});

test("mantém zeros reais, ausência de dados e fazendas presentes em somente uma fonte", () => {
  const rows = consolidarAnaliseGeralFazendas({ cadastro: [], compactacao: { pontos: [point("Nova", [0])] }, entomologia: [
    { codFazenda: 3, tocosBrocados: 0, tocosAnalisados: 100 },
    { codFazenda: 4, tocosBrocados: 0, tocosAnalisados: 0 },
  ], biometria: [
    { fazenda: "5", fazendaNome: "Outra", talhao: "1", areaHa: null, tch: 80 },
    { fazenda: "5", fazendaNome: "Outra", talhao: "2", areaHa: null, tch: 100 },
  ] });
  assert.equal(rows.find((row) => row.fazenda === "Nova")!.compactacaoTotal, 0);
  assert.equal(rows.find((row) => row.codigo === "3")!.tocosPercentual, 0);
  assert.equal(rows.find((row) => row.codigo === "4")!.tocosPercentual, null);
  assert.equal(rows.find((row) => row.codigo === "5")!.tch, 90);
});

test("usa nomes alternativos do mapa e não atribui nome ambíguo a uma fazenda errada", () => {
  const rows = consolidarAnaliseGeralFazendas({
    cadastro: [{ codigo: "1", nome: "Nome atual" }, { codigo: "2", nome: "Duplicada" }, { codigo: "3", nome: "Duplicada" }],
    compactacao: { pontos: [point("Nome antigo", [1500]), point("Duplicada", [1800])], geojson: { type: "FeatureCollection", features: [
      { type: "Feature", properties: { Cod_fazend: 1, Fazenda: "Nome antigo" }, geometry: { type: "Polygon", coordinates: [] } },
    ] } }, entomologia: [], biometria: [],
  });
  assert.equal(rows.find((row) => row.codigo === "1")!.compactacaoTotal, 1500);
  assert.equal(rows.find((row) => row.codigo === "1")!.fazenda, "Nome atual");
  assert.equal(rows.find((row) => row.codigo === "2")!.compactacaoTotal, null);
  assert.equal(rows.find((row) => row.codigo === null && row.fazenda === "Duplicada")!.compactacaoTotal, 1800);
});
