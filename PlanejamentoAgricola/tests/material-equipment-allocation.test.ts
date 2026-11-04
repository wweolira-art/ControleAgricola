import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import { materialEquipmentTargets } from "../src/lib/material-equipment-allocation.js";
import { writeMaterialEquipmentTargets, redistributeMaterialAfterRemoval } from "../server/material-equipment-allocation.js";

test("excluir um objeto redistribui 14 L/ha sem alterar outra distribuição", () => {
  const db = new Database(":memory:");
  try {
    db.exec(`CREATE TABLE lines (id INTEGER PRIMARY KEY, material_distribution_group INTEGER, calc_dose REAL);
      INSERT INTO lines VALUES (1, 1, 7), (2, 1, 7), (3, 3, 20);`);
    db.transaction(() => {
      redistributeMaterialAfterRemoval(db, 1);
      db.prepare("DELETE FROM lines WHERE id = ?").run(1);
    })();
    assert.deepEqual(db.prepare("SELECT id, calc_dose FROM lines ORDER BY id").all(), [
      { id: 2, calc_dose: 14 }, { id: 3, calc_dose: 20 },
    ]);
    redistributeMaterialAfterRemoval(db, 2);
    assert.equal((db.prepare("SELECT calc_dose FROM lines WHERE id = 3").get() as { calc_dose: number }).calc_dose, 20);
  } finally { db.close(); }
});

test("seis equipamentos: quatro no objeto A e dois no B dividem o valor, sem multiplicar", () => {
  const codes = ["4005", "4006", "4015", "4021", "4024", "4031"];
  const targets = materialEquipmentTargets(codes, codes.map((code, i) => ({ code, costObjectCodes: [i < 4 ? 13 : 19] })));
  assert.equal(targets.length, 2);
  assert.equal(targets[0].share, 4 / 6);
  assert.ok(Math.abs(targets[1].share - 2 / 6) < 1e-12);
  assert.deepEqual(targets[0].equipmentCodes, codes.slice(0, 4));
  const base = 15.7166 * 5.7902 * 250;
  const allocated = targets.reduce((sum, target) => sum + 15.7166 * target.share * 5.7902 * 250, 0);
  assert.ok(Math.abs(allocated - base) < 1e-8);
});

test("normaliza códigos, ignora duplicidades e divide a parcela de equipamento com dois vínculos", () => {
  const targets = materialEquipmentTargets(["004005", "4005", "4006"], [
    { code: "4005", costObjectCodes: [13, 13, 19] }, { code: "04006", costObjectCodes: [19] },
  ]);
  assert.equal(targets.find((t) => t.objectCode === 13)?.share, 0.25);
  assert.equal(targets.find((t) => t.objectCode === 19)?.share, 0.75);
  assert.equal(targets.reduce((sum, t) => sum + t.share, 0), 1);
});

test("não atribui objeto arbitrário quando faltam vínculos", () => {
  assert.throws(() => materialEquipmentTargets(["4005", "4006"], [{ code: "4005", costObjectCodes: [13] }]), /4006/);
  assert.throws(() => materialEquipmentTargets([], []), /Selecione/);
  assert.throws(() => materialEquipmentTargets(["4005"], [{ code: "4005", costObjectCodes: [0] }]), /sem objeto/);
});

function fixture() {
  const db = new Database(":memory:");
  db.exec(`CREATE TABLE cost_objects (id INTEGER PRIMARY KEY, code TEXT UNIQUE, description TEXT);
    INSERT INTO cost_objects VALUES (101, '013', 'Grade pesada');
    CREATE TABLE materials (id INTEGER PRIMARY KEY, description TEXT);
    INSERT INTO materials VALUES (1, 'Óleo diesel');
    CREATE TABLE lines (id INTEGER PRIMARY KEY, material_id INTEGER, cost_object_id INTEGER, object_code TEXT, dose REAL, price REAL, area REAL, calc_months TEXT);
    CREATE TABLE line_months (line_id INTEGER, month_index INTEGER, value REAL);`);
  return db;
}

test("grava o material por objeto local, preservando preço, meses, área e total", () => {
  const db = fixture();
  try {
    const targets = materialEquipmentTargets(["1", "2", "3"], [{ code: "1", costObjectCodes: [13] }, { code: "2", costObjectCodes: [13] }, { code: "3", costObjectCodes: [19] }]);
    writeMaterialEquipmentTargets(db, targets, (target) => {
      const dose = 18 * target.share;
      const id = db.prepare("INSERT INTO lines (material_id,cost_object_id,object_code,dose,price,area,calc_months) VALUES (1,?,?,?,?,?,?)")
        .run(target.costObjectId, target.localObjectCode, dose, 6, 100, "[0,2]").lastInsertRowid;
      for (const month of [0, 2]) db.prepare("INSERT INTO line_months VALUES (?,?,?)").run(id, month, dose * 6 * 100);
    });
    const rows = db.prepare("SELECT * FROM lines ORDER BY object_code").all() as { cost_object_id: number; object_code: string; dose: number; price: number; area: number; calc_months: string }[];
    assert.equal(rows.length, 2);
    assert.equal(rows[0].cost_object_id, 101); // Usa ID local, não o código Oracle.
    assert.equal(rows[0].object_code, "013");
    assert.equal(rows[0].dose, 12);
    assert.ok(Math.abs(rows[1].dose - 6) < 1e-12);
    for (const row of rows) { assert.equal(row.price, 6); assert.equal(row.area, 100); assert.equal(row.calc_months, "[0,2]"); }
    const totals = db.prepare("SELECT month_index,SUM(value) total FROM line_months GROUP BY month_index").all() as { total: number }[];
    for (const row of totals) assert.ok(Math.abs(row.total - 10800) < 1e-8);
    assert.equal((db.prepare("SELECT COUNT(*) n FROM cost_objects").get() as { n: number }).n, 2);
  } finally { db.close(); }
});

test("falha em um destino desfaz todos os novos registros e objetos", () => {
  const db = fixture();
  try {
    const targets = materialEquipmentTargets(["1", "2"], [{ code: "1", costObjectCodes: [13] }, { code: "2", costObjectCodes: [19] }]);
    assert.throws(() => writeMaterialEquipmentTargets(db, targets, (target) => {
      db.prepare("INSERT INTO lines (object_code) VALUES (?)").run(target.localObjectCode);
      if (target.objectCode === 19) throw new Error("Falha simulada");
    }), /Falha simulada/);
    assert.equal((db.prepare("SELECT COUNT(*) n FROM lines").get() as { n: number }).n, 0);
    assert.equal((db.prepare("SELECT COUNT(*) n FROM cost_objects").get() as { n: number }).n, 1);
  } finally { db.close(); }
});
