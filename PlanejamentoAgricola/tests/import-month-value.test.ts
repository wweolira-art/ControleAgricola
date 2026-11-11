import assert from "node:assert/strict";
import { test } from "node:test";
import * as XLSX from "xlsx";
import { technicalImportMonthValue } from "../src/lib/import-month-value.js";

const line = { item_type: "E", ref_kind: "material", calc_price: 5.6, product_code: "260", description: "Diesel" } as const;

test("tipo E exporta quantidade mensal pelo preço da linha na safra, preservando precisão no Excel", () => {
  const values = [11999.96, 6087, 0, -56].map((value) => technicalImportMonthValue(line, value, "Irrigação, 202610"));
  assert.equal(values[0], 11999.96 / 5.6);
  assert.equal(values[1], 6087 / 5.6);
  assert.equal(values[2], 0);
  assert.equal(values[3], -10);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([values]), "Import");
  const saved = XLSX.read(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }), { type: "buffer" });
  const result = XLSX.utils.sheet_to_json<number[]>(saved.Sheets.Import, { header: 1 })[0];
  result.forEach((value, index) => assert.ok(Math.abs(value * 5.6 - [11999.96, 6087, 0, -56][index]) < 1e-8));
});

test("itens G e equipamentos mantêm o valor e material sem preço não exporta quantidade incorreta", () => {
  assert.equal(technicalImportMonthValue({ ...line, item_type: "G" }, 100.123, "centro"), 100.12);
  assert.equal(technicalImportMonthValue({ ...line, ref_kind: "cost_object" }, 100.123, "centro"), 100.12);
  assert.equal(technicalImportMonthValue({ ...line, calc_price: null }, 0, "centro"), 0);
  for (const price of [null, 0, -1, NaN, Infinity]) {
    assert.throws(() => technicalImportMonthValue({ ...line, calc_price: price }, 100, "Irrigação, 202610"), /260.*Irrigação, 202610.*preço válido/);
  }
});
