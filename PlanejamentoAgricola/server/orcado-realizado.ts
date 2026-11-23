import { fetchActivityRealizado } from "./activity-links.js";
import { MONTHS } from "./catalog.js";
import { collectBudgetContributions } from "./calc.js";
import { db } from "./db.js";
import { oracleNumber, oracleText, withOracle } from "./oracle.js";
import { currentSafraId, listSafras, resolveSafraId, safraStartYear } from "./safras.js";
import { breakdownForSafra, listSafraCostPerTon, storedSafraKpi } from "./safra-kpis.js";
import { fetchUnRealizadoUnitsBySheet } from "./un-realizado.js";
import { aggregateCompare, zeros, type CompareViewRow, type RealizadoObject } from "../src/lib/reportAggregate.ts";

const SAFRA_MONTHS = [8, 9, 10, 11, 0, 1, 2, 3, 4, 5, 6, 7];

type RealizadoRule = {
  sheetName: string;
  negocio: number;
  processo: number;
  subprocesso?: number;
};

export const REALIZADO_RULES: RealizadoRule[] = [
  { sheetName: "IRRIGAÇÃO", negocio: 1, processo: 4 },
  { sheetName: "MECANIZAÇÃO AGR.", negocio: 3, processo: 1, subprocesso: 3 },
  { sheetName: "P.SOLO", negocio: 1, processo: 1, subprocesso: 1 },
  { sheetName: "PLANTIO", negocio: 1, processo: 1, subprocesso: 2 },
  { sheetName: "T.C.P.", negocio: 1, processo: 1, subprocesso: 3 },
  { sheetName: "T.C.S.", negocio: 1, processo: 2 },
  { sheetName: "C. MECANIZADA", negocio: 1, processo: 3, subprocesso: 3 },
  { sheetName: "C. MANUAL", negocio: 1, processo: 3, subprocesso: 2 },
  { sheetName: "OFICINA", negocio: 3, processo: 1, subprocesso: 1 },
  { sheetName: "TRANSP.AGRICOLA", negocio: 3, processo: 1, subprocesso: 2 },
  { sheetName: "ADMINISTRAÇÃO", negocio: 5, processo: 1 },
  { sheetName: "ARRENDAMENTOS", negocio: 5, processo: 2 },
  { sheetName: "PECUÁRIA", negocio: 2, processo: 6, subprocesso: 1 },
  { sheetName: "DIRETORIA", negocio: 5, processo: 4, subprocesso: 3 },
  { sheetName: "CORTE SEMENTE", negocio: 1, processo: 1, subprocesso: 1 },
];

function money(n: number) {
  return Math.round((n || 0) * 100) / 100;
}

function costObjectKey(code: unknown): string {
  const raw = String(code ?? "").trim();
  if (!raw) return "none";
  const n = Number(raw.replace(",", "."));
  if (Number.isFinite(n) && Math.abs(n - Math.round(n)) < 1e-9) return String(Math.round(n));
  return raw.toUpperCase();
}

function anomesRange(startYear: number) {
  return { from: startYear * 100 + 9, to: (startYear + 1) * 100 + 8 };
}

function sumMonths(months: number[]) {
  return months.reduce((acc, value) => acc + (value || 0), 0);
}

function addInto(target: number[], extra: number[]) {
  for (let i = 0; i < 12; i++) target[i] = money((target[i] ?? 0) + (extra[i] ?? 0));
}

function anomesSpanForSafras(codes: string[], fallbackYear: number) {
  const years = codes.map((code) => safraStartYear(code));
  const minYear = Math.min(fallbackYear, ...years);
  const maxYear = Math.max(fallbackYear, ...years);
  return { from: minYear * 100 + 9, to: (maxYear + 1) * 100 + 8 };
}

function buildSafraCompare(
  contributions: { months: number[] }[],
  oracleRows: Record<string, unknown>[],
  currentId: number,
  sheetByName: Map<string, { id: number }>,
  allowedSheetIds?: Set<number>,
): CompareViewRow[] {
  const safras = listSafras().map((safra) => ({
    ...safra,
    year: safraStartYear(safra.code),
  }));
  const kpiById = new Map(listSafraCostPerTon().map((row) => [row.safraId, row] as const));

  const currentOrcado = zeros();
  for (const row of contributions) addInto(currentOrcado, row.months);

  const realizadoBySafra = new Map<number, number[]>();
  for (const safra of safras) realizadoBySafra.set(safra.id, zeros());

  for (const raw of oracleRows) {
    const anomes = oracleNumber(raw, "anomes");
    const valor = oracleNumber(raw, "valor") ?? 0;
    if (anomes == null || !valor) continue;
    const sheetName = matchSheetName(
      oracleNumber(raw, "negocio"),
      oracleNumber(raw, "processo"),
      oracleNumber(raw, "subprocesso"),
    );
    if (!sheetName || !sheetByName.has(sheetName)) continue;
    for (const safra of safras) {
      const index = anomesToIndex(anomes, safra.year);
      if (index == null) continue;
      const months = realizadoBySafra.get(safra.id)!;
      months[index] = money(months[index] + valor);
      break;
    }
  }

  return safras
    .slice()
    .sort((a, b) => a.year - b.year)
    .map((safra) => {
      const kpi = kpiById.get(safra.id);
      const realizado = realizadoBySafra.get(safra.id) ?? zeros();
      const isCurrent = safra.id === currentId;
      const orcado = isCurrent ? currentOrcado.slice() : zeros();
      const scopedStoredOrcado = allowedSheetIds && kpi
        ? breakdownForSafra(storedSafraKpi(safra.id), "cost_center")
            .filter((row) => allowedSheetIds.has(Number(row.key.replace(/^cc-/, ""))))
            .reduce((sum, row) => sum + row.total, 0)
        : kpi?.orcamentoTotal ?? 0;
      const orcadoTotal = isCurrent ? money(sumMonths(orcado)) : money(scopedStoredOrcado);
      const realizadoTotal = money(sumMonths(realizado));
      const orcadoAnnualOnly = !isCurrent;
      const variacao = orcado.map((value, i) =>
        orcadoAnnualOnly ? 0 : money((realizado[i] ?? 0) - value),
      );
      return {
        key: `safra-${safra.id}`,
        label: safra.label,
        orcado,
        realizado,
        variacao,
        orcadoTotal,
        realizadoTotal,
        variacaoTotal: money(realizadoTotal - orcadoTotal),
        orcadoAnnualOnly,
        tons: kpi?.moagem ?? 0,
      };
    })
    .filter(
      (row) => row.orcadoTotal || row.realizadoTotal || row.key === `safra-${currentId}`,
    );
}

function anomesToIndex(anomes: number, startYear: number): number | null {
  const year = Math.floor(anomes / 100);
  const month = anomes % 100;
  if (month < 1 || month > 12) return null;
  const calendar = month - 1;
  const index = SAFRA_MONTHS.indexOf(calendar);
  if (index < 0) return null;
  const expectedYear = calendar >= 8 ? startYear : startYear + 1;
  if (year !== expectedYear) return null;
  return index;
}

export function matchSheetName(negocio: number | null, processo: number | null, subprocesso: number | null) {
  if (negocio == null || processo == null) return null;
  const specific = REALIZADO_RULES.find(
    (rule) =>
      rule.subprocesso != null &&
      rule.negocio === negocio &&
      rule.processo === processo &&
      rule.subprocesso === subprocesso,
  );
  if (specific) return specific.sheetName;
  const general = REALIZADO_RULES.find(
    (rule) => rule.subprocesso == null && rule.negocio === negocio && rule.processo === processo,
  );
  return general?.sheetName ?? null;
}

