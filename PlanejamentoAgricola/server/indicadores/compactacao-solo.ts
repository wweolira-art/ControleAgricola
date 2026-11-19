import { COMPACTACAO_PROFUNDIDADES, normalizarCompactacao, type CompactacaoData, type CompactacaoContornos } from "../../src/lib/compactacaoSolo.js";
import fs from "node:fs";
import type Database from "better-sqlite3";
import { db } from "../db.js";
import { geojsonPath } from "./mapa-fazendas.js";

const FONTE_LOCAL = "SQLite local (tabela compactacao_solo)";

export function invalidarCacheCompactacao() {
  // Os dados são consultados diretamente no SQLite. A função é mantida para os
  // pontos de integração que a chamam após uma importação ou edição.
}

function garantirTabelaCompactacaoSolo(database: Database.Database) {
  database.exec(`CREATE TABLE IF NOT EXISTS compactacao_solo (
    id_unico TEXT PRIMARY KEY,
    id_exibido TEXT,
    data_hora_utc TEXT,
    campo TEXT,
    fazenda TEXT,
    lote TEXT,
    dados_json TEXT NOT NULL,
    atualizado_em TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_compactacao_solo_data ON compactacao_solo(data_hora_utc);
  CREATE INDEX IF NOT EXISTS idx_compactacao_solo_fazenda ON compactacao_solo(fazenda);`);
}

export async function carregarCompactacaoSolo(filtros: { dataInicio?: string | null; dataFim?: string | null; profundidade?: string | null }, database: Database.Database = db): Promise<CompactacaoData> {
  if (filtros.profundidade && !COMPACTACAO_PROFUNDIDADES.some((d) => d.nome === filtros.profundidade)) throw Object.assign(new Error("Profundidade inválida."), { status: 400 });
  for (const date of [filtros.dataInicio, filtros.dataFim]) if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)))) throw Object.assign(new Error("Data inválida."), { status: 400 });
  if (filtros.dataInicio && filtros.dataFim && filtros.dataInicio > filtros.dataFim) throw Object.assign(new Error("A data inicial deve ser anterior à final."), { status: 400 });

  garantirTabelaCompactacaoSolo(database);
  const rows = database.prepare("SELECT data_hora_utc, dados_json FROM compactacao_solo ORDER BY data_hora_utc, id_unico").all() as Array<{ data_hora_utc: string | null; dados_json: string }>;
  const dates = rows.map((row) => String(row.data_hora_utc ?? "").slice(0, 10)).filter(Boolean);
  const pontos = rows.filter((row) => {
    const day = String(row.data_hora_utc ?? "").slice(0, 10);
    return (!filtros.dataInicio || day >= filtros.dataInicio) && (!filtros.dataFim || day <= filtros.dataFim);
  }).map((row) => normalizarCompactacao(JSON.parse(row.dados_json) as Record<string, unknown>, filtros.profundidade)).filter((row) => row != null);
  const geojson = JSON.parse(fs.readFileSync(geojsonPath(), "utf8")) as CompactacaoContornos;
  return { pontos, geojson, fonte: FONTE_LOCAL, consultadoEm: new Date().toISOString(), periodoDisponivel: { inicio: dates[0] ?? null, fim: dates.at(-1) ?? null }, profundidade: filtros.profundidade ?? null, duplicadosRemovidos: 0 };
}
