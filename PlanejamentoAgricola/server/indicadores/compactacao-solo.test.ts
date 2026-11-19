import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { carregarCompactacaoSolo, invalidarCacheCompactacao } from "./compactacao-solo.js";

test("lê a compactação da tabela SQLite compactacao_solo e filtra datas/profundidades", async () => {
  const database = new Database(":memory:");
  const sample = (id: number, day: string) => ({ idunico: id, fazenda: "A", lote: 1, latitude: -9.8, longitude: -36.1, "dataehora(utc)": `${day}T10:00:00-03:00`, ...Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`${i}-${i + 1}cm`, 1000])) });
  await carregarCompactacaoSolo({}, database); // Inicializa a tabela de teste.
  const insert = database.prepare(`INSERT INTO compactacao_solo (id_unico, data_hora_utc, dados_json, atualizado_em)
    VALUES (?, ?, ?, ?)`);
  try {
    for (const row of [sample(1, "2025-01-01"), sample(2, "2026-01-01"), sample(3, "2026-01-02")]) {
      insert.run(String(row.idunico), row["dataehora(utc)"], JSON.stringify(row), new Date().toISOString());
    }
    const data = await carregarCompactacaoSolo({ dataInicio: "2026-01-01", dataFim: "2026-01-02", profundidade: "40-44cm" }, database);
    assert.equal(data.fonte, "SQLite local (tabela compactacao_solo)");
    assert.equal(data.duplicadosRemovidos, 0);
    assert.equal(data.pontos.length, 2);
    assert.equal(data.geojson?.type, "FeatureCollection");
    assert.ok(data.geojson.features.length > 0);
    assert.equal(data.pontos[0].leituras.length, 1);
    assert.equal(data.pontos[0].leituras[0].profundidade, "40-44cm");
    assert.equal(data.periodoDisponivel.inicio, "2025-01-01");
    invalidarCacheCompactacao();
    await assert.rejects(carregarCompactacaoSolo({ profundidade: "99-100cm" }, database));
    await assert.rejects(carregarCompactacaoSolo({ dataInicio: "2026-02-01", dataFim: "2026-01-01" }, database));
  } finally {
    database.close();
  }
});
