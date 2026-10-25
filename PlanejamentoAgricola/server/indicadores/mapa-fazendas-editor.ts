import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { geojsonPath } from "./mapa-fazendas.js";

function invalid(message: string, status = 400): never {
  throw Object.assign(new Error(message), { status });
}

function revision(text: string) { return createHash("sha256").update(text).digest("hex"); }

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
