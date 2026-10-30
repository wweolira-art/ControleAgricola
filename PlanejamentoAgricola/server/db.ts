import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { OFFICIAL_ACTIVITIES } from "./activities-data.js";
import { COST_CENTERS, SHEET_TITLES } from "./catalog.js";
import { OFFICIAL_COST_OBJECTS } from "./cost-objects-data.js";
import { OFFICIAL_MATERIALS } from "./materials-data.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "data");
fs.mkdirSync(dataDir, { recursive: true });

export const dbPath = path.join(dataDir, "planejamento.db");
export const db = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS sheets (
  id INTEGER PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  kind TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  visible INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS cells (
  sheet_id INTEGER NOT NULL REFERENCES sheets(id) ON DELETE CASCADE,
  row INTEGER NOT NULL,
  col INTEGER NOT NULL,
  formula TEXT,
  value TEXT,
  PRIMARY KEY (sheet_id, row, col)
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY,
  sheet_id INTEGER NOT NULL REFERENCES sheets(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS lines (
  id INTEGER PRIMARY KEY,
  sheet_id INTEGER NOT NULL REFERENCES sheets(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  object_code TEXT,
  product_code TEXT,
  item_type TEXT,
  description TEXT NOT NULL,
  is_group INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS line_months (
  line_id INTEGER NOT NULL REFERENCES lines(id) ON DELETE CASCADE,
  month_index INTEGER NOT NULL,
  formula TEXT,
  value TEXT,
  PRIMARY KEY (line_id, month_index)
);

CREATE TABLE IF NOT EXISTS activities (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  empenho TEXT
);

CREATE TABLE IF NOT EXISTS materials (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('E', 'G')),
  empenho TEXT,
  valor REAL
);

CREATE TABLE IF NOT EXISTS cost_objects (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS fazendas (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  distancia REAL
);

CREATE TABLE IF NOT EXISTS category_catalog (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE
);

CREATE TABLE IF NOT EXISTS safras (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS calc_params (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('material', 'activity')),
  material_id INTEGER REFERENCES materials(id) ON DELETE CASCADE,
  activity_id INTEGER REFERENCES activities(id) ON DELETE CASCADE,
  premise TEXT NOT NULL,
  dose REAL,
  rate_ha REAL,
  price REAL,
  safra_id INTEGER REFERENCES safras(id)
);

CREATE TABLE IF NOT EXISTS premissa_values (
  safra_id INTEGER NOT NULL REFERENCES safras(id) ON DELETE CASCADE,
  subprocess_key TEXT NOT NULL,
  qty REAL NOT NULL DEFAULT 0,
  start_day TEXT,
  end_day TEXT,
  PRIMARY KEY (safra_id, subprocess_key)
);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS sheet_verifications (
  sheet_id INTEGER NOT NULL REFERENCES sheets(id) ON DELETE CASCADE,
  safra_id INTEGER NOT NULL REFERENCES safras(id) ON DELETE CASCADE,
  PRIMARY KEY (sheet_id, safra_id)
);

CREATE TABLE IF NOT EXISTS harvest_areas (
  id INTEGER PRIMARY KEY,
  safra_id INTEGER NOT NULL REFERENCES safras(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  area REAL NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS value_distributions (
  id INTEGER PRIMARY KEY,
  created_at TEXT NOT NULL,
  safra_id INTEGER REFERENCES safras(id) ON DELETE CASCADE,
  activity_id INTEGER NOT NULL,
  activity_name TEXT NOT NULL,
  category_name TEXT NOT NULL,
  total_value REAL NOT NULL,
  months TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS value_distribution_lines (
  id INTEGER PRIMARY KEY,
  distribution_id INTEGER NOT NULL REFERENCES value_distributions(id) ON DELETE CASCADE,
  sheet_id INTEGER NOT NULL REFERENCES sheets(id) ON DELETE CASCADE,
  line_id INTEGER NOT NULL,
  created_line INTEGER NOT NULL DEFAULT 0,
  previous_months TEXT
);

CREATE TABLE IF NOT EXISTS entrada_cana_caminhao_conferencia (
  pesagem TEXT NOT NULL,
  guia TEXT NOT NULL,
  op01 TEXT,
  op02 TEXT,
  op03 TEXT,
  op04 TEXT,
  op05 TEXT,
  op06 TEXT,
  op07 TEXT,
  op08 TEXT,
  op09 TEXT,
  op10 TEXT,
  op11 TEXT,
  op12 TEXT,
  PRIMARY KEY (pesagem, guia)
);

CREATE TABLE IF NOT EXISTS paradas_colheita_local (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  api_id TEXT,
  motivo TEXT NOT NULL,
  observacao TEXT,
  inicio TEXT NOT NULL,
  fim TEXT NOT NULL,
  maquina REAL,
  cod_equipamento REAL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS lubrificacao_programacao (
  cod_equipamento INTEGER PRIMARY KEY,
  dias_semana TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS contract_controls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contrato_jatoba TEXT NOT NULL,
  empresa TEXT NOT NULL DEFAULT '',
  grupo TEXT NOT NULL DEFAULT '',
  classificacao TEXT NOT NULL DEFAULT '',
  gef TEXT NOT NULL DEFAULT '',
  codigo_contratada TEXT NOT NULL DEFAULT '',
  prioridade TEXT NOT NULL DEFAULT 'normal',
  codigo_unico TEXT NOT NULL DEFAULT '',
  uc TEXT NOT NULL DEFAULT '',
  ultima_competencia TEXT NOT NULL DEFAULT '',
  emissao TEXT,
  fazenda_local TEXT NOT NULL DEFAULT '',
  cpf_cnpj TEXT NOT NULL DEFAULT '',
  nascimento_email TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS contract_controls_contract_idx ON contract_controls(contrato_jatoba);

CREATE TABLE IF NOT EXISTS contract_verification_alerts (
  contract_id INTEGER NOT NULL REFERENCES contract_controls(id) ON DELETE CASCADE,
  competencia TEXT NOT NULL,
  sent_at TEXT NOT NULL,
  PRIMARY KEY (contract_id, competencia)
);
`);

db.exec([
  "CREATE TABLE IF NOT EXISTS calc_rules (id INTEGER PRIMARY KEY, kind TEXT NOT NULL CHECK (kind IN ('material', 'activity')), material_id INTEGER REFERENCES materials(id) ON DELETE CASCADE, activity_id INTEGER REFERENCES activities(id) ON DELETE CASCADE, sheet_id INTEGER NOT NULL REFERENCES sheets(id) ON DELETE CASCADE, category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE, premise TEXT NOT NULL, dose REAL, rate_ha REAL, line_id INTEGER REFERENCES lines(id) ON DELETE SET NULL);",
  "CREATE TABLE IF NOT EXISTS safra_kpis (safra_id INTEGER PRIMARY KEY REFERENCES safras(id) ON DELETE CASCADE, orcamento_total REAL NOT NULL DEFAULT 0, moagem REAL NOT NULL DEFAULT 0, updated_at TEXT NOT NULL, cost_centers_json TEXT, categories_json TEXT);",
  "CREATE TABLE IF NOT EXISTS safra_budget_breakdown (safra_id INTEGER NOT NULL REFERENCES safras(id) ON DELETE CASCADE, kind TEXT NOT NULL CHECK (kind IN ('subprocess', 'category', 'cost_center')), item_key TEXT NOT NULL, item_label TEXT NOT NULL, total REAL NOT NULL DEFAULT 0, PRIMARY KEY (safra_id, kind, item_key));",
  "CREATE TABLE IF NOT EXISTS premissa_cells (safra_id INTEGER NOT NULL REFERENCES safras(id) ON DELETE CASCADE, row INTEGER NOT NULL, col INTEGER NOT NULL, formula TEXT, value TEXT, PRIMARY KEY (safra_id, row, col));",
  "CREATE TABLE IF NOT EXISTS premissa_copies (id INTEGER PRIMARY KEY, safra_id INTEGER NOT NULL REFERENCES safras(id) ON DELETE CASCADE, dest_key TEXT NOT NULL, source_key TEXT NOT NULL, source_scope TEXT NOT NULL CHECK (source_scope IN ('current', 'previous')), start_month INTEGER NOT NULL CHECK (start_month >= 0 AND start_month <= 11), end_month INTEGER NOT NULL DEFAULT 11 CHECK (end_month >= 0 AND end_month <= 11));",
  "CREATE TABLE IF NOT EXISTS premissa_subprocesses (id INTEGER PRIMARY KEY, safra_id INTEGER NOT NULL REFERENCES safras(id) ON DELETE CASCADE, key TEXT NOT NULL, name TEXT NOT NULL, suffix TEXT NOT NULL DEFAULT 'ha', kind TEXT NOT NULL DEFAULT 'subprocess', UNIQUE (safra_id, key));",
  "CREATE TABLE IF NOT EXISTS calc_param_cost_objects (calc_param_id INTEGER NOT NULL REFERENCES calc_params(id) ON DELETE CASCADE, cost_object_id INTEGER NOT NULL REFERENCES cost_objects(id) ON DELETE CASCADE, PRIMARY KEY (calc_param_id, cost_object_id));",
  "CREATE TABLE IF NOT EXISTS empenhos (id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE, description TEXT NOT NULL);",
  "CREATE TABLE IF NOT EXISTS parametros_tecnicos (safra_id INTEGER NOT NULL REFERENCES safras(id) ON DELETE CASCADE, anomes_inicio TEXT NOT NULL, anomes_fim TEXT NOT NULL, area_plantio REAL NOT NULL, area_soca REAL NOT NULL, area_irrigacao REAL NOT NULL, area_arrendada REAL NOT NULL, moagem_lj REAL NOT NULL DEFAULT 0, tonelagem_manual REAL NOT NULL DEFAULT 0, atr REAL NOT NULL DEFAULT 0, produtividade REAL NOT NULL DEFAULT 0, preco_atr_consecana REAL NOT NULL DEFAULT 0, updated_at TEXT NOT NULL, PRIMARY KEY (safra_id, anomes_inicio, anomes_fim));",
  "CREATE TABLE IF NOT EXISTS custo_colheita_local (safra_id INTEGER NOT NULL REFERENCES safras(id) ON DELETE CASCADE, anomes_inicio TEXT NOT NULL, anomes_fim TEXT NOT NULL, secao TEXT NOT NULL, objeto TEXT NOT NULL, custo REAL NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (safra_id, anomes_inicio, anomes_fim, secao, objeto));",
].join("\n"));

const addColumn = (sql: string) => {
  try {
    db.exec(sql);
  } catch {
    /* coluna já existe */
  }
};

addColumn("ALTER TABLE lines ADD COLUMN activity_id INTEGER REFERENCES activities(id)");
addColumn("ALTER TABLE contract_controls ADD COLUMN uc TEXT NOT NULL DEFAULT ''");
addColumn("ALTER TABLE contract_controls ADD COLUMN ultima_competencia TEXT NOT NULL DEFAULT ''");
addColumn("ALTER TABLE contract_controls ADD COLUMN prioridade TEXT NOT NULL DEFAULT 'normal'");
addColumn("ALTER TABLE contract_controls ADD COLUMN empresa TEXT NOT NULL DEFAULT ''");
addColumn("ALTER TABLE contract_controls ADD COLUMN ultima_emissao TEXT");
db.exec(`UPDATE contract_controls
         SET prioridade = CASE
           WHEN CAST(prioridade AS INTEGER) = 1 THEN 'alta'
           WHEN prioridade NOT IN ('alta', 'media', 'normal') THEN 'normal'
           ELSE prioridade
         END`);
addColumn("ALTER TABLE lines ADD COLUMN material_id INTEGER REFERENCES materials(id)");
addColumn("ALTER TABLE lines ADD COLUMN cost_object_id INTEGER REFERENCES cost_objects(id)");
addColumn("ALTER TABLE lines ADD COLUMN ref_kind TEXT");
addColumn("ALTER TABLE lines ADD COLUMN parent_id INTEGER REFERENCES lines(id)");
addColumn("ALTER TABLE materials ADD COLUMN valor REAL");
addColumn("ALTER TABLE materials ADD COLUMN grupo TEXT");
addColumn("ALTER TABLE activities ADD COLUMN valor REAL");
addColumn("ALTER TABLE activities ADD COLUMN empenho TEXT");
addColumn("ALTER TABLE calc_params ADD COLUMN rate_ha REAL");
addColumn("ALTER TABLE calc_params ADD COLUMN safra_id INTEGER REFERENCES safras(id)");
addColumn("ALTER TABLE calc_params ADD COLUMN price REAL");
addColumn("ALTER TABLE calc_params ADD COLUMN exclude_weekdays TEXT");
addColumn("ALTER TABLE calc_params ADD COLUMN area_premise TEXT");
addColumn("ALTER TABLE calc_params ADD COLUMN from_materials INTEGER NOT NULL DEFAULT 0");
addColumn("ALTER TABLE calc_params ADD COLUMN calc_mode TEXT NOT NULL DEFAULT 'area'");
addColumn("ALTER TABLE lines ADD COLUMN use_activity_auto INTEGER NOT NULL DEFAULT 1");
addColumn("ALTER TABLE lines ADD COLUMN start_month INTEGER");
addColumn("ALTER TABLE lines ADD COLUMN end_month INTEGER");
addColumn("ALTER TABLE lines ADD COLUMN calc_premise TEXT");
addColumn("ALTER TABLE lines ADD COLUMN calc_dose REAL");
addColumn("ALTER TABLE lines ADD COLUMN calc_price REAL");
addColumn("ALTER TABLE lines ADD COLUMN calc_exclude_weekdays TEXT");
addColumn("ALTER TABLE lines ADD COLUMN calc_area_premise TEXT");
addColumn("ALTER TABLE lines ADD COLUMN calc_area_pct REAL");
addColumn("ALTER TABLE lines ADD COLUMN calc_area_ha REAL");
addColumn("ALTER TABLE entrada_cana_caminhao_conferencia ADD COLUMN op05 TEXT");
addColumn("ALTER TABLE entrada_cana_caminhao_conferencia ADD COLUMN op06 TEXT");
addColumn("ALTER TABLE entrada_cana_caminhao_conferencia ADD COLUMN op07 TEXT");
addColumn("ALTER TABLE entrada_cana_caminhao_conferencia ADD COLUMN op08 TEXT");
addColumn("ALTER TABLE entrada_cana_caminhao_conferencia ADD COLUMN op09 TEXT");
addColumn("ALTER TABLE entrada_cana_caminhao_conferencia ADD COLUMN op10 TEXT");
addColumn("ALTER TABLE entrada_cana_caminhao_conferencia ADD COLUMN op11 TEXT");
addColumn("ALTER TABLE entrada_cana_caminhao_conferencia ADD COLUMN op12 TEXT");
addColumn("ALTER TABLE paradas_colheita_local ADD COLUMN observacao TEXT");
addColumn("ALTER TABLE paradas_colheita_local ADD COLUMN api_id TEXT");
addColumn("ALTER TABLE lines ADD COLUMN calc_months TEXT");
addColumn("ALTER TABLE lines ADD COLUMN calc_plans TEXT");
addColumn("ALTER TABLE lines ADD COLUMN calc_reduce_pct REAL");
addColumn("ALTER TABLE lines ADD COLUMN calc_applications REAL");
addColumn("ALTER TABLE lines ADD COLUMN calc_direct INTEGER NOT NULL DEFAULT 0");
addColumn("ALTER TABLE lines ADD COLUMN calc_kind TEXT");
addColumn("ALTER TABLE lines ADD COLUMN calc_trips REAL");
addColumn("ALTER TABLE lines ADD COLUMN calc_machine_qty REAL");
addColumn("ALTER TABLE lines ADD COLUMN calc_hour_interval REAL");
addColumn("ALTER TABLE lines ADD COLUMN obc_split_group TEXT");
addColumn("ALTER TABLE lines ADD COLUMN observation TEXT");
addColumn("ALTER TABLE calc_params ADD COLUMN start_month INTEGER");
addColumn("ALTER TABLE calc_params ADD COLUMN end_month INTEGER");
addColumn("ALTER TABLE calc_params ADD COLUMN use_activity_auto INTEGER NOT NULL DEFAULT 1");
addColumn("ALTER TABLE premissa_values ADD COLUMN months TEXT");
addColumn("ALTER TABLE premissa_values ADD COLUMN manual_months INTEGER NOT NULL DEFAULT 0");
addColumn("ALTER TABLE lines ADD COLUMN empenho_override TEXT");
addColumn("ALTER TABLE fazendas ADD COLUMN distancia REAL");
addColumn("ALTER TABLE categories ADD COLUMN catalog_id INTEGER REFERENCES category_catalog(id)");
addColumn("ALTER TABLE lines ADD COLUMN center_sheet_id INTEGER REFERENCES sheets(id)");
addColumn("ALTER TABLE lines ADD COLUMN funcionario_api_config TEXT");

// Migração da primeira versão dos nomes em inglês, preservando os dados locais.
const renameBiometricTable = (oldName: string, newName: string) => {
  const oldExists = Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(oldName));
  const newExists = Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(newName));
  if (oldExists && !newExists) db.exec(`ALTER TABLE "${oldName}" RENAME TO "${newName}"`);
};
renameBiometricTable("biometric_items", "analise_biometrica_itens");
renameBiometricTable("biometric_measurements", "analise_biometrica_lancamentos");
renameBiometricTable("biometric_farms", "analise_biometrica_fazendas");
renameBiometricTable("biometric_fields", "analise_biometrica_talhoes");
db.exec("DROP INDEX IF EXISTS biometric_measurements_period_idx; DROP INDEX IF EXISTS biometric_measurements_field_idx;");

// Cache local da Análise Biométrica. Mantém os dados consultados no ORDS/Oracle
// disponíveis para consulta mesmo durante indisponibilidade da fonte externa.
db.exec(`
CREATE TABLE IF NOT EXISTS analise_biometrica_itens (
  code INTEGER PRIMARY KEY,
  description TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS analise_biometrica_lancamentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  collected_at TEXT NOT NULL,
  data_label TEXT NOT NULL,
  point_code TEXT NOT NULL DEFAULT '',
  item_code INTEGER NOT NULL,
  farm_code TEXT NOT NULL,
  field_code TEXT NOT NULL,
  variety TEXT NOT NULL DEFAULT '',
  value REAL NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(collected_at, point_code, item_code, farm_code, field_code, variety, value)
);
CREATE INDEX IF NOT EXISTS analise_biometrica_lancamentos_periodo_idx ON analise_biometrica_lancamentos(collected_at);
CREATE INDEX IF NOT EXISTS analise_biometrica_lancamentos_talhao_idx ON analise_biometrica_lancamentos(farm_code, field_code);
CREATE TABLE IF NOT EXISTS analise_biometrica_fazendas (
  code TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS analise_biometrica_talhoes (
  farm_code TEXT NOT NULL,
  field_code TEXT NOT NULL,
  area_ha REAL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (farm_code, field_code)
);

CREATE TABLE IF NOT EXISTS entrada_cana_caminhao_local (
  chave TEXT PRIMARY KEY,
  data_iso TEXT,
  pesagem TEXT,
  guia TEXT,
  caminhao TEXT,
  dados_json TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS entrada_cana_caminhao_local_data_idx ON entrada_cana_caminhao_local(data_iso);
CREATE INDEX IF NOT EXISTS entrada_cana_caminhao_local_caminhao_idx ON entrada_cana_caminhao_local(caminhao);
`);

export function linkLineCatalogs() {
  db.exec(`
    UPDATE lines
    SET cost_object_id = (SELECT id FROM cost_objects WHERE cost_objects.code = lines.object_code)
    WHERE cost_object_id IS NULL AND object_code IS NOT NULL AND TRIM(object_code) != '';

    UPDATE lines
    SET material_id = (SELECT id FROM materials WHERE materials.code = lines.product_code),
        ref_kind = 'material'
    WHERE product_code IS NOT NULL AND TRIM(product_code) != ''
      AND material_id IS NULL
      AND (ref_kind IS NULL OR TRIM(COALESCE(ref_kind, '')) = '')
      AND NOT (
        COALESCE(is_group, 0) = 1
        AND TRIM(COALESCE(product_code, '')) <> ''
      );

    UPDATE lines
    SET ref_kind = 'activity'
    WHERE activity_id IS NOT NULL AND (ref_kind IS NULL OR ref_kind = '');
  `);
}

export function seedOfficialActivities(force = false) {
  const done = db.prepare("SELECT value FROM meta WHERE key = 'activities_catalog'").get() as { value: string } | undefined;
  if (done?.value === "oficial-2026-08" && !force) return;

  const ins = db.prepare("INSERT INTO activities (code, description) VALUES (?, ?)");
  const tx = db.transaction(() => {
    db.exec("UPDATE lines SET activity_id = NULL WHERE activity_id IS NOT NULL");
    db.exec("DELETE FROM activities");
    for (const row of OFFICIAL_ACTIVITIES) {
      ins.run(row.code, row.description);
    }
    db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('activities_catalog', 'oficial-2026-08')").run();
  });
  tx();
}

export function seedOfficialCostObjects(force = false) {
  const done = db.prepare("SELECT value FROM meta WHERE key = 'cost_objects_catalog'").get() as { value: string } | undefined;
  if (done?.value === "oficial-2026-08" && !force) return;

  const ins = db.prepare("INSERT INTO cost_objects (code, description) VALUES (?, ?)");
  const tx = db.transaction(() => {
    db.exec("UPDATE lines SET cost_object_id = NULL WHERE cost_object_id IS NOT NULL");
    db.exec("DELETE FROM cost_objects");
    for (const row of OFFICIAL_COST_OBJECTS) {
      ins.run(row.code, row.description);
    }
    db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('cost_objects_catalog', 'oficial-2026-08')").run();
  });
  tx();
}

export function seedOfficialMaterials(force = false) {
  const done = db.prepare("SELECT value FROM meta WHERE key = 'materials_catalog'").get() as { value: string } | undefined;
  if (done?.value === "oficial-2026-08" && !force) return;

  const ins = db.prepare(
    "INSERT INTO materials (code, description, tipo, empenho, valor) VALUES (?, ?, 'E', ?, ?)",
  );
  const tx = db.transaction(() => {
    db.exec("UPDATE lines SET material_id = NULL WHERE material_id IS NOT NULL");
    db.exec("DELETE FROM materials");
    for (const row of OFFICIAL_MATERIALS) {
      ins.run(row.code, row.description, row.empenho, row.valor);
    }
    db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('materials_catalog', 'oficial-2026-08')").run();
  });
  tx();
}

export function seedCategoryCatalog() {
  db.exec(`
    INSERT OR IGNORE INTO category_catalog (name)
    SELECT DISTINCT TRIM(name) FROM categories
    WHERE name IS NOT NULL AND TRIM(name) != '';

    UPDATE categories
    SET catalog_id = (
      SELECT id FROM category_catalog WHERE category_catalog.name = categories.name
    )
    WHERE catalog_id IS NULL;
  `);
}

/** Garante que todo centro de custo do catálogo exista como aba em Orçamentos. */
export function ensureCostCenterSheets() {
  const existing = new Set(
    (db.prepare("SELECT name FROM sheets").all() as { name: string }[]).map((row) => row.name),
  );
  const maxSort = (db.prepare("SELECT COALESCE(MAX(sort_order), 0) AS m FROM sheets").get() as { m: number }).m;
  const insert = db.prepare(
    "INSERT INTO sheets (name, title, kind, sort_order, visible) VALUES (?, ?, 'cost_center', ?, 1)",
  );
  let nextSort = maxSort + 1;
  const tx = db.transaction(() => {
    for (const name of COST_CENTERS) {
      if (existing.has(name)) continue;
      insert.run(name, SHEET_TITLES[name] ?? name, nextSort++);
    }
  });
  tx();
}

export function seedCatalogs() {
  seedOfficialActivities();
  seedOfficialCostObjects();
  seedOfficialMaterials();
  seedCategoryCatalog();
  ensureCostCenterSheets();
  linkLineCatalogs();
  db.prepare("INSERT OR IGNORE INTO activities (code, description) VALUES (?, ?)").run("PLANTIO", "PLANTIO");
  try {
    const empty = db.prepare("SELECT COUNT(*) AS n FROM calc_params").get() as { n: number };
    const old = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'calc_rules'").get();
    if (old && empty.n === 0) {
      db.exec(
        `INSERT INTO calc_params (kind, material_id, activity_id, premise, dose)
         SELECT kind, material_id, activity_id, premise, dose FROM calc_rules`,
      );
    }
  } catch {
    /* tabela antiga pode não existir */
  }
}