function oracleFilterSql(sheetNames?: string[], objectAlias = "ob") {
  const rules = sheetNames
    ? REALIZADO_RULES.filter((rule) => sheetNames.includes(rule.sheetName))
    : REALIZADO_RULES;
  if (!rules.length) return "1 = 0";
  return rules.map((rule) => {
    const parts = [`${objectAlias}.negocio = ${rule.negocio}`, `${objectAlias}.processo = ${rule.processo}`];
    if (rule.subprocesso != null) parts.push(`${objectAlias}.subprocesso = ${rule.subprocesso}`);
    return `(${parts.join(" AND ")})`;
  }).join("\n              OR ");
}

function patchRowsWithStoredOrcado(rows: CompareViewRow[], totalsByKey: Map<string, number>): CompareViewRow[] {
  const patched = rows.map((row) => {
    const orcadoTotal = money(totalsByKey.get(row.key) ?? 0);
    const realizadoTotal = money(row.realizadoTotal);
    return {
      ...row,
      orcado: zeros(),
      orcadoTotal,
      orcadoAnnualOnly: true,
      variacao: row.realizado.map((value) => money(value)),
      variacaoTotal: money(realizadoTotal - orcadoTotal),
    };
  });
  return patched.filter((row) => row.orcadoTotal || row.realizadoTotal);
}

function applyStoredOrcadoForSafra(
  summary: ReturnType<typeof aggregateCompare>,
  harvestId: number,
) {
  if (harvestId === currentSafraId()) return summary;
  const stored = storedSafraKpi(harvestId);
  const ccTotals = new Map(breakdownForSafra(stored, "cost_center").map((row) => [row.key, row.total]));
  const catTotals = new Map(breakdownForSafra(stored, "category").map((row) => [row.key, row.total]));
  const costCenter = patchRowsWithStoredOrcado(summary.views.costCenter, ccTotals);
  const category = patchRowsWithStoredOrcado(summary.views.category, catTotals);
  const totalOrcado = money(costCenter.reduce((sum, row) => sum + row.orcadoTotal, 0));
  const totalRealizado = money(summary.totalRealizado);
  const totalVariacao = money(totalRealizado - totalOrcado);
  return {
    ...summary,
    views: {
      ...summary.views,
      costCenter,
      category,
    },
    totals: {
      orcado: zeros(),
      realizado: summary.totals.realizado,
      variacao: summary.totals.realizado.map((value) => money(value)),
    },
    totalOrcado,
    totalVariacao,
  };
}

async function fetchRealizado(anomesFrom: number, anomesTo: number, sheetNames?: string[]) {
  return withOracle(async (conn) => {
    const result = await conn.execute(
      `SELECT a.anomes,
              a.cod_objetocusto,
              ob.negocio,
              ob.processo,
              ob.subprocesso,
              SUM(a.valor) AS valor
         FROM custo.lancamento_custo a
         JOIN custo.objetocusto ob
           ON ob.cod_objetocusto = a.cod_objetocusto
        WHERE a.tipo = 'R'
          AND a.anomes BETWEEN :anomesFrom AND :anomesTo
          AND EXISTS (
              SELECT 1
                FROM custo.empenho emp
               WHERE emp.cod_empenho = a.cod_empenho
                 AND emp.cod_tipoempenho IN (1, 2)
          )
          AND (
              ${oracleFilterSql(sheetNames)}
          )
        GROUP BY a.anomes, a.cod_objetocusto, ob.negocio, ob.processo, ob.subprocesso`,
      { anomesFrom, anomesTo },
    );
    return (result.rows ?? []) as Record<string, unknown>[];
  });
}

async function fetchGrupoGastoOracle(anomesFrom: number, anomesTo: number, sheetNames?: string[]) {
  const agricolaSql = `NOT EXISTS (
              SELECT 1
                FROM custo.objetocusto b
               WHERE b.negocio = 5
                 AND b.processo IN (3, 4)
                 AND oc.cod_objetocusto = b.cod_objetocusto
          )
          AND NOT EXISTS (
              SELECT 1
                FROM custo.objetocusto d
               WHERE d.negocio IN (2, 98, 90, 6, 99, 8, 7)
                 AND oc.cod_objetocusto = d.cod_objetocusto
          )`;
  return withOracle(async (conn) => {
    const result = await conn.execute(
      `SELECT ge.cod_grupoempenho,
              ge.descricao,
              emp.cod_empenho,
              emp.descricao AS empenho,
              a.anomes,
              NVL(SUM(CASE WHEN a.tipo = 'O' THEN a.valor ELSE 0 END), 0) AS orcado,
              NVL(SUM(CASE WHEN a.tipo = 'R' THEN a.valor ELSE 0 END), 0) AS realizado,
              NVL(SUM(CASE WHEN a.tipo = 'O' AND ${agricolaSql} THEN a.valor ELSE 0 END), 0) AS orcado_agricola,
              NVL(SUM(CASE WHEN a.tipo = 'R' AND ${agricolaSql} THEN a.valor ELSE 0 END), 0) AS realizado_agricola
         FROM custo.lancamento_custo a
         JOIN custo.empenho emp
           ON emp.cod_empenho = a.cod_empenho
         JOIN custo.grupoempenho ge
           ON ge.cod_grupoempenho = emp.cod_grupoempenho
         LEFT JOIN custo.objetocusto oc
           ON oc.cod_objetocusto = a.cod_objetocusto
        WHERE a.anomes BETWEEN :anomesFrom AND :anomesTo
          AND a.tipo IN ('O', 'R')
          AND emp.cod_tipoempenho IN (1, 2)
          ${sheetNames ? `AND (${oracleFilterSql(sheetNames, "oc")})` : ""}
        GROUP BY ge.cod_grupoempenho, ge.descricao, emp.cod_empenho, emp.descricao, a.anomes`,
      { anomesFrom, anomesTo },
    );
    return (result.rows ?? []) as Record<string, unknown>[];
  });
}

