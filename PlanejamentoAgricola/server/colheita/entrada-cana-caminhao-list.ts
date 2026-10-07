import { ORDS_MAX_UPDATES,
  acumularVinculoEquipPeriodo,
  diaUtcFromIso,
  listarVinculosEquipPeriodo,
  parsePeriodoObrigatorio,
  parsePeriodoOpcional,
  putOrdsItem,
  scanOrdsCollection,
  selfHrefFromItem,
  toNumber,
  type VinculoEquipPeriodo,
} from "./ords-common.js";
import { matchPeriodoDia } from "./periodo-colheita.js";
import { db } from "../db.js";
import { withOracle } from "../oracle.js";

const DEFAULT_ORDS_URL =
  "https://g58645a2c384a96-bd1.adb.sa-saopaulo-1.oraclecloudapps.com/ords/admin/entradacanacaminhao/";

function baseUrl() {
  const fromEnv =
    process.env.ORDS_ENTRADA_CANA_CAMINHAO_URL?.trim() ||
    process.env.ENTRADA_CANA_ORDS_URL?.trim();
  return (fromEnv || DEFAULT_ORDS_URL).replace(/\/?$/, "/");
}

export interface EntradaCanaCaminhaoRow {
  rowid: string | null;
  pesagem: number | null;
  guia: number | null;
  situacao: string | null;
  caminhao: number | null;
  talhao: number | null;
  etapa: number | null;
  data: string | null;
  intQueima: number | null;
  pesoBruto: number | null;
  pesoTara: number | null;
  pesoLiquido: number | null;
  fazenda: string | null;
  tipoColheita: string | null;
  safra: string | null;
  atr: number | null;
  empresa: string | null;
  codEquipamento: number | null;
  op01: string | null;
  op02: string | null;
  op03: string | null;
  op04: string | null;
  op05: string | null;
  op06: string | null;
  op07: string | null;
  selfHref?: string | null;
}

type OpKey = "op01" | "op02" | "op03" | "op04" | "op05" | "op06" | "op07";

const OP_KEYS: OpKey[] = ["op01", "op02", "op03", "op04", "op05", "op06", "op07"];

function pickText(item: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = item[key] ?? item[key.toUpperCase()];
    if (value != null && String(value).trim() !== "") return String(value).trim();
  }
  return null;
}

function mapItem(item: Record<string, unknown>, includeHref = false): EntradaCanaCaminhaoRow | null {
  if (!item || typeof item !== "object") return null;
  const row: EntradaCanaCaminhaoRow = {
    rowid: pickText(item, "rowid", "id"),
    pesagem: toNumber(item.pesagem),
    guia: toNumber(item.guia),
    situacao: pickText(item, "situacao", "situação", "status"),
    caminhao: toNumber(item.caminhao),
    talhao: toNumber(item.talhao),
    etapa: toNumber(item.etapa),
    data: item.data != null ? String(item.data) : null,
    intQueima: toNumber(item.intqueima),
    pesoBruto: toNumber(item.pesobruto),
    pesoTara: toNumber(item.pesotara),
    pesoLiquido: toNumber(item.pesoliquido),
    fazenda: (item.fazenda ?? item.FAZENDA) != null ? String(item.fazenda ?? item.FAZENDA).trim() : null,
    tipoColheita: item.tipocolheita != null ? String(item.tipocolheita).trim() : null,
    safra: item.safra != null ? String(item.safra).trim() : null,
    atr: toNumber(item.atr),
    empresa: item.empresa != null ? String(item.empresa).trim() : null,
    codEquipamento: toNumber(item.cod_equipamento ?? item.COD_EQUIPAMENTO),
    op01: pickText(item, "op01", "op_01", "op1", "op 01"),
    op02: pickText(item, "op02", "op_02", "op2", "op 02"),
    op03: pickText(item, "op03", "op_03", "op3", "op 03"),
    op04: pickText(item, "op04", "op_04", "op4", "op 04"),
    op05: pickText(item, "op05", "op_05", "op5", "op 05"),
    op06: pickText(item, "op06", "op_06", "op6", "op 06"),
    op07: pickText(item, "op07", "op_07", "op7", "op 07"),
  };
  if (includeHref) row.selfHref = selfHrefFromItem(item as { links?: { rel?: string; href?: string }[] });
  return row;
}

