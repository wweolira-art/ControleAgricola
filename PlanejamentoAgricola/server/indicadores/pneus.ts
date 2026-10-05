import { oracleText, oracleValue, withOracle } from "../oracle.js";
import { isPneusView, type PneusData, type PneusView, type PneuConserto, type PneuItem } from "../../src/lib/pneus.js";

type Row = Record<string, unknown>;
const MAX_ROWS = 100000;
const num = (r: Row, key: string) => {
  const value = oracleValue(r, key);
  return value == null || !Number.isFinite(Number(value)) ? null : Number(value);
};
const label = (r: Row, key: string) => oracleText(r, key) || "Não informado";

export type PneusConsulta = {
  view?: string | null;
  from?: string | null;
  to?: string | null;
};

function period(from?: string | null, to?: string | null) {
  const dataInicio = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : "1900-01-01";
  const dataFim = to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : "2999-12-31";
  return dataFim < dataInicio ? { dataInicio, dataFim: dataInicio } : { dataInicio, dataFim };
}

function mapPneus(rows: Row[] | undefined): PneuItem[] {
  return (rows ?? []).map((r) => ({
    id: num(r, "cod_pneu")!,
    numero: oracleText(r, "numero_fogo") || String(num(r, "cod_pneu")),
    medida: label(r, "medida"),
    tipo: label(r, "tipo"),
    categoria: label(r, "categoria"),
    marca: label(r, "marca"),
    descarte: oracleText(r, "descarte") || null,
    motivo: label(r, "motivo"),
    causa: label(r, "causa"),
    equipamento: oracleText(r, "equipamento"),
    tipoEquipamento: label(r, "tipo_equipamento"),
    colocado: oracleText(r, "colocado") || null,
    montado: num(r, "montado") === 1,
    emReforma: num(r, "em_reforma") === 1,
    vida: num(r, "vida") ?? 1,
    sulco: num(r, "sulco"),
    rodado: num(r, "rodado"),
    aquisicao: num(r, "aquisicao"),
    custo: num(r, "custo"),
    posicao: oracleText(r, "posicao"),
    eixo: oracleText(r, "eixo"),
    posicaoDescricao: label(r, "posicao_descricao"),
    medicao: oracleText(r, "medicao") || null,
  }));
}

function mapConsertos(rows: Row[] | undefined): PneuConserto[] {
  return (rows ?? []).map((r) => ({
    pneuId: num(r, "cod_pneu")!,
    inicio: oracleText(r, "inicio") || null,
    fim: oracleText(r, "fim") || null,
    reforma: oracleText(r, "reforma") === "S",
    recusado: oracleText(r, "recusado") === "S",
    valor: num(r, "valor") ?? 0,
    fornecedor: label(r, "fornecedor"),
    tipo: label(r, "tipo"),
  }));
}

function assertLimit(count: number, labelText: string) {
  if (count >= MAX_ROWS) {
    throw new Error(`O volume de ${labelText} excedeu o limite da consulta. Refine o período antes de exibir totais.`);
  }
}

const TIRE_JOINS = `
      LEFT JOIN automotivo.medidapneu me ON me.cod_medidapneu=p.cod_medidapneu
      LEFT JOIN automotivo.tipopneu tp ON tp.cod_tipopneu=p.cod_tipopneu
      LEFT JOIN automotivo.categoriapneu ca ON ca.cod_categoriapneu=p.cod_categoriapneu
      LEFT JOIN automotivo.marcapneu ma ON ma.cod_marcapneu=p.cod_marcapneu
      LEFT JOIN automotivo.motivosucata mo ON mo.cod_motivosucata=p.cod_motivosucata
      LEFT JOIN automotivo.causaretirarpneu cr ON cr.cod_causaretpneu=p.cod_causaretpneusucata
      LEFT JOIN automotivo.posicaopneu po ON po.cod_posicaopneu=ep.cod_posicaopneu`;