async function fetchAtividadesInsumoOracle(anomesFrom: number, anomesTo: number) {
  return withOracle(async (conn) => {
    const result = await conn.execute(
      `WITH requisicoes AS (
         SELECT req.cod_grupoempresa,
                req.cod_empresa,
                req.cod_filial,
                req.nrrequisicao,
                req.item,
                req.cod_material,
                mat.descricao AS material_descricao,
                req.item_ordem_servico,
                req.quantidade,
                req.vrcustounitario,
                req.informacao_fornecedor,
                req.dataretirada,
                cab.tipo_ordemservico,
                cab.ano_ordem_servico,
                cab.numero_ordem_servico,
                cab.cod_grupoempresa_req,
                cab.cod_empresa_req,
                cab.cod_filial_req,
                hist.cod_empenho AS cod_empenho,
                grupo.descricao AS grupo_material
           FROM material.itensrequisicaomaterial req
           JOIN material.requisicaomaterial cab
             ON cab.cod_grupoempresa = req.cod_grupoempresa
            AND cab.cod_empresa = req.cod_empresa
            AND cab.cod_filial = req.cod_filial
            AND cab.nrrequisicao = req.nrrequisicao
           JOIN material.material mat
             ON mat.cod_material = req.cod_material
           JOIN material.historicogrupomaterial hist
             ON hist.cod_grupoempresa = req.cod_grupoempresa
            AND hist.cod_empresa = req.cod_empresa
            AND hist.cod_filial = req.cod_filial
            AND hist.cod_familia = mat.cod_familia
            AND hist.cod_grupomaterial = mat.cod_grupomaterial
            AND req.dataretirada BETWEEN hist.datainicio AND NVL(hist.datatermino, DATE '2999-12-31')
           LEFT JOIN material.grupomaterial grupo
             ON grupo.cod_familia = mat.cod_familia
            AND grupo.cod_grupomaterial = mat.cod_grupomaterial
          WHERE req.data_canc IS NULL
            AND TO_NUMBER(TO_CHAR(req.dataretirada, 'YYYYMM')) BETWEEN :anomesFrom AND :anomesTo
       ), atividades AS (
         -- Nas requisições P, a OS é o próprio apontamento e o item da OS é o item apontado.
         SELECT TO_NUMBER(TO_CHAR(req.dataretirada, 'YYYYMM')) AS anomes,
                req.cod_empenho,
                req.nrrequisicao,
                req.item,
                req.grupo_material,
                ai.cod_operacao AS cod_atividade,
                NVL(op.descricao, sg.descricao) AS atividade,
                ROUND(NVL(req.quantidade, 0) * NVL(req.vrcustounitario, 0), 2) AS realizado
           FROM requisicoes req
           JOIN agricola.parametros_empresa_agricola pea
             ON pea.cod_grupoempresa_agr = req.cod_grupoempresa_req
            AND pea.cod_empresa_agr = req.cod_empresa_req
            AND pea.cod_filial_agr = req.cod_filial_req
           JOIN agricola.apontamento ap
             ON ap.cod_grupoempresa = pea.cod_grupoempresa
            AND ap.cod_empresa = pea.cod_empresa
            AND ap.cod_filial = pea.cod_filial
            AND ap.ano_apontamento = req.ano_ordem_servico
            AND ap.nr_apontamento = req.numero_ordem_servico
           JOIN agricola.apontamentoitem ai
             ON ai.cod_grupoempresa = ap.cod_grupoempresa
            AND ai.cod_empresa = ap.cod_empresa
            AND ai.cod_filial = ap.cod_filial
            AND ai.ano_apontamento = ap.ano_apontamento
            AND ai.nr_apontamento = ap.nr_apontamento
            AND ai.item_apontamento = req.item_ordem_servico
           LEFT JOIN rh.operacaoagricola op
             ON op.cod_operacaoagricola = ai.cod_operacao
           LEFT JOIN planejamento.subempgenerico sg
             ON TO_CHAR(sg.cod_subempenho) = TO_CHAR(ai.cod_operacao)
          WHERE req.tipo_ordemservico = 'P'

          UNION ALL

         -- Demais origens mantêm o vínculo explícito gravado no material apontado.
         SELECT TO_NUMBER(TO_CHAR(req.dataretirada, 'YYYYMM')) AS anomes,
                req.cod_empenho,
                req.nrrequisicao,
                req.item,
                req.grupo_material,
                ai.cod_operacao AS cod_atividade,
                NVL(op.descricao, sg.descricao) AS atividade,
                ROUND(NVL(am.quantidade, 0) * NVL(req.vrcustounitario, 0), 2) AS realizado
           FROM requisicoes req
           JOIN agricola.apontamentomaterial am
             ON am.cod_grupoempresa = req.cod_grupoempresa
            AND am.cod_empresa = req.cod_empresa
            AND am.cod_filial = req.cod_filial
            AND am.nrrequisicao = req.nrrequisicao
            AND am.cod_material = req.cod_material
            AND am.item_requisicao = req.item
           JOIN agricola.apontamentoitem ai
             ON ai.cod_grupoempresa = am.cod_grupoempresa
            AND ai.cod_empresa = am.cod_empresa
            AND ai.cod_filial = am.cod_filial
            AND ai.ano_apontamento = am.ano_apontamento
            AND ai.nr_apontamento = am.nr_apontamento
            AND ai.item_apontamento = am.item_apontamento
           LEFT JOIN rh.operacaoagricola op
             ON op.cod_operacaoagricola = ai.cod_operacao
           LEFT JOIN planejamento.subempgenerico sg
             ON TO_CHAR(sg.cod_subempenho) = TO_CHAR(ai.cod_operacao)
          WHERE NVL(req.tipo_ordemservico, '-') <> 'P'
       ), detalhes_sem_apontamento AS (
         SELECT TO_NUMBER(TO_CHAR(req.dataretirada, 'YYYYMM')) AS anomes,
                req.cod_empenho,
                req.grupo_material,
                req.nrrequisicao,
                req.item,
                req.material_descricao,
                req.informacao_fornecedor,
                ROUND(NVL(req.quantidade, 0) * NVL(req.vrcustounitario, 0), 2) AS realizado
           FROM requisicoes req
          WHERE NOT EXISTS (
                  SELECT 1 FROM atividades a
                   WHERE a.anomes = TO_NUMBER(TO_CHAR(req.dataretirada, 'YYYYMM'))
                     AND a.cod_empenho = req.cod_empenho
                     AND a.nrrequisicao = req.nrrequisicao
                     AND a.item = req.item
                )
          AND req.cod_empenho IS NOT NULL
       )
       SELECT anomes, cod_empenho, 17 AS cod_grupoempenho, grupo_material, cod_atividade, atividade, realizado,
              NULL AS nrrequisicao, NULL AS item, NULL AS material_descricao, NULL AS informacao_fornecedor
         FROM atividades
        WHERE cod_atividade IS NOT NULL
       UNION ALL
       SELECT anomes, cod_empenho, 17 AS cod_grupoempenho, grupo_material, NULL AS cod_atividade,
              NVL(NULLIF(TRIM(material_descricao), ''), 'Material sem descrição') ||
                CASE WHEN NULLIF(TRIM(informacao_fornecedor), '') IS NOT NULL
                  THEN ' · ' || TRIM(informacao_fornecedor) ELSE '' END AS atividade,
              realizado, nrrequisicao, item, material_descricao, informacao_fornecedor
         FROM detalhes_sem_apontamento`,
      { anomesFrom, anomesTo },
    );
    return (result.rows ?? []) as Record<string, unknown>[];
  });
}

async function fetchRequisicoesSemApontamentoOracle(anomesFrom: number, anomesTo: number) {
  return withOracle(async (conn) => {
    const result = await conn.execute(
      `SELECT TO_NUMBER(TO_CHAR(i.dataretirada, 'YYYYMM')) AS anomes,
              emp.cod_grupoempenho AS cod_grupoempenho,
              h.cod_empenho AS cod_empenho,
              i.nrrequisicao,
              i.item,
              m.descricao AS material_descricao,
              i.informacao_fornecedor,
              ROUND(NVL(i.quantidade, 0) * NVL(i.vrcustounitario, 0), 2) AS realizado
         FROM material.itensrequisicaomaterial i
         JOIN material.material m ON m.cod_material = i.cod_material
         JOIN material.historicogrupomaterial h
           ON h.cod_grupoempresa = i.cod_grupoempresa
          AND h.cod_empresa = i.cod_empresa
          AND h.cod_filial = i.cod_filial
          AND h.cod_familia = m.cod_familia
          AND h.cod_grupomaterial = m.cod_grupomaterial
          AND i.dataretirada BETWEEN h.datainicio AND NVL(h.datatermino, DATE '2999-12-31')
         JOIN custo.empenho emp ON emp.cod_empenho = h.cod_empenho
        WHERE i.data_canc IS NULL
          AND h.cod_empenho IS NOT NULL
          AND emp.cod_grupoempenho IN (14, 17, 18, 19)
          AND TO_NUMBER(TO_CHAR(i.dataretirada, 'YYYYMM')) BETWEEN :anomesFrom AND :anomesTo
          AND NOT EXISTS (
            SELECT 1 FROM agricola.apontamentomaterial am
             WHERE am.cod_grupoempresa = i.cod_grupoempresa
               AND am.cod_empresa = i.cod_empresa
               AND am.cod_filial = i.cod_filial
               AND am.nrrequisicao = i.nrrequisicao
               AND am.cod_material = i.cod_material
               AND am.item_requisicao = i.item
          )`,
      { anomesFrom, anomesTo },
    );
    return (result.rows ?? []) as Record<string, unknown>[];
  });
}

