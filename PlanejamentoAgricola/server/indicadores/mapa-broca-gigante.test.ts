import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularIndiceBrocaGigante, calcularIndiceBrocaComum, montarEntomologicoTalhao } from "./mapa-fazendas.js";

test("infestação de broca gigante usa as touceiras e reproduz exemplos do relatório 9138", () => {
  const percent = (brocadas: number, analisadas: number) => Number(((calcularIndiceBrocaGigante(brocadas, analisadas) ?? 0) * 100).toFixed(2));
  assert.equal(percent(131, 1306), 10.03); // Escuro 1
  assert.equal(percent(83, 368), 22.55); // Peco I
  assert.equal(percent(115, 464), 24.78); // Coite 11
  assert.equal(percent(0, 122), 0); // Pangamonha 1
  assert.equal(calcularIndiceBrocaGigante(1, 0), null);
  assert.equal(calcularIndiceBrocaGigante(1, Number.NaN), null);
  assert.equal(calcularIndiceBrocaComum(5, 200), 0.025);
});

test("cores da broca gigante seguem danos nos tocos e preservam a infestação de touceiras", () => {
  const sample = { qtdeEntrenosBroca: 0, entreNosAnalisados: 0, canasBrocadas: 0, canasBGigante: 50, numeroCana: 100, touceirasBrocadas: 25, touceirasAnalisadas: 100, tocosBrocados: 1, tocosAnalisados: 100, ultimaAnalise: null, qtdAnalises: 1 };
  const result = montarEntomologicoTalhao(sample);
  assert.equal(result.indiceBrocaGigante, .25);
  assert.equal(result.faixaBrocaGigante, "verde");
  assert.equal(montarEntomologicoTalhao({ ...sample, tocosBrocados: 2 }).faixaBrocaGigante, "amarelo");
  assert.equal(montarEntomologicoTalhao({ ...sample, tocosBrocados: 2.5 }).faixaBrocaGigante, "vermelho");
  assert.equal(montarEntomologicoTalhao({ ...sample, tocosAnalisados: 0 }).faixaBrocaGigante, "sem");
});
