import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import { prepararEntradaMaquina, substituirEntradasMaquina } from "./entrada-cana-maquina-import-store.js";

function fixture() {
  const db = new Database(":memory:");
  db.exec(`CREATE TABLE entrada_cana_maquina_local (chave TEXT PRIMARY KEY, data_iso TEXT, maquina TEXT, cod_equipamento TEXT, dados_json TEXT NOT NULL, atualizado_em TEXT NOT NULL)`);
  return db;
}
function row(maquina = 5001, day = "2026-11-01", peso = 100, extra: Record<string, unknown> = {}) {
  return prepararEntradaMaquina({ maquina, datacolheita: `${day}T00:00:00Z`, peso, fazenda: "FAZENDA A", talhao: 1, tipocolheita: "MECANIZADA", tipocana: "CANA", impmineral: 1, ...extra });
}
function data(db: Database.Database) {
  return (db.prepare("SELECT dados_json FROM entrada_cana_maquina_local ORDER BY maquina, data_iso, chave").all() as {dados_json:string}[]).map(r => JSON.parse(r.dados_json));
}

test("corrigir peso/impureza substitui o dia da máquina sem somar o valor anterior", () => {
  const db = fixture();
  try {
    substituirEntradasMaquina(db, [row(5001, undefined, 100, { cod_equipamento: 91 }), row(5001, "2026-11-02", 300), row(5002, undefined, 400)]);
    const result = substituirEntradasMaquina(db, [row(5001, undefined, 150, { impmineral: 2 })]);
    assert.equal(result.removed, 1);
    assert.equal(result.scopes, 1);
    const rows = data(db);
    assert.equal(rows.length, 3);
    assert.equal(rows[0].peso, 150);
    assert.equal(rows[0].impMineral, 2);
    assert.equal(rows[0].codEquipamento, 91);
    assert.equal(rows[1].peso, 300);
    assert.equal(rows[2].peso, 400);
    substituirEntradasMaquina(db, [row(5001, undefined, 150, { impmineral: 2 })]);
    assert.equal(data(db).length, 3);
  } finally { db.close(); }
});

test("lote mantém todas as linhas da máquina/dia e retira linhas removidas da nova planilha", () => {
  const db = fixture();
  try {
    substituirEntradasMaquina(db, [row(), row(5001, undefined, 30, {talhao: 3})]);
    substituirEntradasMaquina(db, [row(5001, undefined, 120), row(5001, undefined, 80, {talhao: 2})]);
    assert.equal(data(db).length, 2);
    assert.equal(data(db).reduce((sum,r) => sum+r.peso, 0), 200);
    assert.deepEqual(data(db).map(r=>r.talhao).sort(), [1,2]);
  } finally { db.close(); }
});

test("erro na inserção desfaz exclusão e gravações parciais", () => {
  const db = fixture();
  try {
    substituirEntradasMaquina(db, [row()]);
    db.exec(`CREATE TRIGGER falha BEFORE INSERT ON entrada_cana_maquina_local WHEN json_extract(NEW.dados_json,'$.peso')=999 BEGIN SELECT RAISE(ABORT,'falha simulada'); END`);
    assert.throws(() => substituirEntradasMaquina(db, [row(5001, undefined, 150), row(5001, undefined, 999, {talhao:2})]), /falha simulada/);
    assert.equal(data(db).length, 1);
    assert.equal(data(db)[0].peso, 100);
  } finally { db.close(); }
});

test("data impossível rejeita o lote antes de apagar dados", () => {
  const db = fixture();
  try {
    substituirEntradasMaquina(db, [row()]);
    assert.throws(() => substituirEntradasMaquina(db, [{...row(), dataColheita:"2026-02-31T00:00:00Z"}]), /devem ser válidos/);
    assert.equal(data(db)[0].peso, 100);
  } finally { db.close(); }
});
