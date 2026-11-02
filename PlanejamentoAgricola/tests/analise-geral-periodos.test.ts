import { test } from "node:test";
import assert from "node:assert/strict";
import { resolverPeriodosAnaliseGeral, periodosAnaliseGeralPadrao } from "../src/lib/analiseGeralPeriodos";

test("cada coluna conserva seu próprio período, inclusive entre safras diferentes", () => {
  const result = resolverPeriodosAnaliseGeral({
    compactacaoInicio: "2025-09-01", compactacaoFim: "2026-08-30",
    tocosInicio: "2026-01-01", tocosFim: "2026-08-31",
    tchInicio: "2026-09-01", tchFim: "2026-10-30",
  });
  assert.deepEqual(result, {
    compactacao: { inicio: "2025-09-01", fim: "2026-08-30" },
    tocos: { inicio: "2026-01-01", fim: "2026-08-31" },
    tch: { inicio: "2026-09-01", fim: "2026-10-30" },
  });
});

test("período comum antigo continua válido e pode ser substituído em somente uma coluna", () => {
  const base = { inicio: "2026-09-01", fim: "2026-10-30" };
  assert.deepEqual(resolverPeriodosAnaliseGeral(base), periodosAnaliseGeralPadrao(base.inicio, base.fim));
  const result = resolverPeriodosAnaliseGeral({ ...base, compactacaoInicio: "2025-09-01", compactacaoFim: "2026-08-30" });
  assert.deepEqual(result.tch, base);
  assert.equal(result.compactacao.fim, "2026-08-30");
});

test("datas inválidas ou invertidas identificam a coluna que precisa ser corrigida", () => {
  const base = { inicio: "2026-09-01", fim: "2026-10-30" };
  assert.throws(() => resolverPeriodosAnaliseGeral({ ...base, tocosInicio: "2026-11-01" }), /Tocos %/);
  assert.throws(() => resolverPeriodosAnaliseGeral({ ...base, tchInicio: "2026-02-30" }), /TCH análise biométrica/);
  assert.throws(() => resolverPeriodosAnaliseGeral({ ...base, compactacaoFim: "" , fim: "" }), /Compactação do solo/);
});
