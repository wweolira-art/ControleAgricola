import assert from "node:assert/strict";
import test from "node:test";
import { montarQualidadeColheita } from "../server/indicadores/colheita-qualidade.ts";

function row(overrides: Record<string, unknown>) {
  return {
    chaveAmostra: "",
    numeroAmostra: 0,
    dataAmostra: "2026-09-01",
    mesRef: "2026-09",
    codEquipamento: 1,
    equipTag: "COLHEDORA",
    codOperador: null,
    nomeOperador: "",
    codFazenda: 42500,
    codTalhao: null,
    fazendaDesc: "BOM SUCESSO 2",
    rendimentoagricola: 0,
    tchPlanejado: null,
    meta: null,
    codTipoPerda: 5,
    tipoPerdaDesc: "ESTILHA",
    quantidade: 0,
    ...overrides,
  } as never;
}

test("perda estimada por fazenda usa perda media contra TCH medio das amostras com TCH", () => {
  const quantidades = [
    1.34, 3.6, 3.507, 3.675, 4.53, 12, 1.41, 1.165, 1.584, 1.365, 2.007, 1.025, 0.56, 1.015, 0.867, 0.8,
  ];
  const tchs = [0, 4.55, 0, 94.71, 94.71, 0, 0, 0, 0, 0, 0, 0, 0, 2.59, 4.55, 30.47];
  const rows = quantidades.map((quantidade, index) =>
    row({
      chaveAmostra: `42500-${index + 1}`,
      numeroAmostra: index + 1,
      rendimentoagricola: tchs[index],
      quantidade,
    }),
  );

  const qualidade = montarQualidadeColheita(rows);
  assert.equal(qualidade.porFazenda[0]?.label, "BOM SUCESSO 2");
  assert.equal(qualidade.porFazenda[0]?.tonHaPerda, 2.53);
  assert.equal(qualidade.porFazenda[0]?.pctPerda, 6.2);
});

test("perda estimada por fazenda sem TCH positivo fica zerada", () => {
  const qualidade = montarQualidadeColheita([
    row({ chaveAmostra: "42100-1", codFazenda: 42100, fazendaDesc: "BOM SUCESSO", quantidade: 3.84 }),
    row({ chaveAmostra: "72000-1", codFazenda: 72000, fazendaDesc: "CAXACUMBA III", quantidade: 2.58 }),
  ]);

  assert.deepEqual(
    qualidade.porFazenda.map((item) => ({ label: item.label, pctPerda: item.pctPerda })),
    [
      { label: "BOM SUCESSO", pctPerda: 0 },
      { label: "CAXACUMBA III", pctPerda: 0 },
    ],
  );
});
