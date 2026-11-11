import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import { syncPlanningMaterialPrices } from "../server/sync-material-prices.js";

function fixture() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE materials (id INTEGER PRIMARY KEY, code TEXT, tipo TEXT, valor REAL);
    CREATE TABLE lines (id INTEGER PRIMARY KEY, material_id INTEGER, product_code TEXT, ref_kind TEXT, item_type TEXT, is_group INTEGER);
    CREATE TABLE line_safra_prices (line_id INTEGER, safra_id INTEGER, calc_price REAL, PRIMARY KEY(line_id,safra_id));
    CREATE TABLE calc_params (id INTEGER PRIMARY KEY, material_id INTEGER, safra_id INTEGER, kind TEXT, price REAL);
    INSERT INTO materials VALUES (1,'260','E',5.6),(2,'123','E',NULL),(3,'4006','G',100),(4,'345','E',0);
    INSERT INTO lines VALUES (10,1,'260','material','E',0),(11,1,'260','material','E',0),
      (12,2,'123','material','E',0),(13,3,'4006','material','G',0),(14,NULL,'E00260','material','E',0),
      (15,NULL,'260','cost_object','E',1),(16,4,'345','material','E',0);
    INSERT INTO line_safra_prices VALUES (10,7,7),(11,7,8),(10,8,9),(12,7,20),(13,7,100),(16,7,30);
    INSERT INTO calc_params VALUES (1,1,7,'material',7),(2,1,8,'material',9),(3,3,7,'material',100),
      (4,1,7,'activity',22);
  `);
  return db;
}

test("unifica tipo E em todos os centros da safra sem modificar outras safras, G ou materiais sem preço", () => {
  const db = fixture();
  try {
    let recalculated = false;
    const result = syncPlanningMaterialPrices(db, 7, () => {
      recalculated = true;
      assert.equal(db.prepare("SELECT calc_price FROM line_safra_prices WHERE line_id=10 AND safra_id=7").pluck().get(), 5.6);
    });
    assert.deepEqual(result, { updatedLines: 3, updatedRules: 1, skippedMaterials: 2 });
    assert.equal(recalculated, true);
    const price = (line: number, safra = 7) => db.prepare("SELECT calc_price FROM line_safra_prices WHERE line_id=? AND safra_id=?").pluck().get(line, safra);
    assert.equal(price(11), 5.6);
    assert.equal(price(14), 5.6);
    assert.equal(price(10, 8), 9);
    assert.equal(price(12), 20);
    assert.equal(price(13), 100);
    assert.equal(price(16), 30);
    assert.equal(price(15), undefined);
    assert.deepEqual(db.prepare("SELECT price FROM calc_params ORDER BY id").pluck().all(), [5.6, 9, 100, 22]);
  } finally { db.close(); }
});

test("falha no recálculo desfaz todos os preços da operação", () => {
  const db = fixture();
  try {
    assert.throws(() => syncPlanningMaterialPrices(db, 7, () => { throw new Error("falha no cálculo"); }), /falha no cálculo/);
    assert.equal(db.prepare("SELECT calc_price FROM line_safra_prices WHERE line_id=10 AND safra_id=7").pluck().get(), 7);
    assert.equal(db.prepare("SELECT price FROM calc_params WHERE id=1").pluck().get(), 7);
    assert.equal(db.prepare("SELECT COUNT(*) FROM line_safra_prices WHERE line_id=14").pluck().get(), 0);
  } finally { db.close(); }
});