function toOrdsPutBody(row: EntradaCanaCaminhaoRow, codEquipamento: number | null) {
  return {
    pesagem: row.pesagem,
    guia: row.guia,
    caminhao: row.caminhao,
    talhao: row.talhao,
    etapa: row.etapa,
    data: row.data,
    intqueima: row.intQueima,
    pesobruto: row.pesoBruto,
    pesotara: row.pesoTara,
    pesoliquido: row.pesoLiquido,
    fazenda: row.fazenda,
    tipocolheita: row.tipoColheita,
    safra: row.safra,
    atr: row.atr,
    empresa: row.empresa,
    cod_equipamento: codEquipamento,
  };
}

function matchBusca(row: EntradaCanaCaminhaoRow, busca: string | null) {
  if (!busca) return true;
  const q = busca.toLowerCase();
  const blob = [row.pesagem, row.guia, row.caminhao, row.talhao, row.fazenda, row.tipoColheita, row.safra, row.empresa, row.codEquipamento]
    .filter((v) => v != null && v !== "")
    .join(" ")
    .toLowerCase();
  return blob.includes(q);
}

function matchPeriodo(row: EntradaCanaCaminhaoRow, dataInicio: string | null, dataFim: string | null) {
  return matchPeriodoDia(diaUtcFromIso(row.data), dataInicio, dataFim);
}

function overlayConferenciaLocal(rows: EntradaCanaCaminhaoRow[]) {
  if (!rows.length) return rows;
  const stmt = db.prepare(
    `SELECT op01, op02, op03, op04, op05, op06, op07
       FROM entrada_cana_caminhao_conferencia
      WHERE pesagem = ? AND guia = ?`,
  );
  return rows.map((row) => {
    const pesagem = row.pesagem == null ? "" : String(row.pesagem);
    const guia = row.guia == null ? "" : String(row.guia);
    if (!pesagem || !guia) return row;
    const local = stmt.get(pesagem, guia) as
      | Partial<Record<OpKey, string | null>>
      | undefined;
    if (!local) return row;
    return {
      ...row,
      ...Object.fromEntries(OP_KEYS.map((key) => [key, local[key] ?? row[key]])),
    };
  });
}

function cleanOpValue(value: unknown) {
  const text = value == null ? "" : String(value).trim();
  return text;
}

function codigoFuncionarioFromOp(value: string | null | undefined) {
  const text = cleanOpValue(value);
  if (!text) return null;
  const match = text.match(/^(.+?)\s*-\s*.+$/);
  return cleanOpValue(match ? match[1] : text) || null;
}

async function buscarDescricoesFuncionarios(codigos: string[]) {
  const unique = [...new Set(codigos.map((codigo) => cleanOpValue(codigo)).filter(Boolean))];
  if (!unique.length) return {} as Record<string, string>;
  try {
    return await withOracle(async (conn) => {
      const binds = Object.fromEntries(unique.map((codigo, index) => [`c${index}`, codigo]));
      const placeholders = unique.map((_, index) => `:c${index}`).join(", ");
      const result = await conn.execute(
        `SELECT TRIM(TO_CHAR(cdgfuncionario)) AS codigo,
                TRIM(cscfuncionario) AS descricao
           FROM agricola.sga_funcionario
          WHERE TRIM(TO_CHAR(cdgfuncionario)) IN (${placeholders})`,
        binds,
        { maxRows: 0, fetchArraySize: 500 },
      );
      const rows = (result.rows ?? []) as Record<string, unknown>[];
      return Object.fromEntries(
        rows
          .map((row) => [cleanOpValue(row.CODIGO ?? row.codigo), cleanOpValue(row.DESCRICAO ?? row.descricao)] as const)
          .filter(([codigo, descricao]) => codigo && descricao),
      );
    });
  } catch {
    return {} as Record<string, string>;
  }
}

function normalizeOpValue(value: unknown) {
  if (value == null || typeof value !== "object") return cleanOpValue(value);
  const record = value as { codigoFuncionario?: unknown; codigo?: unknown; funcionario?: unknown; viagens?: unknown; numeroViagens?: unknown };
  const codigo = cleanOpValue(record.codigoFuncionario ?? record.codigo ?? record.funcionario);
  const viagens = cleanOpValue(record.viagens ?? record.numeroViagens);
  if (!codigo && !viagens) return "";
  if (codigo && viagens) return `${codigo} - ${viagens}`;
  return codigo ?? viagens;
}

