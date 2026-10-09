import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runLimited } from "../oracle.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const EXTERNAL_MAP_PATH = "C:\\Users\\rayhiran\\Desktop\\Softwares\\build\\exe.win-amd64-3.13\\Mapa SHP (1).json";
const ORDS_URL =
  process.env.ORDS_PENETROMETRO_URL ??
  "https://g58645a2c384a96-bd1.adb.sa-saopaulo-1.oraclecloudapps.com/ords/admin/compactacaopenetrometro/";

export type PenetrometroRow = Record<string, unknown>;

export interface PenetrometroPreviewResult {
  dados: PenetrometroRow[];
  total: number;
  colunas: string[];
}

export interface PenetrometroImportResult {
  inseridos: number;
  atualizados: number;
  erros: Array<{ linha: number; erro: string }>;
}

type GeoFeature = {
  geometry?: { type?: string; coordinates?: unknown };
  properties?: Record<string, unknown>;
};

let geoFeaturesCache: GeoFeature[] | null = null;

function normalizeCell(value: unknown) {
  if (value == null) return "";
  return String(value).trim();
}

function parsePtNumber(value: unknown) {
  const raw = normalizeCell(value);
  if (!raw) return null;
  const normalized =
    raw.includes(",") && raw.includes(".")
      ? raw.replace(/\./g, "").replace(",", ".")
      : raw.includes(",")
        ? raw.replace(",", ".")
        : raw;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function parseCsvLine(line: string, delimiter = ";") {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (ch === delimiter && !quoted) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((v) => v.trim());
}

function parseCsv(text: string) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return [];
  const headers = parseCsvLine(lines[0]!);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row: PenetrometroRow = {};
    headers.forEach((header, i) => {
      row[header] = values[i] ?? "";
    });
    return row;
  });
}

function renameColumns(row: PenetrometroRow) {
  const out: PenetrometroRow = {};
  for (const [key, value] of Object.entries(row)) {
    const next =
      key === "ID Exibido"
        ? "IDExibido"
        : key === "ID Unico"
          ? "IDUnico"
          : key === "Data e Hora (UTC)"
            ? "DataeHoraUTC"
            : key === "Lote"
              ? "Talhao"
            : key;
    out[next] = value;
  }
  return out;
}

function isIdentifier(name: string) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
}

function loadGeoFeatures() {
  if (geoFeaturesCache) return geoFeaturesCache;
  const local = path.join(ROOT, "server", "data", "Mapa SHP (1).json");
  const mapPath = fs.existsSync(local) ? local : EXTERNAL_MAP_PATH;
  const parsed = JSON.parse(fs.readFileSync(mapPath, "utf8")) as { features?: GeoFeature[] };
  geoFeaturesCache = Array.isArray(parsed.features) ? parsed.features : [];
  return geoFeaturesCache;
}

function pointInRing(lng: number, lat: number, ring: number[][]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]?.[0] ?? 0;
    const yi = ring[i]?.[1] ?? 0;
    const xj = ring[j]?.[0] ?? 0;
    const yj = ring[j]?.[1] ?? 0;
    const intersect = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi || Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function normalizeRing(raw: unknown): number[][] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((pair) => (Array.isArray(pair) ? [Number(pair[0]), Number(pair[1])] : null))
    .filter((pair): pair is number[] => !!pair && Number.isFinite(pair[0]) && Number.isFinite(pair[1]));
}

function featureContains(feature: GeoFeature, lng: number, lat: number) {
  const type = feature.geometry?.type;
  const coords = feature.geometry?.coordinates;
  if (type === "Polygon" && Array.isArray(coords)) {
    const outer = normalizeRing(coords[0]);
    if (!outer.length || !pointInRing(lng, lat, outer)) return false;
    return !coords.slice(1).some((hole) => pointInRing(lng, lat, normalizeRing(hole)));
  }
  if (type === "MultiPolygon" && Array.isArray(coords)) {
    return coords.some((poly) => featureContains({ geometry: { type: "Polygon", coordinates: poly } }, lng, lat));
  }
  return false;
}

function findArea(lng: number, lat: number) {
  return loadGeoFeatures().find((feature) => featureContains(feature, lng, lat))?.properties ?? {};
}

export function previewPenetrometroCsv(text: string): PenetrometroPreviewResult {
  const dados = parseCsv(text).map((row) => {
    const lng = parsePtNumber(row.Longitude);
    const lat = parsePtNumber(row.Latitude);
    const area = lng != null && lat != null ? findArea(lng, lat) : {};
    return renameColumns({ ...row, ...area });
  });
  const colunas = [...new Set(dados.flatMap((row) => Object.keys(row)))];
  return { dados, total: dados.length, colunas };
}

