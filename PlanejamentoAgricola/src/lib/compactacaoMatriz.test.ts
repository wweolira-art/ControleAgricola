import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizarCompactacao } from "./compactacaoSolo";
import { resumoCompactacaoMatriz, gruposMatrizCompactacao, corCompactacaoMatriz } from "./compactacaoMatriz";

test("matriz agrega campos, fazendas e totais sem dar peso extra a faixas ausentes", () => {
  const raw = (id: number, value: number) => ({ idunico: id, latitude: -9.8, longitude: -36.1, campo: "Campo A", fazenda: "Fazenda A", lote: id, ...Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`${i}-${i + 1}cm`, value])) });
  const a = normalizarCompactacao({ ...raw(1, 1000), "0-1cm": null })!;
  const b = normalizarCompactacao(raw(2, 3000))!;
  const summary = resumoCompactacaoMatriz([a, b]);
  assert.equal(summary.profundidades[0], 3000);
  assert.equal(summary.profundidades[1], 2000);
  assert.equal(summary.total, (15 * 1000 + 16 * 3000) / 31);
  assert.equal(gruposMatrizCompactacao([a, b], "campo")[0].resumo.total, summary.total);
  assert.equal(gruposMatrizCompactacao([a, b], "fazenda").length, 1);
  assert.equal(gruposMatrizCompactacao([a, b], "lote").length, 2);
  assert.equal(resumoCompactacaoMatriz([]).total, null);
});

test("cores da matriz seguem escala verde, amarela e vermelha", () => {
  assert.equal(corCompactacaoMatriz(1600), "rgb(0, 210, 0)");
  assert.equal(corCompactacaoMatriz(1800), "rgb(255, 210, 0)");
  assert.equal(corCompactacaoMatriz(2000), "rgb(255, 0, 0)");
});
