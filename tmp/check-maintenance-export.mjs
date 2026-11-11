import fs from 'node:fs';
import ts from '../PlanejamentoAgricola/node_modules/typescript/lib/typescript.js';
import XLSX from '../PlanejamentoAgricola/node_modules/xlsx/xlsx.js';
import assert from 'node:assert/strict';
import { shouldAllocateMaintenance } from '../PlanejamentoAgricola/src/lib/import-maintenance.ts';
import { atividadeSubstituidaPorMateriaisE } from '../PlanejamentoAgricola/src/lib/import-materials.ts';
import { atividadeDaImportacao, empenhoDaImportacao } from '../PlanejamentoAgricola/src/lib/import-empenho.ts';

const source = fs.readFileSync('PlanejamentoAgricola/src/components/CostCenter.tsx', 'utf8');
const ast = ts.createSourceFile('CostCenter.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = new Set(['foldImportText', 'isFuncionarioImportCategory', 'activityImportCode', 'subempenhoImportCode', 'lineHasImportValue', 'lineCanExport', 'importObjectCode', 'buildImportRows', 'numberOrTextCode']);
const parts = ast.statements.filter(n => ts.isFunctionDeclaration(n) && names.has(n.name?.text)).map(n => n.getText(ast));
const allocation = ast.statements.find(n => ts.isVariableStatement(n) && n.declarationList.declarations.some(d => d.name.getText(ast) === 'MAINTENANCE_EQUIPMENT_EMPENHOS'));
const js = ts.transpileModule([allocation.getText(ast), ...parts].join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const build = new Function('shouldAllocateMaintenance', 'atividadeSubstituidaPorMateriaisE', 'atividadeDaImportacao', 'empenhoDaImportacao', 'isFuelLubricantCategory', js + '\nreturn buildImportRows;')(shouldAllocateMaintenance, atividadeSubstituidaPorMateriaisE, atividadeDaImportacao, empenhoDaImportacao, () => false);
const workbook = XLSX.readFile('C:/Users/rayhi/Downloads/Importacao_Planejamento_Tecnica_Todos_Centros_26-27 (3).xlsx');
const input = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]).filter(r => /^G0999[5-9]$/.test(r.SUBEMPENHO));
const months = Object.keys(input[0]).filter(k => /^\d{6}$/.test(k)).map(Number).sort();
const activities = input.map((r, i) => ({ id: i + 1, code: r.SUBEMPENHO.slice(1), description: r.SUBEMPENHO, empenho: null }));
const lines = input.map((r, i) => ({ id: i + 1, category_id: 1, object_code: String(r.OBJETOCUSTO), ref_kind: 'activity', item_type: null, activity_id: i + 1, parent_id: null, is_group: 1, description: r.SUBEMPENHO, months: months.map((m, month) => ({ month, value: r[m] ?? 0 })) }));
const result = build({ name: 'colheita', categories: [{ id: 1, name: 'DESPESAS COM MANUTENÇÃO', lines }] }, activities, months);
assert.equal(result.length, 40);
assert.ok(result.every(r => r.SUBEMPENHO === 'G28' && Number(r.EMPENHO) > 0));
for (const r of input) for (const month of months) {
  const cents = result.filter(x => Number(x.OBJETOCUSTO) === Number(r.OBJETOCUSTO)).reduce((sum, x) => sum + Math.round(x[month] * 100), 0);
  assert.equal(cents, Math.round(r[month] * 100));
}
console.log(JSON.stringify({ original: input.length, distributed: result.length, monthsChecked: months.length, empenhos: [...new Set(result.map(r => r.EMPENHO))], monthlyTotalsPreserved: true }));
