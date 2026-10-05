export type CttIndicadorId =
  | "hrsElevador"
  | "hrsMotor"
  | "disponibilidade"
  | "tonDia"
  | "tonHrMotor"
  | "tonHrElevador"
  | "dieselHr"
  | "dieselTon"
  | "perdasHa"
  | "impurezaMineral"
  | "oleoTon"
  | "dieselKm"
  | "eficienciaKm";

export type CttIndicadorDef = {
  id: CttIndicadorId;
  label: string;
  meta: number;
  unidade: "num" | "pct";
  sentido: "maior" | "menor";
  agregacao: "soma" | "taxa";
  /** Meta da planilha é diária e acompanha a quantidade de dias do filtro. */
  escalaComDias?: boolean;
  casas?: number;
};

/** Metas diárias do quadro INDICADOR - CTT. A meta é única, no fechamento da frente. */
export const INDICADORES_CTT: CttIndicadorDef[] = [
  { id: "hrsElevador", label: "Horas elevador", meta: 10.2, unidade: "num", sentido: "maior", agregacao: "soma", escalaComDias: true },
  { id: "hrsMotor", label: "Horas do motor", meta: 17, unidade: "num", sentido: "maior", agregacao: "soma", escalaComDias: true },
  {
    id: "disponibilidade",
    label: "% de Disponibilidade de Colhedora",
    meta: 85,
    unidade: "pct",
    sentido: "maior",
    agregacao: "taxa",
  },
  {
    id: "tonDia",
    label: "Produção tonelada",
    meta: 564,
    unidade: "num",
    sentido: "maior",
    agregacao: "soma",
    escalaComDias: true,
  },
  {
    id: "tonHrMotor",
    label: "Produção tonelada por colhedora hora de motor",
    meta: 34,
    unidade: "num",
    sentido: "maior",
    agregacao: "taxa",
  },
  {
    id: "tonHrElevador",
    label: "Produção tonelada por colhedora hora de elevador",
    meta: 56,
    unidade: "num",
    sentido: "maior",
    agregacao: "taxa",
  },
  {
    id: "dieselHr",
    label: "Consumo de diesel por hora de motor (colhedora)",
    meta: 35,
    unidade: "num",
    sentido: "menor",
    agregacao: "taxa",
  },
  {
    id: "dieselTon",
    label: "Consumo de diesel por tonelada (colhedora)",
    meta: 1.1,
    unidade: "num",
    sentido: "menor",
    agregacao: "taxa",
  },
  {
    id: "perdasHa",
    label: "Total de Perdas por hectares",
    meta: 3,
    unidade: "num",
    sentido: "menor",
    agregacao: "taxa",
  },
  {
    id: "impurezaMineral",
    label: "% de Impureza Mineral",
    meta: 7,
    unidade: "pct",
    sentido: "menor",
    agregacao: "taxa",
  },
];

/** Metas diárias dos tratores. A meta aparece só na coluna final. */
export const INDICADORES_CTT_TRATOR: CttIndicadorDef[] = [
  {
    id: "disponibilidade",
    label: "% de Disponibilidade de Trator Transbordo",
    meta: 85,
    unidade: "pct",
    sentido: "maior",
    agregacao: "taxa",
  },
  { id: "hrsMotor", label: "Horas do motor", meta: 17, unidade: "num", sentido: "maior", agregacao: "soma", escalaComDias: true },
  {
    id: "tonDia",
    label: "Produção tonelada por trator dia",
    meta: 323.3,
    unidade: "num",
    sentido: "maior",
    agregacao: "soma",
    escalaComDias: true,
  },
  {
    id: "dieselHr",
    label: "Consumo de diesel por hora (trator)",
    meta: 8,
    unidade: "num",
    sentido: "menor",
    agregacao: "taxa",
  },
  {
    id: "dieselTon",
    label: "Consumo de diesel por tonelada (trator)",
    meta: 0.6,
    unidade: "num",
    sentido: "menor",
    agregacao: "taxa",
  },
  {
    id: "oleoTon",
    label: "Consumo de óleo hidráulico por tonelada (trator)",
    meta: 0.008,
    unidade: "num",
    sentido: "menor",
    agregacao: "taxa",
    casas: 3,
  },
];

/** Metas diárias dos caminhões. A meta aparece só na coluna final. */
export const INDICADORES_CTT_CAMINHAO: CttIndicadorDef[] = [
  {
    id: "disponibilidade",
    label: "% de Disponibilidade de Caminhão",
    meta: 85,
    unidade: "pct",
    sentido: "maior",
    agregacao: "taxa",
  },
  {
    id: "tonDia",
    label: "Produção tonelada por caminhão dia",
    meta: 225.6,
    unidade: "num",
    sentido: "maior",
    agregacao: "soma",
    escalaComDias: true,
    casas: 1,
  },
  {
    id: "dieselKm",
    label: "Consumo de diesel por quilômetros (caminhão)",
    meta: 0.769,
    unidade: "num",
    sentido: "menor",
    agregacao: "taxa",
    casas: 3,
  },
  {
    id: "eficienciaKm",
    label: "Eficiência de consumo de diesel por quilômetro rodado",
    meta: 1.3,
    unidade: "num",
    sentido: "maior",
    agregacao: "taxa",
    casas: 1,
  },
];

