import { ORDS_MAX_ROWS, scanOrdsCollection, toNumber } from "./ords-common.js";

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
  };
}

export async function listarPrecoRaio(filtros: { limit?: number | string | null } = {}) {
  const userLimit = toNumber(filtros.limit);
  const maxRows = userLimit != null && userLimit > 0 ? Math.min(userLimit, ORDS_MAX_ROWS) : undefined;
  const collected = await scanOrdsCollection(baseUrl(), {
    maxRows,
    match: (item) => Boolean(mapItem(item)),
    map: (item) => mapItem(item) as Record<string, unknown>,
  });
  const dados = (collected.dados as unknown as PrecoRaioRow[])
    .filter((row) => row.raio != null && row.producao != null)
    .sort((a, b) => (a.raio ?? 0) - (b.raio ?? 0));

  return {
    filtros: { limit: collected.maxRows },
    resumo: {
      totalLinhas: dados.length,
      paginasOrds: collected.pages,
      truncado: collected.hasMore,
    },
    dados,
  };
}
