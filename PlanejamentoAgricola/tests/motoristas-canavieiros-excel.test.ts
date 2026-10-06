import assert from "node:assert/strict";
import { test } from "node:test";
import * as XLSX from "xlsx";
import {
  buildMotoristasCanavieirosWorkbook,
  valorEquipamento,
  valorFolguista,
  valorLinha,
  type MotoristasExcelCell,
} from "../src/lib/motoristas-canavieiros-excel.ts";

function cents(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function unescapeXml(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

function parseXmlGrid(xml: string) {
  const rows: MotoristasExcelCell[][] = [];
  for (const match of xml.matchAll(/<Row\/>|<Row>([\s\S]*?)<\/Row>/g)) {
    const body = match[1] ?? "";
    const cells: MotoristasExcelCell[] = [];
    for (const cell of body.matchAll(/<Cell\b([^>]*?)\/>|<Cell\b([^>]*)>([\s\S]*?)<\/Cell>/g)) {
      const attrs = cell[1] || cell[2] || "";
      const inner = cell[3] ?? "";
      const col = Number(attrs.match(/ss:Index="(\d+)"/)?.[1] ?? "0");
      const formula = attrs.match(/ss:Formula="([^"]*)"/)?.[1] ?? null;
      const data = inner.match(/<Data ss:Type="(Number|String)">(.*?)<\/Data>/);
      let value: number | string | null = null;
      if (data?.[1] === "Number") value = Number(data[2]);
      if (data?.[1] === "String") value = unescapeXml(data[2] ?? "");
      cells.push({ col, value, formula: formula ? unescapeXml(formula) : null });
    }
    rows.push(cells);
  }
  return rows;
}

function cellAt(rows: MotoristasExcelCell[][], row: number, col: number) {
  return rows[row - 1]?.find((cell) => cell.col === col) ?? null;
}

function evaluate(rows: MotoristasExcelCell[][]) {
  const memo = new Map<string, number>();
  const visiting = new Set<string>();
  const valueAt = (row: number, col: number): number => {
    const key = `${row}:${col}`;
    if (memo.has(key)) return memo.get(key) ?? 0;
    if (visiting.has(key)) throw new Error(`referência circular em R${row}C${col}`);
    visiting.add(key);
    const cell = cellAt(rows, row, col);
    let result = 0;
    if (cell?.formula) {
      let expr = cell.formula.replace(/^=/, "");
      expr = expr.replace(/SUM\(R(\d+)C(\d+):R(\d+)C(\d+)\)/gi, (_all, r1, c1, r2, c2) => {
        let sum = 0;
        for (let r = Number(r1); r <= Number(r2); r += 1) {
          for (let c = Number(c1); c <= Number(c2); c += 1) sum += valueAt(r, c);
        }
        return `(${sum})`;
      });
      expr = expr.replace(/R(\d+)C(\d+)/g, (_all, r, c) => `(${valueAt(Number(r), Number(c))})`);
      if (!/^[\d.+\-*/()eE]+$/.test(expr)) throw new Error(`fórmula inválida em R${row}C${col}: ${expr}`);
      result = Function(`"use strict"; return (${expr})`)() as number;
    } else if (typeof cell?.value === "number") {
      result = cell.value;
    }
    visiting.delete(key);
    memo.set(key, result);
    return result;
  };
  return valueAt;
}

test("excel recalcula produção, preço, percentual e folguista como a tela", () => {
  const precoA = 12.4;
  const precoB = 3;
  const precoC = 10;
  const workbook = buildMotoristasCanavieirosWorkbook({
    dataInicio: "2026-10-01",
    dataFim: "2026-10-06",
    equipamentos: [
      {
        equipTag: "10",
        frota: "5001",
        toneladaColhida: 230.25,
        fazendas: [
          { fazenda: "A & B", producao: 100.25, raio: 25, preco: precoA },
          { fazenda: "FAZENDA B", producao: 50, raio: 40, preco: precoB },
          { fazenda: "SEM PREÇO", producao: 80, raio: null, preco: null },
        ],
      },
      {
        equipTag: "20",
        frota: "5002",
        toneladaColhida: 200,
        fazendas: [{ fazenda: "FAZENDA C", producao: 200, raio: 15, preco: precoC }],
      },
      {
        equipTag: "30",
        frota: null,
        toneladaColhida: 15,
        fazendas: [],
      },
    ],
    grupos: [
      {
        folguistaPercentual: 20,
        folguistas: [
          { matricula: "1", nome: "FOLGA UM" },
          { matricula: "2", nome: "FOLGA DOIS" },
        ],
        equipamentos: [
          {
            equipTag: "5001",
            percentual: 24,
            producao: 230.25,
            totalFinanceiro: (valorLinha(100.25, precoA) ?? 0) + (valorLinha(50, precoB) ?? 0),
            lookupTags: ["5001"],
            motoristas: [
              { matricula: "101", nome: "JOAO" },
              { matricula: "102", nome: "MARIA" },
            ],
          },
          {
            equipTag: "5002",
            percentual: 30,
            producao: 200,
            totalFinanceiro: valorLinha(200, precoC) ?? 0,
            lookupTags: ["5002"],
            motoristas: [{ matricula: "201", nome: "PEDRO" }],
          },
        ],
      },
    ],
  });

  const xmlRows = parseXmlGrid(workbook.xml);
  assert.equal(xmlRows.length, workbook.rows.length);
  workbook.rows.forEach((row, rowIndex) => {
    assert.equal(xmlRows[rowIndex]?.length, row.length, `quantidade de células na linha ${rowIndex + 1}`);
    row.forEach((cell, cellIndex) => {
      const xmlCell = xmlRows[rowIndex]?.[cellIndex];
      assert.equal(xmlCell?.col, cell.col);
      assert.equal(xmlCell?.formula, cell.formula);
      if (typeof cell.value === "number") assert.ok(Math.abs(Number(xmlCell?.value) - cell.value) < 1e-6);
      else assert.equal(xmlCell?.value, cell.value);
    });
  });

  const valueAt = evaluate(xmlRows);
  const linhaA = xmlRows.findIndex((row) => row.some((cell) => cell.value === "A & B")) + 1;
  const linhaB = xmlRows.findIndex((row) => row.some((cell) => cell.value === "FAZENDA B")) + 1;
  const linhaSemPreco = xmlRows.findIndex((row) => row.some((cell) => cell.value === "SEM PREÇO")) + 1;
  const linhaC = xmlRows.findIndex((row) => row.some((cell) => cell.value === "FAZENDA C")) + 1;
  assert.ok(linhaA > 0 && linhaB === linhaA + 1 && linhaSemPreco === linhaB + 1);

  assert.equal(cellAt(xmlRows, linhaA, 8)?.formula, `=R${linhaA}C5*R${linhaA}C7`);
  assert.equal(cellAt(xmlRows, linhaA, 11)?.formula, `=R${linhaA}C8`);
  assert.equal(cents(valueAt(linhaA, 8)), cents(100.25 * precoA));
  assert.equal(cents(valueAt(linhaA, 11)), cents(100.25 * precoA));
  assert.equal(cents(valueAt(linhaB, 8)), 150);
  assert.equal(cellAt(xmlRows, linhaSemPreco, 7)?.value, null);
  assert.equal(cellAt(xmlRows, linhaSemPreco, 8)?.formula, null);
  assert.equal(cellAt(xmlRows, linhaSemPreco, 8)?.value, null);
  assert.equal(cellAt(xmlRows, linhaSemPreco, 11)?.value, null);

  const totalA = linhaSemPreco + 1;
  const totalFinanceiroA = (valorLinha(100.25, precoA) ?? 0) + (valorLinha(50, precoB) ?? 0);
  assert.equal(cents(valueAt(totalA, 5)), cents(100.25 + 50 + 80));
  assert.equal(cents(valueAt(totalA, 8)), cents(totalFinanceiroA));
  assert.equal(cents(valueAt(totalA, 11)), cents(totalFinanceiroA));
  assert.equal(cellAt(xmlRows, linhaC + 1, 8)?.formula?.includes(`R${linhaC}C8`), true);

  const semFazenda = xmlRows.findIndex((row) => row.some((cell) => cell.value === "SEM FAZENDA")) + 1;
  assert.equal(cellAt(xmlRows, semFazenda, 5)?.value, 15);
  assert.equal(cellAt(xmlRows, semFazenda, 8)?.value, null);
  assert.equal(cellAt(xmlRows, semFazenda + 1, 8)?.formula, null);

  const joao = xmlRows.findIndex((row) => row.some((cell) => cell.value === "JOAO")) + 1;
  const maria = joao + 1;
  const pedro = xmlRows.findIndex((row) => row.some((cell) => cell.value === "PEDRO")) + 1;
  const folga1 = xmlRows.findIndex((row) => row.some((cell) => cell.value === "FOLGA UM")) + 1;
  const folga2 = folga1 + 1;
  const totalGrupo = folga2 + 1;
  assert.equal(cellAt(xmlRows, joao, 6)?.formula, `=R${totalA}C8*R${joao}C5`);
  assert.equal(cellAt(xmlRows, maria, 5)?.formula, `=R${joao}C5`);
  assert.ok(Math.abs(Number(cellAt(xmlRows, joao, 5)?.value) - 0.24) < 1e-9);
  assert.equal(cents(valueAt(joao, 6)), cents(valorEquipamento(totalFinanceiroA, 24)));
  assert.equal(cents(valueAt(maria, 6)), cents(valorEquipamento(totalFinanceiroA, 24)));
  assert.equal(cents(valueAt(pedro, 6)), cents(valorEquipamento(2000, 30)));
  assert.equal(cellAt(xmlRows, joao, 4)?.value, 230.25);
  assert.equal(cellAt(xmlRows, maria, 4)?.value, null);

  const subtotal = valorEquipamento(totalFinanceiroA, 24) * 2 + valorEquipamento(2000, 30);
  const folga = valorFolguista(subtotal, 20);
  assert.equal(cents(valueAt(folga1, 6)), cents(folga / 2));
  assert.equal(cents(valueAt(folga2, 6)), cents(folga / 2));
  assert.equal(cents(valueAt(totalGrupo, 4)), cents(230.25 + 200));
  assert.equal(cents(valueAt(totalGrupo, 6)), cents(subtotal + folga));

  const totalGeral = xmlRows.findIndex((row) => row.some((cell) => cell.value === "TOTAL GERAL")) + 1;
  assert.equal(cellAt(xmlRows, totalGeral, 4)?.col, 4);
  assert.equal(cellAt(xmlRows, totalGeral, 6)?.col, 6);
  assert.equal(cents(valueAt(totalGeral, 4)), cents(230.25 + 200));
  assert.equal(cents(valueAt(totalGeral, 6)), cents(subtotal + folga));
  assert.equal(xmlRows.some((row) => row.some((cell) => cell.value === "-")), false);

  const wb = XLSX.read(workbook.xml, { type: "string" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  assert.ok(sheet);
  const totalCell = sheet[`H${totalA}`];
  const producaoCell = sheet[`E${linhaA}`];
  const precoCell = sheet[`G${linhaA}`];
  assert.equal(producaoCell?.t, "n");
  assert.equal(precoCell?.t, "n");
  assert.equal(totalCell?.t, "n");
  assert.equal(cents(Number(producaoCell?.v)), cents(100.25));
  assert.equal(cents(Number(precoCell?.v)), cents(precoA));
  assert.equal(cents(Number(totalCell?.v)), cents(totalFinanceiroA));
});
