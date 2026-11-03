import type Database from "better-sqlite3";
import { validarParametroRendimento, type RendimentoParametro } from "../../src/lib/rendimento-agricola.js";

function garantirTabela(db: Database.Database) {
  db.exec(`CREATE TABLE IF NOT EXISTS rendimento_agricola_parametros (
    codObjetoCusto INTEGER NOT NULL, objetoCusto TEXT NOT NULL,
    codOperacao INTEGER NOT NULL, operacao TEXT NOT NULL,
    rendimentoPrevisto REAL NOT NULL CHECK(rendimentoPrevisto > 0),
    consumoPrevisto REAL NOT NULL CHECK(consumoPrevisto > 0),
    atualizadoEm TEXT NOT NULL,
    PRIMARY KEY(codObjetoCusto, codOperacao)
  )`);
}

export function listarRendimentoParametros(db: Database.Database): RendimentoParametro[] {
  garantirTabela(db);
  return db.prepare("SELECT codObjetoCusto, objetoCusto, codOperacao, operacao, rendimentoPrevisto, consumoPrevisto FROM rendimento_agricola_parametros ORDER BY objetoCusto, operacao").all() as RendimentoParametro[];
}

export function salvarRendimentoParametro(db: Database.Database, parametro: RendimentoParametro): RendimentoParametro {
  const values = validarParametroRendimento(parametro);
  garantirTabela(db);
  db.prepare(`INSERT INTO rendimento_agricola_parametros (codObjetoCusto, objetoCusto, codOperacao, operacao, rendimentoPrevisto, consumoPrevisto, atualizadoEm)
    VALUES (@codObjetoCusto, @objetoCusto, @codOperacao, @operacao, @rendimentoPrevisto, @consumoPrevisto, @atualizadoEm)
    ON CONFLICT(codObjetoCusto, codOperacao) DO UPDATE SET objetoCusto=excluded.objetoCusto, operacao=excluded.operacao,
    rendimentoPrevisto=excluded.rendimentoPrevisto, consumoPrevisto=excluded.consumoPrevisto, atualizadoEm=excluded.atualizadoEm`)
    .run({ ...values, objetoCusto: parametro.objetoCusto, operacao: parametro.operacao, atualizadoEm: new Date().toISOString() });
  return { ...values, objetoCusto: parametro.objetoCusto, operacao: parametro.operacao };
}
