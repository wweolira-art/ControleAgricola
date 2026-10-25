import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { calcularPercentualQuantidadeBrocas, montarEntomologicoTalhao, resumirEntomologicoFazendas, type EntomologicoOracle } from "./mapa-fazendas.js";

const rows = JSON.parse(fs.readFileSync(new URL("./fixtures/broca-comum-2025-2026.json", import.meta.url), "utf8")) as Array<{ codFazenda: number; quantidadeBrocas: number; canasAnalisadas: number; percentual: number }>;

test("% Qtde. Brocas confere com as 39 fazendas do PDF, com três casas decimais", () => {
  assert.equal(rows.length, 39);
  for (const row of rows) {
    const value = calcularPercentualQuantidadeBrocas(row.quantidadeBrocas, row.canasAnalisadas);
    assert.equal(Number(value?.toFixed(3)), row.percentual, `Fazenda ${row.codFazenda}`);
  }
  assert.equal(rows.reduce((sum, r) => sum + r.quantidadeBrocas, 0), 1339);
  assert.equal(rows.reduce((sum, r) => sum + r.canasAnalisadas, 0), 159412);
  assert.equal(calcularPercentualQuantidadeBrocas(0, 100), 0);
  assert.equal(calcularPercentualQuantidadeBrocas(1, 0), null);
});

test("classificação comum usa quantidade de brocas e preserva entre-nós nos detalhes", () => {
  const sample: EntomologicoOracle = { codFazenda: 40100, codTalhao: 1, qtdeEntrenosBroca: 57, entreNosAnalisados: 7546, canasBrocadas: 42, brocasComuns: 21, numeroCana: 752, canasBGigante: 0, touceirasAnalisadas: 0, touceirasBrocadas: 0, tocosAnalisados: 0, tocosBrocados: 0, qtdAnalises: 1, ultimaAnalise: null };
  const result = montarEntomologicoTalhao(sample);
  assert.equal(Number(result.percentualQuantidadeBrocas?.toFixed(3)), 2.793);
  assert.equal(result.faixaBrocaComum, "amarelo");
  assert.equal(result.indiceBrocaComum, 57 / 7546);
  // Include analyses even when a plot is absent from the GeoJSON.
  const farm = resumirEntomologicoFazendas([sample, { ...sample, codTalhao: 999, brocasComuns: 0, numeroCana: 248 }], new Map([[40100, "Fazenda teste"]]))[0];
  assert.equal(farm.nome, "Fazenda teste");
  assert.equal(farm.numeroCana, 1000);
  assert.equal(farm.percentualQuantidadeBrocas, 2.1);
});
