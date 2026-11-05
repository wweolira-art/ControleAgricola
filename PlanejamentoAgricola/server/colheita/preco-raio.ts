import {
  ORDS_MAX_ROWS,
  invalidateOrdsPageCache,
  postOrdsItem,
  putOrdsItem,
  scanOrdsCollection,
  selfHrefFromItem,
  toNumber,
} from "./ords-common.js";

const DEFAULT_ORDS_URL =
  "https://g58645a2c384a96-bd1.adb.sa-saopaulo-1.oraclecloudapps.com/ords/admin/precoraio/";

function baseUrl() {
  const fromEnv = process.env.ORDS_PRECO_RAIO_URL?.trim() || process.env.PRECO_RAIO_ORDS_URL?.trim();
  return (fromEnv || DEFAULT_ORDS_URL).replace(/\/?$/, "/");
}

export interface PrecoRaioRow {
  raio: number | null;
  preco: number | null;
  producao: number | null;
  dataInicio: string | null;
  dataFinal: string | null;
  selfHref?: string | null;
}

function numberValue(value: unknown) {
  if (typeof value === "string") return toNumber(value.replace(/\./g, "").replace(",", "."));
  return toNumber(value);
}

function mapItem(item: Record<string, unknown>): PrecoRaioRow | null {
  if (!item || typeof item !== "object") return null;
  const preco = numberValue(item.preco ?? item.PRECO ?? item.producao ?? item.PRODUCAO ?? item.valor ?? item.VALOR);
  return {
    raio: numberValue(item.raio ?? item.RAIO),
    preco,
    producao: preco,
    dataInicio: item.datainicio != null ? String(item.datainicio).trim() : item.DATAINICIO != null ? String(item.DATAINICIO).trim() : null,
    dataFinal: item.datafinal != null ? String(item.datafinal).trim() : item.DATAFINAL != null ? String(item.DATAFINAL).trim() : null,
    selfHref: selfHrefFromItem(item as { links?: { rel?: string; href?: string }[] }),
  };
}

function dataValida(value: string | null | undefined) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function ativoNaData(row: PrecoRaioRow, referencia: string | null) {
  if (!referencia) return true;
  if (dataValida(row.dataInicio) && row.dataInicio! > referencia) return false;
  if (dataValida(row.dataFinal) && row.dataFinal! < referencia) return false;
  return true;
}

export async function listarPrecoRaio(filtros: {
  limit?: number | string | null;
  dataInicio?: string | null;
  dataFim?: string | null;
  todos?: boolean;
} = {}) {
  const userLimit = toNumber(filtros.limit);
  const maxRows = userLimit != null && userLimit > 0 ? Math.min(userLimit, ORDS_MAX_ROWS) : undefined;
  const collected = await scanOrdsCollection(baseUrl(), {
    maxRows,
    match: (item) => Boolean(mapItem(item)),
    map: (item) => mapItem(item) as Record<string, unknown>,
  });
  const todos = (collected.dados as unknown as PrecoRaioRow[])
    .filter((row) => row.raio != null && row.producao != null)
    .sort((a, b) => (a.raio ?? 0) - (b.raio ?? 0) || String(b.dataInicio ?? "").localeCompare(String(a.dataInicio ?? "")));
  const referencia = dataValida(filtros.dataFim) ? filtros.dataFim! : dataValida(filtros.dataInicio) ? filtros.dataInicio! : null;
  const ativos = todos.filter((row) => ativoNaData(row, referencia));
  const dados = filtros.todos
    ? todos
    : [...new Map(ativos.map((row) => [row.raio, row])).values()].sort((a, b) => (a.raio ?? 0) - (b.raio ?? 0));

  return {
    filtros: { limit: collected.maxRows, dataInicio: filtros.dataInicio ?? null, dataFim: filtros.dataFim ?? null, referencia },
    resumo: {
      totalLinhas: dados.length,
      paginasOrds: collected.pages,
      truncado: collected.hasMore,
    },
    dados,
  };
}

export async function salvarPrecoRaio(params: {
  raio?: number | string | null;
  preco?: number | string | null;
  dataInicio?: string | null;
  dataFinal?: string | null;
  selfHref?: string | null;
}) {
  const raio = toNumber(params.raio == null ? null : String(params.raio).replace(",", "."));
  const preco = toNumber(params.preco == null ? null : String(params.preco).replace(",", "."));
  const dataInicio = String(params.dataInicio ?? "").trim();
  const dataFinal = String(params.dataFinal ?? "").trim() || null;
  if (raio == null || raio < 0) throw Object.assign(new Error("Informe um raio válido."), { status: 400 });
  if (preco == null || preco < 0) throw Object.assign(new Error("Informe um preço válido."), { status: 400 });
  if (!dataValida(dataInicio)) throw Object.assign(new Error("Informe a data inicial no formato AAAA-MM-DD."), { status: 400 });
  if (dataFinal && !dataValida(dataFinal)) throw Object.assign(new Error("Informe a data final no formato AAAA-MM-DD."), { status: 400 });
  if (dataFinal && dataFinal < dataInicio) throw Object.assign(new Error("A data final não pode ser anterior à inicial."), { status: 400 });

  const body = { raio, producao: preco, datainicio: dataInicio, datafinal: dataFinal };
  const resultado = params.selfHref?.trim()
    ? await putOrdsItem(params.selfHref, body)
    : await postOrdsItem(baseUrl(), body);
  invalidateOrdsPageCache(baseUrl());
  return { resumo: { acao: params.selfHref?.trim() ? "atualizar" : "criar", raio, preco, dataInicio, dataFinal }, dados: resultado };
}
