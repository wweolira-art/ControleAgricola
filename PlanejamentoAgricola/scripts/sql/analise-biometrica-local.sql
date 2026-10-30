-- Estrutura local da Análise Biométrica (SQLite)
-- Executar no banco: data/planejamento.db

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

CREATE INDEX IF NOT EXISTS analise_biometrica_lancamentos_periodo_idx
  ON analise_biometrica_lancamentos(collected_at);

CREATE INDEX IF NOT EXISTS analise_biometrica_lancamentos_talhao_idx
  ON analise_biometrica_lancamentos(farm_code, field_code);

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