async function fetchAtividadesTerceirosOracle(anomesFrom: number, anomesTo: number) {
  return withOracle(async (conn) => {
    const result = await conn.execute(
      `SELECT TO_NUMBER(TO_CHAR(parcela.datainicio, 'YYYYMM')) AS anomes,
              'contrato_variavel' AS tipo_detalhe,
              emp.cod_grupoempenho,
              parcela.cod_empenho,
              item.cod_servico AS cod_atividade,
              centro.negocio,
              centro.processo,
              centro.subprocesso,
              MAX(NVL(op.descricao, sg.descricao)) AS atividade,
              SUM(NVL(item.vlrtotal, 0)) AS peso,
              SUM(
                CASE
                  WHEN NOT EXISTS (
                    SELECT 1
                      FROM custo.objetocusto b
                     WHERE b.negocio = 5
                       AND b.processo IN (3, 4)
                       AND b.cod_objetocusto = NVL(item.cod_objetocusto, destino.cod_objetocusto)
                  )
                   AND NOT EXISTS (
                    SELECT 1
                      FROM custo.objetocusto d
                     WHERE d.negocio IN (2, 98, 90, 6, 99, 8, 7)
                       AND d.cod_objetocusto = NVL(item.cod_objetocusto, destino.cod_objetocusto)
                  )
                  THEN NVL(item.vlrtotal, 0)
                  ELSE 0
                END
              ) AS peso_agricola
         FROM financeiro.itemcontratovariavel item
         JOIN financeiro.parcelascontrato parcela
           ON parcela.numerocontrato = item.numerocontrato
          AND parcela.parcela = item.parcela
          AND parcela.cod_grupoempresa = item.cod_grupoempresa
         JOIN custo.empenho emp
           ON emp.cod_empenho = parcela.cod_empenho
         LEFT JOIN rh.operacaoagricola op
           ON op.cod_operacaoagricola = item.cod_servico
         LEFT JOIN planejamento.subempgenerico sg
           ON TO_CHAR(sg.cod_subempenho) = TO_CHAR(item.cod_servico)
         LEFT JOIN rh.operacaoobjetocusto destino
           ON destino.cod_operacaoagricola = item.cod_servico
          AND destino.data_termino IS NULL
         LEFT JOIN custo.objetocusto centro
           ON centro.cod_objetocusto = NVL(item.cod_objetocusto, destino.cod_objetocusto)
        WHERE TO_NUMBER(TO_CHAR(parcela.datainicio, 'YYYYMM')) BETWEEN :anomesFrom AND :anomesTo
          AND emp.cod_grupoempenho IN (14, 17, 18, 19, 22, 24, 25)
          AND emp.cod_tipoempenho IN (1, 2)
          AND item.cod_servico IS NOT NULL
        GROUP BY TO_NUMBER(TO_CHAR(parcela.datainicio, 'YYYYMM')),
                 emp.cod_grupoempenho, parcela.cod_empenho, item.cod_servico,
                 centro.negocio, centro.processo, centro.subprocesso`,
      { anomesFrom, anomesTo },
    );
    return (result.rows ?? []) as Record<string, unknown>[];
  });
}

async function fetchContratosAlugueisOracle(anomesFrom: number, anomesTo: number) {
  return withOracle(async (conn) => {
    const result = await conn.execute(
      `SELECT TO_NUMBER(TO_CHAR(parcela.datainicio, 'YYYYMM')) AS anomes,
              'contrato_fixo' AS tipo_detalhe,
              emp.cod_grupoempenho,
              parcela.cod_empenho,
              contrato.numerocontrato AS cod_atividade,
              centro.negocio,
              centro.processo,
              centro.subprocesso,
              MAX(
                CASE
                  WHEN NULLIF(TRIM(contrato.descricaoresumida), '') IS NOT NULL
                   AND fornecedor.razaosocial IS NOT NULL
                    THEN fornecedor.razaosocial || ' · ' || TRIM(contrato.descricaoresumida)
                  ELSE COALESCE(
                    NULLIF(TRIM(contrato.descricaoresumida), ''),
                    fornecedor.razaosocial,
                    'Fornecedor ' || TO_CHAR(contrato.cod_fornecedor)
                  )
                END
              ) AS atividade,
              SUM(NVL(parcela.valor, 0)) AS peso,
              SUM(
                CASE
                  WHEN NOT EXISTS (
                    SELECT 1
                      FROM custo.objetocusto b
                     WHERE b.negocio = 5
                       AND b.processo IN (3, 4)
                       AND b.cod_objetocusto = parcela.cod_objetocusto
                  )
                   AND NOT EXISTS (
                    SELECT 1
                      FROM custo.objetocusto d
                     WHERE d.negocio IN (2, 98, 90, 6, 99, 8, 7)
                       AND d.cod_objetocusto = parcela.cod_objetocusto
                  )
                  THEN NVL(parcela.valor, 0)
                  ELSE 0
                END
              ) AS peso_agricola
         FROM financeiro.parcelascontrato parcela
         JOIN financeiro.contrato contrato
           ON contrato.cod_grupoempresa = parcela.cod_grupoempresa
          AND contrato.cod_empresa = parcela.cod_empresa
          AND contrato.cod_filial = parcela.cod_filial
          AND contrato.numerocontrato = parcela.numerocontrato
         JOIN custo.empenho emp
           ON emp.cod_empenho = parcela.cod_empenho
         LEFT JOIN (
           SELECT cod_fornecedor, MAX(razaosocial) AS razaosocial
             FROM material.vw_parceironegocio
            GROUP BY cod_fornecedor
         ) fornecedor
           ON fornecedor.cod_fornecedor = contrato.cod_fornecedor
         LEFT JOIN custo.objetocusto centro
           ON centro.cod_objetocusto = parcela.cod_objetocusto
        WHERE TO_NUMBER(TO_CHAR(parcela.datainicio, 'YYYYMM')) BETWEEN :anomesFrom AND :anomesTo
          AND emp.cod_grupoempenho IN (14, 17, 18, 19, 22, 24, 25)
          AND emp.cod_tipoempenho IN (1, 2)
          AND NOT EXISTS (
            SELECT 1
              FROM financeiro.itemcontratovariavel item
             WHERE item.cod_grupoempresa = parcela.cod_grupoempresa
               AND item.numerocontrato = parcela.numerocontrato
               AND item.parcela = parcela.parcela
               AND item.cod_servico IS NOT NULL
          )
        GROUP BY TO_NUMBER(TO_CHAR(parcela.datainicio, 'YYYYMM')),
                 emp.cod_grupoempenho, parcela.cod_empenho, contrato.numerocontrato,
                 centro.negocio, centro.processo, centro.subprocesso`,
      { anomesFrom, anomesTo },
    );
    return (result.rows ?? []) as Record<string, unknown>[];
  });
}

