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
let exportacaoImportada = false;

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

function importarExportacaoSeAusente() {
  if (exportacaoImportada) return;
  exportacaoImportada = true;
  const existente = db.prepare(
    "SELECT grupos_json FROM colheita_motorista_canavieiro WHERE data_inicio = ? AND data_fim = ?",
  );
  const inserir = db.prepare(
    `INSERT INTO colheita_motorista_canavieiro (data_inicio, data_fim, grupos_json, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(data_inicio, data_fim) DO NOTHING`,
  );
  const atualizar = db.prepare(
    `UPDATE colheita_motorista_canavieiro
        SET grupos_json = ?, updated_at = ?
      WHERE data_inicio = ? AND data_fim = ?`,
  );
  const quantidadeMotoristas = (grupos: GrupoMotoristaPeriodo[]) =>
    grupos.reduce((total, grupo) => total + [...grupo.equipamentos.flatMap((equipamento) => equipamento.motoristas), ...grupo.folguistas]
      .filter((motorista) => Boolean(motorista.matricula || motorista.nome)).length, 0);
  const salvar = db.transaction(() => {
    for (const item of periodosExportados()) {
      if (!ISO_DATE.test(item.dataInicio) || !ISO_DATE.test(item.dataFim) || item.dataInicio > item.dataFim) continue;
      const gruposExportados = normalizarGruposPeriodo(item.grupos);
      const registro = existente.get(item.dataInicio, item.dataFim) as { grupos_json?: string } | undefined;
      if (!registro) {
        inserir.run(item.dataInicio, item.dataFim, JSON.stringify(gruposExportados), item.updatedAt || new Date().toISOString());
        continue;
      }
      try {
        const gruposLocais = normalizarGruposPeriodo(JSON.parse(registro.grupos_json || "[]"));
        // Mantém os ajustes já completos no computador de destino, mas corrige
        // cadastros vazios/parciais que impediam a migração inicial.
        if (quantidadeMotoristas(gruposLocais) < quantidadeMotoristas(gruposExportados)) {
          atualizar.run(JSON.stringify(gruposExportados), item.updatedAt || new Date().toISOString(), item.dataInicio, item.dataFim);
        }
      } catch {
        atualizar.run(JSON.stringify(gruposExportados), item.updatedAt || new Date().toISOString(), item.dataInicio, item.dataFim);
      }
    }
  });
  salvar();
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
  importarExportacaoSeAusente();
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

export function listarPeriodosMotoristasCanavieiros() {
  ensureTable();
  const rows = db.prepare(
    `SELECT data_inicio, data_fim, grupos_json, updated_at
       FROM colheita_motorista_canavieiro
      ORDER BY data_inicio DESC, data_fim DESC`,
  ).all() as Array<{ data_inicio: string; data_fim: string; grupos_json: string; updated_at: string }>;
  return rows.map((row) => {
    let grupos: GrupoMotoristaPeriodo[] = [];
    try { grupos = normalizarGruposPeriodo(JSON.parse(row.grupos_json)); } catch { /* registro inválido não é origem de cópia */ }
    const motoristas = grupos.reduce(
      (total, grupo) => total + [...grupo.equipamentos.flatMap((equipamento) => equipamento.motoristas), ...grupo.folguistas]
        .filter((motorista) => Boolean(motorista.matricula || motorista.nome)).length,
      0,
    );
    return {
      dataInicio: row.data_inicio,
      dataFim: row.data_fim,
      updatedAt: row.updated_at,
      grupos: grupos.length,
      equipamentos: grupos.reduce((total, grupo) => total + grupo.equipamentos.length, 0),
      motoristas,
    };
  });
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
