import { test } from "node:test";
import assert from "node:assert/strict";
import { filterApplicationFarms } from "./mapaApplicationFarms";

test("exibe todos os talhões de fazendas com aplicação e exclui fazendas sem aplicação", () => {
  const features = [
    { properties: { codFazenda: 1, camada: "LOTES", areaAplicada: 2 } },
    { properties: { codFazenda: 1, camada: "LOTES", areaAplicada: 0 } },
    { properties: { codFazenda: 1, camada: "MATA", areaAplicada: 0 } },
    { properties: { codFazenda: 2, camada: "LOTES", areaAplicada: 0 } },
    { properties: { codFazenda: 3, camada: "MATA", areaAplicada: 3 } },
    { properties: { codFazenda: null, camada: "LOTES", areaAplicada: 5 } },
  ];
  assert.deepEqual(filterApplicationFarms(features), features.slice(0, 3));
  assert.deepEqual(filterApplicationFarms([features[3]]), []);
});

test("nova operação substitui fazendas visíveis sem reaproveitar o filtro anterior", () => {
  const first = [{ properties: { codFazenda: 1, areaAplicada: 2 } }, { properties: { codFazenda: 2, areaAplicada: 0 } }];
  const next = [{ properties: { codFazenda: 1, areaAplicada: 0 } }, { properties: { codFazenda: 2, areaAplicada: 3 } }];
  assert.deepEqual(filterApplicationFarms(first), [first[0]]);
  assert.deepEqual(filterApplicationFarms(next), [next[1]]);
  assert.deepEqual(filterApplicationFarms([]), []);
});
