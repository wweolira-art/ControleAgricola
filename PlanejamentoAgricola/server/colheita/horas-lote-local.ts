import { db } from "../db.js";

export type HorasEquipLinha = {
  ordem: number;
  tipoEquipamento: string | null;
  codEquipamento: number | null;
  horaMotor: number | null;
  horasElevador: number | null;
  apiId: number | null;
  apiSincronizado: boolean;
};

export type HorasLote = {
  id: number;
  data: string;
  turno: string;
  apiSincronizado: boolean;
  atualizadoEm: string | null;
  equipamentos: HorasEquipLinha[];
};

export type HorasLoteResumo = {
  id: number;
  data: string;
  turno: string;
  apiSincronizado: boolean;
  atualizadoEm: string | null;
  qtdEquip: number;
};

function ensureTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS horas_lote (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      data TEXT NOT NULL,
      turno TEXT NOT NULL,
      api_sincronizado INTEGER DEFAULT 0,
      atualizado_em TEXT DEFAULT (datetime('now', 'localtime')),
      UNIQUE(data, turno)
    );
    CREATE TABLE IF NOT EXISTS horas_equipamento (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lote_id INTEGER NOT NULL,
      ordem INTEGER NOT NULL DEFAULT 0,
      tipo_equipamento TEXT,
      cod_equipamento REAL,
      hora_motor REAL,
      horas_elevador REAL,
      api_id INTEGER,
      api_sincronizado INTEGER DEFAULT 0,
      FOREIGN KEY (lote_id) REFERENCES horas_lote(id) ON DELETE CASCADE
    );
  `);
}

function toNum(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function turnoNorm(turno: unknown) {
  return String(turno || "").trim().toUpperCase();
}

function turnoOrd(turno: unknown) {
  const t = turnoNorm(turno);
  if (t === "A") return 0;
  if (t === "B") return 1;
  return 2;
}

function mapLinha(row: Record<string, unknown>): HorasEquipLinha {
  return {
    ordem: Number(row.ordem ?? 0),
    tipoEquipamento: row.tipo_equipamento != null ? String(row.tipo_equipamento) : null,
    codEquipamento: toNum(row.cod_equipamento),
    horaMotor: toNum(row.hora_motor),
    horasElevador: toNum(row.horas_elevador),
    apiId: toNum(row.api_id),
    apiSincronizado: Boolean(row.api_sincronizado),
  };
}

export function obterHorasLote(data: string, turno: string): HorasLote | null {
  ensureTables();
  const lote = db
    .prepare("SELECT * FROM horas_lote WHERE data = ? AND turno = ?")
    .get(data.slice(0, 10), turnoNorm(turno)) as Record<string, unknown> | undefined;
  if (!lote) return null;
  const eqs = db
    .prepare(
      `SELECT ordem, tipo_equipamento, cod_equipamento, hora_motor, horas_elevador, api_id, api_sincronizado
         FROM horas_equipamento WHERE lote_id = ? ORDER BY ordem`,
    )
    .all(lote.id) as Record<string, unknown>[];
  return {
    id: Number(lote.id),
    data: String(lote.data),
    turno: String(lote.turno),
    apiSincronizado: Boolean(lote.api_sincronizado),
    atualizadoEm: lote.atualizado_em != null ? String(lote.atualizado_em) : null,
    equipamentos: eqs.map(mapLinha),
  };
}

export function listarHorasLotes(limit = 40): HorasLoteResumo[] {
  ensureTables();
  const rows = db
    .prepare(
      `SELECT l.id, l.data, l.turno, l.api_sincronizado, l.atualizado_em, COUNT(e.id) AS qtd_equip
         FROM horas_lote l
         LEFT JOIN horas_equipamento e ON e.lote_id = l.id
        GROUP BY l.id
        ORDER BY l.data DESC, l.turno
        LIMIT ?`,
    )
    .all(limit) as Record<string, unknown>[];
  return rows.map((row) => ({
    id: Number(row.id),
    data: String(row.data),
    turno: String(row.turno),
    apiSincronizado: Boolean(row.api_sincronizado),
    atualizadoEm: row.atualizado_em != null ? String(row.atualizado_em) : null,
    qtdEquip: Number(row.qtd_equip ?? 0),
  }));
}

export function salvarHorasLote(payload: {
  data: string;
  turno: string;
  equipamentos?: Array<{
    tipoEquipamento?: string | null;
    tipo_equipamento?: string | null;
    codEquipamento?: number | null;
    cod_equipamento?: number | null;
    horaMotor?: number | null;
    hora_motor?: number | null;
    horasElevador?: number | null;
    horas_elevador?: number | null;
    apiId?: number | null;
    api_id?: number | null;
  }>;
}): HorasLote {
  ensureTables();
  const data = String(payload.data || "").slice(0, 10);
  const turno = turnoNorm(payload.turno);
  const equipamentos = payload.equipamentos ?? [];
  const tx = db.transaction(() => {
    const existente = db.prepare("SELECT id FROM horas_lote WHERE data = ? AND turno = ?").get(data, turno) as
      | { id: number }
      | undefined;
    let loteId: number;
    if (existente) {
      loteId = existente.id;
      db.prepare(
        `UPDATE horas_lote SET api_sincronizado = 0, atualizado_em = datetime('now', 'localtime') WHERE id = ?`,
      ).run(loteId);
      db.prepare("DELETE FROM horas_equipamento WHERE lote_id = ?").run(loteId);
    } else {
      const info = db.prepare("INSERT INTO horas_lote (data, turno, api_sincronizado) VALUES (?, ?, 0)").run(data, turno);
      loteId = Number(info.lastInsertRowid);
    }
    const insert = db.prepare(
      `INSERT INTO horas_equipamento
         (lote_id, ordem, tipo_equipamento, cod_equipamento, hora_motor, horas_elevador, api_id, api_sincronizado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    equipamentos.forEach((eq, idx) => {
      const apiId = toNum(eq.apiId ?? eq.api_id);
      insert.run(
        loteId,
        idx,
        String(eq.tipoEquipamento ?? eq.tipo_equipamento ?? "").trim().toUpperCase() || null,
        toNum(eq.codEquipamento ?? eq.cod_equipamento),
        toNum(eq.horaMotor ?? eq.hora_motor),
        toNum(eq.horasElevador ?? eq.horas_elevador),
        apiId,
        apiId != null ? 1 : 0,
      );
    });
  });
  tx();
  const registro = obterHorasLote(data, turno);
  if (!registro) throw new Error("Falha ao gravar o lote local.");
  return registro;
}

