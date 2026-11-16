import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db } from "../db.js";
import { oracleNumber, oracleText, withOracle } from "../oracle.js";

export type PneuPreco = {
  id: number;
  codMedida: number;
  dataInicial: string;
  dataFinal: string | null;
  preco: number;
};

export type PneuMedidaOpcao = { codMedida: number; descricao: string };
const PRECO_SEM_DATA_FINAL = "9999-12-31";
export type PneuPrecoReferencia = {
  size: string;
  brand: string;
  model: string;
  unitPrice: number;
  store: string;
};

export type TabelaPrecoReferencia = {
  referenceMonth: string;
  currency: string;
  unit: string;
  notes: string;
  prices: PneuPrecoReferencia[];
};

const tabelaReferenciaPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../data/precos-pneus-agricolas-2026-11.json",
);

db.exec(`
  CREATE TABLE IF NOT EXISTS pneu_precos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cod_medida INTEGER NOT NULL,
    data_inicial TEXT NOT NULL,
    data_final TEXT NOT NULL,
    preco REAL NOT NULL CHECK (preco >= 0),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (cod_medida, data_inicial, data_final)
  );
  CREATE INDEX IF NOT EXISTS idx_pneu_precos_medida_periodo
    ON pneu_precos (cod_medida, data_inicial, data_final);
`);

function mapPreco(row: Record<string, unknown>): PneuPreco {
  const dataFinal = String(row.data_final);
  return {
    id: Number(row.id),
    codMedida: Number(row.cod_medida),
    dataInicial: String(row.data_inicial),
    dataFinal: dataFinal === PRECO_SEM_DATA_FINAL ? null : dataFinal,
    preco: Number(row.preco),
  };
}

export function listarPrecosPneus(): PneuPreco[] {
  return (db.prepare(`
    SELECT id, cod_medida, data_inicial, data_final, preco
      FROM pneu_precos
     ORDER BY cod_medida, data_inicial DESC, id DESC
  `).all() as Record<string, unknown>[]).map(mapPreco);
}

export function lerTabelaLocalPrecosPneus(): TabelaPrecoReferencia | null {
  if (!fs.existsSync(tabelaReferenciaPath)) return null;
  const raw: unknown = JSON.parse(fs.readFileSync(tabelaReferenciaPath, "utf8"));
  if (!raw || typeof raw !== "object") throw new Error("A tabela local de preços de pneus é inválida.");
  const source = raw as Record<string, unknown>;
  const prices = Array.isArray(source.prices) ? source.prices : [];
  const parsed = prices.map((item) => {
    const row = item as Record<string, unknown>;
    const price = Number(row.unitPrice);
    if (
      !String(row.size ?? "").trim() || !String(row.brand ?? "").trim() || !String(row.model ?? "").trim()
      || !String(row.store ?? "").trim() || !Number.isFinite(price) || price < 0
    ) throw new Error("A tabela local de preços de pneus contém um registro inválido.");
    return {
      size: String(row.size).trim(),
      brand: String(row.brand).trim(),
      model: String(row.model).trim(),
      unitPrice: price,
      store: String(row.store).trim(),
    };
  });
  return {
    referenceMonth: String(source.referenceMonth ?? ""),
    currency: String(source.currency ?? "BRL"),
    unit: String(source.unit ?? "unidade"),
    notes: String((source.source as Record<string, unknown> | undefined)?.notes ?? ""),
    prices: parsed,
  };
}

export function resolverPrecoPneu(
  precos: readonly PneuPreco[],
  codMedida: number | null | undefined,
  data: string | null | undefined,
): number | null {
  if (codMedida == null || !data) return null;
  const dia = data.slice(0, 10);
  const vigente = precos
    .filter((item) => item.codMedida === codMedida && item.dataInicial <= dia && (item.dataFinal == null || item.dataFinal >= dia))
    .sort((a, b) => b.dataInicial.localeCompare(a.dataInicial) || b.id - a.id)[0];
  return vigente?.preco ?? null;
}

