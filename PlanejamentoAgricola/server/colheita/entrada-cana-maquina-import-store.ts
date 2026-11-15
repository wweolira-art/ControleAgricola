import type Database from "better-sqlite3";
import type { EntradaCanaMaquinaRow } from "./entrada-cana-maquina-list.js";
import { diaUtcFromIso, parseDataDia, toNumber } from "./ords-common.js";

export function chaveEntradaMaquina(row: EntradaCanaMaquinaRow) {
  return `${row.maquina ?? ""}|${diaUtcFromIso(row.dataColheita) ?? ""}|${row.fazenda ?? ""}|${row.talhao ?? ""}|${row.tipoColheita ?? ""}|${row.tipoCana ?? ""}|${row.peso ?? ""}|${row.impMineral ?? ""}|${row.codEquipamento ?? ""}`;
}

export function prepararEntradaMaquina(payload: Record<string, unknown>): EntradaCanaMaquinaRow {
  const row: EntradaCanaMaquinaRow = {
    maquina: toNumber(payload.maquina),
    fazenda: payload.fazenda == null ? null : String(payload.fazenda).trim() || null,
    talhao: toNumber(payload.talhao),
    dataColheita: payload.datacolheita == null ? null : String(payload.datacolheita),
    tipoColheita: payload.tipocolheita == null ? null : String(payload.tipocolheita).trim() || null,
    tipoCana: payload.tipocana == null ? null : String(payload.tipocana).trim() || null,
    peso: toNumber(payload.peso), impMineral: toNumber(payload.impmineral),
    safra: payload.safra == null ? null : String(payload.safra).trim() || null,
    codEquipamento: toNumber(payload.cod_equipamento),
  };
  validar(row);
  return row;
}

function validar(row: EntradaCanaMaquinaRow) {
  const day = diaUtcFromIso(row.dataColheita);
  if (row.maquina == null || !Number.isFinite(row.maquina) || !day || !parseDataDia(day) || row.peso == null || !Number.isFinite(row.peso)) {
    throw new Error("Entrada Cana Máquina: máquina, data e peso devem ser válidos antes de substituir os registros existentes.");
  }
  return day;
}

/** Recebe o lote inteiro: arquivos sobrepostos não apagam linhas uns dos outros. */
export function substituirEntradasMaquina(db: Database.Database, input: EntradaCanaMaquinaRow[]) {
  const scopes = new Map<string, { maquina: string; day: string }>();
  const rows = input.map(row => {
    const day = validar(row);
    scopes.set(`${row.maquina}|${day}`, { maquina: String(row.maquina), day });
    return { ...row };
  });
  const read = db.prepare("SELECT dados_json FROM entrada_cana_maquina_local WHERE maquina = ? AND data_iso = ?");
  const remove = db.prepare("DELETE FROM entrada_cana_maquina_local WHERE maquina = ? AND data_iso = ?");
  const save = db.prepare(`INSERT INTO entrada_cana_maquina_local
    (chave, data_iso, maquina, cod_equipamento, dados_json, atualizado_em) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(chave) DO UPDATE SET dados_json=excluded.dados_json, atualizado_em=excluded.atualizado_em`);
  const identity = (r: EntradaCanaMaquinaRow) => JSON.stringify([r.fazenda, r.talhao, r.tipoColheita, r.tipoCana]);
  const codes = (items: EntradaCanaMaquinaRow[]) => [...new Set(items.map(r => r.codEquipamento).filter((v): v is number => v != null))];
  return db.transaction(() => {
    const previous = new Map<string, EntradaCanaMaquinaRow[]>();
    for (const [key, scope] of scopes) previous.set(key, (read.all(scope.maquina, scope.day) as {dados_json: string}[]).map(r => JSON.parse(r.dados_json)));
    for (const row of rows) {
      if (row.codEquipamento != null) continue;
      const existing = previous.get(`${row.maquina}|${diaUtcFromIso(row.dataColheita)}`) ?? [];
      const exactCodes = codes(existing.filter(r => identity(r) === identity(row)));
      const candidates = exactCodes.length ? exactCodes : codes(existing);
      if (candidates.length > 1) throw new Error(`Há mais de um equipamento vinculado à máquina ${row.maquina} nessa data. Confira o vínculo antes de reimportar.`);
      row.codEquipamento = candidates[0] ?? null;
    }
    let removed = 0;
    for (const scope of scopes.values()) removed += remove.run(scope.maquina, scope.day).changes;
    const now = new Date().toISOString();
    for (const row of rows) save.run(chaveEntradaMaquina(row), diaUtcFromIso(row.dataColheita), String(row.maquina), row.codEquipamento == null ? null : String(row.codEquipamento), JSON.stringify(row), now);
    return { rows, removed, scopes: scopes.size };
  })();
}
