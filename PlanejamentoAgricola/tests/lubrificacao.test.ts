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
  type LubrificacaoComponenteVencimento,
} from "../src/lib/lubrificacao.js";

test("lubrication point status uses the 90% alert threshold", () => {
  assert.equal(lubrificacaoStatusPonto(null, 50), "sem_plano");
  assert.equal(lubrificacaoStatusPonto(20, 50), "em_dia");
  assert.equal(lubrificacaoStatusPonto(45, 50), "a_vencer");
  assert.equal(lubrificacaoStatusPonto(50, 50), "vencido");
  assert.equal(lubrificacaoStatusPonto(62, 50), "vencido");
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