function empenhoInsumo(raw: Record<string, unknown>) {
  const cadastrado = oracleText(raw, "cod_empenho");
  if (cadastrado) return cadastrado;
  const grupo = normalizedText(oracleText(raw, "grupo_material"));
  if (/HERBICID|INSETICID|FUNGICID|DEFENSIV/.test(grupo)) return "241";
  if (/PRODUTOS? BIOLOGIC/.test(grupo)) return "240";
  if (/FERTILIZ|ADUBO/.test(grupo)) return "243";
  if (/CORRETIV|CALCARIO|GESSO/.test(grupo)) return "242";
  return "";
}

function addAtividadesInsumo(
  rows: CompareViewRow[],
  apontamentos: Record<string, unknown>[],
  startYear: number,
) {
  const byEmpenho = new Map<string, Map<string, CompareViewRow>>();
  const byGroupAndEmpenho = new Map<string, Map<string, CompareViewRow>>();
  const observacoesPorLinha = new Map<CompareViewRow, Set<string>>();
  for (const raw of apontamentos) {
    const anomes = oracleNumber(raw, "anomes");
    const index = anomes == null ? null : anomesToIndex(anomes, startYear);
    const empenho = empenhoInsumo(raw);
    const grupo = oracleText(raw, "cod_grupoempenho") || "17";
    const codigo = oracleText(raw, "cod_atividade") ||
      (oracleText(raw, "nrrequisicao") ? `REQ-${oracleText(raw, "nrrequisicao")}-${oracleText(raw, "item")}` : "");
    if (index == null || !empenho || !codigo) continue;
    const requisicao = Boolean(oracleText(raw, "nrrequisicao"));
    const materialDescricao = oracleText(raw, "material_descricao").trim();
    const observacao = oracleText(raw, "informacao_fornecedor").trim();
    const groupKey = requisicao && materialDescricao
      ? `material:${normalizedText(materialDescricao)}`
      : codigo;
    const activities = byEmpenho.get(empenho) ?? new Map<string, CompareViewRow>();
    const row = activities.get(groupKey) ?? {
      key: `atividade-insumo-${empenho}-${codigo}`,
      label: requisicao
        ? materialDescricao || "Material sem descrição"
        : `${codigo} - ${oracleText(raw, "atividade") || "Operação sem descrição"}`,
      sourceCodes: requisicao ? [codigo] : undefined,
      orcado: zeros(),
      realizado: zeros(),
      variacao: zeros(),
      orcadoTotal: 0,
      realizadoTotal: 0,
      variacaoTotal: 0,
    };
    if (requisicao) {
      row.sourceCodes = [...new Set([...(row.sourceCodes ?? []), codigo])];
      const observacoes = observacoesPorLinha.get(row) ?? new Set<string>();
      if (observacao) observacoes.add(observacao);
      observacoesPorLinha.set(row, observacoes);
      row.label = [materialDescricao || "Material sem descrição", ...observacoes].join(" · ");
    }
    row.realizado[index] = money(row.realizado[index] + (oracleNumber(raw, "realizado") ?? 0));
    activities.set(groupKey, row);
    byEmpenho.set(empenho, activities);
    if (grupo) {
      const scopedKey = `${grupo}:${empenho}`;
      const scoped = byGroupAndEmpenho.get(scopedKey) ?? new Map<string, CompareViewRow>();
      const scopedRow = scoped.get(groupKey) ?? {
        ...row,
        orcado: zeros(),
        realizado: zeros(),
        variacao: zeros(),
      };
      if (requisicao) {
        scopedRow.sourceCodes = [...new Set([...(scopedRow.sourceCodes ?? []), codigo])];
        scopedRow.label = row.label;
      }
      scopedRow.realizado[index] = money(scopedRow.realizado[index] + (oracleNumber(raw, "realizado") ?? 0));
      scoped.set(groupKey, scopedRow);
      byGroupAndEmpenho.set(scopedKey, scoped);
    }
  }

  return rows.map((group) => {
    const groupCode = group.key.split("-").at(-1) ?? "";
    return {
      ...group,
      sources: (group.sources ?? []).map((source) => {
        const empenho = source.key.split("-").at(-1) ?? "";
        const details = [...(byGroupAndEmpenho.get(`${groupCode}:${empenho}`) ?? byEmpenho.get(empenho) ?? new Map<string, CompareViewRow>()).values()]
          .map((detail) => {
            const realizadoTotal = money(sumMonths(detail.realizado));
            return {
              ...detail,
              realizadoTotal,
              variacao: detail.realizado.map(money),
              variacaoTotal: realizadoTotal,
            };
          })
          .filter((detail) => detail.realizadoTotal)
          .sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { numeric: true }));
        return details.length ? { ...source, sources: details } : source;
      }),
    };
  });
}

function addDetalhesPonderados(
  rows: CompareViewRow[],
  contratos: Record<string, unknown>[],
  startYear: number,
  weightField: "peso" | "peso_agricola" = "peso",
  targetGroups = new Set(["18", "19"]),
  keyPrefix = "atividade-terceiros",
) {
  type WeightedActivity = {
    codes: string[];
    description: string;
    label: string;
    keyPrefix: string;
    weights: number[];
  };
  const byEmpenho = new Map<string, Map<string, WeightedActivity>>();

  for (const raw of contratos) {
    const grupo = oracleText(raw, "cod_grupoempenho");
    if (!targetGroups.has(grupo)) continue;
    const empenho = oracleText(raw, "cod_empenho");
    const codigo = oracleText(raw, "cod_atividade");
    const anomes = oracleNumber(raw, "anomes");
    const index = anomes == null ? null : anomesToIndex(anomes, startYear);
    if (!empenho || !codigo || index == null) continue;

    const activities = byEmpenho.get(empenho) ?? new Map<string, WeightedActivity>();
    const detailType = oracleText(raw, "tipo_detalhe");
    const resolvedPrefix = detailType === "contrato_fixo" ? "contrato-aluguel" : keyPrefix;
    const description = oracleText(raw, "atividade") || (
      detailType === "contrato_fixo" ? "Fornecedor não identificado" : "Operação sem descrição"
    );
    const activityKey =
      detailType === "contrato_variavel"
        ? `${resolvedPrefix}:${normalizedText(description)}`
        : `${resolvedPrefix}:${codigo}`;
    const activity = activities.get(activityKey) ?? {
      codes: [],
      description,
      label: detailType === "contrato_variavel" ? description : `${codigo} - ${description}`,
      keyPrefix: resolvedPrefix,
      weights: zeros(),
    };
    if (!activity.codes.includes(codigo)) activity.codes.push(codigo);
    activity.label = detailType === "contrato_variavel"
      ? activity.description
      : activity.codes.length > 1
        ? activity.description
        : `${codigo} - ${activity.description}`;
    activity.weights[index] += oracleNumber(raw, weightField) ?? 0;
    activities.set(activityKey, activity);
    byEmpenho.set(empenho, activities);
  }

  return rows.map((group) => {
    const grupo = group.key.split("-").at(-1) ?? "";
    if (!targetGroups.has(grupo)) return group;

    return {
      ...group,
      sources: (group.sources ?? []).map((source) => {
        const empenho = source.key.split("-").at(-1) ?? "";
        const weighted = [...(byEmpenho.get(empenho)?.values() ?? [])];
        if (!weighted.length) return source;

        const details = new Map<string, CompareViewRow>();
        for (const activity of weighted) {
          const codes = activity.codes.slice().sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
          const detailKey = `${activity.keyPrefix}:${codes.join("~")}`;
          details.set(detailKey, {
            key: `${activity.keyPrefix}-${grupo}-${empenho}-${codes.join("~")}`,
            label: activity.label,
            orcado: zeros(),
            realizado: zeros(),
            variacao: zeros(),
            orcadoTotal: 0,
            realizadoTotal: 0,
            variacaoTotal: 0,
          });
        }

        for (let index = 0; index < 12; index++) {
          const currentMonth = weighted.filter((activity) => (activity.weights[index] ?? 0) > 0);
          const active = currentMonth.length
            ? currentMonth
            : weighted.filter((activity) => sumMonths(activity.weights) > 0);
          const weightOf = (activity: WeightedActivity) =>
            currentMonth.length ? activity.weights[index] : sumMonths(activity.weights);
          const totalWeight = active.reduce((sum, activity) => sum + weightOf(activity), 0);
          const totalRealizado = source.realizado[index] ?? 0;
          if (!active.length || !totalWeight || !totalRealizado) continue;

          let allocated = 0;
          active.forEach((activity, activityIndex) => {
            const value =
              activityIndex === active.length - 1
                ? money(totalRealizado - allocated)
                : money(totalRealizado * (weightOf(activity) / totalWeight));
            const codes = activity.codes.slice().sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
            const detail = details.get(`${activity.keyPrefix}:${codes.join("~")}`)!;
            detail.realizado[index] = value;
            allocated = money(allocated + value);
          });
        }

        const sources = [...details.values()]
          .map((detail) => {
            const realizadoTotal = money(sumMonths(detail.realizado));
            return {
              ...detail,
              realizadoTotal,
              variacao: detail.realizado.map(money),
              variacaoTotal: realizadoTotal,
            };
          })
          .filter((detail) => detail.realizadoTotal)
          .sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { numeric: true }));

        if (!sources.length) return source;
        const combined = new Map((source.sources ?? []).map((detail) => [detail.key, detail]));
        for (const detail of sources) {
          const existing = combined.get(detail.key);
          if (!existing) {
            combined.set(detail.key, detail);
            continue;
          }
          combined.set(detail.key, {
            ...existing,
            realizado: existing.realizado.map((value, index) => money(value + detail.realizado[index])),
            realizadoTotal: money(existing.realizadoTotal + detail.realizadoTotal),
            variacao: existing.variacao.map((value, index) => money(value + detail.variacao[index])),
            variacaoTotal: money(existing.variacaoTotal + detail.variacaoTotal),
          });
        }
        return { ...source, sources: [...combined.values()] };
      }),
    };
  });
}