function validar(input: unknown) {
  const body = (input ?? {}) as Record<string, unknown>;
  const codMedida = Number(body.codMedida ?? body.cod_medida);
  const dataInicial = String(body.dataInicial ?? body.data_inicial ?? "").trim();
  const dataFinalRaw = String(body.dataFinal ?? body.data_final ?? "").trim();
  const dataFinal = dataFinalRaw || null;
  const preco = Number(body.preco);
  if (!Number.isInteger(codMedida) || codMedida <= 0) throw new Error("Informe uma medida de pneu válida.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataInicial) || (dataFinal != null && !/^\d{4}-\d{2}-\d{2}$/.test(dataFinal))) {
    throw new Error("Informe uma data inicial válida. A data final é opcional.");
  }
  if (dataFinal != null && dataFinal < dataInicial) throw new Error("A data final deve ser igual ou posterior à data inicial.");
  if (!Number.isFinite(preco) || preco < 0) throw new Error("Informe um preço válido.");
  return { codMedida, dataInicial, dataFinal, preco };
}

function validarSobreposicao(codMedida: number, dataInicial: string, dataFinal: string, ignorarId?: number) {
  const conflito = db.prepare(`
    SELECT id FROM pneu_precos
     WHERE cod_medida = ?
       AND data_inicial <= ?
       AND data_final >= ?
       AND (? IS NULL OR id <> ?)
     LIMIT 1
  `).get(codMedida, dataFinal, dataInicial, ignorarId ?? null, ignorarId ?? null) as { id: number } | undefined;
  if (conflito) throw new Error("Já existe um preço para essa medida em parte do período informado.");
}

export function criarPrecoPneu(input: unknown): PneuPreco {
  const value = validar(input);
  const dataFinalBanco = value.dataFinal ?? PRECO_SEM_DATA_FINAL;
  validarSobreposicao(value.codMedida, value.dataInicial, dataFinalBanco);
  const info = db.prepare(`
    INSERT INTO pneu_precos (cod_medida, data_inicial, data_final, preco)
    VALUES (?, ?, ?, ?)
  `).run(value.codMedida, value.dataInicial, dataFinalBanco, value.preco);
  return mapPreco(db.prepare(`SELECT id, cod_medida, data_inicial, data_final, preco FROM pneu_precos WHERE id = ?`)
    .get(Number(info.lastInsertRowid)) as Record<string, unknown>);
}

export function atualizarPrecoPneu(id: number, input: unknown): PneuPreco {
  if (!Number.isInteger(id) || id <= 0) throw new Error("Preço não encontrado.");
  const value = validar(input);
  const dataFinalBanco = value.dataFinal ?? PRECO_SEM_DATA_FINAL;
  validarSobreposicao(value.codMedida, value.dataInicial, dataFinalBanco, id);
  const info = db.prepare(`
    UPDATE pneu_precos
       SET cod_medida = ?, data_inicial = ?, data_final = ?, preco = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?
  `).run(value.codMedida, value.dataInicial, dataFinalBanco, value.preco, id);
  if (!info.changes) throw new Error("Preço não encontrado.");
  return mapPreco(db.prepare(`SELECT id, cod_medida, data_inicial, data_final, preco FROM pneu_precos WHERE id = ?`)
    .get(id) as Record<string, unknown>);
}

export function excluirPrecoPneu(id: number) {
  if (!Number.isInteger(id) || id <= 0) throw new Error("Preço não encontrado.");
  const info = db.prepare("DELETE FROM pneu_precos WHERE id = ?").run(id);
  if (!info.changes) throw new Error("Preço não encontrado.");
}

export async function listarMedidasPneus(): Promise<PneuMedidaOpcao[]> {
  return withOracle(async (conn) => {
    const result = await conn.execute(`
      SELECT cod_medidapneu, desc_medidapneu
        FROM automotivo.medidapneu
       ORDER BY desc_medidapneu, cod_medidapneu
    `);
    return ((result.rows ?? []) as Record<string, unknown>[])
      .map((row) => ({
        codMedida: oracleNumber(row, "cod_medidapneu", "COD_MEDIDAPNEU") ?? 0,
        descricao: oracleText(row, "desc_medidapneu", "DESC_MEDIDAPNEU") ?? "",
      }))
      .filter((row) => row.codMedida > 0);
  });
}
