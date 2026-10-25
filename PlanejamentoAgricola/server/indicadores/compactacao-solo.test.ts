import { test } from "node:test";
import assert from "node:assert/strict";
import { carregarCompactacaoSolo } from "./compactacao-solo.js";

test("paginação não repete a primeira página, deduplica IDs e filtra datas/profundidades", async () => {
  const previousFetch = globalThis.fetch;
  const previousUrl = process.env.COMPACTACAO_API_URL;
  process.env.COMPACTACAO_API_URL = "https://example.invalid/compactacao-test";
  const offsets: string[] = [];
  const sample = (id: number, day: string) => ({ idunico: id, fazenda: "A", lote: 1, latitude: -9.8, longitude: -36.1, "dataehora(utc)": `${day}T10:00:00-03:00`, ...Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`${i}-${i + 1}cm`, 1000])) });
  globalThis.fetch = async (input) => {
    const offset = new URL(String(input)).searchParams.get("offset")!;
    offsets.push(offset);
    return new Response(JSON.stringify(offset === "0" ? { items: [sample(1, "2025-01-01"), sample(2, "2026-01-01")], hasMore: true } : { items: [sample(2, "2026-01-01"), sample(3, "2026-01-02")], hasMore: false }));
  };
  try {
    const data = await carregarCompactacaoSolo({ dataInicio: "2026-01-01", dataFim: "2026-01-02", profundidade: "40-44cm" });
    assert.deepEqual(offsets, ["0", "2"]);
    assert.equal(data.duplicadosRemovidos, 1);
    assert.equal(data.pontos.length, 2);
    assert.equal(data.geojson?.type, "FeatureCollection");
    assert.ok(data.geojson.features.length > 0);
    assert.equal(data.pontos[0].leituras.length, 1);
    assert.equal(data.pontos[0].leituras[0].profundidade, "40-44cm");
    assert.equal(data.periodoDisponivel.inicio, "2025-01-01");
    await carregarCompactacaoSolo({});
    assert.equal(offsets.length, 2); // Cache avoids fetching all pages for every filter.
    await assert.rejects(carregarCompactacaoSolo({ profundidade: "99-100cm" }));
    await assert.rejects(carregarCompactacaoSolo({ dataInicio: "2026-02-01", dataFim: "2026-01-01" }));
  } finally {
    globalThis.fetch = previousFetch;
    if (previousUrl == null) delete process.env.COMPACTACAO_API_URL; else process.env.COMPACTACAO_API_URL = previousUrl;
  }
});
