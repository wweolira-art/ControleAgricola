import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { db } from "../db.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const EXTERNAL_MAP_PATH = "C:\\Users\\rayhiran\\Desktop\\Softwares\\build\\exe.win-amd64-3.13\\Mapa SHP (1).json";
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

function toBancoPayload(row: PenetrometroRow) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (!isIdentifier(key) && !/^\d+-\d+cm$/i.test(key) && key !== "DataeHoraUTC" && key !== "dataehora(utc)") continue;
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

function garantirTabelaCompactacaoSolo() {
  db.exec(`CREATE TABLE IF NOT EXISTS compactacao_solo (
    id_unico TEXT PRIMARY KEY,
    id_exibido TEXT,
    data_hora_utc TEXT,
    campo TEXT,
    fazenda TEXT,
    lote TEXT,
    dados_json TEXT NOT NULL,
    atualizado_em TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_compactacao_solo_data ON compactacao_solo(data_hora_utc);
  CREATE INDEX IF NOT EXISTS idx_compactacao_solo_fazenda ON compactacao_solo(fazenda);`);
}

function texto(value: unknown) {
  const result = dbValue(value);
  return result == null ? null : String(result);
}

function idLocal(payload: Record<string, unknown>) {
  const id = texto(payload.idunico) ?? texto(payload.idexibido);
  if (id) return id;
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function salvarLinha(row: PenetrometroRow) {
  const payload = toBancoPayload(row);
  const id = idLocal(payload);
  const existente = db.prepare("SELECT 1 FROM compactacao_solo WHERE id_unico = ?").get(id);
  db.prepare(`INSERT INTO compactacao_solo (id_unico, id_exibido, data_hora_utc, campo, fazenda, lote, dados_json, atualizado_em)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id_unico) DO UPDATE SET
      id_exibido = excluded.id_exibido, data_hora_utc = excluded.data_hora_utc,
      campo = excluded.campo, fazenda = excluded.fazenda, lote = excluded.lote,
      dados_json = excluded.dados_json, atualizado_em = excluded.atualizado_em`)
    .run(id, texto(payload.idexibido), texto(payload["dataehora(utc)"]), texto(payload.campo), texto(payload.fazenda), texto(payload.lote), JSON.stringify({ ...payload, idunico: payload.idunico ?? id }), new Date().toISOString());
  return existente ? "update" as const : "insert" as const;
}

export async function importarPenetrometroCsv(text: string): Promise<PenetrometroImportResult> {
  const preview = previewPenetrometroCsv(text);
  return importarPenetrometroRegistros(preview.dados);
}

/** Importa medições já estruturadas, inclusive os registros exportados pela ORDS. */
export function importarPenetrometroRegistros(dados: PenetrometroRow[]): PenetrometroImportResult {
  garantirTabelaCompactacaoSolo();
  let inseridos = 0;
  let atualizados = 0;
  const erros: PenetrometroImportResult["erros"] = [];
  const salvar = db.transaction(() => {
    dados.forEach((row, idx) => {
      try {
        const result = salvarLinha(row);
        if (result === "insert") inseridos += 1;
        else atualizados += 1;
      } catch (e) {
        erros.push({ linha: idx + 2, erro: e instanceof Error ? e.message : String(e) });
      }
    });
  });
  salvar();
  return { inseridos, atualizados, erros };
}

export async function listarPenetrometro(limit = 200): Promise<PenetrometroPreviewResult> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit) || 200, 1), 1000);
  garantirTabelaCompactacaoSolo();
  const dados = db.prepare("SELECT dados_json FROM compactacao_solo ORDER BY data_hora_utc DESC, id_unico DESC LIMIT ?").all(safeLimit)
    .map((row) => JSON.parse(String((row as { dados_json: string }).dados_json)) as PenetrometroRow);
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
  garantirTabelaCompactacaoSolo();
  const existing = db.prepare("SELECT dados_json FROM compactacao_solo WHERE id_unico = ?").get(id) as { dados_json: string } | undefined;
  if (!existing) throw new Error("Registro não encontrado no banco local.");
  const dados = JSON.parse(existing.dados_json) as PenetrometroRow;
  dados.campo = dbValue(params.campo);
  dados.fazenda = dbValue(params.fazenda);
  dados.lote = dbValue(params.lote);
  db.prepare(`UPDATE compactacao_solo SET campo = ?, fazenda = ?, lote = ?, dados_json = ?, atualizado_em = ? WHERE id_unico = ?`)
    .run(texto(dados.campo), texto(dados.fazenda), texto(dados.lote), JSON.stringify(dados), new Date().toISOString(), id);
  return { ok: true };
}
