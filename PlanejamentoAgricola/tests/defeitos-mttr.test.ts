import assert from "node:assert/strict";
import test from "node:test";
import { agregarDefeitosMttr } from "../server/indicadores/defeitos-mttr.ts";

test("reparte as horas da O.S. entre os defeitos e ordena pelo tempo de reparo", () => {
  const rows = agregarDefeitosMttr(
    [
      { anoOs: 2026, numeroOs: 1, tempoReparoHoras: 10 },
      { anoOs: 2026, numeroOs: 2, tempoReparoHoras: 4 },
    ],
    [
      { anoOs: 2026, numeroOs: 1, descricao: "Vazamento hidráulico" },
      { anoOs: 2026, numeroOs: 1, descricao: "Correia partida" },
      { anoOs: 2026, numeroOs: 2, descricao: "vazamento hidraulico" },
    ],
  );

  assert.equal(rows[0]?.defeito, "Vazamento hidráulico");
  assert.equal(rows[0]?.qtd, 2);
  assert.equal(rows[0]?.tempoReparoHoras, 9);
  assert.equal(rows[0]?.participacaoPct, 64.29);
  assert.equal(rows[1]?.defeito, "Correia partida");
  assert.equal(rows[1]?.tempoReparoHoras, 5);
  assert.equal(rows[1]?.qtd, 1);
  assert.equal(rows[1]?.participacaoPct, 35.71);
});

test("O.S. sem defeito informado entra como Sem descrição", () => {
  const rows = agregarDefeitosMttr([{ anoOs: 2026, numeroOs: 9, tempoReparoHoras: 3 }], []);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.defeito, "Sem descrição");
  assert.equal(rows[0]?.tempoReparoHoras, 3);
  assert.equal(rows[0]?.participacaoPct, 100);
});
