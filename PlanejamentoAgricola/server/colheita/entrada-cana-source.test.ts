import { test } from "node:test";
import assert from "node:assert/strict";
import { carregarEntradaCanaComFallback, entradaCanaDateQuery } from "./entrada-cana-source";

test("base local vazia não impede carregar a fonte e salvar uma cópia", async () => {
  const remote = { dados: [{ pesagem: 42 }] };
  let cached = { dados: [] as { pesagem: number }[] };
  const result = await carregarEntradaCanaComFallback(async () => remote, () => cached, (value) => { cached = value; });
  assert.equal(result.fonte, "ords");
  assert.deepEqual(result.payload, remote);
  assert.deepEqual(cached, remote);
});

test("API indisponível usa dados locais e avisa; sem dados o erro é informado", async () => {
  const failure = async () => { throw new Error("API indisponível"); };
  const result = await carregarEntradaCanaComFallback(failure, () => ({ dados: [42] }), () => assert.fail("não deve sobrescrever o cache"));
  assert.equal(result.fonte, "local");
  assert.ok(result.aviso);
  await assert.rejects(carregarEntradaCanaComFallback(failure, () => ({ dados: [] }), () => {}), /API indisponível/);
});

test("retorno vazio válido não é substituído por pesagens antigas", async () => {
  const result = await carregarEntradaCanaComFallback(async () => ({ dados: [] }), () => ({ dados: [42] }), () => {});
  assert.equal(result.fonte, "ords");
  assert.deepEqual(result.payload.dados, []);
});

test("período na origem inclui todo o último dia e funciona na virada do mês", () => {
  assert.deepEqual(entradaCanaDateQuery("2026-10-30", "2026-10-31"), { data: { $gte: { $date: "2026-10-30T00:00:00Z" }, $lt: { $date: "2026-11-01T00:00:00Z" } } });
  assert.equal(entradaCanaDateQuery(null, null), undefined);
});
