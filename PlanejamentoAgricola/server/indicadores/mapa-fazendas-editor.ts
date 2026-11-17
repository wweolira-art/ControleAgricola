import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { geojsonPath } from "./mapa-fazendas.js";

function invalid(message: string, status = 400): never {
  throw Object.assign(new Error(message), { status });
}

function revision(text: string) { return createHash("sha256").update(text).digest("hex"); }

function persistCollection(file: string, text: string, collection: any) {
  const backupDir = path.join(path.dirname(file), "mapa-backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const backup = `${Date.now()}-${randomUUID()}.json`;
  fs.writeFileSync(path.join(backupDir, backup), text, { flag: "wx" });
  const next = JSON.stringify(collection);
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, next, { flag: "wx" });
    fs.renameSync(temporary, file);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
  return { revision: revision(next), geojson: collection, backup };
}

export function readMapEditor() {
  const text = fs.readFileSync(geojsonPath(), "utf8");
  return { revision: revision(text), geojson: JSON.parse(text) };
}

export function validateMapGeometry(geometry: any) {
  if (!geometry || !["Polygon", "MultiPolygon"].includes(geometry.type)) invalid("Use uma geometria Polygon ou MultiPolygon.");
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  if (!Array.isArray(polygons) || !polygons.length) invalid("O polígono não pode estar vazio.");
  for (const polygon of polygons) {
    if (!Array.isArray(polygon) || !polygon.length) invalid("O polígono precisa de um contorno.");
    for (const ring of polygon) {
      if (!Array.isArray(ring) || ring.length < 4 || ring.length > 10000) invalid("Cada contorno precisa de pelo menos três vértices e fechamento.");
      for (const point of ring) {
        if (!Array.isArray(point) || point.length !== 2 || !point.every((n: unknown) => typeof n === "number" && Number.isFinite(n)) || Math.abs(point[0]) > 180 || Math.abs(point[1]) > 90) invalid("Coordenadas inválidas. Use [longitude, latitude].");
      }
      if (ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1]) invalid("O primeiro e o último vértice precisam ser iguais.");
      let area = 0;
      for (let i = 0; i < ring.length - 1; i++) {
        if (ring[i][0] === ring[i + 1][0] && ring[i][1] === ring[i + 1][1]) invalid("O contorno possui vértices consecutivos repetidos.");
        area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
      }
      if (Math.abs(area) < 1e-12) invalid("O contorno precisa ter área maior que zero.");
      const cross = (a: number[], b: number[], c: number[]) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      for (let i = 0; i < ring.length - 1; i++) for (let j = i + 2; j < ring.length - 1; j++) {
        if (i === 0 && j === ring.length - 2) continue;
        if (cross(ring[i], ring[i + 1], ring[j]) * cross(ring[i], ring[i + 1], ring[j + 1]) < 0 && cross(ring[j], ring[j + 1], ring[i]) * cross(ring[j], ring[j + 1], ring[i + 1]) < 0) invalid("O contorno possui linhas cruzadas. Ajuste os vértices.");
      }
    }
  }
}

export function saveMapFeature(body: any) {
  const file = geojsonPath();
  const text = fs.readFileSync(file, "utf8");
  if (body.revision !== revision(text)) invalid("O mapa foi alterado por outra pessoa. Reabra as configurações antes de salvar.", 409);
  const collection = JSON.parse(text);
  if (!Number.isInteger(body.index) || !collection.features[body.index]) invalid("Talhão não encontrado.");
  const name = typeof body.fazenda === "string" ? body.fazenda.trim() : "";
  if (!name || name.length > 160) invalid("Informe um nome de fazenda com até 160 caracteres.");
  if (!Number.isSafeInteger(body.talhao) || body.talhao < 0) invalid("Informe um número de talhão inteiro e positivo ou zero.");
  const feature = collection.features[body.index];
  // Existing source contours can be renamed without forcing unrelated geometry repairs.
  if (JSON.stringify(body.geometry) !== JSON.stringify(feature.geometry)) validateMapGeometry(body.geometry);
  const props = feature.properties;
  const farmCode = props.Cod_fazend ?? props.cod_fazend ?? props.cod_fazenda;
  for (const item of collection.features) {
    const p = item.properties;
    if (item === feature || (body.renameFarm === true && farmCode != null && String(p.Cod_fazend ?? p.cod_fazend ?? p.cod_fazenda) === String(farmCode))) {
      p.Fazenda = name;
      if ("fazenda" in p) p.fazenda = name;
    }
  }
  props.Lote = body.talhao;
  if ("lote" in props) props.lote = body.talhao;
  if ("cod_talhao" in props) props.cod_talhao = body.talhao;
  feature.geometry = { type: body.geometry.type, coordinates: body.geometry.coordinates };
  return persistCollection(file, text, collection);
}

export function importMapKmlFeatures(body: any) {
  const file = geojsonPath();
  const text = fs.readFileSync(file, "utf8");
  if (body.revision !== revision(text)) invalid("O mapa foi alterado por outra pessoa. Reabra as configurações antes de importar.", 409);
  if (!Array.isArray(body.features) || !body.features.length || body.features.length > 500) {
    invalid("O arquivo KML deve conter de 1 a 500 polígonos.");
  }
  const collection = JSON.parse(text);
  if (!collection || collection.type !== "FeatureCollection" || !Array.isArray(collection.features)) {
    invalid("O arquivo atual do mapa não é uma coleção GeoJSON válida.");
  }
  let nextId = collection.features.reduce((max: number, feature: any) => {
    const id = Number(feature?.properties?.id);
    return Number.isSafeInteger(id) ? Math.max(max, id) : max;
  }, 0) + 1;
  const imported = body.features.map((input: any, index: number) => {
    const fazenda = typeof input?.fazenda === "string" ? input.fazenda.trim() : "";
    if (input?.codFazenda == null || input.codFazenda === "") invalid(`Polígono ${index + 1}: informe o código da fazenda.`);
    if (input?.talhao == null || input.talhao === "") invalid(`Polígono ${index + 1}: informe o número do talhão.`);
    const codFazenda = Number(input?.codFazenda);
    const talhao = Number(input?.talhao);
    if (!fazenda || fazenda.length > 160) invalid(`Polígono ${index + 1}: informe o nome da fazenda com até 160 caracteres.`);
    if (!Number.isSafeInteger(codFazenda) || codFazenda <= 0) invalid(`Polígono ${index + 1}: informe um código de fazenda inteiro e positivo.`);
    if (!Number.isSafeInteger(talhao) || talhao < 0) invalid(`Polígono ${index + 1}: informe um número de talhão inteiro e positivo ou zero.`);
    validateMapGeometry(input.geometry);
    const id = nextId++;
    return {
      type: "Feature",
      geometry: { type: input.geometry.type, coordinates: input.geometry.coordinates },
      properties: {
        id,
        Fazenda: fazenda,
        Lote: talhao,
        Cod_fazend: codFazenda,
        Campo: "",
        Produtor: "",
        Idsec: `${codFazenda}_${talhao}_KML_${id}`,
        Fonte: "KML",
        ...(typeof input.nomeOriginal === "string" && input.nomeOriginal.trim()
          ? { NomeKml: input.nomeOriginal.trim().slice(0, 300) }
          : {}),
      },
    };
  });
  collection.features.push(...imported);
  return { ...persistCollection(file, text, collection), importedCount: imported.length };
}
