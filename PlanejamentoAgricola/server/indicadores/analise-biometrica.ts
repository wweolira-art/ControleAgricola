import { db } from "../db.js";
import { oracleNumber, withOracle } from "../oracle.js";
import { periodoBiometria } from "../../src/lib/periodo-biometria.js";

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
  const normalized = normalizeCodigoFazenda(fazenda);
  const nome = fazendaMap.get(fazenda) ?? fazendaMap.get(normalized) ?? null;
  return {
    fazendaNome: nome,
    fazendaLabel: nome ? `${nome} (${fazenda})` : fazenda,
  };
}

function normalizeCodigoFazenda(value: string | number | null | undefined) {
  const text = String(value ?? "").trim();
  return text.replace(/^0+/, "") || text;
}

function timestamp() {
  return new Date().toISOString();
}

function salvarItensLocais(items: ItemRow[]) {
  const save = db.prepare(`INSERT INTO analise_biometrica_itens (code, description, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(code) DO UPDATE SET description = excluded.description, updated_at = excluded.updated_at`);
  const updatedAt = timestamp();
  db.transaction(() => items.forEach((item) => save.run(Number(item.cod_item), String(item.descricao ?? ""), updatedAt)))();
}

function itensLocais(): ItemRow[] {
  return db.prepare("SELECT code AS cod_item, description AS descricao FROM analise_biometrica_itens ORDER BY code").all() as ItemRow[];
}

