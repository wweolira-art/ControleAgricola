import { deleteOrdsItem, diaUtcFromIso, parsePeriodoObrigatorio, postOrdsItem, putOrdsItem, scanOrdsCollection, toNumber } from "./ords-common.js";
import { montarPayloadHoras } from "./horas-envio-payload.js";
import {
  horasMaquinaOrdsUrl,
  listarHorasMaquina,
  mapHorasMaquinaItem,
  type HorasMaquinaRow,
} from "./horas-maquina.js";
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
  leituraAnterior?: { horaMotor: number | null; horasElevador: number | null } | null;
}) {
  const anterior = input.leituraAnterior !== undefined
    ? input.leituraAnterior
    : (await ultimasHorasAntes(input.data, input.turno, [input.codEquipamento]))[codKey(input.codEquipamento)] ?? null;
  const payload = montarPayloadHoras(input, anterior);
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
  equipamento?: string | null;
  codTipoEquipamento?: number | null;
}) {
  const periodo = parsePeriodoObrigatorio(filtros);
  const turnoN = filtros.turno && filtros.turno !== "TODOS" ? turnoNorm(filtros.turno) : null;
  const lista = await listarHorasMaquina({
    ...periodo,
    equipamento: filtros.equipamento,
    codTipoEquipamento: filtros.codTipoEquipamento,
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
      horasMotorRodadas: row.horasMotorRodadas ?? null,
      horasElevadorRodadas: row.horasElevadorRodadas ?? null,
    }))
    .sort((a, b) => String(b.data).localeCompare(String(a.data)) || String(b.turno).localeCompare(String(a.turno)) || (a.codEquipamento ?? 0) - (b.codEquipamento ?? 0));
  return { items, count: items.length };
}

export async function ultimasHorasAntes(data: string, turno: string, equipamentos: number[]) {
  const dia = data.slice(0, 10);
  const atual = chaveApontamento(dia, turno);
  const pendentes = new Set(equipamentos.filter((n) => Number.isFinite(n)));
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
      origem: "coa";
    }
  > = {};
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
  return toNumber(eq[a] ?? eq[b]);
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
  const anteriores = await ultimasHorasAntes(data, turno, equipamentos
    .map((eq) => eqNum(eq, "codEquipamento", "cod_equipamento"))
    .filter((cod): cod is number => cod != null));
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
        leituraAnterior: anteriores[codKey(cod)] ?? null,
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
  return {
    ok: erros.length === 0 && enviados.length > 0,
    enviados,
    erros,
    error: erros.length ? erros[0]?.erro : enviados.length ? null : "Nenhum registro enviado.",
  };
}
