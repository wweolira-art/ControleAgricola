import { deleteOrdsItem, diaUtcFromIso, postOrdsItem, putOrdsItem, scanOrdsCollection, toNumber } from "./ords-common.js";
import {
  horasMaquinaOrdsUrl,
  listarHorasMaquina,
  mapHorasMaquinaItem,
  type HorasMaquinaRow,
} from "./horas-maquina.js";
import {
  alterarLoteHoras,
  excluirHorasLote,
  listarHorasLotes,
  marcarHorasSincronizado,
  obterHorasLote,
  salvarHorasLote,
  ultimasHorasLocaisAntes,
  type HorasLote,
} from "./horas-lote-local.js";

function turnoNorm(turno: unknown) {
  return String(turno || "").trim().toUpperCase();
}

function turnoOrd(turno: unknown) {
  const t = turnoNorm(turno);
  if (t === "A") return 0;
  if (t === "B") return 1;
  return 2;
}

function chaveApontamento(data: string | null | undefined, turno: unknown): [string, number] {
  return [String(data || "").slice(0, 10), turnoOrd(turno)];
}

function chaveMaior(a: [string, number], b: [string, number]) {
  return a[0] > b[0] || (a[0] === b[0] && a[1] > b[1]);
}

function codKey(cod: number) {
  return String(Math.trunc(cod));
}

function montarPayload(input: {
  data: string;
  turno: string;
  codEquipamento: number;
  horaMotor: number | null;
  horasElevador: number | null;
}) {
  return {
    data: `${input.data.slice(0, 10)}T00:00:00Z`,
    turno: turnoNorm(input.turno),
    cod_equipamento: Number(input.codEquipamento),
    hora_motor: Number(input.horaMotor ?? 0),
    horas_elevador: input.horasElevador == null ? null : Number(input.horasElevador),
  };
}

async function buscarExistente(data: string, turno: string, codEquipamento: number) {
  const lista = await listarHorasMaquina({
    dataInicio: data,
    dataFim: data,
    equipamento: String(codEquipamento),
    limit: 200,
  });
  const turnoN = turnoNorm(turno);
  return (
    lista.dados.find(
      (row) =>
        row.codEquipamento === codEquipamento &&
        diaUtcFromIso(row.data) === data &&
        turnoNorm(row.turno) === turnoN,
    ) ?? null
  );
}

export async function enviarHorasRegistro(input: {
  data: string;
  turno: string;
  codEquipamento: number;
  horaMotor: number | null;
  horasElevador: number | null;
  apiId?: number | null;
}) {
  const payload = montarPayload(input);
  let alvoId = input.apiId ?? null;
  if (alvoId == null) {
    const existente = await buscarExistente(input.data, input.turno, input.codEquipamento);
    if (existente?.id != null) alvoId = existente.id;
  }
  if (alvoId != null) {
    const result = (await putOrdsItem(`${horasMaquinaOrdsUrl()}${alvoId}`, payload)) as Record<string, unknown> | null;
    return { ...(result ?? {}), id: toNumber(result?.id) ?? alvoId, _acao: "update" as const };
  }
  const result = (await postOrdsItem(horasMaquinaOrdsUrl(), payload)) as Record<string, unknown> | null;
  return { ...(result ?? {}), id: toNumber(result?.id), _acao: "create" as const };
}

export async function excluirHorasRegistro(apiId: number) {
  await deleteOrdsItem(`${horasMaquinaOrdsUrl()}${apiId}`);
}

