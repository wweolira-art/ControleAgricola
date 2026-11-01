import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { listarParametrosEquipamentosIrrigacao, salvarParametrosEquipamentoIrrigacao } from "./irrigacao-equipamentos-parametros";

test("banco novo fica vazio e consultas preservam os valores locais", () => {
  const db = new Database(":memory:");
  try {
    assert.deepEqual(listarParametrosEquipamentosIrrigacao(db), []);
    const local = { codigo: 42, vazao: 17.5, comprimento: 93.25 };
    salvarParametrosEquipamentoIrrigacao(local, db);
    assert.deepEqual(listarParametrosEquipamentosIrrigacao(db), [local]);
    assert.deepEqual(listarParametrosEquipamentosIrrigacao(db), [local]);
    const alterado = { ...local, vazao: 23 };
    salvarParametrosEquipamentoIrrigacao(alterado, db);
    assert.deepEqual(listarParametrosEquipamentosIrrigacao(db), [alterado]);
  } finally { db.close(); }
});

test("dispositivos não compartilham parâmetros e valores inválidos não são gravados", () => {
  const primeiro = new Database(":memory:");
  const segundo = new Database(":memory:");
  try {
    salvarParametrosEquipamentoIrrigacao({ codigo: 42, vazao: 17.5, comprimento: 93.25 }, primeiro);
    assert.deepEqual(listarParametrosEquipamentosIrrigacao(segundo), []);
    for (const item of [
      { codigo: 0, vazao: 10, comprimento: 20 },
      { codigo: 42, vazao: 0, comprimento: 20 },
      { codigo: 42, vazao: 10, comprimento: Number.NaN },
    ]) assert.throws(() => salvarParametrosEquipamentoIrrigacao(item, segundo));
    assert.deepEqual(listarParametrosEquipamentosIrrigacao(segundo), []);
  } finally { primeiro.close(); segundo.close(); }
});
