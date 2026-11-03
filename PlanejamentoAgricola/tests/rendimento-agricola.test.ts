import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import { resumirRendimento, validarParametroRendimento, validarPeriodoRendimento, type RendimentoLancamento, type RendimentoParametro } from "../src/lib/rendimento-agricola.js";
import { listarRendimentoParametros, salvarRendimentoParametro } from "../server/indicadores/rendimento-agricola-parametros.js";

const parametro: RendimentoParametro = { codObjetoCusto: 10, objetoCusto: "Preparo", codOperacao: 5, operacao: "Gradagem pesada", rendimentoPrevisto: 2, consumoPrevisto: 15 };
const linha = (patch: Partial<RendimentoLancamento> = {}): RendimentoLancamento => ({
  origem: "automotivo", idAbastecimento: "1", dataAbastecimento: "2026-10-02", codEquipamento: 4001,
  codObjetoCusto: 10, objetoCusto: "Preparo", codOperacaoAgricola: 5, descricaoOperacao: "Gradagem pesada",
  horasTrabalho: 10, areaHa: 20, qtdeLitros: 100, ...patch,
});

test("metas são independentes por objeto e operação; taxas usam os totais", () => {
  const parametros = [parametro, { ...parametro, codObjetoCusto: 20, objetoCusto: "Outro objeto", rendimentoPrevisto: 3 }];
  const rows = resumirRendimento([linha(), linha({ idAbastecimento: "2", horasTrabalho: 2, areaHa: 8, qtdeLitros: 40 }), linha({ idAbastecimento: "3", codObjetoCusto: 20, objetoCusto: "Outro objeto" })], parametros);
  const principal = rows.find((row) => row.codObjetoCusto === 10)!;
  assert.equal(principal.horas, 12);
  assert.equal(principal.areaHa, 28);
  assert.equal(principal.rendimentoRealizado, 28 / 12);
  assert.equal(principal.consumoRealizado, 140 / 12);
  assert.equal(principal.rendimentoPrevisto, 2);
  assert.equal(rows.find((row) => row.codObjetoCusto === 20)?.rendimentoPrevisto, 3);
});

test("cada abastecimento entra uma vez; origem distinta permanece e dados sem identificação são separados", () => {
  const rows = resumirRendimento([linha(), linha(), linha({ origem: "posto" }), linha({ idAbastecimento: "3", codObjetoCusto: null, codOperacaoAgricola: null, descricaoOperacao: null, objetoCusto: null, horasTrabalho: 0 })], []);
  assert.equal(rows.length, 2);
  assert.equal(rows.find((row) => row.codObjetoCusto === 10)?.litros, 200);
  const sem = rows.find((row) => row.codObjetoCusto == null)!;
  assert.equal(sem.consumoRealizado, null);
  assert.equal(sem.rendimentoRealizado, null);
  assert.equal(sem.rendimentoPrevisto, null);
});

test("meta cadastrada continua visível sem produção no período", () => {
  const [row] = resumirRendimento([], [parametro]);
  assert.equal(row.rendimentoPrevisto, 2);
  assert.equal(row.consumoPrevisto, 15);
  assert.equal(row.rendimentoRealizado, null);
  assert.equal(row.abastecimentos, 0);
});

test("valida datas reais e metas numéricas positivas", () => {
  validarPeriodoRendimento("2026-10-01", "2026-10-31");
  for (const [inicio, fim] of [["", "2026-10-31"], ["2026-10-31", "2026-10-01"], ["2026-02-30", "2026-03-01"]]) assert.throws(() => validarPeriodoRendimento(inicio, fim));
  assert.throws(() => validarParametroRendimento({ ...parametro, consumoPrevisto: 0 }));
  assert.throws(() => validarParametroRendimento({ ...parametro, rendimentoPrevisto: "2" }));
  assert.throws(() => validarParametroRendimento({ ...parametro, codObjetoCusto: 0 }));
  assert.throws(() => validarParametroRendimento({ ...parametro, consumoPrevisto: NaN }));
});

test("salvar atualiza apenas a combinação escolhida e persiste as duas metas", () => {
  const db = new Database(":memory:");
  try {
    assert.deepEqual(listarRendimentoParametros(db), []);
    salvarRendimentoParametro(db, parametro);
    salvarRendimentoParametro(db, { ...parametro, codObjetoCusto: 20, objetoCusto: "Outro" });
    salvarRendimentoParametro(db, { ...parametro, rendimentoPrevisto: 2.75, consumoPrevisto: 18.5 });
    const rows = listarRendimentoParametros(db);
    assert.equal(rows.length, 2);
    assert.equal(rows.find((row) => row.codObjetoCusto === 10)?.consumoPrevisto, 18.5);
    assert.equal(rows.find((row) => row.codObjetoCusto === 10)?.rendimentoPrevisto, 2.75);
    assert.equal(rows.find((row) => row.codObjetoCusto === 20)?.consumoPrevisto, 15);
    assert.throws(() => salvarRendimentoParametro(db, { ...parametro, rendimentoPrevisto: -1 }));
    assert.equal(listarRendimentoParametros(db).length, 2);
  } finally { db.close(); }
});