function dbValue(value: unknown) {
  if (value == null) return null;
  const s = String(value).trim();
  return s === "" || s.toLowerCase() === "nan" ? null : s;
}

function toOrdsPayload(row: PenetrometroRow) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (!isIdentifier(key) && !/^\d+-\d+cm$/i.test(key) && key !== "DataeHoraUTC") continue;
    const mapped =
      key === "DataeHoraUTC"
        ? "dataehora(utc)"
        : key === "IDUnico"
          ? "idunico"
          : key === "IDExibido"
            ? "idexibido"
            : key === "Talhao"
              ? "lote"
              : key.toLowerCase();
    const clean = dbValue(value);
    const asNumber = typeof clean === "string" ? parsePtNumber(clean) : null;
    out[mapped] = asNumber != null && (mapped !== "equipamento" && mapped !== "unidade") ? asNumber : clean;
  }
  return out;
}

async function ordsRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`ORDS HTTP ${res.status}: ${text.slice(0, 500)}`);
  return text ? (JSON.parse(text) as T) : ({} as T);
}

function selfHref(row: Record<string, unknown>) {
  const links = Array.isArray(row.links) ? (row.links as Array<{ rel?: string; href?: string }>) : [];
  return links.find((link) => link.rel === "self" || link.rel === "edit")?.href ?? null;
}

async function buscarPorIdExibido(idExibido: unknown) {
  if (idExibido == null || idExibido === "") return null;
  const q = encodeURIComponent(JSON.stringify({ idexibido: idExibido }));
  const data = await ordsRequest<{ items?: Record<string, unknown>[] }>(`${ORDS_URL}?q=${q}&limit=1`);
  return data.items?.[0] ?? null;
}

async function inserirOuAtualizar(row: PenetrometroRow, linha: number) {
  const payload = toOrdsPayload(row);
  try {
    const existing = await buscarPorIdExibido(payload.idexibido);
    if (existing) {
      const href = selfHref(existing);
      if (!href) throw new Error(`Linha ${linha}: registro existente sem link de atualização.`);
      const cleanExisting = { ...existing };
      delete cleanExisting.links;
      await ordsRequest(href, { method: "PUT", body: JSON.stringify({ ...cleanExisting, ...payload }) });
      return "update" as const;
    }
    await ordsRequest(ORDS_URL, { method: "POST", body: JSON.stringify(payload) });
    return "insert" as const;
  } catch (e) {
    throw new Error(`Linha ${linha}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export async function importarPenetrometroCsv(text: string): Promise<PenetrometroImportResult> {
  const preview = previewPenetrometroCsv(text);
  let inseridos = 0;
  let atualizados = 0;
  const erros: PenetrometroImportResult["erros"] = [];
  const results = await runLimited(
    preview.dados.map((row, idx) => async () => {
      try {
        const result = await inserirOuAtualizar(row, idx + 2);
        if (result === "insert") inseridos += 1;
        else atualizados += 1;
      } catch (e) {
        erros.push({ linha: idx + 2, erro: e instanceof Error ? e.message : String(e) });
      }
    }),
    1,
  );
  void results;
  return { inseridos, atualizados, erros };
}

export async function listarPenetrometro(limit = 200): Promise<PenetrometroPreviewResult> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit) || 200, 1), 1000);
  const data = await ordsRequest<{ items?: Record<string, unknown>[] }>(`${ORDS_URL}?limit=${safeLimit}`);
  const dados = (data.items ?? []).map((row) => {
    const clean = { ...row };
    delete clean.links;
    return clean;
  });
  const colunas = [...new Set(dados.flatMap((row) => Object.keys(row)))];
  return { dados, total: dados.length, colunas };
}

export async function atualizarPenetrometroCadastro(params: {
  idUnico: string | number | null;
  campo?: string | null;
  fazenda?: string | null;
  lote?: string | number | null;
}) {
  const id = dbValue(params.idUnico);
  if (id == null) throw new Error("ID inválido.");
  const q = encodeURIComponent(JSON.stringify({ idunico: id }));
  const data = await ordsRequest<{ items?: Record<string, unknown>[] }>(`${ORDS_URL}?q=${q}&limit=1`);
  const existing = data.items?.[0];
  const href = existing ? selfHref(existing) : null;
  if (!existing || !href) throw new Error("Registro não encontrado no ORDS.");
  const cleanExisting = { ...existing };
  delete cleanExisting.links;
  await ordsRequest(href, {
    method: "PUT",
    body: JSON.stringify({
      ...cleanExisting,
      campo: dbValue(params.campo),
      fazenda: dbValue(params.fazenda),
      lote: dbValue(params.lote),
    }),
  });
  return { ok: true };
}