function assertFuncionariosSemRepeticao(values: Record<OpKey, string>) {
  const vistos = new Set<string>();
  for (const key of OP_KEYS) {
    const codigo = codigoFuncionarioFromOp(values[key]);
    if (!codigo) continue;
    const normalized = codigo.replace(/^0+/, "") || codigo;
    if (vistos.has(normalized)) {
      const err = new Error("Não é permitido repetir o mesmo código de funcionário nas OPs da mesma linha.");
      (err as Error & { status?: number }).status = 400;
      throw err;
    }
    vistos.add(normalized);
  }
}

export function salvarEntradaCanaCaminhaoOps(params: {
  pesagem?: string | number | null;
  guia?: string | number | null;
  ops?: Partial<Record<OpKey, unknown>> | null;
}) {
  const pesagem = params.pesagem != null ? String(params.pesagem).trim() : "";
  const guia = params.guia != null ? String(params.guia).trim() : "";
  if (!pesagem || !guia) {
    const err = new Error("Informe pesagem e guia para salvar as OPs.");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }
  const ops = params.ops || {};
  const values = Object.fromEntries(OP_KEYS.map((key) => [key, normalizeOpValue(ops[key])])) as Record<OpKey, string>;
  assertFuncionariosSemRepeticao(values);
  db.prepare(
    `INSERT INTO entrada_cana_caminhao_conferencia (pesagem, guia, op01, op02, op03, op04, op05, op06, op07)
     VALUES (@pesagem, @guia, @op01, @op02, @op03, @op04, @op05, @op06, @op07)
     ON CONFLICT(pesagem, guia) DO UPDATE SET
       op01 = excluded.op01,
       op02 = excluded.op02,
       op03 = excluded.op03,
       op04 = excluded.op04,
       op05 = excluded.op05,
       op06 = excluded.op06,
       op07 = excluded.op07`,
  ).run({ pesagem, guia, ...values });
  return { ok: true, registro: { pesagem, guia, ...values } };
}

async function coletarLinhas(
  filtros: {
    busca?: string | null;
    dataInicio?: string | null;
    dataFim?: string | null;
    pesagem?: string | null;
    guia?: string | null;
    caminhao?: string | null;
    limit?: number | null;
  },
  includeHref = false,
) {
  const busca = filtros.busca?.trim() || null;
  const { dataInicio, dataFim } = parsePeriodoOpcional(filtros);
  const pesagem = filtros.pesagem?.trim() || null;
  const guia = filtros.guia?.trim() || null;
  const caminhao = filtros.caminhao?.trim() || null;
  const userLimit = toNumber(filtros.limit);
  const maxRows = userLimit != null && userLimit > 0 ? userLimit : Number.MAX_SAFE_INTEGER;

  const collected = await scanOrdsCollection(baseUrl(), {
    maxRows,
    match: (item) => {
      const row = mapItem(item);
      if (!row) return false;
      if (pesagem && String(row.pesagem) !== String(pesagem)) return false;
      if (guia && String(row.guia) !== String(guia)) return false;
      if (caminhao && String(row.caminhao) !== String(caminhao)) return false;
      if (!matchPeriodo(row, dataInicio, dataFim)) return false;
      if (!matchBusca(row, busca)) return false;
      return true;
    },
    map: (item) => mapItem(item, includeHref) as Record<string, unknown>,
  });

  return {
    ...collected,
    filtros: { busca, dataInicio, dataFim, pesagem, guia, caminhao, limit: collected.maxRows },
  };
}

export async function listarEntradaCanaCaminhao(filtros: Parameters<typeof coletarLinhas>[0] = {}) {
  const collected = await coletarLinhas(filtros, false);
  const dados = overlayConferenciaLocal(collected.dados as unknown as EntradaCanaCaminhaoRow[]);
  const codigosFuncionario = dados.flatMap((row) =>
    OP_KEYS.map((key) => codigoFuncionarioFromOp(row[key])).filter((codigo): codigo is string => Boolean(codigo)),
  );
  const funcionarios = await buscarDescricoesFuncionarios(codigosFuncionario);
  const pesoLiquidoTotal = dados.reduce((acc, r) => acc + (r.pesoLiquido ?? 0), 0);
  return {
    filtros: collected.filtros,
    resumo: { totalLinhas: dados.length, paginasOrds: collected.pages, pesoLiquidoTotal, truncado: collected.hasMore },
    funcionarios,
    dados,
  };
}