export function marcarHorasSincronizado(
  data: string,
  turno: string,
  equipamentos: Array<{ codEquipamento?: number | null; apiId?: number | null }>,
) {
  ensureTables();
  const lote = db
    .prepare("SELECT id FROM horas_lote WHERE data = ? AND turno = ?")
    .get(data.slice(0, 10), turnoNorm(turno)) as { id: number } | undefined;
  if (!lote) return;
  const upd = db.prepare(
    `UPDATE horas_equipamento SET api_id = ?, api_sincronizado = 1 WHERE lote_id = ? AND cod_equipamento = ?`,
  );
  const tx = db.transaction(() => {
    for (const item of equipamentos) {
      upd.run(toNum(item.apiId), lote.id, toNum(item.codEquipamento));
    }
    db.prepare(
      `UPDATE horas_lote SET api_sincronizado = 1, atualizado_em = datetime('now', 'localtime') WHERE id = ?`,
    ).run(lote.id);
  });
  tx();
}

export function excluirHorasLote(data: string, turno: string) {
  ensureTables();
  const info = db.prepare("DELETE FROM horas_lote WHERE data = ? AND turno = ?").run(data.slice(0, 10), turnoNorm(turno));
  return info.changes > 0;
}

export function alterarLoteHoras(data: string, turnoAtual: string, dataNova: string, turnoNovo: string): HorasLote {
  ensureTables();
  const dataN = data.slice(0, 10);
  const dataNovaN = dataNova.slice(0, 10);
  const turnoAtualN = turnoNorm(turnoAtual);
  const turnoNovoN = turnoNorm(turnoNovo);
  if (!dataNovaN) throw Object.assign(new Error("Data nova é obrigatória."), { status: 400 });
  if (turnoNovoN !== "A" && turnoNovoN !== "B") {
    throw Object.assign(new Error("Turno novo deve ser A ou B."), { status: 400 });
  }
  if (dataN === dataNovaN && turnoAtualN === turnoNovoN) {
    const mesmo = obterHorasLote(dataN, turnoAtualN);
    if (!mesmo) throw Object.assign(new Error("Lote não encontrado."), { status: 404 });
    return mesmo;
  }
  const lote = db.prepare("SELECT id FROM horas_lote WHERE data = ? AND turno = ?").get(dataN, turnoAtualN) as
    | { id: number }
    | undefined;
  if (!lote) throw Object.assign(new Error("Lote não encontrado."), { status: 404 });
  const destino = db.prepare("SELECT id FROM horas_lote WHERE data = ? AND turno = ?").get(dataNovaN, turnoNovoN);
  if (destino) {
    throw Object.assign(new Error(`Já existe lote para ${dataNovaN} turno ${turnoNovoN}.`), { status: 400 });
  }
  db.prepare(
    `UPDATE horas_lote SET data = ?, turno = ?, atualizado_em = datetime('now', 'localtime') WHERE id = ?`,
  ).run(dataNovaN, turnoNovoN, lote.id);
  const registro = obterHorasLote(dataNovaN, turnoNovoN);
  if (!registro) throw new Error("Falha ao alterar o lote.");
  return registro;
}

export function ultimasHorasLocaisAntes(data: string, turno: string, equipamentos: number[]) {
  ensureTables();
  const dia = data.slice(0, 10);
  const atual = [dia, turnoOrd(turno)] as const;
  const melhor = new Map<string, { codEquipamento: number; horaMotor: number | null; horasElevador: number | null; data: string; turno: string; origem: "local" }>();
  if (!equipamentos.length || !dia) return {};
  const placeholders = equipamentos.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT e.cod_equipamento, e.hora_motor, e.horas_elevador, l.data, l.turno
         FROM horas_equipamento e
         JOIN horas_lote l ON e.lote_id = l.id
        WHERE e.cod_equipamento IN (${placeholders})`,
    )
    .all(...equipamentos) as Record<string, unknown>[];
  for (const row of rows) {
    const cod = toNum(row.cod_equipamento);
    if (cod == null) continue;
    const chave: [string, number] = [String(row.data || "").slice(0, 10), turnoOrd(row.turno)];
    if (chave[0] > atual[0] || (chave[0] === atual[0] && chave[1] >= atual[1])) continue;
    const key = String(Math.trunc(cod));
    const prev = melhor.get(key);
    if (!prev || chave[0] > prev.data || (chave[0] === prev.data && chave[1] > turnoOrd(prev.turno))) {
      melhor.set(key, {
        codEquipamento: cod,
        horaMotor: toNum(row.hora_motor),
        horasElevador: toNum(row.horas_elevador),
        data: chave[0],
        turno: turnoNorm(row.turno),
        origem: "local",
      });
    }
  }
  return Object.fromEntries(melhor);
}