export async function listarHorasCoa(filtros: {
  dataInicio?: string | null;
  dataFim?: string | null;
  turno?: string | null;
}) {
  const turnoN = filtros.turno && filtros.turno !== "TODOS" ? turnoNorm(filtros.turno) : null;
  const lista = await listarHorasMaquina({
    dataInicio: filtros.dataInicio,
    dataFim: filtros.dataFim,
    limit: 2000,
  });
  const items = lista.dados
    .filter((row) => !turnoN || turnoNorm(row.turno) === turnoN)
    .map((row) => ({
      id: row.id,
      data: diaUtcFromIso(row.data),
      turno: row.turno,
      codEquipamento: row.codEquipamento,
      tipoEquipamento: row.tipoDescricao,
      horaMotor: row.horaMotor,
      horasElevador: row.horasElevador,
    }));
  return { items, count: items.length };
}

export async function ultimasHorasAntes(data: string, turno: string, equipamentos: number[]) {
  const dia = data.slice(0, 10);
  const atual = chaveApontamento(dia, turno);
  const pendentes = new Set(equipamentos.filter((n) => Number.isFinite(n)));
  const locais = ultimasHorasLocaisAntes(dia, turno, [...pendentes]);
  const collected = await scanOrdsCollection(horasMaquinaOrdsUrl(), {
    maxRows: 20000,
    match: (item) => {
      const row = mapHorasMaquinaItem(item);
      if (!row?.codEquipamento || !pendentes.has(row.codEquipamento)) return false;
      const chave = chaveApontamento(diaUtcFromIso(row.data), row.turno);
      return chave[0] < atual[0] || (chave[0] === atual[0] && chave[1] < atual[1]);
    },
    map: (item) => mapHorasMaquinaItem(item) as Record<string, unknown>,
  });
  const melhor = new Map<string, HorasMaquinaRow>();
  for (const raw of collected.dados as unknown as HorasMaquinaRow[]) {
    if (raw.codEquipamento == null) continue;
    const key = codKey(raw.codEquipamento);
    const prev = melhor.get(key);
    const chave = chaveApontamento(diaUtcFromIso(raw.data), raw.turno);
    if (!prev || chaveMaior(chave, chaveApontamento(diaUtcFromIso(prev.data), prev.turno))) {
      melhor.set(key, raw);
    }
  }
  const ultimas: Record<
    string,
    {
      codEquipamento: number | null;
      horaMotor: number | null;
      horasElevador: number | null;
      data: string | null;
      turno: string | null;
      id?: number | null;
      origem: "local" | "coa";
    }
  > = { ...locais };
  for (const [key, row] of melhor) {
    const item = {
      codEquipamento: row.codEquipamento,
      horaMotor: row.horaMotor,
      horasElevador: row.horasElevador,
      data: diaUtcFromIso(row.data),
      turno: turnoNorm(row.turno),
      id: row.id,
      origem: "coa" as const,
    };
    const atualItem = ultimas[key];
    if (!atualItem || chaveMaior(chaveApontamento(item.data, item.turno), chaveApontamento(atualItem.data, atualItem.turno))) {
      ultimas[key] = item;
    }
  }
  return ultimas;
}

type EquipPayload = {
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
};

function eqNum(eq: EquipPayload, a: keyof EquipPayload, b: keyof EquipPayload) {
  const n = Number(eq[a] ?? eq[b]);
  return Number.isFinite(n) ? n : null;
}