const TIRE_COLS = `
      p.cod_pneu, p.numero_fogo, me.desc_medidapneu medida, tp.desc_tipopneu tipo,
      ca.desc_categoriapneu categoria, ma.desc_marcapneu marca,
      TO_CHAR(p.dt_sucateamento,'YYYY-MM-DD') descarte,
      mo.desc_motivosucata motivo, cr.desc_causaretpneu causa,
      ep.cod_equipamento equipamento, te.descricaotipoequipamento tipo_equipamento,
      TO_CHAR(ep.dtcolocado,'YYYY-MM-DD') colocado,
      CASE WHEN ep.cod_pneu IS NOT NULL AND ep.dtretirado IS NULL THEN 1 ELSE 0 END montado,
      NVL(r.em_reforma,0) em_reforma, NVL(p.vida_inicial,1)+NVL(r.vidas,0) vida,
      p.km_hstotal rodado, p.valor_aquisicao aquisicao,
      po.posicao, po.eixo, po.desc_posicaopneu posicao_descricao`;

const REPAIR_SQL = `
      SELECT c.cod_pneu, TO_CHAR(c.dtconserto_ini,'YYYY-MM-DD') inicio,
        TO_CHAR(c.dtconserto_fim,'YYYY-MM-DD') fim, t.reforma, c.recusado,
        NVL(c.valor_conserto,0) valor, t.desc_tipoconsertopneu tipo,
        f.razaosocial fornecedor
      FROM automotivo.consertopneu c
      JOIN automotivo.pneu p ON p.cod_pneu=c.cod_pneu
      LEFT JOIN automotivo.tipoconsertopneu t ON t.cod_tipoconsertopneu=c.cod_tipoconsertopneu
      LEFT JOIN (SELECT cod_fornecedor, MAX(razaosocial) razaosocial
        FROM material.vw_parceironegocio GROUP BY cod_fornecedor) f ON f.cod_fornecedor=c.cod_fornecedor
      WHERE (p.cod_motivosucata<>17 OR p.cod_motivosucata IS NULL)
        AND c.dtconserto_ini BETWEEN TO_DATE(:dataInicio,'YYYY-MM-DD') AND TO_DATE(:dataFim,'YYYY-MM-DD')`;

/** Custo de reposição: média anual de material.customedio (família 32) por medida. */
const CUSTO_MEDIDA_CTE = `
      custo_descarte AS (
        SELECT cm.ano, mm.cod_medidapneu,
          ROUND(AVG(cm.custo_medio), 2) AS customedio
        FROM material.customedio cm
        JOIN material.material b ON b.cod_material = cm.cod_material
        JOIN automotivo.medidapneu_material mm ON mm.cod_material = cm.cod_material
        WHERE b.cod_familia IN (32)
          AND mm.cod_medidapneu IN (SELECT DISTINCT cod_medidapneu FROM alvo WHERE cod_medidapneu IS NOT NULL)
        GROUP BY cm.ano, mm.cod_medidapneu
      ), custo_medida_recente AS (
        SELECT cod_medidapneu, customedio,
          ROW_NUMBER() OVER (PARTITION BY cod_medidapneu ORDER BY ano DESC) rn
        FROM custo_descarte
      )`;

