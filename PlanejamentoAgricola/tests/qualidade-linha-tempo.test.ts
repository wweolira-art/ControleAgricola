import assert from "node:assert/strict";
import test from "node:test";
import { montarQualidadeColheita } from "../server/indicadores/colheita-qualidade.ts";
import { pctPerdaRelatorioSintetico } from "../server/indicadores/perdas-percentual.ts";

test("9117 trunca cada percentual e inclui amostras sem TCH como zero", () => {
  assert.equal(pctPerdaRelatorioSintetico([{ perdas: 1, tch: 5 }]), 16.66);
  assert.equal(pctPerdaRelatorioSintetico([{ perdas: 1, tch: 5 }, { perdas: 20, tch: 0 }]), 8.33);
  assert.equal(pctPerdaRelatorioSintetico([]), null);
});

test("linha do tempo e resumo usam a média do relatório por amostra, não por item", () => {
  const row = (key: string, quantidade: number, tch: number) => ({
    chaveAmostra: key, numeroAmostra: Number(key), dataAmostra: "2026-09-01", mesRef: "2026-09",
    codEquipamento: 5001, equipTag: "5001", codOperador: null, nomeOperador: "", codFazenda: 1,
    fazendaDesc: "Fazenda", rendimentoagricola: tch, tchPlanejado: 100, codTipoPerda: 1,
    tipoPerdaDesc: "Estilha", quantidade,
  } as never);
  const result = montarQualidadeColheita([row("1", 0.4, 5), row("1", 0.6, 5), row("2", 20, 0)]);
  assert.equal(result.linhaTempo[0].amostras, 2);
  assert.equal(result.linhaTempo[0].pctPerda, 8.33);
  assert.equal(result.resumo.pctPerda, 8.33);
});