export async function enviarHorasCoa(payload: { data: string; turno: string; equipamentos?: EquipPayload[] }) {
  const data = String(payload.data || "").slice(0, 10);
  const turno = turnoNorm(payload.turno);
  const equipamentos = payload.equipamentos ?? [];
  if (!data || !turno) {
    throw Object.assign(new Error("Data e turno são obrigatórios."), { status: 400 });
  }
  if (!equipamentos.length) {
    throw Object.assign(new Error("Informe ao menos um equipamento."), { status: 400 });
  }
  const registro = salvarHorasLote(payload);
  const enviados: Array<{
    codEquipamento: number;
    apiId: number | null;
    acao: string;
    horaMotor: number | null;
    horasElevador: number | null;
  }> = [];
  const erros: Array<{ codEquipamento: number | null; erro: string }> = [];
  for (const eq of equipamentos) {
    const cod = eqNum(eq, "codEquipamento", "cod_equipamento");
    if (cod == null) {
      erros.push({ codEquipamento: null, erro: "Código obrigatório" });
      continue;
    }
    try {
      const r = await enviarHorasRegistro({
        data,
        turno,
        codEquipamento: cod,
        horaMotor: eqNum(eq, "horaMotor", "hora_motor"),
        horasElevador: eqNum(eq, "horasElevador", "horas_elevador"),
        apiId: eqNum(eq, "apiId", "api_id"),
      });
      enviados.push({
        codEquipamento: cod,
        apiId: toNumber(r.id),
        acao: String(r._acao ?? "create"),
        horaMotor: toNumber(r.hora_motor),
        horasElevador: toNumber(r.horas_elevador),
      });
    } catch (e) {
      erros.push({ codEquipamento: cod, erro: e instanceof Error ? e.message : String(e) });
    }
  }
  if (enviados.length) {
    marcarHorasSincronizado(
      data,
      turno,
      enviados.map((e) => ({ codEquipamento: e.codEquipamento, apiId: e.apiId })),
    );
  }
  const registroAtual = obterHorasLote(data, turno) ?? registro;
  return {
    ok: erros.length === 0 && enviados.length > 0,
    enviados,
    erros,
    registro: registroAtual,
    error: erros.length ? erros[0]?.erro : enviados.length ? null : "Nenhum registro enviado.",
  };
}

export async function excluirHorasLoteCompleto(data: string, turno: string) {
  const registro = obterHorasLote(data, turno);
  if (!registro) throw Object.assign(new Error("Lote não encontrado."), { status: 404 });
  const avisos: string[] = [];
  for (const eq of registro.equipamentos) {
    if (eq.apiId == null) continue;
    try {
      await excluirHorasRegistro(eq.apiId);
    } catch (e) {
      avisos.push(`Equip ${eq.codEquipamento ?? "?"}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  excluirHorasLote(data, turno);
  return { ok: true, avisos };
}

export async function alterarHorasLoteCompleto(
  data: string,
  turno: string,
  dataNova: string,
  turnoNovo: string,
) {
  const registro = obterHorasLote(data, turno);
  if (!registro) throw Object.assign(new Error("Lote não encontrado."), { status: 404 });
  const destino = obterHorasLote(dataNova, turnoNovo);
  if (destino && (dataNova !== data || turnoNorm(turnoNovo) !== turnoNorm(turno))) {
    throw Object.assign(new Error(`Já existe lote para ${dataNova} turno ${turnoNovo}.`), { status: 400 });
  }
  const enviados: Array<{ codEquipamento: number | null; apiId: number | null }> = [];
  const erros: Array<{ codEquipamento: number | null; erro: string }> = [];
  for (const eq of registro.equipamentos) {
    if (eq.apiId == null || eq.codEquipamento == null) continue;
    try {
      const r = await enviarHorasRegistro({
        data: dataNova,
        turno: turnoNovo,
        codEquipamento: eq.codEquipamento,
        horaMotor: eq.horaMotor,
        horasElevador: eq.horasElevador,
        apiId: eq.apiId,
      });
      enviados.push({ codEquipamento: eq.codEquipamento, apiId: toNumber(r.id) ?? eq.apiId });
    } catch (e) {
      erros.push({
        codEquipamento: eq.codEquipamento,
        erro: e instanceof Error ? e.message : String(e),
      });
    }
  }
  if (erros.length) {
    const err = new Error("Falha ao atualizar data/turno no COA.");
    (err as Error & { status?: number; detalhes?: unknown }).status = 502;
    (err as Error & { detalhes?: unknown }).detalhes = erros;
    throw err;
  }
  return { ok: true, registro: alterarLoteHoras(data, turno, dataNova, turnoNovo), enviados };
}

export { listarHorasLotes, obterHorasLote, salvarHorasLote, type HorasLote };
