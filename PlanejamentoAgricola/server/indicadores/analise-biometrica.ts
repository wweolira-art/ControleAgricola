import { db } from "../db.js";
import { oracleNumber, withOracle } from "../oracle.js";

const BASE_URL =
  "https://g58645a2c384a96-bd1.adb.sa-saopaulo-1.oraclecloudapps.com/ords/admin";

type OrdsResponse<T> = {
  items?: T[];
  hasMore?: boolean;
  limit?: number;
  offset?: number;
  links?: Array<{ rel?: string; href?: string }>;
};

type ItemRow = {
  cod_item: number;
  descricao: string;
};

type LancamentoRow = {
  data: string;
  cod_ponto: number | null;
  cod_item: number;
  cod_fazenda: number | string | null;
  cod_talhao: number | string | null;
  variedade?: string | null;
  valor: number | string | null;
};

type AnaliseBiometricaBase = {
  id: string;
  fazenda: string;
  fazendaNome: string | null;
  fazendaLabel: string;
  talhao: string;
  areaHa: number | null;
  data: string;
  dataLabel: string;
  variedade: string | null;
  tamanhoCana: number | null;
  canaPorMetro: number | null;
  tamanhoEntrenos: number | null;
  pesoPorCana: number | null;
  diametro: number | null;
  tch: number | null;
};

export type AnaliseBiometricaRegistro = AnaliseBiometricaBase & {
  pontos: number;
};

export type AnaliseBiometricaPonto = AnaliseBiometricaBase & {
  ponto: string;
  pontoDescricao: string;
};

export type AnaliseBiometricaData = {
  atualizadoEm: string;
  opcoes: {
    fazendas: string[];
    talhoes: string[];
  };
  registros: AnaliseBiometricaRegistro[];
  pontos: AnaliseBiometricaPonto[];
  fazendas: Array<{ codigo: string; nome: string; label: string }>;
  itens: Array<{ codigo: number; descricao: string }>;
};

function parseDateBr(value: string | null | undefined) {
  const text = String(value ?? "").trim();
  const match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  return "";
}

function normalizeDescription(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

function metricKey(description: string) {
  const text = normalizeDescription(description);
  if (text.includes("TAMANHO DA CANA")) return "tamanhoCana";
  if (text.includes("CANA POR METRO")) return "canaPorMetro";
  if (text.includes("ENTRENO")) return "tamanhoEntrenos";
  if (text.includes("PESO POR CANA")) return "pesoPorCana";
  if (text.includes("DIAMETRO")) return "diametro";
  if (text.includes("TCH") || text.includes("PESO(TCH)")) return "tch";
  return null;
}

function avg(values: number[]) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function fazendaFields(fazendaMap: Map<string, string>, fazenda: string) {
  const nome = fazendaMap.get(fazenda) ?? null;
  return {
    fazendaNome: nome,
    fazendaLabel: nome ? `${nome} (${fazenda})` : fazenda,
  };
}

async function carregarAreasTalhao() {
  try {
    return await withOracle(async (conn) => {
      const result = await conn.execute(
        `SELECT t.cod_fazenda,
                t.cod_talhao,
                MAX(NVL(t.areaproducao, t.areaplantada)) AS area_ha
           FROM agricola.talhao t
          WHERE NVL(t.cod_fazenda, -1) <> 0
            AND t.cod_talhao IS NOT NULL
          GROUP BY t.cod_fazenda, t.cod_talhao`,
      );
      const map = new Map<string, number>();
      for (const raw of (result.rows ?? []) as Record<string, unknown>[]) {
        const codFazenda = oracleNumber(raw, "cod_fazenda", "COD_FAZENDA");
        const codTalhao = oracleNumber(raw, "cod_talhao", "COD_TALHAO");
        const area = oracleNumber(raw, "area_ha", "AREA_HA");
        if (codFazenda == null || codTalhao == null || !(area != null && area > 0)) continue;
        map.set(`${codFazenda}:${codTalhao}`, area);
      }
      return map;
    });
  } catch (e) {
    console.warn("[analise-biometrica] Não foi possível consultar área dos talhões.", e);
    return new Map<string, number>();
  }
}

async function fetchAll<T>(path: string): Promise<T[]> {
  const out: T[] = [];
  let url: string | null = `${BASE_URL}/${path}/`;
  while (url) {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`Falha ao consultar ${path} (${res.status}).`);
    const json = (await res.json()) as OrdsResponse<T>;
    out.push(...(json.items ?? []));
    const next = json.links?.find((link) => link.rel === "next")?.href;
    url = json.hasMore && next ? next : null;
  }
  return out;
}

