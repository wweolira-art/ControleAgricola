import assert from "node:assert/strict";
import { test } from "node:test";
import * as XLSX from "xlsx";
import { materialPriceExportData, materialPricesForSafra } from "../src/lib/material-price-export.js";
import type { CalcRule, Material } from "../src/api.js";

const options = { safraId: 7, safraCode: "26/27", group: 1, company: 2, branch: 3 };
const materials: Material[] = [
  { id: 1, code: "00260", description: "Diesel", tipo: "E", empenho: "252", valor: 5.6789 },
  { id: 2, code: "4006", description: "Trator", tipo: "G", empenho: "26", valor: 100 },
  { id: 3, code: "E00123", description: "Sem preço", tipo: "E", empenho: null, valor: null },
  { id: 4, code: "345", description: "Preço zero", tipo: "E", empenho: "241", valor: 0 },
];

test("exporta apenas E no layout do modelo, preservando preços e códigos ao ler o Excel", () => {
  const { headers, rows } = materialPriceExportData(materials, options);
  assert.deepEqual(headers, ["COD_GRUPOEMPRESA", "COD_EMPRESA", "COD_FILIAL", "EMPENHO", "SUBEMPENHO", "OBSERVACAO",
    202609, 202610, 202611, 202612, 202701, 202702, 202703, 202704, 202705, 202706, 202707, 202708]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([headers, ...rows]), "Planilha1");
  const saved = XLSX.read(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }), { type: "buffer" });
  const actual = XLSX.utils.sheet_to_json(saved.Sheets.Planilha1, { header: 1, defval: null });
  assert.deepEqual(actual, [headers,
    [1, 2, 3, 252, "E00260", null, ...Array(12).fill(5.6789)],
    [1, 2, 3, null, "E00123", null, ...Array(12).fill(null)],
    [1, 2, 3, 241, "E345", null, ...Array(12).fill(0)],
  ]);
});

test("rejeita período e códigos inválidos e lista sem materiais E", () => {
  assert.throws(() => materialPriceExportData(materials, { ...options, safraCode: "inválida" }), /safra válida/);
  assert.throws(() => materialPriceExportData(materials, { ...options, branch: 1.5 }), /inteiros positivos/);
  assert.throws(() => materialPriceExportData([materials[1]], options), /Não há materiais/);
});


test("preço é exclusivo da safra, sem usar cadastro geral nem outra safra", () => {
  const rules = [
    { kind: "material", materialId: 1, safraId: 7, price: 7.25, storedPrice: 7.25 },
    { kind: "material", materialId: 1, safraId: 8, price: 9.5, storedPrice: 9.5 },
    { kind: "material", materialId: 3, safraId: 7, price: 12, storedPrice: null },
    { kind: "material", materialId: 4, safraId: 7, price: 0, storedPrice: 0 },
  ] as CalcRule[];
  assert.deepEqual(materialPricesForSafra(materials, rules, 7).map((m) => m.valor), [7.25, null, null, 0]);
  assert.equal(materialPricesForSafra(materials, rules, 8)[0].valor, 9.5);
  assert.throws(() => materialPricesForSafra(materials, [...rules,
    { ...rules[0], storedPrice: 8 }], 7), /preços diferentes/);
});

test("exporta preços informados nas linhas da safra mesmo sem parâmetros de material", () => {
  const current = materialPricesForSafra(materials, [], 7, [
    { materialId: 1, materialCode: "00260", price: 6.25 },
    { materialId: 1, materialCode: "00260", price: 6.25 },
    { materialId: null, materialCode: "E00123", price: 42.15 },
  ]);
  const { rows } = materialPriceExportData(current, options);
  assert.deepEqual(rows[0].slice(6), Array(12).fill(6.25));
  assert.deepEqual(rows[1].slice(6), Array(12).fill(42.15));
  assert.deepEqual(rows[2].slice(6), Array(12).fill(null));
  assert.throws(() => materialPriceExportData(materialPricesForSafra(materials, [], 7), options), /Nenhum preço/);
  assert.throws(() => materialPricesForSafra(materials, [], 7, [
    { materialId: 1, materialCode: "00260", price: 6.25 },
    { materialId: 1, materialCode: "00260", price: 7 },
  ]), /preços diferentes/);
});

test("preço da linha prevalece sobre o parâmetro e sobre o cadastro geral", () => {
  const rules = [{ kind: "material", materialId: 1, safraId: 7, storedPrice: 8 }] as CalcRule[];
  assert.equal(materialPricesForSafra(materials, rules, 7, [
    { materialId: 1, materialCode: "00260", price: 6.25 },
  ])[0].valor, 6.25);
});