type OrcadoAssociationMaps = {
  bySource: Map<string, number[]>;
  byEmpenho: Map<string, number[]>;
  byActivity: Map<number, { label: string; months: number[] }>;
  activityIdsBySource: Map<string, number[]>;
  activityIdsByEmpenho: Map<string, number[]>;
};

function addMonthsScaled(target: number[], source: number[], divisor: number) {
  const safeDivisor = divisor > 0 ? divisor : 1;
  for (let index = 0; index < 12; index++) {
    target[index] = money((target[index] ?? 0) + (source[index] ?? 0) / safeDivisor);
  }
}

function orcadoAssociationMaps(
  contributions: ReturnType<typeof collectBudgetContributions>,
  harvestId: number,
): OrcadoAssociationMaps {
  const activityLabels = new Map(
    (db.prepare("SELECT id, description FROM activities").all() as { id: number; description: string }[]).map(
      (row) => [row.id, row.description] as const,
    ),
  );
  const byActivityMonths = new Map<number, number[]>();
  for (const contribution of contributions) {
    if (contribution.kind !== "activity") continue;
    const match = /^a-(\d+)$/.exec(contribution.activityKey);
    if (!match) continue;
    const activityId = Number(match[1]);
    const months = byActivityMonths.get(activityId) ?? zeros();
    addInto(months, contribution.months);
    byActivityMonths.set(activityId, months);
  }

  const columns = db.prepare("PRAGMA table_info(activity_realizado_links)").all() as { name: string }[];
  const hasSafra = columns.some((column) => column.name === "safra_id");
  const links = db
    .prepare(
      `SELECT activity_id, source, source_code, COALESCE(match_by, 'code') AS match_by
         FROM activity_realizado_links
        ${hasSafra ? "WHERE safra_id = ?" : ""}`,
    )
    .all(...(hasSafra ? [harvestId] : [])) as {
      activity_id: number;
      source: string;
      source_code: string;
      match_by: string;
    }[];

  const linkCount = new Map<string, number>();
  for (const link of links) {
    const key = `${link.activity_id}:${link.source}`;
    linkCount.set(key, (linkCount.get(key) ?? 0) + 1);
  }

  const bySource = new Map<string, number[]>();
  const byEmpenho = new Map<string, number[]>();
  const activityIdsBySource = new Map<string, number[]>();
  const activityIdsByEmpenho = new Map<string, number[]>();
  for (const link of links) {
    const activityId = Number(link.activity_id);
    const months = byActivityMonths.get(activityId);
    if (!months) continue;
    const count = linkCount.get(`${link.activity_id}:${link.source}`) ?? 1;
    const code = String(link.source_code ?? "").trim();
    if (!code) continue;
    const targetMap =
      link.source === "contrato_fixo" && link.match_by === "cod_empenho" ? byEmpenho : bySource;
    const activityMap =
      link.source === "contrato_fixo" && link.match_by === "cod_empenho"
        ? activityIdsByEmpenho
        : activityIdsBySource;
    const key = `${link.source}:${code}`;
    const target = targetMap.get(key) ?? zeros();
    addMonthsScaled(target, months, count);
    targetMap.set(key, target);
    const ids = activityMap.get(key) ?? [];
    if (!ids.includes(activityId)) activityMap.set(key, [...ids, activityId]);
  }
  const byActivity = new Map<number, { label: string; months: number[] }>();
  for (const [activityId, months] of byActivityMonths) {
    byActivity.set(activityId, {
      label: activityLabels.get(activityId)?.trim() || `Subempenho ${activityId}`,
      months,
    });
  }
  return { bySource, byEmpenho, byActivity, activityIdsBySource, activityIdsByEmpenho };
}

function detailAssociation(detail: CompareViewRow) {
  const codes = detail.sourceCodes ?? (detail.key.split("-").at(-1) ?? "").split("~").filter(Boolean);
  if (detail.key.startsWith("atividade-insumo-")) {
    return { source: "insumo", codes };
  }
  if (detail.key.startsWith("atividade-terceiros-")) {
    return { source: "contrato_variavel", codes };
  }
  if (detail.key.startsWith("contrato-aluguel-")) {
    return { source: "contrato_fixo", codes };
  }
  return null;
}