export async function gerarAnaliseBiometrica(): Promise<AnaliseBiometricaData> {
  const fazendaRows = db.prepare("SELECT code, description FROM fazendas").all() as Array<{
    code: string;
    description: string;
  }>;
  const fazendaMap = new Map(fazendaRows.map((row) => [String(row.code).trim(), String(row.description).trim()]));
  const [itens, lancamentos, areasTalhao] = await Promise.all([
    fetchAll<ItemRow>("itens_analisebiometrica"),
    fetchAll<LancamentoRow>("lancamento_analisebiometrica"),
    carregarAreasTalhao(),
  ]);
  const itemMap = new Map(itens.map((item) => [Number(item.cod_item), metricKey(item.descricao)]));

  type Draft = Omit<AnaliseBiometricaBase, "tamanhoCana" | "canaPorMetro" | "tamanhoEntrenos" | "pesoPorCana" | "diametro" | "tch"> & {
    values: Record<string, number[]>;
    pointKeys: Set<string>;
  };
  type PontoDraft = Omit<AnaliseBiometricaBase, "tamanhoCana" | "canaPorMetro" | "tamanhoEntrenos" | "pesoPorCana" | "diametro" | "tch"> & {
    ponto: string;
    pontoDescricao: string;
    values: Record<string, number[]>;
  };

  const drafts = new Map<string, Draft>();
  const pointDrafts = new Map<string, PontoDraft>();
  for (const row of lancamentos) {
    const data = parseDateBr(row.data);
    const fazenda = String(row.cod_fazenda ?? "").trim();
    const talhao = String(row.cod_talhao ?? "").trim();
    const metric = itemMap.get(Number(row.cod_item));
    const valor = Number(row.valor);
    if (!data || !fazenda || !talhao || !metric || !Number.isFinite(valor)) continue;
    const fields = fazendaFields(fazendaMap, fazenda);
    const areaHa = areasTalhao.get(`${fazenda}:${talhao}`) ?? null;
    const key = `${fazenda}|${talhao}|${data}`;
    const draft =
      drafts.get(key) ??
      {
        id: key,
        fazenda,
        ...fields,
        talhao,
        areaHa,
        data,
        dataLabel: row.data,
        variedade: row.variedade?.trim() || null,
        values: {},
        pointKeys: new Set<string>(),
      };
    (draft.values[metric] ??= []).push(valor);
    if (row.cod_ponto != null) draft.pointKeys.add(String(row.cod_ponto));
    if (!draft.variedade && row.variedade?.trim()) draft.variedade = row.variedade.trim();
    drafts.set(key, draft);

    const ponto = row.cod_ponto == null ? "Sem ponto" : String(row.cod_ponto);
    const pointKey = `${fazenda}|${talhao}|${data}|${ponto}`;
    const pointDraft =
      pointDrafts.get(pointKey) ??
      {
        id: pointKey,
        fazenda,
        ...fields,
        talhao,
        areaHa,
        data,
        dataLabel: row.data,
        variedade: row.variedade?.trim() || null,
        ponto,
        pontoDescricao: row.cod_ponto == null ? "Sem ponto" : `${row.cod_ponto}º ponto`,
        values: {},
      };
    (pointDraft.values[metric] ??= []).push(valor);
    if (!pointDraft.variedade && row.variedade?.trim()) pointDraft.variedade = row.variedade.trim();
    pointDrafts.set(pointKey, pointDraft);
  }

  const registros = [...drafts.values()]
    .map((draft) => ({
      id: draft.id,
      fazenda: draft.fazenda,
      fazendaNome: draft.fazendaNome,
      fazendaLabel: draft.fazendaLabel,
      talhao: draft.talhao,
      areaHa: draft.areaHa,
      data: draft.data,
      dataLabel: draft.dataLabel,
      variedade: draft.variedade,
      tamanhoCana: avg(draft.values.tamanhoCana ?? []),
      canaPorMetro: avg(draft.values.canaPorMetro ?? []),
      tamanhoEntrenos: avg(draft.values.tamanhoEntrenos ?? []),
      pesoPorCana: avg(draft.values.pesoPorCana ?? []),
      diametro: avg(draft.values.diametro ?? []),
      tch: avg(draft.values.tch ?? []),
      pontos: draft.pointKeys.size,
    }))
    .sort((a, b) => a.data.localeCompare(b.data) || a.fazenda.localeCompare(b.fazenda) || a.talhao.localeCompare(b.talhao));

  const pontos = [...pointDrafts.values()]
    .map((draft) => ({
      id: draft.id,
      fazenda: draft.fazenda,
      fazendaNome: draft.fazendaNome,
      fazendaLabel: draft.fazendaLabel,
      talhao: draft.talhao,
      areaHa: draft.areaHa,
      data: draft.data,
      dataLabel: draft.dataLabel,
      variedade: draft.variedade,
      ponto: draft.ponto,
      pontoDescricao: draft.pontoDescricao,
      tamanhoCana: avg(draft.values.tamanhoCana ?? []),
      canaPorMetro: avg(draft.values.canaPorMetro ?? []),
      tamanhoEntrenos: avg(draft.values.tamanhoEntrenos ?? []),
      pesoPorCana: avg(draft.values.pesoPorCana ?? []),
      diametro: avg(draft.values.diametro ?? []),
      tch: avg(draft.values.tch ?? []),
    }))
    .sort(
      (a, b) =>
        a.data.localeCompare(b.data) ||
        a.fazenda.localeCompare(b.fazenda) ||
        a.talhao.localeCompare(b.talhao, "pt-BR", { numeric: true }) ||
        a.ponto.localeCompare(b.ponto, "pt-BR", { numeric: true }),
    );

  return {
    atualizadoEm: new Date().toISOString(),
    opcoes: {
      fazendas: [...new Set(registros.map((row) => row.fazenda))].sort((a, b) => {
        const an = fazendaMap.get(a) ?? a;
        const bn = fazendaMap.get(b) ?? b;
        return an.localeCompare(bn, "pt-BR", { numeric: true });
      }),
      talhoes: [...new Set(registros.map((row) => row.talhao))].sort((a, b) => Number(a) - Number(b) || a.localeCompare(b, "pt-BR")),
    },
    registros,
    pontos,
    fazendas: [...new Set(registros.map((row) => row.fazenda))]
      .map((codigo) => {
        const nome = fazendaMap.get(codigo) ?? codigo;
        return { codigo, nome, label: nome === codigo ? codigo : `${nome} (${codigo})` };
      })
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { numeric: true })),
    itens: itens.map((item) => ({ codigo: Number(item.cod_item), descricao: item.descricao })),
  };
}