async function queryDescarte(from: string, to: string): Promise<PneusData> {
  return withOracle(async (conn) => {
    const binds = { dataInicio: from, dataFim: to };
    const tires = await conn.execute(
      `
      WITH alvo AS (
        SELECT p.cod_pneu, p.numero_fogo, p.cod_medidapneu, p.cod_tipopneu, p.cod_categoriapneu,
          p.cod_marcapneu, p.dt_sucateamento, p.cod_motivosucata, p.cod_causaretpneusucata,
          p.vida_inicial, p.km_hstotal, p.valor_aquisicao
        FROM automotivo.pneu p
        WHERE (p.cod_motivosucata<>17 OR p.cod_motivosucata IS NULL)
          AND p.dt_sucateamento IS NOT NULL
          AND p.dt_sucateamento BETWEEN TO_DATE(:dataInicio,'YYYY-MM-DD') AND TO_DATE(:dataFim,'YYYY-MM-DD')
      ), montagem AS (
        SELECT ep.*, ROW_NUMBER() OVER (PARTITION BY ep.cod_pneu
          ORDER BY ep.dtcolocado DESC NULLS LAST, ep.hora_fim_montagem DESC NULLS LAST, ep.sequencia DESC) rn
        FROM automotivo.equip_pneu ep
        WHERE ep.cod_pneu IN (SELECT cod_pneu FROM alvo)
      ), tipo_equip AS (
        SELECT h.cod_equipamento, t.descricaotipoequipamento,
          ROW_NUMBER() OVER (PARTITION BY h.cod_equipamento ORDER BY h.data_inicio DESC NULLS LAST) rn
        FROM automotivo.historico_tipoequipamento h
        LEFT JOIN automotivo.tipoequipamento t ON t.cod_tipoequipamento=h.cod_tipoequipamento
        WHERE h.data_fim IS NULL
          AND h.cod_equipamento IN (SELECT DISTINCT cod_equipamento FROM montagem WHERE rn=1)
      ), reformas AS (
        SELECT c.cod_pneu,
          SUM(CASE WHEN t.reforma='S' AND c.dtconserto_fim IS NOT NULL AND NVL(c.recusado,'N')<>'S' THEN 1 ELSE 0 END) vidas,
          MAX(CASE WHEN c.dtconserto_fim IS NULL AND NVL(c.recusado,'N')<>'S' THEN 1 ELSE 0 END) em_reforma
        FROM automotivo.consertopneu c
        LEFT JOIN automotivo.tipoconsertopneu t ON t.cod_tipoconsertopneu=c.cod_tipoconsertopneu
        WHERE c.cod_pneu IN (SELECT cod_pneu FROM alvo)
        GROUP BY c.cod_pneu
      ), ${CUSTO_MEDIDA_CTE}
      SELECT ${TIRE_COLS},
        ep.sulcoretirado sulco,
        COALESCE(cd.customedio, cm.customedio) custo,
        CAST(NULL AS VARCHAR2(10)) medicao
      FROM alvo p
      LEFT JOIN montagem ep ON ep.cod_pneu=p.cod_pneu AND ep.rn=1
      LEFT JOIN tipo_equip te ON te.cod_equipamento=ep.cod_equipamento AND te.rn=1
      LEFT JOIN reformas r ON r.cod_pneu=p.cod_pneu
      LEFT JOIN custo_descarte cd
        ON cd.cod_medidapneu = p.cod_medidapneu
       AND cd.ano = EXTRACT(YEAR FROM p.dt_sucateamento)
      LEFT JOIN custo_medida_recente cm
        ON cm.cod_medidapneu = p.cod_medidapneu
       AND cm.rn = 1
      ${TIRE_JOINS}
      ORDER BY p.numero_fogo`,
      binds,
      { maxRows: MAX_ROWS },
    );
    assertLimit(tires.rows?.length ?? 0, "descartes");
    return { pneus: mapPneus(tires.rows as Row[]), consertos: [], atualizadoEm: new Date().toISOString() };
  });
}

