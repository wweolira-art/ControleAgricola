import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import { activityFuelSql } from "../server/activity-fuel.js";

/** Executa a consulta real em SQLite, adaptando somente as funções de data Oracle. */
function fixture() {
  const db = new Database(":memory:");
  db.exec("ATTACH DATABASE ':memory:' AS automotivo; ATTACH DATABASE ':memory:' AS posto; ATTACH DATABASE ':memory:' AS material;");
  db.function("NVL", (value, fallback) => value ?? fallback);
  db.function("TRUNC", (value) => value == null ? null : String(value).slice(0, 10));
  db.function("TO_DATE", (value, _format) => value);
  db.function("TO_CHAR", { varargs: true }, (...args) => args[0] == null ? null : args[1] === "YYYYMMDDHH24MISS" ? String(args[0]).replace(/\D/g, "").padEnd(14, "0") : String(args[0]));
  db.exec(`
    CREATE TABLE automotivo.abastecimento (cod_grupoempresa INTEGER, cod_equipamento INTEGER, dtabastecimento TEXT, sequencia INTEGER, cod_material INTEGER, qtdelitros REAL, kmhs_rodados REAL, valor_unitario REAL, nrrequisicao INTEGER);
    CREATE TABLE posto.abastecimento (cod_grupoempresa INTEGER, cod_empresa INTEGER, cod_filial INTEGER, cod_abast INTEGER, cod_equipamento INTEGER, cod_material INTEGER, data TEXT, qtde_litros REAL, kmhs_rodados REAL);
    CREATE TABLE posto.abastecimento_itensrequisicao (cod_grupoempresa INTEGER, cod_empresa INTEGER, cod_filial INTEGER, cod_abast INTEGER, nrrequisicao INTEGER, item INTEGER);
    CREATE TABLE material.itensrequisicaomaterial (nrrequisicao INTEGER, item INTEGER, cod_material INTEGER, quantidade REAL, vrcustounitario REAL);
    CREATE TABLE automotivo.itens_apontamento (cod_equipamento INTEGER, dt_apontamento TEXT, cod_operacaoagricola INTEGER, area REAL, tothoras_trabalhadas REAL);
  `);
  const abastecer = (data: string, litros: number, equipamento = 4026, sequencia = 1) => db.prepare("INSERT INTO automotivo.abastecimento VALUES (1, ?, ?, ?, 1, ?, 10, 6, 1)").run(equipamento, data, sequencia, litros);
  const apontar = (data: string, operacao: number, equipamento = 4026) => db.prepare("INSERT INTO automotivo.itens_apontamento VALUES (?, ?, ?, 10, 5)").run(equipamento, data, operacao);
  const consultar = (op: number | number[] = 5, inicio = "2026-09-01", fim = "2026-09-30") => {
    const operacoes = Array.isArray(op) ? op : [op];
    const binds = Object.fromEntries(operacoes.map((codigo, i) => [`o${i}`, codigo]));
    const sql = activityFuelSql(":e0", operacoes.map((_, i) => `:o${i}`).join(",")).replaceAll("TO_DATE(:dataInicio, 'YYYY-MM-DD') - 120", "date(:dataInicio, '-120 day')");
    return db.prepare(sql).all({ e0: 4026, ...binds, dataInicio: inicio, dataFim: fim }) as { cod_equipamento: number; litros: number; valor: number }[];
  };
  return { db, abastecer, apontar, consultar };
}

test("mesmo equipamento: exclui combustível da outra operação e de operação não identificada", () => {
  const { db, abastecer, apontar, consultar } = fixture();
  try {
    abastecer("2026-09-01", 50); // Sem apontamento: fora.
    apontar("2026-09-02", 5);
    apontar("2026-09-03", 6); // Última operação do intervalo não é a selecionada.
    abastecer("2026-09-04", 100);
    apontar("2026-09-05", 6);
    apontar("2026-09-06", 5);
    apontar("2026-09-07", 5); // Vários apontamentos não multiplicam os litros.
    abastecer("2026-09-08", 200);
    abastecer("2026-09-09", 80); // Sem operação entre este e o anterior: fora.
    assert.deepEqual(consultar(), [{ cod_equipamento: 4026, litros: 200, valor: 1200 }]);
    assert.deepEqual(consultar(6), [{ cod_equipamento: 4026, litros: 100, valor: 600 }]);
    assert.deepEqual(consultar([5, 6]), [{ cod_equipamento: 4026, litros: 300, valor: 1800 }]);
  } finally { db.close(); }
});

test("posto e automotivo compartilham o intervalo; itens de requisição não duplicam litros", () => {
  const { db, abastecer, apontar, consultar } = fixture();
  try {
    abastecer("2026-08-31", 50);
    apontar("2026-09-01", 5);
    db.exec(`INSERT INTO posto.abastecimento VALUES (1,1,1,12,4026,1,'2026-09-02',100,10);
      INSERT INTO posto.abastecimento_itensrequisicao VALUES (1,1,1,12,1,1),(1,1,1,12,1,2);
      INSERT INTO material.itensrequisicaomaterial VALUES (1,1,1,60,5),(1,2,1,40,7);`);
    apontar("2026-09-03", 6);
    abastecer("2026-09-04", 200);
    apontar("2026-09-05", 5, 9999);
    abastecer("2026-09-06", 900, 9999); // Outro equipamento: fora.
    assert.deepEqual(consultar(), [{ cod_equipamento: 4026, litros: 100, valor: 580 }]);
    assert.deepEqual(consultar(6), [{ cod_equipamento: 4026, litros: 200, valor: 1200 }]);
  } finally { db.close(); }
});

test("filtra safra pelo abastecimento, usando o anterior fora do período para não reaproveitar operação antiga", () => {
  const { db, abastecer, apontar, consultar } = fixture();
  try {
    apontar("2026-08-30", 5);
    abastecer("2026-08-31", 500);
    abastecer("2026-09-01", 100); // Não herda a operação anterior ao abastecimento de agosto.
    apontar("2026-09-29", 5);
    abastecer("2026-09-30", 150);
    apontar("2026-10-01", 5);
    abastecer("2026-10-02", 300);
    assert.deepEqual(consultar(), [{ cod_equipamento: 4026, litros: 150, valor: 900 }]);
    assert.deepEqual(consultar(6), []);
  } finally { db.close(); }
});
