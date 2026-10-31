import { db } from "../db.js";

export type ParametrosEquipamentoIrrigacao = {
  codigo: number;
  vazao: number;
  comprimento: number;
};

function garantirTabelaParametros() {
  db.exec(`CREATE TABLE IF NOT EXISTS irrigacao_equipamentos_parametros (
    codigo INTEGER PRIMARY KEY, vazao REAL NOT NULL CHECK(vazao > 0),
    comprimento REAL NOT NULL CHECK(comprimento > 0)
  )`);
}

export function listarParametrosEquipamentosIrrigacao() {
  garantirTabelaParametros();
  const inserir = db.prepare("INSERT OR IGNORE INTO irrigacao_equipamentos_parametros (codigo, vazao, comprimento) VALUES (?, ?, ?)");
  db.transaction(() => {
    inserir.run(8001, 220, 288);
    inserir.run(8002, 150, 238);
    inserir.run(8003, 140, 199);
    inserir.run(8004, 140, 199);
    inserir.run(8005, 420, 397);
    inserir.run(8006, 424, 500);
    inserir.run(8007, 250, 235);
    inserir.run(8008, 250, 235);
  })();
  return db.prepare("SELECT codigo, vazao, comprimento FROM irrigacao_equipamentos_parametros ORDER BY codigo").all() as ParametrosEquipamentoIrrigacao[];
}

export function salvarParametrosEquipamentoIrrigacao(parametros: ParametrosEquipamentoIrrigacao) {
  listarParametrosEquipamentosIrrigacao();
  const { codigo, vazao, comprimento } = parametros;
  if (!Number.isSafeInteger(codigo) || codigo <= 0) throw new Error("Equipamento inválido.");
  if (!Number.isFinite(vazao) || vazao <= 0) throw new Error("Informe uma vazão maior que zero.");
  if (!Number.isFinite(comprimento) || comprimento <= 0) throw new Error("Informe um comprimento maior que zero.");

  const result = db
    .prepare("UPDATE irrigacao_equipamentos_parametros SET vazao = ?, comprimento = ? WHERE codigo = ?")
    .run(vazao, comprimento, codigo);
  if (!result.changes) throw new Error("Equipamento não encontrado.");
  return db
    .prepare("SELECT codigo, vazao, comprimento FROM irrigacao_equipamentos_parametros WHERE codigo = ?")
    .get(codigo) as ParametrosEquipamentoIrrigacao;
}
