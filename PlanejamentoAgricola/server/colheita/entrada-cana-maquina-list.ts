import { ORDS_MAX_ROWS, ORDS_MAX_UPDATES,
  acumularVinculoEquipPeriodo,
  diaUtcFromIso,
  invalidateOrdsPageCache,
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
import { oracleNumber, withOracle } from "../oracle.js";
import { vinculosOraclePorTag } from "./equipamento-tag-oracle.js";
import { db } from "../db.js";
import { carregarEntradaCanaComFallback, entradaCanaDateQuery } from "./entrada-cana-source.js";

const DEFAULT_ORDS_URL =
  "https://g58645a2c384a96-bd1.adb.sa-saopaulo-1.oraclecloudapps.com/ords/admin/entradacanamaquina/";
const TIPO_COLHEDEIRA = 81;

type EntradaCanaMaquinaFiltros = {
  busca?: string | null;
  dataInicio?: string | null;
  dataFim?: string | null;
  maquina?: string | null;
  limit?: number | null;
  /** Mantém somente equipamentos classificados como colhedeira na data do lançamento. */
  somenteColhedeiras?: boolean;
};

function baseUrl() {
  const fromEnv =
    process.env.ORDS_ENTRADA_CANA_MAQUINA_URL?.trim() ||
    process.env.ENTRADA_CANA_MAQUINA_ORDS_URL?.trim();
  return (fromEnv || DEFAULT_ORDS_URL).replace(/\/?$/, "/");
}

export interface EntradaCanaMaquinaRow {
  maquina: number | null;
  fazenda: string | null;
  talhao: number | null;
  dataColheita: string | null;
  tipoColheita: string | null;
  tipoCana: string | null;
  peso: number | null;
  impMineral: number | null;
  safra: string | null;
  codEquipamento: number | null;
  selfHref?: string | null;
}

function mapItem(item: Record<string, unknown>, includeHref = false): EntradaCanaMaquinaRow | null {
  if (!item || typeof item !== "object") return null;
  const row: EntradaCanaMaquinaRow = {
    maquina: toNumber(item.maquina),
    fazenda: item.fazenda != null ? String(item.fazenda).trim() : null,
    talhao: toNumber(item.talhao),
    dataColheita: item.datacolheita != null ? String(item.datacolheita) : null,
    tipoColheita: item.tipocolheita != null ? String(item.tipocolheita).trim() : null,
    tipoCana: item.tipocana != null ? String(item.tipocana).trim() : null,
    peso: toNumber(item.peso),
    impMineral: toNumber(item.impmineral),
    safra: item.safra != null ? String(item.safra).trim() : null,
    codEquipamento: toNumber(item.cod_equipamento),
  };
  if (includeHref) row.selfHref = selfHrefFromItem(item as { links?: { rel?: string; href?: string }[] });
  return row;
}

function toOrdsPutBody(row: EntradaCanaMaquinaRow, codEquipamento: number | null) {
  return {
    maquina: row.maquina,
    fazenda: row.fazenda,
    talhao: row.talhao,
    datacolheita: row.dataColheita,
    tipocolheita: row.tipoColheita,
    tipocana: row.tipoCana,
    peso: row.peso,
    impmineral: row.impMineral,
    safra: row.safra,
    cod_equipamento: codEquipamento,
  };
}

function matchBusca(row: EntradaCanaMaquinaRow, busca: string | null) {
  if (!busca) return true;
  const q = busca.toLowerCase();
  const blob = [row.maquina, row.fazenda, row.talhao, row.tipoColheita, row.tipoCana, row.safra, row.codEquipamento]
    .filter((v) => v != null && v !== "")
    .join(" ")
    .toLowerCase();
  return blob.includes(q);
}

function matchPeriodo(row: EntradaCanaMaquinaRow, dataInicio: string | null, dataFim: string | null) {
  return matchPeriodoDia(diaUtcFromIso(row.dataColheita), dataInicio, dataFim);
}

async function coletarLinhas(
  filtros: EntradaCanaMaquinaFiltros,
  includeHref = false,
) {
  const busca = filtros.busca?.trim() || null;
  const { dataInicio, dataFim } = parsePeriodoOpcional(filtros);
  const maquina = filtros.maquina?.trim() || null;
  const userLimit = toNumber(filtros.limit);
  const maxRows = userLimit != null && userLimit > 0 ? userLimit : Number.MAX_SAFE_INTEGER;

  const collected = await scanOrdsCollection(baseUrl(), {
    maxRows,
    pageConcurrency: 3,
    query: entradaCanaDateQuery(dataInicio, dataFim),
    match: (item) => {
      const row = mapItem(item);
      if (!row) return false;
      if (maquina && String(row.maquina) !== String(maquina)) return false;
      if (!matchPeriodo(row, dataInicio, dataFim)) return false;
      if (!matchBusca(row, busca)) return false;
      return true;
    },
    map: (item) => mapItem(item, includeHref) as Record<string, unknown>,
  });

  return { ...collected, filtros: { busca, dataInicio, dataFim, maquina, limit: collected.maxRows } };
}

function chaveLocal(row: EntradaCanaMaquinaRow) {
  return `${row.maquina ?? ""}|${diaUtcFromIso(row.dataColheita) ?? ""}|${row.fazenda ?? ""}|${row.talhao ?? ""}|${row.tipoColheita ?? ""}|${row.codEquipamento ?? ""}`;
}

function salvarLinhasLocais(rows: EntradaCanaMaquinaRow[]) {
  const save = db.prepare(`INSERT INTO entrada_cana_maquina_local
    (chave, data_iso, maquina, cod_equipamento, dados_json, atualizado_em)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(chave) DO UPDATE SET data_iso = excluded.data_iso, maquina = excluded.maquina,
      cod_equipamento = excluded.cod_equipamento, dados_json = excluded.dados_json, atualizado_em = excluded.atualizado_em`);
  const updatedAt = new Date().toISOString();
  db.transaction(() => rows.forEach((row) => {
    const key = chaveLocal(row);
    if (!key.replace(/\|/g, "")) return;
    save.run(
      key,
      diaUtcFromIso(row.dataColheita),
      row.maquina == null ? null : String(row.maquina),
      row.codEquipamento == null ? null : String(row.codEquipamento),
      JSON.stringify(row),
      updatedAt,
    );
  }))();
}

function coletarLinhasLocais(filtros: EntradaCanaMaquinaFiltros) {
  const busca = filtros.busca?.trim() || null;
  const { dataInicio, dataFim } = parsePeriodoOpcional(filtros);
  const maquina = filtros.maquina?.trim() || null;
  const userLimit = toNumber(filtros.limit);
  const maxRows = userLimit != null && userLimit > 0 ? userLimit : Number.MAX_SAFE_INTEGER;
  const rows = (db.prepare("SELECT dados_json FROM entrada_cana_maquina_local ORDER BY data_iso DESC, chave DESC").all() as { dados_json: string }[])
    .map((item) => {
      try { return JSON.parse(item.dados_json) as EntradaCanaMaquinaRow; } catch { return null; }
    })
    .filter((row): row is EntradaCanaMaquinaRow => Boolean(row))
    .filter((row) =>
      (!maquina || String(row.maquina) === maquina) &&
      matchPeriodo(row, dataInicio, dataFim) &&
      matchBusca(row, busca),
    );
  const dados = rows.slice(0, maxRows);
  return {
    dados,
    pages: 0,
    hasMore: rows.length > dados.length,
    maxRows,
    filtros: { busca, dataInicio, dataFim, maquina, limit: maxRows },
  };
}

/** Busca todo o histórico da ORDS e o armazena no SQLite local. */
export async function sincronizarEntradaCanaMaquinaLocal() {
  const collected = await coletarLinhas({}, false);
  const rows = collected.dados as unknown as EntradaCanaMaquinaRow[];
  salvarLinhasLocais(rows);
  return { importados: rows.length, paginasOrds: collected.pages, truncado: collected.hasMore };
}

function normalizarTagMaquina(value: string | number | null | undefined) {
  if (value == null) return null;
  const text = String(value).trim().toUpperCase();
  if (!text) return null;
  return /^\d+$/.test(text) ? String(Number(text)) : text;
}

async function referenciasColhedeiraPorData() {
  return withOracle(async (conn) => {
    const [tipos, tags] = await Promise.all([
      conn.execute(
        `SELECT cod_equipamento,
              TO_CHAR(TRUNC(data_inicio), 'YYYY-MM-DD') AS data_inicio,
              TO_CHAR(TRUNC(data_fim), 'YYYY-MM-DD') AS data_fim
         FROM automotivo.historico_tipoequipamento
        WHERE cod_tipoequipamento = :codTipo`,
        { codTipo: TIPO_COLHEDEIRA },
      ),
      conn.execute(
        `SELECT tag,
                cod_equipamento,
                TO_CHAR(TRUNC(data_inicial), 'YYYY-MM-DD') AS data_inicio,
                TO_CHAR(TRUNC(data_final), 'YYYY-MM-DD') AS data_fim
           FROM automotivo.equipamento_tag
          WHERE cod_grupoempresa = :codGrupo
            AND tag IS NOT NULL`,
        { codGrupo: Number(process.env.COD_GRUPOEMPRESA || 1) },
      ),
    ]);
    const periodos = (tipos.rows ?? []).flatMap((row) => {
      const item = row as Record<string, unknown>;
      const codEquipamento = oracleNumber(item, "COD_EQUIPAMENTO", "cod_equipamento");
      if (codEquipamento == null) return [];
      return [{
        codEquipamento,
        dataInicio: String(item.DATA_INICIO ?? item.data_inicio ?? ""),
        dataFim: item.DATA_FIM ?? item.data_fim ? String(item.DATA_FIM ?? item.data_fim) : null,
      }];
    });
    const tagsPorEquipamento = new Map<number, { tag: string; dataInicio: string; dataFim: string | null }[]>();
    for (const row of (tags.rows ?? []) as Record<string, unknown>[]) {
      const codEquipamento = oracleNumber(row, "COD_EQUIPAMENTO", "cod_equipamento");
      const tag = normalizarTagMaquina(String(row.TAG ?? row.tag ?? ""));
      if (codEquipamento == null || !tag) continue;
      const dataInicio = String(row.DATA_INICIO ?? row.data_inicio ?? "");
      if (!dataInicio) continue;
      const dataFim = row.DATA_FIM ?? row.data_fim ? String(row.DATA_FIM ?? row.data_fim) : null;
      const valores = tagsPorEquipamento.get(codEquipamento) ?? [];
      valores.push({ tag, dataInicio, dataFim });
      tagsPorEquipamento.set(codEquipamento, valores);
    }
    return { periodos, tagsPorEquipamento };
  });
}

function ehColhedeiraNaData(
  row: EntradaCanaMaquinaRow,
  referencias: Awaited<ReturnType<typeof referenciasColhedeiraPorData>>,
) {
  const data = diaUtcFromIso(row.dataColheita);
  const tagMaquina = normalizarTagMaquina(row.maquina);
  return referencias.periodos.some((periodo) => {
    if (data && (data < periodo.dataInicio || (periodo.dataFim && data > periodo.dataFim))) return false;
    if (row.codEquipamento === periodo.codEquipamento) return true;
    if (!tagMaquina) return false;
    return (referencias.tagsPorEquipamento.get(periodo.codEquipamento) ?? []).some((tag) =>
      tag.tag === tagMaquina &&
      (!data || (data >= tag.dataInicio && (!tag.dataFim || data <= tag.dataFim))),
    );
  });
}

export async function listarEntradaCanaMaquinaList(filtros: EntradaCanaMaquinaFiltros = {}) {
  const source = await carregarEntradaCanaComFallback(
    () => coletarLinhas(filtros, false),
    () => coletarLinhasLocais(filtros),
    (payload) => salvarLinhasLocais(payload.dados as unknown as EntradaCanaMaquinaRow[]),
  );
  const collected = source.payload;
  let dados = collected.dados as unknown as EntradaCanaMaquinaRow[];
  const somenteColhedeiras = filtros.somenteColhedeiras === true;
  if (somenteColhedeiras) {
    const referenciasColhedeira = await referenciasColhedeiraPorData();
    dados = dados.filter((row) => ehColhedeiraNaData(row, referenciasColhedeira));
  }
  const pesoTotal = dados.reduce((acc, r) => acc + (r.peso ?? 0), 0);
  return {
    fonte: source.fonte,
    aviso: source.aviso,
    filtros: { ...collected.filtros, somenteColhedeiras },
    resumo: { totalLinhas: dados.length, paginasOrds: collected.pages, pesoTotal, truncado: collected.hasMore },
    dados,
  };
}

export async function listarMaquinasDistinct(filtros: Parameters<typeof coletarLinhas>[0] = {}) {
  const payload = await listarEntradaCanaMaquinaList({ ...filtros, busca: null, maquina: null });
  const mapa = new Map<
    string,
    {
      maquina: number | null;
      qtdEntradas: number;
      ultimaData: string | null;
      codEquipamento: number | null;
      porEquip: Map<string, VinculoEquipPeriodo>;
    }
  >();
  for (const row of payload.dados) {
    if (row.maquina == null) continue;
    const key = String(row.maquina);
    const prev = mapa.get(key) || {
      maquina: row.maquina,
      qtdEntradas: 0,
      ultimaData: null,
      codEquipamento: null,
      porEquip: new Map<string, VinculoEquipPeriodo>(),
    };
    prev.qtdEntradas += 1;
    if (row.codEquipamento != null) prev.codEquipamento = row.codEquipamento;
    if (row.dataColheita && (!prev.ultimaData || String(row.dataColheita) > String(prev.ultimaData))) {
      prev.ultimaData = row.dataColheita;
    }
    acumularVinculoEquipPeriodo(prev.porEquip, row.codEquipamento, diaUtcFromIso(row.dataColheita));
    mapa.set(key, prev);
  }
  const vinculosOracle = await vinculosOraclePorTag([...mapa.values()].map((item) => item.maquina));
  const dados = [...mapa.values()]
    .map((item) => ({
      maquina: item.maquina,
      qtdEntradas: item.qtdEntradas,
      ultimaData: item.ultimaData,
      codEquipamento: item.codEquipamento,
      associacoes: listarVinculosEquipPeriodo(item.porEquip),
      associacoesOracle: vinculosOracle.get(normalizarTagMaquina(item.maquina) ?? "") ?? [],
    }))
    .sort((a, b) => {
      const na = Number(a.maquina);
      const nb = Number(b.maquina);
      if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
      return String(a.maquina).localeCompare(String(b.maquina));
    });
  return {
    filtros: payload.filtros,
    resumo: { totalMaquinas: dados.length, totalLinhasBase: payload.resumo.totalLinhas, truncado: payload.resumo.truncado },
    dados,
  };
}

export async function atualizarCodEquipamentoMaquina(params: {
  maquina?: string | number | null;
  dataInicio?: string | null;
  dataFim?: string | null;
  codEquipamento?: number | string | null;
  limpar?: boolean;
}) {
  const maquina = params.maquina != null && String(params.maquina).trim() !== "" ? String(params.maquina).trim() : null;
  if (!maquina) {
    const err = new Error("Informe o número da máquina.");
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

  const collected = await coletarLinhas({ maquina, dataInicio, dataFim, limit: ORDS_MAX_UPDATES }, true);
  const rows = collected.dados as unknown as EntradaCanaMaquinaRow[];
  if (!rows.length) {
    return {
      filtros: { maquina, dataInicio, dataFim, codEquipamento, limpar },
      resumo: { encontrados: 0, atualizados: 0, falhas: 0, truncado: collected.hasMore },
      erros: [] as { maquina?: number | null; dataColheita?: string | null; erro: string }[],
      dados: [],
    };
  }

  let atualizados = 0;
  const erros: { maquina?: number | null; dataColheita?: string | null; erro: string }[] = [];
  const atualizadosRows: Record<string, unknown>[] = [];

  for (const row of rows) {
    if (!row.selfHref) {
      erros.push({ maquina: row.maquina, dataColheita: row.dataColheita, erro: "Registro sem link self na ORDS" });
      continue;
    }
    try {
      await putOrdsItem(row.selfHref, toOrdsPutBody(row, codEquipamento));
      atualizados += 1;
      atualizadosRows.push({
        maquina: row.maquina,
        fazenda: row.fazenda,
        talhao: row.talhao,
        dataColheita: row.dataColheita,
        codEquipamento,
      });
    } catch (err) {
      erros.push({ maquina: row.maquina, dataColheita: row.dataColheita, erro: err instanceof Error ? err.message : String(err) });
    }
  }

  if (atualizados > 0) invalidateOrdsPageCache(baseUrl());

  return {
    filtros: { maquina, dataInicio, dataFim, codEquipamento, limpar },
    resumo: { encontrados: rows.length, atualizados, falhas: erros.length, truncado: collected.hasMore },
    erros,
    dados: atualizadosRows,
  };
}
