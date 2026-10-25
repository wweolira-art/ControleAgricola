import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { readMapEditor, saveMapFeature, validateMapGeometry } from "./mapa-fazendas-editor.js";

test("salva apenas o talhão escolhido, renomeia a fazenda, guarda backup e rejeita revisão antiga", () => {
  const directory = fs.mkdtempSync(path.join(process.cwd(), ".mapa-editor-test-"));
  const file = path.join(directory, "Fazendas.json");
  const previous = process.env.FAZENDAS_GEOJSON_PATH;
  const geometry = { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] };
  const original = { type: "FeatureCollection", features: [
    { type: "Feature", properties: { Fazenda: "Original", Lote: 1, Cod_fazend: 100, Campo: "A" }, geometry },
    { type: "Feature", properties: { Fazenda: "Original", Lote: 2, Cod_fazend: 100 }, geometry },
    { type: "Feature", properties: { Fazenda: "Outra", Lote: 1, Cod_fazend: 200 }, geometry },
  ] };
  fs.writeFileSync(file, JSON.stringify(original));
  process.env.FAZENDAS_GEOJSON_PATH = file;
  try {
    const first = readMapEditor();
    const body = { revision: first.revision, index: 0, fazenda: "Novo nome", talhao: 9, renameFarm: true, geometry };
    const saved = saveMapFeature(body);
    const features = readMapEditor().geojson.features;
    assert.equal(features[0].properties.Fazenda, "Novo nome");
    assert.equal(features[0].properties.Lote, 9);
    assert.equal(features[0].properties.Campo, "A");
    assert.equal(features[1].properties.Fazenda, "Novo nome");
    assert.equal(features[1].properties.Lote, 2);
    assert.deepEqual(features[2], original.features[2]);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory, "mapa-backups", saved.backup), "utf8")), original);
    assert.throws(() => saveMapFeature(body), (e: any) => e.status === 409);
    const beforeInvalid = fs.readFileSync(file, "utf8");
    assert.throws(() => saveMapFeature({ ...body, revision: saved.revision, geometry: { type: "Point", coordinates: [0, 0] } }));
    assert.equal(fs.readFileSync(file, "utf8"), beforeInvalid);
    assert.throws(() => saveMapFeature({ ...body, revision: saved.revision, talhao: -1 }));
  } finally {
    if (previous == null) delete process.env.FAZENDAS_GEOJSON_PATH; else process.env.FAZENDAS_GEOJSON_PATH = previous;
    assert.equal(path.dirname(directory), process.cwd());
    assert.ok(path.basename(directory).startsWith(".mapa-editor-test-"));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("valida contornos, coordenadas e cruzamento das linhas", () => {
  assert.throws(() => validateMapGeometry({ type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1]]] }));
  assert.throws(() => validateMapGeometry({ type: "Polygon", coordinates: [[[0, 0], [181, 0], [1, 1], [0, 0]]] }));
  assert.throws(() => validateMapGeometry({ type: "Polygon", coordinates: [[[0, 0], [2, 2], [0, 2], [3, 0], [0, 0]]] }));
  validateMapGeometry({ type: "MultiPolygon", coordinates: [[[[0, 0], [1, 0], [1, 1], [0, 0]]]] });
});
