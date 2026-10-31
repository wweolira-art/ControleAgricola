import { db } from "../db.js";
export function listarParametrosEquipamentosIrrigacao() {
  db.exec(`CREATE TABLE IF NOT EXISTS irrigacao_equipamentos_parametros (
    codigo INTEGER PRIMARY KEY, vazao REAL NOT NULL CHECK(vazao > 0),
    comprimento REAL NOT NULL CHECK(comprimento > 0)
  )`);
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
  return db.prepare("SELECT codigo, vazao, comprimento FROM irrigacao_equipamentos_parametros ORDER BY codigo").all();
}