export function addOrcadoDasAtividades(
  rows: CompareViewRow[],
  contributions: ReturnType<typeof collectBudgetContributions>,
  harvestId: number,
) {
  const associations = orcadoAssociationMaps(contributions, harvestId);
  return rows.map((group) => ({
    ...group,
    sources: (group.sources ?? []).map((empenho) => {
      const details = empenho.sources ?? [];
      if (!details.length) return empenho;
      const empenhoCode = empenho.key.split("-").at(-1) ?? "";
      const grouped = new Map<string, CompareViewRow>();
      for (const detail of details) {
        const association = detailAssociation(detail);
        const linkedIds = association
          ? [
              ...association.codes.flatMap(
                (code) => associations.activityIdsBySource.get(`${association.source}:${code}`) ?? [],
              ),
              ...(association.source === "contrato_fixo"
                ? associations.activityIdsByEmpenho.get(`contrato_fixo:${empenhoCode}`) ?? []
                : []),
            ].filter((id, index, list) => list.indexOf(id) === index)
          : [];
        // Insumos e contratos variáveis podem conter vários códigos Oracle
        // associados à mesma atividade orçada local. Nesses casos o terceiro
        // nível é consolidado pelo subempenho associado. Contratos fixos sem
        // atividade continuam detalhados individualmente pelo próprio contrato.
        if (!linkedIds.length || association?.source === "contrato_fixo") {
          grouped.set(detail.key, { ...detail });
          continue;
        }
        const targets = linkedIds.map((activityId) => {
          const activity = associations.byActivity.get(activityId)!;
          const key = `subempenho-associado-${empenhoCode}-${activityId}`;
          const target = grouped.get(key) ?? {
            key,
            label: activity.label,
            orcado: zeros(),
            realizado: zeros(),
            variacao: zeros(),
            orcadoTotal: 0,
            realizadoTotal: 0,
            variacaoTotal: 0,
          };
          grouped.set(key, target);
          return { target, weights: activity.months };
        });
        for (let index = 0; index < 12; index++) {
          const current = targets.filter((item) => (item.weights[index] ?? 0) > 0);
          const active = current.length ? current : targets;
          const weightOf = (item: (typeof targets)[number]) =>
            current.length ? item.weights[index] ?? 0 : sumMonths(item.weights) || 1;
          const totalWeight = active.reduce((sum, item) => sum + weightOf(item), 0);
          let allocated = 0;
          active.forEach((item, targetIndex) => {
            const value =
              targetIndex === active.length - 1
                ? money((detail.realizado[index] ?? 0) - allocated)
                : money((detail.realizado[index] ?? 0) * (weightOf(item) / totalWeight));
            item.target.realizado[index] = money((item.target.realizado[index] ?? 0) + value);
            allocated = money(allocated + value);
          });
        }
      }
      const groupedDetails = [...grouped.values()];
      const budgets = groupedDetails.map((detail) => {
        const associatedMatch = /^subempenho-associado-[^-]+-(\d+)$/.exec(detail.key);
        const association = detailAssociation(detail);
        const months = associatedMatch
          ? associations.byActivity.get(Number(associatedMatch[1]))?.months ?? zeros()
          : association
            ? association.codes.reduce((months, code) => {
                addInto(months, associations.bySource.get(`${association.source}:${code}`) ?? zeros());
                return months;
              }, zeros())
            : zeros();
        return {
          detail,
          months,
        };
      });

      const nextDetails = groupedDetails.map((detail) => ({ ...detail, orcado: zeros() }));
      const unlinkedBudget = zeros();
      for (let index = 0; index < 12; index++) {
        const parentBudget = Math.max(0, empenho.orcado[index] ?? 0);
        const linkedBudget = budgets.reduce((sum, item) => sum + Math.max(0, item.months[index] ?? 0), 0);
        const scale = linkedBudget > parentBudget && linkedBudget > 0 ? parentBudget / linkedBudget : 1;
        let allocated = 0;
        budgets.forEach((item) => {
          const value = money(Math.max(0, item.months[index] ?? 0) * scale);
          const target = nextDetails.find((detail) => detail.key === item.detail.key)!;
          target.orcado[index] = value;
          allocated = money(allocated + value);
        });
        unlinkedBudget[index] = money(Math.max(0, parentBudget - allocated));
      }

      const sources = nextDetails.map((detail) => {
        const orcadoTotal = money(sumMonths(detail.orcado));
        const realizadoTotal = money(sumMonths(detail.realizado));
        return {
          ...detail,
          orcadoTotal,
          realizadoTotal,
          variacao: detail.orcado.map((value, index) => money((detail.realizado[index] ?? 0) - value)),
          variacaoTotal: money(realizadoTotal - orcadoTotal),
        };
      });
      if (sumMonths(unlinkedBudget) > 0) {
        const orcadoTotal = money(sumMonths(unlinkedBudget));
        const realizadoTotal = 0;
        sources.push({
          key: `orcado-sem-vinculo-${group.key.split("-").at(-1) ?? ""}-${empenhoCode}`,
          label: "Orçamento do empenho sem vínculo com fornecedor/atividade",
          orcado: unlinkedBudget,
          realizado: zeros(),
          variacao: unlinkedBudget.map((value) => money(-value)),
          orcadoTotal,
          realizadoTotal,
          variacaoTotal: money(realizadoTotal - orcadoTotal),
        });
      }
      return { ...empenho, sources };
    }),
  }));
}

function buildGrupoGastoRows(
  oracleRows: Record<string, unknown>[],
  startYear: number,
  fields: { orcado: string; realizado: string } = { orcado: "orcado", realizado: "realizado" },
): CompareViewRow[] {
  const map = new Map<string, CompareViewRow>();
  for (const raw of oracleRows) {
    const anomes = oracleNumber(raw, "anomes");
    const index = anomes == null ? null : anomesToIndex(anomes, startYear);
    if (index == null) continue;
    const cod = oracleNumber(raw, "cod_grupoempenho");
    const key = String(cod ?? (oracleText(raw, "descricao") || "none"));
    const label = (oracleText(raw, "descricao") || `Grupo ${key}`).trim();
    const row =
      map.get(key) ??
      ({
        key: `grupo-${key}`,
        label,
        orcado: zeros(),
        realizado: zeros(),
        variacao: zeros(),
        orcadoTotal: 0,
        realizadoTotal: 0,
        variacaoTotal: 0,
      } satisfies CompareViewRow);
    const orcado = oracleNumber(raw, fields.orcado) ?? 0;
    const realizado = oracleNumber(raw, fields.realizado) ?? 0;
    row.orcado[index] = money(row.orcado[index] + orcado);
    row.realizado[index] = money(row.realizado[index] + realizado);
    const empenhoCod = oracleNumber(raw, "cod_empenho");
    const empenhoKey = String(empenhoCod ?? (oracleText(raw, "empenho") || "none"));
    const empenhoLabel = (oracleText(raw, "empenho") || `Empenho ${empenhoKey}`).trim();
    const source = (row.sources ?? []).find((item) => item.key === `empenho-${key}-${empenhoKey}`) ?? {
      key: `empenho-${key}-${empenhoKey}`,
      label: empenhoCod == null ? empenhoLabel : `${empenhoCod} - ${empenhoLabel}`,
      orcado: zeros(),
      realizado: zeros(),
      variacao: zeros(),
      orcadoTotal: 0,
      realizadoTotal: 0,
      variacaoTotal: 0,
    } satisfies CompareViewRow;
    source.orcado[index] = money(source.orcado[index] + orcado);
    source.realizado[index] = money(source.realizado[index] + realizado);
    if (!(row.sources ?? []).some((item) => item.key === source.key)) row.sources = [...(row.sources ?? []), source];
    map.set(key, row);
  }
  return [...map.values()]
    .map((row) => {
      const orcadoTotal = money(sumMonths(row.orcado));
      const realizadoTotal = money(sumMonths(row.realizado));
      const variacao = row.orcado.map((value, i) => money((row.realizado[i] ?? 0) - value));
      const sources = (row.sources ?? [])
        .map((source) => {
          const sourceOrcado = money(sumMonths(source.orcado));
          const sourceRealizado = money(sumMonths(source.realizado));
          return {
            ...source,
            orcadoTotal: sourceOrcado,
            realizadoTotal: sourceRealizado,
            variacao: source.orcado.map((value, i) => money((source.realizado[i] ?? 0) - value)),
            variacaoTotal: money(sourceRealizado - sourceOrcado),
          };
        })
        .filter((source) => source.orcadoTotal || source.realizadoTotal)
        .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
      return {
        ...row,
        orcadoTotal,
        realizadoTotal,
        variacao,
        variacaoTotal: money(realizadoTotal - orcadoTotal),
        sources,
      };
    })
    .filter((row) => row.orcadoTotal || row.realizadoTotal)
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}

