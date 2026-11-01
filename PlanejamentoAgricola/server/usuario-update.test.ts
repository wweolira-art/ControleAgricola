import { test } from "node:test";
import assert from "node:assert/strict";
import { persistUsuarioUpdate } from "./usuario-update";

test("salva código manual e preserva perfil e demais campos exigidos pelo PUT", async () => {
  const original = { id_usuario: 10, nome: "Externo", cod_funcionario: null, perfil: 7, senha_hash: "hash-de-teste", links: [] };
  let stored: Record<string, unknown> = original;
  const methods: string[] = [];
  const transport: typeof fetch = async (_url, init) => {
    methods.push(init?.method ?? "GET");
    if (init?.method === "PUT") stored = JSON.parse(String(init.body));
    return Response.json(stored);
  };
  const saved = await persistUsuarioUpdate("https://example.test/usuario/10", original, { cod_funcionario: Number("001") }, transport);
  assert.equal(saved.cod_funcionario, 1);
  assert.equal(stored.perfil, 7);
  assert.equal(stored.senha_hash, "hash-de-teste");
  assert.equal("links" in stored, false);
  assert.deepEqual(methods, ["PUT", "GET"]);
});

test("não confirma sucesso se a API ignora o novo código ou rejeita a gravação", async () => {
  const original = { id_usuario: 10, cod_funcionario: null };
  await assert.rejects(persistUsuarioUpdate("https://example.test/usuario/10", original, { cod_funcionario: 1 }, async () => Response.json(original)), /não gravou o código/);
  await assert.rejects(persistUsuarioUpdate("https://example.test/usuario/10", original, { cod_funcionario: 1 }, async () => Response.json({ message: "Campo obrigatório" }, { status: 400 })), /Campo obrigatório/);
});
