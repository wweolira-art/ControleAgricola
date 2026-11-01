import type Database from "better-sqlite3";

export type ParametrosEquipamentoIrrigacao = {
  codigo: number;
  vazao: number;
  comprimento: number;
};

function garantirTabelaParametros(db: Database.Database) {
  db.exec(`CREATE TABLE IF NOT EXISTS irrigacao_equipamentos_parametros (
    codigo INTEGER PRIMARY KEY, vazao REAL NOT NULL CHECK(vazao > 0),
    comprimento REAL NOT NULL CHECK(comprimento > 0)
  )`);
}

/** Os parâmetros pertencem exclusivamente ao banco deste dispositivo. */
export function listarParametrosEquipamentosIrrigacao(db: Database.Database) {
  garantirTabelaParametros(db);
  return db.prepare("SELECT codigo, vazao, comprimento FROM irrigacao_equipamentos_parametros ORDER BY codigo").all() as ParametrosEquipamentoIrrigacao[];
}

export function salvarParametrosEquipamentoIrrigacao(parametros: ParametrosEquipamentoIrrigacao, db: Database.Database) {
  garantirTabelaParametros(db);
  const { codigo, vazao, comprimento } = parametros;
  if (!Number.isSafeInteger(codigo) || codigo <= 0) throw new Error("Equipamento inválido.");
  if (!Number.isFinite(vazao) || vazao <= 0) throw new Error("Informe uma vazão maior que zero.");
  if (!Number.isFinite(comprimento) || comprimento <= 0) throw new Error("Informe um comprimento maior que zero.");

  db.prepare(`INSERT INTO irrigacao_equipamentos_parametros (codigo, vazao, comprimento)
    VALUES (?, ?, ?) ON CONFLICT(codigo) DO UPDATE SET vazao = excluded.vazao, comprimento = excluded.comprimento`)
    .run(codigo, vazao, comprimento);
  return db
    .prepare("SELECT codigo, vazao, comprimento FROM irrigacao_equipamentos_parametros WHERE codigo = ?")
    .get(codigo) as ParametrosEquipamentoIrrigacao;
}
