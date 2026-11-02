import assert from "node:assert/strict";
import { test } from "node:test";
import {
  chaveMesLubrificacao,
  lubrificacaoHorasRestantes,
  lubrificacaoSituacaoLabel,
  lubrificacaoStatusPonto,
  ordenarVencimentosLubrificacao,
  realizadoComponenteNoMes,
  resumoVencimentosLubrificacao,
  periodoAnteriorLubrificacao,
  variacaoPercentualLubrificacao,
  kpisLubrificacaoPorPeriodo,
  type LubrificacaoComponenteVencimento,
} from "../src/lib/lubrificacao.js";

test("comparação mensal mantém os dias, trata virada do ano e meses menores", () => {
  assert.deepEqual(periodoAnteriorLubrificacao("2026-11-01", "2026-11-10"), { inicio: "2026-10-01", fim: "2026-10-10" });
  assert.deepEqual(periodoAnteriorLubrificacao("2026-01-05", "2026-01-20"), { inicio: "2025-12-05", fim: "2025-12-20" });
  assert.deepEqual(periodoAnteriorLubrificacao("2026-03-01", "2026-03-31"), { inicio: "2026-02-01", fim: "2026-02-28" });
  assert.deepEqual(periodoAnteriorLubrificacao("2024-03-01", "2024-03-31"), { inicio: "2024-02-01", fim: "2024-02-29" });
  assert.equal(periodoAnteriorLubrificacao("", "2026-11-10"), null);
  assert.equal(periodoAnteriorLubrificacao("2026-11-10", "2026-11-01"), null);
});

test("evolução compara só o mesmo período, sem incluir o restante do mês anterior", () => {
  const eventos = [
    { codEquipamento: 1, data: "2025-10-01", quantidade: 2 },
    { codEquipamento: 1, data: "2025-10-20", quantidade: 50 },
    { codEquipamento: 1, data: "2025-11-01", quantidade: 3 },
  ];
  const periodo = periodoAnteriorLubrificacao("2025-11-01", "2025-11-10")!;
  const atual = kpisLubrificacaoPorPeriodo(eventos, [], "2025-11-01", "2025-11-10");
  const anterior = kpisLubrificacaoPorPeriodo(eventos, [], periodo.inicio, periodo.fim);
  assert.equal(variacaoPercentualLubrificacao(atual.lancamentosRealizados, anterior.lancamentosRealizados), 50);
  assert.equal(variacaoPercentualLubrificacao(5, 10), -50);
  assert.equal(variacaoPercentualLubrificacao(0, 0), 0);
  assert.equal(variacaoPercentualLubrificacao(5, 0), null);
  assert.equal(variacaoPercentualLubrificacao(null, 10), null);
});

test("lubrication point status uses the 90% alert threshold", () => {
  assert.equal(lubrificacaoStatusPonto(null, 50), "sem_plano");
  assert.equal(lubrificacaoStatusPonto(20, 50), "em_dia");
  assert.equal(lubrificacaoStatusPonto(45, 50), "a_vencer");
  assert.equal(lubrificacaoStatusPonto(50, 50), "vencido");
  assert.equal(lubrificacaoStatusPonto(62, 50), "vencido");
});

test("comparativo de eficiência subtrai percentuais em pontos percentuais", () => {
  // Setembro 30%, outubro 90%: evolução de 60 p.p., não 200%.
  assert.equal(variacaoPercentualLubrificacao(90, 30, true), 60);
  assert.equal(variacaoPercentualLubrificacao(60, 80, true), -20);
  assert.equal(variacaoPercentualLubrificacao(80, 0, true), 80);
  assert.equal(variacaoPercentualLubrificacao(0, 0, true), 0);
  assert.equal(variacaoPercentualLubrificacao(80, null, true), null);
});

test("remaining hours go negative when the interval is overdue", () => {
  assert.equal(lubrificacaoHorasRestantes(20, 50), 30);
  assert.equal(lubrificacaoHorasRestantes(55, 50), -5);
  assert.equal(lubrificacaoHorasRestantes(null, 50), null);
});

test("vencimento summary and sort put overdue items first", () => {
  const itens = [
    { status: "em_dia", horasRestantes: 20, codEquipamento: 2, codComponente: 1 },
    { status: "vencido", horasRestantes: -4, codEquipamento: 1, codComponente: 2 },
    { status: "a_vencer", horasRestantes: 3, codEquipamento: 1, codComponente: 1 },
  ] as LubrificacaoComponenteVencimento[];
  assert.deepEqual(resumoVencimentosLubrificacao(itens), { ok: 1, aVencer: 1, vencido: 1, semPlano: 0 });
  assert.deepEqual(
    ordenarVencimentosLubrificacao(itens).map((row) => row.status),
    ["vencido", "a_vencer", "em_dia"],
  );
  assert.equal(lubrificacaoSituacaoLabel("a_vencer"), "A vencer");
});

test("quantidade realizada de vencimento usa só o mês/ano escolhidos", () => {
  const realizados = [
    { codEquipamento: 10, codComponente: 2, mes: "2026-09", qtd: 3, litros: 12 },
    { codEquipamento: 10, codComponente: 2, mes: "2026-08", qtd: 8, litros: 40 },
    { codEquipamento: 11, codComponente: 2, mes: "2026-09", qtd: 1, litros: 0 },
  ];
  assert.equal(chaveMesLubrificacao(2026, 9), "2026-09");
  assert.deepEqual(realizadoComponenteNoMes(realizados, 10, 2, 2026, 9), { qtd: 3, litros: 12 });
  assert.deepEqual(realizadoComponenteNoMes(realizados, 10, 2, 2026, 8), { qtd: 8, litros: 40 });
  assert.deepEqual(realizadoComponenteNoMes(realizados, 10, 2, 2026, 7), { qtd: 0, litros: null });
  assert.deepEqual(realizadoComponenteNoMes(realizados, 11, 2, 2026, 9), { qtd: 1, litros: null });
});
