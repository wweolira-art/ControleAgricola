const x = require('../PlanejamentoAgricola/node_modules/xlsx');
const w = x.readFile('C:/Users/rayhi/Downloads/Importacao_Planejamento_Tecnica_Todos_Centros_26-27 (3).xlsx');
for (const name of w.SheetNames) {
  const rows = x.utils.sheet_to_json(w.Sheets[name]);
  console.log(name, rows.length, JSON.stringify(rows[0]));
  console.log(JSON.stringify(rows.filter(r => /999[5-9]/.test(String(r.SUBEMPENHO)))));
}