async function queryEstoque(): Promise<PneusData> {
  return withOracle(async (conn) => {
    const tires = await conn.execute(
      `
      WITH alvo AS (
        SELECT p.cod_pneu, p.numero_fogo, p.cod_medidapneu, p.cod_tipopneu, p.cod_categoriapneu,
          p.cod_marcapneu, p.dt_sucateamento, p.cod_motivosucata, p.cod_causaretpneusucata,
          p.vida_inicial, p.km_hstotal, p.valor_aquisicao
        FROM automotivo.pneu p
        WHERE (p.cod_motivosucata<>17 OR p.cod_motivosucata IS NULL)
          AND p.dt_sucateamento IS NULL
      ), montagem AS (
        SELECT ep.*, ROW_NUMBER() OVER (PARTITION BY ep.cod_pneu
          ORDER BY ep.dtcolocado DESC NULLS LAST, ep.hora_fim_montagem DESC NULLS LAST, ep.sequencia DESC) rn
        FROM automotivo.equip_pneu ep
        WHERE ep.cod_pneu IN (SELECT cod_pneu FROM alvo)
      ), medicao AS (
        SELECT i.cod_pneu, m.cod_equipamento, m.dtmedicao,
          (NVL(i.medicao1,0)+NVL(i.medicao2,0)+NVL(i.medicao3,0)+NVL(i.medicao4,0)) /
          NULLIF((CASE WHEN i.medicao1 IS NOT NULL THEN 1 ELSE 0 END)+
            (CASE WHEN i.medicao2 IS NOT NULL THEN 1 ELSE 0 END)+
            (CASE WHEN i.medicao3 IS NOT NULL THEN 1 ELSE 0 END)+
            (CASE WHEN i.medicao4 IS NOT NULL THEN 1 ELSE 0 END),0) sulco,
          ROW_NUMBER() OVER (PARTITION BY i.cod_pneu, m.cod_equipamento
            ORDER BY m.dtmedicao DESC, m.hora_ini DESC NULLS LAST, m.n_documento DESC) rn
        FROM automotivo.medicaosulcopneu m
        JOIN automotivo.itens_medicaosulco i ON i.n_documento=m.n_documento
        WHERE i.cod_pneu IN (SELECT cod_pneu FROM alvo)
      ), tipo_equip AS (
        SELECT h.cod_equipamento, t.descricaotipoequipamento,
          ROW_NUMBER() OVER (PARTITION BY h.cod_equipamento ORDER BY h.data_inicio DESC NULLS LAST) rn
        FROM automotivo.historico_tipoequipamento h
        LEFT JOIN automotivo.tipoequipamento t ON t.cod_tipoequipamento=h.cod_tipoequipamento
        WHERE h.data_fim IS NULL
          AND h.cod_equipamento IN (SELECT DISTINCT cod_equipamento FROM montagem WHERE rn=1 AND dtretirado IS NULL)
      ), reformas AS (
        SELECT c.cod_pneu,
          SUM(CASE WHEN t.reforma='S' AND c.dtconserto_fim IS NOT NULL AND NVL(c.recusado,'N')<>'S' THEN 1 ELSE 0 END) vidas,
          MAX(CASE WHEN c.dtconserto_fim IS NULL AND NVL(c.recusado,'N')<>'S' THEN 1 ELSE 0 END) em_reforma
        FROM automotivo.consertopneu c
        LEFT JOIN automotivo.tipoconsertopneu t ON t.cod_tipoconsertopneu=c.cod_tipoconsertopneu
        WHERE c.cod_pneu IN (SELECT cod_pneu FROM alvo)
        GROUP BY c.cod_pneu
      )
      SELECT ${TIRE_COLS},
        CASE WHEN p.dt_sucateamento IS NOT NULL THEN ep.sulcoretirado
          ELSE COALESCE(md.sulco,ep.sulcocolocado) END sulco,
        CAST(NULL AS NUMBER) custo,
        TO_CHAR(md.dtmedicao,'YYYY-MM-DD') medicao
      FROM alvo p
      LEFT JOIN montagem ep ON ep.cod_pneu=p.cod_pneu AND ep.rn=1
      LEFT JOIN medicao md ON md.cod_pneu=p.cod_pneu AND md.cod_equipamento=ep.cod_equipamento AND md.rn=1
      LEFT JOIN tipo_equip te ON te.cod_equipamento=ep.cod_equipamento AND te.rn=1
      LEFT JOIN reformas r ON r.cod_pneu=p.cod_pneu
      ${TIRE_JOINS}
      ORDER BY p.numero_fogo`,
      {},
      { maxRows: MAX_ROWS },
    );
    assertLimit(tires.rows?.length ?? 0, "pneus em estoque");
    return { pneus: mapPneus(tires.rows as Row[]), consertos: [], atualizadoEm: new Date().toISOString() };
  });
}