function normalizedText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

function sheetNameForOracleRow(raw: Record<string, unknown>) {
  return matchSheetName(
    oracleNumber(raw, "negocio"),
    oracleNumber(raw, "processo"),
    oracleNumber(raw, "subprocesso"),
  );
}

export async function orcadoRealizado(options?: { safraId?: number | null; sheetIds?: number[] | null }) {
  const harvestId = resolveSafraId(options?.safraId);
  const safra = db.prepare("SELECT code, label FROM safras WHERE id = ?").get(harvestId) as
    | { code: string; label: string }
    | undefined;
  const startYear = safra ? safraStartYear(safra.code) : new Date().getFullYear();
  const { from: anomesFrom, to: anomesTo } = anomesRange(startYear);
  const fetchRange = anomesSpanForSafras(
    listSafras().map((row) => row.code),
    startYear,
  );
  const sheets = db
    .prepare("SELECT id, name, title FROM sheets WHERE kind = 'cost_center'")
    .all() as { id: number; name: string; title: string }[];
  const sheetByName = new Map(sheets.map((row) => [row.name, row]));
  const allowedSheetIds = options?.sheetIds ? new Set(options.sheetIds) : undefined;
  const allowedSheetNames = allowedSheetIds
    ? sheets.filter((sheet) => allowedSheetIds.has(sheet.id)).map((sheet) => sheet.name)
    : undefined;

  const contributions = collectBudgetContributions().filter(
    (row) => !allowedSheetIds || allowedSheetIds.has(row.sheetId),
  );
  const objectLabels = new Map(contributions.map((row) => [row.objectKey, row.objectLabel]));
  const objects = db.prepare("SELECT code, description FROM cost_objects").all() as { code: string; description: string }[];
  for (const row of objects) {
    const key = costObjectKey(row.code);
    if (!objectLabels.has(key)) objectLabels.set(key, `${row.code} — ${row.description}`);
  }

  const realizadoMap = new Map<string, RealizadoObject>();
  const [
    oracleRows,
    realizadoByActivity,
    grupoGastoRows,
    atividadesInsumoRows,
    requisicoesSemApontamentoRows,
    atividadesTerceirosRows,
    contratosAlugueisRows,
  ] = await Promise.all([
      fetchRealizado(fetchRange.from, fetchRange.to, allowedSheetNames),
      allowedSheetIds ? Promise.resolve([]) : fetchActivityRealizado({ safraId: harvestId, startYear }),
      fetchGrupoGastoOracle(anomesFrom, anomesTo, allowedSheetNames),
      allowedSheetIds ? Promise.resolve([]) : fetchAtividadesInsumoOracle(anomesFrom, anomesTo),
      allowedSheetIds ? Promise.resolve([]) : fetchRequisicoesSemApontamentoOracle(anomesFrom, anomesTo),
      fetchAtividadesTerceirosOracle(anomesFrom, anomesTo),
      fetchContratosAlugueisOracle(anomesFrom, anomesTo),
    ]);
  const atividadesTerceirosVisiveis = allowedSheetNames
    ? atividadesTerceirosRows.filter((row) => {
        const name = sheetNameForOracleRow(row);
        return name != null && allowedSheetNames.includes(name);
      })
    : atividadesTerceirosRows;
  const contratosAlugueisVisiveis = allowedSheetNames
    ? contratosAlugueisRows.filter((row) => {
        const name = sheetNameForOracleRow(row);
        return name != null && allowedSheetNames.includes(name);
      })
    : contratosAlugueisRows;
  const grupoGastoBase = buildGrupoGastoRows(grupoGastoRows, startYear);
  const grupoGastoAgricolaBase = buildGrupoGastoRows(grupoGastoRows, startYear, {
    orcado: "orcado_agricola",
    realizado: "realizado_agricola",
  });
  const grupoGastoComInsumos = allowedSheetIds
    ? grupoGastoBase
    : addAtividadesInsumo(grupoGastoBase, [...atividadesInsumoRows, ...requisicoesSemApontamentoRows], startYear);
  const grupoGastoAgricolaComInsumos = allowedSheetIds
    ? grupoGastoAgricolaBase
    : addAtividadesInsumo(
        grupoGastoAgricolaBase,
        [...atividadesInsumoRows, ...requisicoesSemApontamentoRows],
        startYear,
      );
  const grupoGasto = addOrcadoDasAtividades(
    addDetalhesPonderados(
      grupoGastoComInsumos,
      [...atividadesTerceirosVisiveis, ...contratosAlugueisVisiveis],
      startYear,
      "peso",
      new Set(["14", "17", "18", "19", "22", "24", "25"]),
    ),
    contributions,
    harvestId,
  );
  const grupoGastoAgricola = addOrcadoDasAtividades(
    addDetalhesPonderados(
      grupoGastoAgricolaComInsumos,
      [...atividadesTerceirosVisiveis, ...contratosAlugueisVisiveis],
      startYear,
      "peso_agricola",
      new Set(["14", "17", "18", "19", "22", "24", "25"]),
    ),
    contributions,
    harvestId,
  );
  for (const raw of oracleRows) {
    const anomes = oracleNumber(raw, "anomes");
    const valor = oracleNumber(raw, "valor") ?? 0;
    if (anomes == null || !valor) continue;
    if (anomes < anomesFrom || anomes > anomesTo) continue;
    const index = anomesToIndex(anomes, startYear);
    if (index == null) continue;
    const sheetName = matchSheetName(
      oracleNumber(raw, "negocio"),
      oracleNumber(raw, "processo"),
      oracleNumber(raw, "subprocesso"),
    );
    const sheet = sheetName ? sheetByName.get(sheetName) : undefined;
    if (!sheet) continue;
    const objectKey = costObjectKey(oracleText(raw, "cod_objetocusto") || oracleNumber(raw, "cod_objetocusto"));
    const mapKey = `${sheet.id}::${objectKey}`;
    const row = realizadoMap.get(mapKey) ?? {
      sheetId: sheet.id,
      sheetTitle: sheet.title,
      key: objectKey,
      label: objectLabels.get(objectKey) ?? (objectKey === "none" ? "Sem objeto de custo" : objectKey),
      months: zeros(),
    };
    row.months[index] = money(row.months[index] + valor);
    realizadoMap.set(mapKey, row);
  }

  const realizadoByObject = [...realizadoMap.values()];
  const unitsBySheet = await fetchUnRealizadoUnitsBySheet(harvestId).catch(
    () => [] as { sheetId: number; units: number }[],
  );
  const scopedUnitsBySheet = allowedSheetIds
    ? unitsBySheet.filter((row) => allowedSheetIds.has(row.sheetId))
    : unitsBySheet;
  const summaryRaw = aggregateCompare(contributions, realizadoByObject, [], realizadoByActivity);
  const summary = allowedSheetIds ? summaryRaw : applyStoredOrcadoForSafra(summaryRaw, harvestId);
  const safraRows = buildSafraCompare(
    contributions,
    oracleRows,
    currentSafraId(),
    sheetByName,
    allowedSheetIds,
  );

  return {
    months: MONTHS,
    safraId: harvestId,
    anomesFrom,
    anomesTo,
    safraLabel: safra?.label ?? `Safra ${startYear}/${startYear + 1}`,
    contributions,
    realizadoByObject,
    realizadoByActivity,
    unitsBySheet: scopedUnitsBySheet,
    ...summary,
    grupoGasto,
    grupoGastoAgricola,
    views: {
      ...summary.views,
      safra: safraRows,
    },
  };
}
