import { db } from "./db.js";

const COST_PLANNING_TABLES = [
  "activities",
  "activity_realizado_links",
  "calc_param_cost_objects",
  "calc_params",
  "calc_rules",
  "categories",
  "category_catalog",
  "cells",
  "cost_objects",
  "custo_colheita_local",
  "empenhos",
  "fazendas",
  "harvest_areas",
  "horas_equipamento",
  "horas_lote",
  "line_months",
  "line_safra_prices",
  "lines",
  "materials",
  "parametros_tecnicos",
  "premissa_cells",
  "premissa_copies",
  "premissa_subprocesses",
  "premissa_values",
  "safra_budget_breakdown",
  "safra_kpis",
  "safras",
  "seed_radius_tariffs",
  "sheet_verifications",
  "sheets",
  "un_realizado_operations",
  "un_realizado_sources",
  "value_distribution_lines",
  "value_distributions",
] as const;

type CostPlanningTable = (typeof COST_PLANNING_TABLES)[number];
type Row = Record<string, unknown>;

export type CostPlanningBackup = {
  module: "custo-planejamento";
  version: 1;
  exportedAt: string;
  tables: Partial<Record<CostPlanningTable, Row[]>>;
};

function hasTable(name: string) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
}

function quoted(name: string) {
  return `"${name.replace(/"/g, '""')}"`;
}

function tableColumns(table: CostPlanningTable) {
  return (db.prepare(`PRAGMA table_info(${quoted(table)})`).all() as { name: string }[]).map((column) => column.name);
}

export function exportCostPlanning(): CostPlanningBackup {
  const tables: CostPlanningBackup["tables"] = {};
  for (const table of COST_PLANNING_TABLES) {
    if (!hasTable(table)) continue;
    tables[table] = db.prepare(`SELECT * FROM ${quoted(table)}`).all() as Row[];
  }
  return { module: "custo-planejamento", version: 1, exportedAt: new Date().toISOString(), tables };
}

function parseBackup(value: unknown): CostPlanningBackup {
  if (!value || typeof value !== "object") throw new Error("Arquivo de Custo e Planejamento inválido.");
  const backup = value as Partial<CostPlanningBackup>;
  if (backup.module !== "custo-planejamento" || backup.version !== 1 || !backup.tables || typeof backup.tables !== "object") {
    throw new Error("Este arquivo não é uma exportação de Custo e Planejamento compatível.");
  }
  if (!Array.isArray(backup.tables.sheets) || !Array.isArray(backup.tables.safras)) {
    throw new Error("O arquivo não contém os centros de custo e safras necessários.");
  }
  for (const table of COST_PLANNING_TABLES) {
    const rows = backup.tables[table];
    if (rows !== undefined && (!Array.isArray(rows) || rows.some((row) => !row || typeof row !== "object" || Array.isArray(row)))) {
      throw new Error(`Dados inválidos na tabela ${table}.`);
    }
  }
  return backup as CostPlanningBackup;
}

function insertRows(table: CostPlanningTable, rows: Row[]) {
  if (!rows.length || !hasTable(table)) return 0;
  const columns = tableColumns(table);
  const insert = db.prepare(
    `INSERT INTO ${quoted(table)} (${columns.map(quoted).join(", ")}) VALUES (${columns.map((column) => `@${column}`).join(", ")})`,
  );
  let inserted = 0;
  for (const row of rows) {
    const values = Object.fromEntries(columns.map((column) => [column, row[column] ?? null]));
    insert.run(values);
    inserted += 1;
  }
  return inserted;
}

const DELETE_ORDER: CostPlanningTable[] = [
  "line_months", "line_safra_prices", "cells", "calc_param_cost_objects", "calc_params", "calc_rules",
  "activity_realizado_links", "value_distribution_lines", "value_distributions", "premissa_cells", "premissa_copies",
  "premissa_subprocesses", "premissa_values", "sheet_verifications", "harvest_areas", "seed_radius_tariffs",
  "safra_budget_breakdown", "safra_kpis", "custo_colheita_local", "parametros_tecnicos", "un_realizado_operations",
  "un_realizado_sources", "horas_equipamento", "horas_lote", "lines", "categories", "sheets", "activities",
  "materials", "cost_objects", "fazendas", "category_catalog", "empenhos", "safras",
];

const INSERT_ORDER: CostPlanningTable[] = [
  "category_catalog", "activities", "materials", "cost_objects", "fazendas", "empenhos", "safras", "sheets",
  "categories", "lines", "cells", "line_months", "line_safra_prices", "calc_params", "calc_param_cost_objects",
  "calc_rules", "activity_realizado_links", "premissa_values", "premissa_cells", "premissa_copies", "premissa_subprocesses",
  "value_distributions", "value_distribution_lines", "sheet_verifications", "harvest_areas", "seed_radius_tariffs",
  "safra_budget_breakdown", "safra_kpis", "custo_colheita_local", "parametros_tecnicos", "un_realizado_sources",
  "un_realizado_operations", "horas_equipamento", "horas_lote",
];

export function replaceCostPlanning(value: unknown) {
  const backup = parseBackup(value);
  let imported = 0;
  const replace = db.transaction(() => {
    // A ordem foi definida pelas chaves estrangeiras para não afetar tabelas de outros módulos.
    for (const table of DELETE_ORDER) if (hasTable(table)) db.exec(`DELETE FROM ${quoted(table)}`);
    for (const table of INSERT_ORDER) imported += insertRows(table, backup.tables[table] ?? []);
  });
  replace();
  return { imported, sheets: backup.tables.sheets?.length ?? 0, safras: backup.tables.safras?.length ?? 0 };
}
