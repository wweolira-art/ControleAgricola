import assert from "node:assert/strict";
import test from "node:test";
import { montarQualidadeColheita } from "../server/indicadores/colheita-qualidade.ts";
import { pctPerdaRelatorioSintetico } from "../server/indicadores/perdas-percentual.ts";

test("9117 trunca cada percentual e inclui amostras sem TCH como zero", () => {
  assert.equal(pctPerdaRelatorioSintetico([{ perdas: 1, tch: 5 }]), 16.66);
  assert.equal(pctPerdaRelatorioSintetico([{ perdas: 1, tch: 5 }, { perdas: 20, tch: 0 }]), 8.33);
  assert.equal(pctPerdaRelatorioSintetico([]), null);
});

test("linha do tempo e resumo ponderam o TCH pela area de cada talhao sem repetir a area", () => {
  const row = (key: string, talhao: number, area: number, quantidade: number, tch: number) => ({
    chaveAmostra: key, numeroAmostra: Number(key), dataAmostra: "2026-09-01", mesRef: "2026-09",
    codEquipamento: 5001, equipTag: "5001", codOperador: null, nomeOperador: "", codFazenda: 1,
    codTalhao: talhao, areaTalhao: area,
    fazendaDesc: "Fazenda", rendimentoagricola: tch, tchPlanejado: 100, codTipoPerda: 1,
    tipoPerdaDesc: "Estilha", quantidade,
  } as never);
  const result = montarQualidadeColheita([
    row("1", 1, 10, 2, 50),
    row("2", 1, 10, 2, 50),
    row("3", 2, 30, 2, 100),
  ]);
  assert.equal(result.linhaTempo[0].amostras, 3);
  assert.equal(result.linhaTempo[0].tchUsado, 87.5);
  assert.equal(result.linhaTempo[0].pctPerda, 2.2);
  assert.equal(result.resumo.tchUsado, 87.5);
  assert.equal(result.resumo.pctPerda, 2.2);
});
