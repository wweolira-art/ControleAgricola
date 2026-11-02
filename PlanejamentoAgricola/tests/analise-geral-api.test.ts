import { test } from "node:test";
import assert from "node:assert/strict";
import { consultarAnaliseGeralFazendas } from "../src/lib/analise-geral-api";
import { periodosAnaliseGeralPadrao } from "../src/lib/analiseGeralPeriodos";

test("consulta autenticada não depende de método novo no objeto api", async () => {
  const expected = { fazendas: [], avisos: [], atualizadoEm: "2026-11-01T12:00:00Z" };
  const transport: typeof fetch = async (url, init) => {
    const request = new URL(String(url), "https://example.test");
    assert.equal(request.pathname, "/api/indicadores/analise-geral-fazendas");
    assert.equal(request.searchParams.get("safraCode"), "2026/2027");
    assert.equal(request.searchParams.get("inicio"), "2026-09-01");
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer teste");
    assert.equal(init?.cache, "no-store");
    return Response.json(expected);
  };
  assert.deepEqual(await consultarAnaliseGeralFazendas({ inicio: "2026-09-01", fim: "2026-11-01", safraCode: "2026/2027", token: "teste" }, transport), expected);
});

test("envia e confirma os três períodos sem substituir a biometria pelo período da compactação", async () => {
  const periodos = periodosAnaliseGeralPadrao("2026-09-01", "2026-10-30");
  periodos.compactacao = { inicio: "2025-09-01", fim: "2026-08-30" };
  const expected = { fazendas: [], avisos: [], atualizadoEm: "2026-11-01T12:00:00Z", periodos };
  const params = { inicio: periodos.compactacao.inicio, fim: periodos.compactacao.fim, periodos, token: null };
  const transport: typeof fetch = async (url) => {
    const query = new URL(String(url), "https://example.test").searchParams;
    assert.equal(query.get("compactacaoInicio"), "2025-09-01");
    assert.equal(query.get("compactacaoFim"), "2026-08-30");
    assert.equal(query.get("tchInicio"), "2026-09-01");
    assert.equal(query.get("tchFim"), "2026-10-30");
    assert.equal(query.get("tocosInicio"), "2026-09-01");
    return Response.json(expected);
  };
  assert.deepEqual(await consultarAnaliseGeralFazendas(params, transport), expected);
  await assert.rejects(consultarAnaliseGeralFazendas(params, async () => Response.json({ ...expected, periodos: undefined })), /períodos independentes/);
});

test("servidor antigo e falha de sessão recebem mensagens claras", async () => {
  const params = { inicio: "2026-09-01", fim: "2026-11-01", token: null };
  await assert.rejects(consultarAnaliseGeralFazendas(params, async () => new Response("<html>Aplicação</html>", { headers: { "Content-Type": "text/html" } })), /versão do servidor/);
  await assert.rejects(consultarAnaliseGeralFazendas(params, async () => Response.json({ error: "Sessão inválida" }, { status: 401 })), /Sessão expirada/);
  await assert.rejects(consultarAnaliseGeralFazendas(params, async () => Response.json({ error: "Fonte indisponível" }, { status: 500 })), /Fonte indisponível/);
});
