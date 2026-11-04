import { db } from "../db.js";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  normalizarGruposPeriodo,
  type GrupoMotoristaPeriodo,
} from "../../src/lib/motoristas-canavieiros-periodos.js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const EXPORT_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "data", "motoristas-canavieiros-export.json");

type PeriodoExportado = { dataInicio: string; dataFim: string; updatedAt?: string; grupos: unknown };
let exportacaoCache: PeriodoExportado[] | null = null;

function periodosExportados() {
  if (exportacaoCache) return exportacaoCache;
  try {
    if (!existsSync(EXPORT_PATH)) return (exportacaoCache = []);
    const parsed = JSON.parse(readFileSync(EXPORT_PATH, "utf8")) as { periodos?: unknown };
    exportacaoCache = Array.isArray(parsed.periodos)
      ? parsed.periodos.filter((item): item is PeriodoExportado => Boolean(item && typeof item === "object"))
      : [];
  } catch {
    exportacaoCache = [];
  }
  return exportacaoCache;
}

function ensureTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS colheita_motorista_canavieiro (
      data_inicio TEXT NOT NULL,
      data_fim TEXT NOT NULL,
      grupos_json TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (data_inicio, data_fim)
    );
  `);
}

function periodo(dataInicio: unknown, dataFim: unknown) {
  const inicio = String(dataInicio ?? "").trim();
  const fim = String(dataFim ?? "").trim();
  if (!ISO_DATE.test(inicio) || !ISO_DATE.test(fim) || inicio > fim) {
    throw Object.assign(new Error("Informe o período dos motoristas."), { status: 400 });
  }
  return { inicio, fim };
}

export function obterMotoristasCanavieiros(dataInicio: unknown, dataFim: unknown) {
  ensureTable();
  const { inicio, fim } = periodo(dataInicio, dataFim);
  let row = db
    .prepare(
      `SELECT grupos_json, updated_at
       FROM colheita_motorista_canavieiro
       WHERE data_inicio = ? AND data_fim = ?`,
    )
    .get(inicio, fim) as { grupos_json: string; updated_at: string } | undefined;
  if (!row) {
    const exportado = periodosExportados().find((item) => item.dataInicio === inicio && item.dataFim === fim);
    if (exportado) {
      const grupos = normalizarGruposPeriodo(exportado.grupos);
      db.prepare(
        `INSERT INTO colheita_motorista_canavieiro (data_inicio, data_fim, grupos_json, updated_at)
         VALUES (?, ?, ?, ?)`,
      ).run(inicio, fim, JSON.stringify(grupos), exportado.updatedAt || new Date().toISOString());
      row = db
        .prepare(
          `SELECT grupos_json, updated_at
           FROM colheita_motorista_canavieiro
           WHERE data_inicio = ? AND data_fim = ?`,
        )
        .get(inicio, fim) as { grupos_json: string; updated_at: string } | undefined;
    }
  }
  let grupos: GrupoMotoristaPeriodo[] = [];
  if (row?.grupos_json) {
    try {
      grupos = normalizarGruposPeriodo(JSON.parse(row.grupos_json));
    } catch {
      grupos = [];
    }
  }
  return {
    dataInicio: inicio,
    dataFim: fim,
    grupos,
    updatedAt: row?.updated_at ?? null,
  };
}

export function salvarMotoristasCanavieiros(input: { dataInicio: unknown; dataFim: unknown; grupos: unknown }) {
  ensureTable();
  const { inicio, fim } = periodo(input.dataInicio, input.dataFim);
  const grupos = normalizarGruposPeriodo(input.grupos);
  db.prepare(
    `INSERT INTO colheita_motorista_canavieiro (data_inicio, data_fim, grupos_json, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(data_inicio, data_fim) DO UPDATE SET
       grupos_json = excluded.grupos_json,
       updated_at = datetime('now')`,
  ).run(inicio, fim, JSON.stringify(grupos));
  return obterMotoristasCanavieiros(inicio, fim);
}
