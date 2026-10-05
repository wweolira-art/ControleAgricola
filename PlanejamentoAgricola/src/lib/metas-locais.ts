import type { CttIndicadorId } from "./indicador-ctt.js";

const STORAGE_META_DISP = "meta-disponibilidade-pct";
const STORAGE_META_DISP_TIPO = "meta-disponibilidade-por-tipo";
const STORAGE_META_MTTR = "meta-mttr-horas";
const STORAGE_META_MTBF = "meta-mtbf-horas";
const STORAGE_META_MTTR_TIPO = "meta-mttr-por-tipo";
const STORAGE_META_MTBF_TIPO = "meta-mtbf-por-tipo";
const STORAGE_METAS_CTT = "indicador-ctt-metas";

export type CttQuadro = "colhedora" | "trator" | "caminhao";
export type CttMetasSalvas = Partial<Record<CttQuadro, Partial<Record<CttIndicadorId, number>>>>;

function asNumber(value: unknown, fallback: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.round(n * 1000) / 1000;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function readMetaDisponibilidade(fallback = 85) {
  const direto = localStorage.getItem(STORAGE_META_DISP);
  if (direto != null && direto.trim() !== "") return asNumber(direto, fallback);
  const ctt = readMetasCtt().colhedora?.disponibilidade;
  return ctt != null ? asNumber(ctt, fallback) : fallback;
}

export function writeMetaDisponibilidade(valor: number) {
  const n = asNumber(valor, 85);
  localStorage.setItem(STORAGE_META_DISP, String(n));
  const atuais = readMetasCtt();
  writeMetasCtt({
    ...atuais,
    colhedora: { ...atuais.colhedora, disponibilidade: n },
    trator: { ...atuais.trator, disponibilidade: n },
    caminhao: { ...atuais.caminhao, disponibilidade: n },
  });
}

export function readMetasDisponibilidadePorTipo() {
  const raw = readJson<Record<string, unknown>>(STORAGE_META_DISP_TIPO, {});
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw)) {
    const n = Number(value);
    if (Number.isFinite(n)) out[key] = asNumber(n, n);
  }
  return out;
}

export function readMetaDisponibilidadeTipo(codTipo: number | null, fallback = 85) {
  if (codTipo == null) return readMetaDisponibilidade(fallback);
  const porTipo = readMetasDisponibilidadePorTipo()[String(codTipo)];
  return porTipo != null ? porTipo : readMetaDisponibilidade(fallback);
}

function readMetaHoras(key: string, tipoKey: string, codTipo: number | null, fallback: number) {
  if (codTipo != null) {
    const map = readJson<Record<string, unknown>>(tipoKey, {});
    const n = Number(map[String(codTipo)]);
    if (Number.isFinite(n)) return asNumber(n, fallback);
  }
  const direto = localStorage.getItem(key);
  if (direto != null && direto.trim() !== "") return asNumber(direto, fallback);
  return fallback;
}

function writeMetaHoras(key: string, tipoKey: string, codTipo: number | null, valor: number, fallback: number) {
  const n = asNumber(valor, fallback);
  if (codTipo == null) {
    localStorage.setItem(key, String(n));
    return;
  }
  const atuais = readJson<Record<string, number>>(tipoKey, {});
  localStorage.setItem(tipoKey, JSON.stringify({ ...atuais, [String(codTipo)]: n }));
}

export function readMetaMttr(codTipo: number | null = null, fallback = 15) {
  return readMetaHoras(STORAGE_META_MTTR, STORAGE_META_MTTR_TIPO, codTipo, fallback);
}

export function writeMetaMttr(codTipo: number | null, valor: number) {
  writeMetaHoras(STORAGE_META_MTTR, STORAGE_META_MTTR_TIPO, codTipo, valor, 15);
}

export function readMetaMtbf(codTipo: number | null = null, fallback = 15) {
  return readMetaHoras(STORAGE_META_MTBF, STORAGE_META_MTBF_TIPO, codTipo, fallback);
}

export function writeMetaMtbf(codTipo: number | null, valor: number) {
  writeMetaHoras(STORAGE_META_MTBF, STORAGE_META_MTBF_TIPO, codTipo, valor, 15);
}

export function writeMetaDisponibilidadeTipo(codTipo: number | null, valor: number) {
  const n = asNumber(valor, 85);
  if (codTipo == null) {
    writeMetaDisponibilidade(n);
    return;
  }
  const next = { ...readMetasDisponibilidadePorTipo(), [String(codTipo)]: n };
  localStorage.setItem(STORAGE_META_DISP_TIPO, JSON.stringify(next));
}

export function readMetasCtt(): CttMetasSalvas {
  const raw = readJson<CttMetasSalvas>(STORAGE_METAS_CTT, {});
  return raw && typeof raw === "object" ? raw : {};
}

export function writeMetasCtt(value: CttMetasSalvas) {
  localStorage.setItem(STORAGE_METAS_CTT, JSON.stringify(value));
}

export function readMetaCtt(quadro: CttQuadro, id: CttIndicadorId, fallback: number) {
  const n = readMetasCtt()[quadro]?.[id];
  return n != null && Number.isFinite(n) ? asNumber(n, fallback) : fallback;
}

export function writeMetaCtt(quadro: CttQuadro, id: CttIndicadorId, valor: number) {
  const n = asNumber(valor, valor);
  const atuais = readMetasCtt();
  writeMetasCtt({
    ...atuais,
    [quadro]: { ...atuais[quadro], [id]: n },
  });
  if (id === "disponibilidade") writeMetaDisponibilidade(n);
}