export async function listarCaminhoesDistinct(filtros: Parameters<typeof coletarLinhas>[0] = {}) {
  const payload = await listarEntradaCanaCaminhao({ ...filtros, busca: null, caminhao: null });
  const mapa = new Map<
    string,
    {
      caminhao: number | null;
      qtdEntradas: number;
      ultimaData: string | null;
      codEquipamento: number | null;
      porEquip: Map<string, VinculoEquipPeriodo>;
    }
  >();
  for (const row of payload.dados) {
    if (row.caminhao == null) continue;
    const key = String(row.caminhao);
    const prev = mapa.get(key) || {
      caminhao: row.caminhao,
      qtdEntradas: 0,
      ultimaData: null,
      codEquipamento: null,
      porEquip: new Map<string, VinculoEquipPeriodo>(),
    };
    prev.qtdEntradas += 1;
    if (row.codEquipamento != null) prev.codEquipamento = row.codEquipamento;
    if (row.data && (!prev.ultimaData || String(row.data) > String(prev.ultimaData))) prev.ultimaData = row.data;
    acumularVinculoEquipPeriodo(prev.porEquip, row.codEquipamento, diaUtcFromIso(row.data));
    mapa.set(key, prev);
  }
  const dados = [...mapa.values()]
    .map((item) => ({
      caminhao: item.caminhao,
      qtdEntradas: item.qtdEntradas,
      ultimaData: item.ultimaData,
      codEquipamento: item.codEquipamento,
      associacoes: listarVinculosEquipPeriodo(item.porEquip),
    }))
    .sort((a, b) => {
      const na = Number(a.caminhao);
      const nb = Number(b.caminhao);
      if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
      return String(a.caminhao).localeCompare(String(b.caminhao));
    });
  return {
    filtros: payload.filtros,
    resumo: { totalCaminhoes: dados.length, totalLinhasBase: payload.resumo.totalLinhas, truncado: payload.resumo.truncado },
    dados,
  };
}

export async function atualizarCodEquipamentoCaminhao(params: {
  caminhao?: string | number | null;
  dataInicio?: string | null;
  dataFim?: string | null;
  codEquipamento?: number | string | null;
  limpar?: boolean;
}) {
  const caminhao = params.caminhao != null && String(params.caminhao).trim() !== "" ? String(params.caminhao).trim() : null;
  if (!caminhao) {
    const err = new Error("Informe o número do caminhão.");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }
  const { dataInicio, dataFim } = parsePeriodoObrigatorio(params);
  const limpar = params.limpar === true || params.codEquipamento === null;
  let codEquipamento: number | null = null;
  if (!limpar) {
    codEquipamento = toNumber(params.codEquipamento);
    if (codEquipamento == null) {
      const err = new Error("Informe um cod_equipamento válido.");
      (err as Error & { status?: number }).status = 400;
      throw err;
    }
  }

  const collected = await coletarLinhas({ caminhao, dataInicio, dataFim, limit: ORDS_MAX_UPDATES }, true);
  const rows = collected.dados as unknown as EntradaCanaCaminhaoRow[];
  if (!rows.length) {
    return {
      filtros: { caminhao, dataInicio, dataFim, codEquipamento, limpar },
      resumo: { encontrados: 0, atualizados: 0, falhas: 0, truncado: collected.hasMore },
      erros: [] as { caminhao?: number | null; pesagem?: number | null; erro: string }[],
      dados: [],
    };
  }

  let atualizados = 0;
  const erros: { caminhao?: number | null; pesagem?: number | null; erro: string }[] = [];
  const atualizadosRows: Record<string, unknown>[] = [];

  for (const row of rows) {
    if (!row.selfHref) {
      erros.push({ caminhao: row.caminhao, pesagem: row.pesagem, erro: "Registro sem link self na ORDS" });
      continue;
    }
    try {
      await putOrdsItem(row.selfHref, toOrdsPutBody(row, codEquipamento));
      atualizados += 1;
      atualizadosRows.push({ pesagem: row.pesagem, guia: row.guia, caminhao: row.caminhao, data: row.data, codEquipamento });
    } catch (err) {
      erros.push({ caminhao: row.caminhao, pesagem: row.pesagem, erro: err instanceof Error ? err.message : String(err) });
    }
  }

  return {
    filtros: { caminhao, dataInicio, dataFim, codEquipamento, limpar },
    resumo: { encontrados: rows.length, atualizados, falhas: erros.length, truncado: collected.hasMore },
    erros,
    dados: atualizadosRows,
  };
}