function salvarLancamentosLocais(rows: LancamentoRow[]) {
  const save = db.prepare(`INSERT OR IGNORE INTO analise_biometrica_lancamentos
    (collected_at, data_label, point_code, item_code, farm_code, field_code, variety, value, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const updatedAt = timestamp();
  db.transaction(() => rows.forEach((row) => {
    const data = parseDateBr(row.data);
    const valor = Number(row.valor);
    if (!data || !Number.isFinite(valor) || row.cod_item == null || row.cod_fazenda == null || row.cod_talhao == null) return;
    save.run(data, String(row.data ?? ""), String(row.cod_ponto ?? ""), Number(row.cod_item), String(row.cod_fazenda), String(row.cod_talhao), String(row.variedade ?? ""), valor, updatedAt);
  }))();
}

function lancamentosLocais(inicio: string, fim: string): LancamentoRow[] {
  return db.prepare(`SELECT data_label AS data,
      NULLIF(point_code, '') AS cod_ponto, item_code AS cod_item, farm_code AS cod_fazenda,
      field_code AS cod_talhao, NULLIF(variety, '') AS variedade, value AS valor
    FROM analise_biometrica_lancamentos WHERE collected_at BETWEEN ? AND ? ORDER BY collected_at, id`).all(inicio, fim) as LancamentoRow[];
}

async function carregarDescricoesFazendas(consultarOracle = true) {
  const map = new Map<string, string>();
  const add = (code: unknown, description: unknown) => {
    const codigo = String(code ?? "").trim();
    const nome = String(description ?? "").trim();
    if (!codigo || !nome) return;
    map.set(codigo, nome);
    map.set(normalizeCodigoFazenda(codigo), nome);
  };

  const fazendaRows = db.prepare("SELECT code, description FROM fazendas").all() as Array<{
    code: string;
    description: string;
  }>;
  for (const row of fazendaRows) add(row.code, row.description);
  const locais = db.prepare("SELECT code, description FROM analise_biometrica_fazendas").all() as Array<{ code: string; description: string }>;
  for (const row of locais) add(row.code, row.description);

  if (!consultarOracle) return map;
  try {
    await withOracle(async (conn) => {
      const result = await conn.execute(
        `SELECT f.cod_fazenda,
                f.descricao
           FROM agricola.fazenda f
          WHERE NVL(f.cod_fazenda, -1) <> 0`,
      );
      const save = db.prepare(`INSERT INTO analise_biometrica_fazendas (code, description, updated_at) VALUES (?, ?, ?)
        ON CONFLICT(code) DO UPDATE SET description = excluded.description, updated_at = excluded.updated_at`);
      const updatedAt = timestamp();
      for (const raw of (result.rows ?? []) as Record<string, unknown>[]) {
        add(raw.COD_FAZENDA ?? raw.cod_fazenda, raw.DESCRICAO ?? raw.descricao);
        const code = String(raw.COD_FAZENDA ?? raw.cod_fazenda ?? "").trim();
        const description = String(raw.DESCRICAO ?? raw.descricao ?? "").trim();
        if (code && description) save.run(code, description, updatedAt);
      }
    });
  } catch (e) {
    console.warn("[analise-biometrica] Não foi possível consultar descrição das fazendas no Oracle.", e);
  }

  return map;
}

async function carregarAreasTalhao(consultarOracle = true) {
  const local = new Map<string, number>();
  const locais = db.prepare("SELECT farm_code, field_code, area_ha FROM analise_biometrica_talhoes WHERE area_ha IS NOT NULL").all() as Array<{ farm_code: string; field_code: string; area_ha: number }>;
  for (const row of locais) local.set(`${row.farm_code}:${row.field_code}`, Number(row.area_ha));
  if (!consultarOracle) return local;
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
      const save = db.prepare(`INSERT INTO analise_biometrica_talhoes (farm_code, field_code, area_ha, updated_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(farm_code, field_code) DO UPDATE SET area_ha = excluded.area_ha, updated_at = excluded.updated_at`);
      const updatedAt = timestamp();
      for (const raw of (result.rows ?? []) as Record<string, unknown>[]) {
        const codFazenda = oracleNumber(raw, "cod_fazenda", "COD_FAZENDA");
        const codTalhao = oracleNumber(raw, "cod_talhao", "COD_TALHAO");
        const area = oracleNumber(raw, "area_ha", "AREA_HA");
        if (codFazenda == null || codTalhao == null || !(area != null && area > 0)) continue;
        map.set(`${codFazenda}:${codTalhao}`, area);
        save.run(String(codFazenda), String(codTalhao), area, updatedAt);
      }
      return map;
    });
  } catch (e) {
    console.warn("[analise-biometrica] Não foi possível consultar área dos talhões.", e);
    return local;
  }
}

async function carregarItens() {
  try {
    const items = await fetchAll<ItemRow>("itens_analisebiometrica");
    salvarItensLocais(items);
    return items;
  } catch (error) {
    const local = itensLocais();
    if (local.length) return local;
    throw error;
  }
}

async function carregarLancamentos(meses: Record<string, unknown>[], inicio: string, fim: string) {
  try {
    const rows: LancamentoRow[] = [];
    for (const filtro of meses) rows.push(...await fetchAll<LancamentoRow>("lancamento_analisebiometrica", filtro));
    salvarLancamentosLocais(rows);
    return rows;
  } catch (error) {
    const local = lancamentosLocais(inicio, fim);
    if (local.length) return local;
    throw error;
  }
}

/** Copia todo o histórico exposto pela API ORDS para o SQLite local. */
export async function sincronizarTodosLancamentosBiometricos() {
  const [itens, lancamentos] = await Promise.all([
    fetchAll<ItemRow>("itens_analisebiometrica"),
    fetchAll<LancamentoRow>("lancamento_analisebiometrica"),
  ]);
  salvarItensLocais(itens);
  salvarLancamentosLocais(lancamentos);
  await Promise.all([carregarDescricoesFazendas(), carregarAreasTalhao()]);
  return { itens: itens.length, lancamentos: lancamentos.length };
}

async function fetchAll<T>(path: string, filtro?: Record<string, unknown>): Promise<T[]> {
  const out: T[] = [];
  let url: string | null = `${BASE_URL}/${path}/`;
  if (filtro) url += `?q=${encodeURIComponent(JSON.stringify(filtro))}`;
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

export async function gerarAnaliseBiometrica(inicio?: string, fim?: string): Promise<AnaliseBiometricaData> {
  const padrao = periodoBiometria();
  inicio ||= padrao.inicio;
  fim ||= padrao.fim;
  const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  if (!validDate(inicio) || !validDate(fim) || inicio > fim) {
    throw new Error("Informe um período válido para a análise biométrica.");
  }
  // O relatório lê exclusivamente o SQLite local. A atualização da cópia é
  // executada separadamente pelo comando `npm run sync:biometria`.
  const [fazendaMap, areasTalhao] = await Promise.all([
    carregarDescricoesFazendas(false),
    carregarAreasTalhao(false),
  ]);
  const itens = itensLocais();
  const lancamentos = lancamentosLocais(inicio, fim);
  if (!itens.length) {
    throw new Error("Não há dados biométricos locais. Execute npm run sync:biometria para importar o histórico da API.");
  }
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
    if (data < inicio || data > fim) continue;
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
        const an = fazendaMap.get(a) ?? fazendaMap.get(normalizeCodigoFazenda(a)) ?? a;
        const bn = fazendaMap.get(b) ?? fazendaMap.get(normalizeCodigoFazenda(b)) ?? b;
        return an.localeCompare(bn, "pt-BR", { numeric: true });
      }),
      talhoes: [...new Set(registros.map((row) => row.talhao))].sort((a, b) => Number(a) - Number(b) || a.localeCompare(b, "pt-BR")),
    },
    registros,
    pontos,
    fazendas: [...new Set(registros.map((row) => row.fazenda))]
      .map((codigo) => {
        const nome = fazendaMap.get(codigo) ?? fazendaMap.get(normalizeCodigoFazenda(codigo)) ?? codigo;
        return { codigo, nome, label: nome === codigo ? codigo : `${nome} (${codigo})` };
      })
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { numeric: true })),
    itens: itens.map((item) => ({ codigo: Number(item.cod_item), descricao: item.descricao })),
  };
}