export type CttMaquina = {
  equipTag: string;
  frenteKey: string;
  frenteLabel: string;
  valores: Partial<Record<CttIndicadorId, number | null>>;
  pesoTon: number;
  horasMotor: number;
  horasElevador: number;
  litros: number;
  /** Litros e horas do horímetro no abastecimento (Km/Hs rodados). Base da média L/h. */
  litrosAbastecimento?: number;
  horasAbastecimento?: number;
  kmRodados: number;
  litrosOleo: number;
  oleoInformado: boolean;
  horasPotenciais: number;
  horasOficina: number;
};

export type CttResumo = {
  total: number | null;
  media: number | null;
  pctMeta: number | null;
};

function round(n: number, digits: number) {
  const p = 10 ** digits;
  return Math.round((n + Number.EPSILON) * p) / p;
}

function mean(nums: number[]) {
  if (!nums.length) return null;
  return nums.reduce((acc, value) => acc + value, 0) / nums.length;
}

export function metaNoPeriodo(def: CttIndicadorDef, dias: number) {
  const diasSeguros = Math.max(1, Math.round(dias) || 1);
  if (!def.escalaComDias) return def.meta;
  return round(def.meta * diasSeguros, 2);
}

function pctDaMeta(media: number | null, meta: number) {
  if (media == null || !(meta > 0)) return null;
  return round((media / meta) * 100, 1);
}

function totalTaxa(id: CttIndicadorId, maquinas: CttMaquina[]) {
  const sum = (pick: (row: CttMaquina) => number) => maquinas.reduce((acc, row) => acc + pick(row), 0);
  if (id === "disponibilidade") {
    const potenciais = sum((row) => row.horasPotenciais);
    if (!(potenciais > 0)) return null;
    const oficina = sum((row) => row.horasOficina);
    return round((Math.max(potenciais - oficina, 0) / potenciais) * 100, 2);
  }
  if (id === "tonHrMotor") {
    const horas = sum((row) => row.horasMotor);
    return horas > 0 ? round(sum((row) => row.pesoTon) / horas, 2) : null;
  }
  if (id === "tonHrElevador") {
    const horas = sum((row) => row.horasElevador);
    return horas > 0 ? round(sum((row) => row.pesoTon) / horas, 2) : null;
  }
  if (id === "dieselHr") {
    const horasAbastecimento = sum((row) => row.horasAbastecimento ?? 0);
    if (horasAbastecimento > 0) {
      return round(sum((row) => row.litrosAbastecimento ?? 0) / horasAbastecimento, 2);
    }
    const horas = sum((row) => row.horasMotor);
    return horas > 0 ? round(sum((row) => row.litros) / horas, 2) : null;
  }
  if (id === "dieselTon") {
    const peso = sum((row) => row.pesoTon);
    return peso > 0 ? round(sum((row) => row.litros) / peso, 2) : null;
  }
  if (id === "dieselKm") {
    const km = sum((row) => row.kmRodados);
    return km > 0 ? round(sum((row) => row.litros) / km, 3) : null;
  }
  if (id === "eficienciaKm") {
    const litros = sum((row) => row.litros);
    return litros > 0 ? round(sum((row) => row.kmRodados) / litros, 2) : null;
  }
  if (id === "oleoTon") {
    if (!maquinas.some((row) => row.oleoInformado)) return null;
    const peso = sum((row) => row.pesoTon);
    return peso > 0 ? round(sum((row) => row.litrosOleo) / peso, 3) : null;
  }
  return null;
}

export function resumirIndicadorCtt(def: CttIndicadorDef, maquinas: CttMaquina[], dias = 1): CttResumo {
  if (!maquinas.length) return { total: null, media: null, pctMeta: null };
  const meta = metaNoPeriodo(def, dias);

  if (def.agregacao === "soma") {
    const total = round(
      maquinas.reduce((acc, row) => acc + (row.valores[def.id] ?? 0), 0),
      2,
    );
    const media = round(total / maquinas.length, 2);
    return { total, media, pctMeta: pctDaMeta(media, meta) };
  }

  const valores = maquinas
    .map((row) => row.valores[def.id])
    .filter((value): value is number => value != null && Number.isFinite(value));
  const mediaBruta = mean(valores);
  const media = mediaBruta == null ? null : round(mediaBruta, 2);
  const totalDireto = totalTaxa(def.id, maquinas);
  return {
    total: totalDireto ?? media,
    media,
    pctMeta: pctDaMeta(media, meta),
  };
}

export function tomContraMeta(
  sentido: CttIndicadorDef["sentido"],
  valor: number | null | undefined,
  meta: number,
) {
  if (valor == null || !Number.isFinite(valor) || !(meta > 0)) return "";
  const atingiu = sentido === "menor" ? valor <= meta : valor >= meta;
  return atingiu ? "ok" : "bad";
}
