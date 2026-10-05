import { diaUtcFromIso, parsePeriodoOpcional, scanOrdsCollection } from "./ords-common.js";
import { matchPeriodoDia } from "./periodo-colheita.js";

const DEFAULT_ORDS_URL =
  "https://g58645a2c384a96-bd1.adb.sa-saopaulo-1.oraclecloudapps.com/ords/admin/tempo_patio/";

function baseUrl() {
  const fromEnv = process.env.ORDS_TEMPO_PATIO_URL?.trim();
  return (fromEnv || DEFAULT_ORDS_URL).replace(/\/?$/, "/");
}

export type TempoPatioRow = {
  data: string | null;
  tempoPatioMinutos: number | null;
};

export function timeToMinutes(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value > 0 && value < 1) return value * 24 * 60;
    if (value <= 24) return value * 60;
    return value;
  }
  const text = String(value).trim();
  const match = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (match) return Number(match[1]) * 60 + Number(match[2]) + Number(match[3] || 0) / 60;
  const numeric = Number(text.replace(",", "."));
  if (!Number.isFinite(numeric)) return null;
  return timeToMinutes(numeric);
}

export function minutosPatioDoItem(item: Record<string, unknown>): number | null {
  const direto = timeToMinutes(item.tempo_patio ?? item.tempoPatio);
  if (direto != null && direto > 0 && direto <= 12 * 60) return direto;
  const chegada = timeToMinutes(item.hora_chegada ?? item.horaChegada);
  const saida = timeToMinutes(item.hora_saida ?? item.horaSaida);
  if (chegada != null && saida != null) {
    let diff = saida - chegada;
    if (diff < 0) diff += 24 * 60;
    if (diff > 0 && diff <= 12 * 60) return diff;
  }
  const descarga = timeToMinutes(item.tempo_descarga ?? item.tempoDescarga);
  if (descarga != null && descarga > 0 && descarga <= 12 * 60) return descarga;
  return null;
}

function mapItem(item: Record<string, unknown>): TempoPatioRow | null {
  if (!item || typeof item !== "object") return null;
  return {
    data: diaUtcFromIso(item.data_movimento ?? item.data ?? item.dataMovimento),
    tempoPatioMinutos: minutosPatioDoItem(item),
  };
}

export async function listarTempoPatio(filtros: { dataInicio?: string | null; dataFim?: string | null } = {}) {
  const { dataInicio, dataFim } = parsePeriodoOpcional(filtros);
  const collected = await scanOrdsCollection(baseUrl(), {
    match: (item) => {
      const row = mapItem(item);
      if (!row?.data) return false;
      return matchPeriodoDia(row.data, dataInicio, dataFim);
    },
    map: (item) => mapItem(item) as Record<string, unknown>,
  });
  return {
    filtros: { dataInicio, dataFim },
    resumo: { totalLinhas: collected.dados.length, truncado: collected.hasMore },
    dados: collected.dados as unknown as TempoPatioRow[],
  };
}
