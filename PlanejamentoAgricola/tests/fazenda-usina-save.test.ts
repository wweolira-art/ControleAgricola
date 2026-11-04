import assert from "node:assert/strict";
import { test } from "node:test";
import { listarFazendaUsina, salvarFazendaUsina } from "../server/colheita/fazenda-usina.js";
import { invalidateOrdsPageCache } from "../server/colheita/ords-common.js";

test("salva criação e edição e invalida a lista em cache, aceitando raio com vírgula", async (t) => {
  const oldUrl = process.env.ORDS_FAZENDA_USINA_URL;
  process.env.ORDS_FAZENDA_USINA_URL = "https://example.test/fazendas/";
  t.after(() => {
    if (oldUrl == null) delete process.env.ORDS_FAZENDA_USINA_URL;
    else process.env.ORDS_FAZENDA_USINA_URL = oldUrl;
    invalidateOrdsPageCache();
  });
  invalidateOrdsPageCache();
  const records: Record<string, unknown>[] = [];
  const methods: string[] = [];
  t.mock.method(globalThis, "fetch", async (_url: unknown, options?: RequestInit) => {
    const method = options?.method ?? "GET";
    methods.push(method);
    if (method === "POST") {
      records.push({ ...JSON.parse(String(options?.body)), links: [{ rel: "self", href: "https://example.test/fazendas/1" }] });
      return Response.json({});
    }
    if (method === "PUT") {
      Object.assign(records[0], JSON.parse(String(options?.body)));
      return Response.json({});
    }
    return Response.json({ items: records, hasMore: false });
  });
  assert.equal((await listarFazendaUsina()).dados.length, 0);
  await salvarFazendaUsina({ descricaoUsina: "Fazenda teste", codSistema: "123", raio: "42,5" });
  assert.equal((await listarFazendaUsina()).dados[0].raio, 42.5);
  await salvarFazendaUsina({ descricaoUsina: "Fazenda teste", codSistema: "", raio: "50,25" });
  const rows = (await listarFazendaUsina()).dados;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].raio, 50.25);
  assert.equal(rows[0].codSistema, 123);
  assert.equal(methods.filter((method) => method === "POST").length, 1);
  assert.equal(methods.filter((method) => method === "PUT").length, 1);
  await assert.rejects(salvarFazendaUsina({ descricaoUsina: "Fazenda teste", raio: "inválido" }), /raio médio válido/);
});
