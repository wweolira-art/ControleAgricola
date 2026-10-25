import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizarCompactacao, mediaCompactacao, gruposCompactacao, corLeituraCompactacao, contornosCompactacao, type CompactacaoFeature } from "./compactacaoSolo";

const sample = (value: number): Record<string, unknown> => ({ idunico: 1, fazenda: "Fazenda A", lote: 2, latitude: -9.8, longitude: -36.1, "dataehora(utc)": "2026-01-10T10:00:00-03:00", ...Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`${i}-${i + 1}cm`, value])) });

test("escala das barras reproduz as três cores do gráfico no PBIX", () => {
  assert.equal(corLeituraCompactacao(0), "rgb(0, 179, 51)");
  assert.equal(corLeituraCompactacao(1250), "rgb(1, 167, 10)");
  assert.equal(corLeituraCompactacao(2500), "rgb(181, 1, 1)");
  assert.equal(corLeituraCompactacao(9000), corLeituraCompactacao(2500));
});

test("contornos acompanham as fazendas medidas e o filtro de talhão", () => {
  const polygon = (farm: string, code: number, plot: number, x: number): CompactacaoFeature => ({ type: "Feature", properties: { Fazenda: farm, Cod_fazend: code, Lote: plot }, geometry: { type: "Polygon", coordinates: [[[x, 0], [x + 1, 0], [x + 1, 1], [x, 1], [x, 0]]] } });
  const features = [polygon("São João", 1, 2, 0), polygon("São João", 1, 3, 2), polygon("Outra", 2, 2, 5)];
  const point = normalizarCompactacao({ ...sample(1000), fazenda: "Sao joao", latitude: .5, longitude: .5 })!;
  assert.deepEqual(contornosCompactacao(features, [point]), features.slice(0, 2));
  assert.deepEqual(contornosCompactacao(features, [point], true), [features[0]]);
  assert.deepEqual(contornosCompactacao(features, []), []);
  const renamed = [{ ...features[0], properties: { ...features[0].properties, Fazenda: "Nome novo" } }, { ...features[1], properties: { ...features[1].properties, Fazenda: "Nome novo" } }, features[2]];
  assert.deepEqual(contornosCompactacao(renamed, [point]), renamed.slice(0, 2));
});

test("associação espacial respeita buracos dos polígonos", () => {
  const feature: CompactacaoFeature = { type: "Feature", properties: { Fazenda: "Renomeada", Lote: 2 }, geometry: { type: "Polygon", coordinates: [ [[0, 0], [3, 0], [3, 3], [0, 3], [0, 0]], [[1, 1], [2, 1], [2, 2], [1, 2], [1, 1]] ] } };
  const point = normalizarCompactacao({ ...sample(1000), latitude: 1.5, longitude: 1.5 })!;
  assert.deepEqual(contornosCompactacao([feature], [point]), []);
});

test("médias seguem as faixas do Power Query, inclusive o rótulo 27-32cm", () => {
  const raw = sample(1000);
  raw["28-29cm"] = 3000; raw["29-30cm"] = 1000; raw["30-31cm"] = 2000; raw["31-32cm"] = 4000;
  const point = normalizarCompactacao(raw)!;
  assert.equal(point.leituras.length, 16);
  assert.equal(point.leituras.find((r) => r.profundidade === "27-32cm")?.kpa, 2500);
  assert.equal(point.mediaKpa, (15 * 1000 + 2500) / 16);
});

test("regra DAX inclui 40-44cm, exige mais de 2000 e ignora faixas mais profundas", () => {
  const raw = sample(2000);
  assert.equal(normalizarCompactacao(raw)?.descompactar, 0);
  raw["43-44cm"] = 2004;
  assert.equal(normalizarCompactacao(raw)?.descompactar, 1);
  assert.equal(normalizarCompactacao(raw, "0-3cm")?.descompactar, 0);
  const deep = sample(1000); deep["44-45cm"] = 9000;
  assert.equal(normalizarCompactacao(deep)?.descompactar, 0);
});

test("faixas incompletas não viram zero; média por fazenda usa todas as leituras válidas", () => {
  const raw: Record<string, unknown> = sample(1000); raw["0-1cm"] = null;
  const a = normalizarCompactacao(raw)!;
  const b = normalizarCompactacao({ ...sample(3000), idunico: 2 })!;
  assert.equal(a.leituras.length, 15);
  assert.equal(normalizarCompactacao(raw, "0-3cm"), null);
  assert.equal(mediaCompactacao([a, b]), (15000 + 48000) / 31);
  const group = gruposCompactacao([a, b], "fazenda")[0];
  assert.equal(group.pontos, 2); assert.equal(group.compactados, 1);
  assert.equal(normalizarCompactacao({ ...raw, latitude: 95 }), null);
});