async function queryReforma(from: string, to: string, withDiscardCounts: boolean): Promise<PneusData> {
  return withOracle(async (conn) => {
    const binds = { dataInicio: from, dataFim: to };
    const repairs = await conn.execute(REPAIR_SQL, binds, { maxRows: MAX_ROWS });
    assertLimit(repairs.rows?.length ?? 0, "consertos");
    const consertos = mapConsertos(repairs.rows as Row[]);
    const tires = await conn.execute(
      `
      WITH alvo AS (
        SELECT p.cod_pneu, p.numero_fogo, p.cod_medidapneu, p.cod_tipopneu, p.cod_categoriapneu,
          p.cod_marcapneu, p.dt_sucateamento, p.cod_motivosucata, p.cod_causaretpneusucata,
          p.vida_inicial, p.km_hstotal, p.valor_aquisicao
        FROM automotivo.pneu p
        WHERE p.cod_pneu IN (
          SELECT c.cod_pneu FROM automotivo.consertopneu c
          JOIN automotivo.pneu p2 ON p2.cod_pneu=c.cod_pneu
          WHERE (p2.cod_motivosucata<>17 OR p2.cod_motivosucata IS NULL)
            AND c.dtconserto_ini BETWEEN TO_DATE(:dataInicio,'YYYY-MM-DD') AND TO_DATE(:dataFim,'YYYY-MM-DD')
        )
      ), montagem AS (
        SELECT ep.*, ROW_NUMBER() OVER (PARTITION BY ep.cod_pneu
          ORDER BY ep.dtcolocado DESC NULLS LAST, ep.hora_fim_montagem DESC NULLS LAST, ep.sequencia DESC) rn
        FROM automotivo.equip_pneu ep
        WHERE ep.cod_pneu IN (SELECT cod_pneu FROM alvo)
      ), tipo_equip AS (
        SELECT h.cod_equipamento, t.descricaotipoequipamento,
          ROW_NUMBER() OVER (PARTITION BY h.cod_equipamento ORDER BY h.data_inicio DESC NULLS LAST) rn
        FROM automotivo.historico_tipoequipamento h
        LEFT JOIN automotivo.tipoequipamento t ON t.cod_tipoequipamento=h.cod_tipoequipamento
        WHERE h.data_fim IS NULL
          AND h.cod_equipamento IN (SELECT DISTINCT cod_equipamento FROM montagem WHERE rn=1)
      ), reformas AS (
        SELECT c.cod_pneu,
          SUM(CASE WHEN t.reforma='S' AND c.dtconserto_fim IS NOT NULL AND NVL(c.recusado,'N')<>'S' THEN 1 ELSE 0 END) vidas,
          MAX(CASE WHEN c.dtconserto_fim IS NULL AND NVL(c.recusado,'N')<>'S' THEN 1 ELSE 0 END) em_reforma
        FROM automotivo.consertopneu c
        LEFT JOIN automotivo.tipoconsertopneu t ON t.cod_tipoconsertopneu=c.cod_tipoconsertopneu
        WHERE c.cod_pneu IN (SELECT cod_pneu FROM alvo)
        GROUP BY c.cod_pneu
      ), ${CUSTO_MEDIDA_CTE}
      SELECT ${TIRE_COLS},
        COALESCE(ep.sulcocolocado, ep.sulcoretirado) sulco,
        COALESCE(cd.customedio, cm.customedio) custo,
        CAST(NULL AS VARCHAR2(10)) medicao
      FROM alvo p
      LEFT JOIN montagem ep ON ep.cod_pneu=p.cod_pneu AND ep.rn=1
      LEFT JOIN tipo_equip te ON te.cod_equipamento=ep.cod_equipamento AND te.rn=1
      LEFT JOIN reformas r ON r.cod_pneu=p.cod_pneu
      LEFT JOIN custo_descarte cd
        ON cd.cod_medidapneu = p.cod_medidapneu
       AND cd.ano = EXTRACT(YEAR FROM NVL(p.dt_sucateamento, SYSDATE))
      LEFT JOIN custo_medida_recente cm
        ON cm.cod_medidapneu = p.cod_medidapneu
       AND cm.rn = 1
      ${TIRE_JOINS}
      ORDER BY p.numero_fogo`,
      binds,
      { maxRows: MAX_ROWS },
    );
    assertLimit(tires.rows?.length ?? 0, "pneus da ressoldadora");
    let descartesPorMarca: PneusData["descartesPorMarca"];
    if (withDiscardCounts) {
      const counts = await conn.execute(
        `
        SELECT NVL(ma.desc_marcapneu,'Não informado') marca, COUNT(*) quantidade
        FROM automotivo.pneu p
        LEFT JOIN automotivo.marcapneu ma ON ma.cod_marcapneu=p.cod_marcapneu
        WHERE (p.cod_motivosucata<>17 OR p.cod_motivosucata IS NULL)
          AND p.dt_sucateamento BETWEEN TO_DATE(:dataInicio,'YYYY-MM-DD') AND TO_DATE(:dataFim,'YYYY-MM-DD')
        GROUP BY NVL(ma.desc_marcapneu,'Não informado')`,
        binds,
      );
      descartesPorMarca = ((counts.rows as Row[]) ?? []).map((r) => ({
        marca: label(r, "marca"),
        quantidade: num(r, "quantidade") ?? 0,
      }));
    }
    return {
      pneus: mapPneus(tires.rows as Row[]),
      consertos,
      atualizadoEm: new Date().toISOString(),
      descartesPorMarca,
    };
  });
}

export async function gerarControlePneus(opts: PneusConsulta = {}): Promise<PneusData> {
  const view: PneusView = isPneusView(opts.view) ? opts.view : "descarte";
  const { dataInicio, dataFim } = period(opts.from, opts.to);
  if (view === "estoque") return queryEstoque();
  if (view === "reforma") return queryReforma(dataInicio, dataFim, true);
  if (view === "detalheReforma") return queryReforma(dataInicio, dataFim, false);
  return queryDescarte(dataInicio, dataFim);
}
