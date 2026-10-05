import { oracleNumber, oracleText, runLimited, withOracle } from "../oracle.js";
import type {
  LubrificacaoComponenteVencimento,
  LubrificacaoDashboardData,
  LubrificacaoEventoDia,
  LubrificacaoFrotaItem,
  LubrificacaoHoraDia,
  LubrificacaoPontoPlano,
  LubrificacaoRealizadoMes,
} from "../../src/lib/lubrificacao.js";
import {
  lubrificacaoHorasRestantes,
  lubrificacaoStatusPonto,
  ordenarVencimentosLubrificacao,
  resumoVencimentosLubrificacao,
} from "../../src/lib/lubrificacao.js";

/** Sistema de graxa das colhedoras (pontos 24h / 50h / 250h). */
const SISTEMA_GRAXA = 48;
const SERVICO_LUBRIFICACAO = 40;
const TIPO_COLHEDORA = 81;
const ALERTA_PCT = 0.9;

function codGrupoEmpresa() {
  return Number(process.env.COD_GRUPOEMPRESA || 1);
}

function isoDate(v: unknown) {
  if (v == null) return null;
  if (v instanceof Date && Number.isFinite(v.getTime())) return v.toISOString().slice(0, 10);
  const s = String(v);
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : s.slice(0, 10) || null;
}

function sqlColhedorasLub() {
  return `SELECT DISTINCT e.cod_equipamento,
                e.descricao,
                e.km_atual
           FROM automotivo.equipamento e
           JOIN automotivo.historico_tipoequipamento ht
             ON ht.cod_equipamento = e.cod_equipamento
            AND ht.data_fim IS NULL
            AND ht.cod_tipoequipamento = ${TIPO_COLHEDORA}
           JOIN automotivo.equipcomponente ec
             ON ec.cod_equipamento = e.cod_equipamento
            AND ec.cod_grupoempresa = e.cod_grupoempresa
            AND ec.cod_sistema = ${SISTEMA_GRAXA}
            AND NVL(ec.limite_hstrabalhada, 0) > 0
          WHERE e.cod_grupoempresa = :codGrupo
            AND NVL(e.ativo, 'S') = 'S'
            AND e.disponibilidade IS NOT NULL
            AND NVL(e.agregado, 'N') <> 'S'`;
}

async function loadFrota(): Promise<LubrificacaoFrotaItem[]> {
  return withOracle(async (conn) => {
    const result = await conn.execute(`${sqlColhedorasLub()} ORDER BY e.cod_equipamento`, {
      codGrupo: codGrupoEmpresa(),
    });
    return ((result.rows ?? []) as Record<string, unknown>[]).map((row) => ({
      codEquipamento: oracleNumber(row, "cod_equipamento", "COD_EQUIPAMENTO")!,
      descricao: oracleText(row, "descricao", "DESCRICAO"),
    }));
  });
}

async function loadPontos(): Promise<LubrificacaoPontoPlano[]> {
  return withOracle(async (conn) => {
    const result = await conn.execute(
      `WITH colhedoras AS (${sqlColhedorasLub()})
       SELECT ec.cod_equipamento,
              ec.limite_hstrabalhada
         FROM automotivo.equipcomponente ec
         JOIN colhedoras c ON c.cod_equipamento = ec.cod_equipamento
        WHERE ec.cod_sistema = ${SISTEMA_GRAXA}
          AND NVL(ec.limite_hstrabalhada, 0) > 0
        ORDER BY ec.cod_equipamento, ec.limite_hstrabalhada`,
      { codGrupo: codGrupoEmpresa() },
    );
    const out: LubrificacaoPontoPlano[] = [];
    for (const row of (result.rows ?? []) as Record<string, unknown>[]) {
      const cod = oracleNumber(row, "cod_equipamento", "COD_EQUIPAMENTO");
      const limiteHs = oracleNumber(row, "limite_hstrabalhada", "LIMITE_HSTRABALHADA");
      if (cod == null || limiteHs == null || !(limiteHs > 0)) continue;
      out.push({ codEquipamento: cod, limiteHs });
    }
    return out;
  });
}

async function loadHoras(ano: number): Promise<LubrificacaoHoraDia[]> {
  return withOracle(async (conn) => {
    const result = await conn.execute(
      `WITH colhedoras AS (${sqlColhedorasLub()})
       SELECT a.cod_equipamento,
              TO_CHAR(TRUNC(a.data_abastecimento), 'YYYY-MM-DD') AS dia,
              SUM(NVL(a.kmhs_rodados, 0)) AS horas
         FROM (
                SELECT ab.cod_equipamento,
                       ab.dtabastecimento AS data_abastecimento,
                       ab.kmhs_rodados
                  FROM automotivo.abastecimento ab
                 WHERE ab.dtabastecimento IS NOT NULL
                   AND TRUNC(ab.dtabastecimento) BETWEEN TO_DATE(:inicio, 'YYYY-MM-DD') AND TO_DATE(:fim, 'YYYY-MM-DD')
                UNION ALL
                SELECT pb.cod_equipamento,
                       pb.data AS data_abastecimento,
                       pb.kmhs_rodados
                  FROM posto.abastecimento pb
                 WHERE pb.data IS NOT NULL
                   AND TRUNC(pb.data) BETWEEN TO_DATE(:inicio, 'YYYY-MM-DD') AND TO_DATE(:fim, 'YYYY-MM-DD')
              ) a
         JOIN colhedoras c ON c.cod_equipamento = a.cod_equipamento
        WHERE NVL(a.kmhs_rodados, 0) > 0
        GROUP BY a.cod_equipamento, TRUNC(a.data_abastecimento)
        ORDER BY 1, 2`,
      {
        codGrupo: codGrupoEmpresa(),
        inicio: `${ano - 1}-01-01`,
        fim: `${ano + 1}-03-31`,
      },
    );
    const out: LubrificacaoHoraDia[] = [];
    for (const row of (result.rows ?? []) as Record<string, unknown>[]) {
      const cod = oracleNumber(row, "cod_equipamento", "COD_EQUIPAMENTO");
      const data = isoDate(row.dia ?? row.DIA);
      const horas = oracleNumber(row, "horas", "HORAS") ?? 0;
      if (cod == null || !data || !(horas > 0)) continue;
      out.push({ codEquipamento: cod, data, horas });
    }
    return out;
  });
}

async function loadEventos(ano: number): Promise<LubrificacaoEventoDia[]> {
  return withOracle(async (conn) => {
    const result = await conn.execute(
      `WITH colhedoras AS (${sqlColhedorasLub()})
       SELECT h.cod_equipamento,
              TO_CHAR(TRUNC(h.dt_lubrificacao), 'YYYY-MM-DD') AS dia,
              COUNT(*) AS quantidade
         FROM automotivo.histlubrificacao h
         JOIN colhedoras c ON c.cod_equipamento = h.cod_equipamento
        WHERE h.dt_lubrificacao IS NOT NULL
          AND h.cod_sistema = ${SISTEMA_GRAXA}
          AND TRUNC(h.dt_lubrificacao) BETWEEN TO_DATE(:inicio, 'YYYY-MM-DD') AND TO_DATE(:fim, 'YYYY-MM-DD')
        GROUP BY h.cod_equipamento, TRUNC(h.dt_lubrificacao)
        ORDER BY 1, 2`,
      {
        codGrupo: codGrupoEmpresa(),
        inicio: `${ano - 1}-01-01`,
        fim: `${ano + 1}-03-31`,
      },
    );

    const out: LubrificacaoEventoDia[] = [];
    for (const row of (result.rows ?? []) as Record<string, unknown>[]) {
      const cod = oracleNumber(row, "cod_equipamento", "COD_EQUIPAMENTO");
      const data = isoDate(row.dia ?? row.DIA);
      if (cod == null || !data) continue;
      out.push({
        codEquipamento: cod,
        data,
        quantidade: oracleNumber(row, "quantidade", "QUANTIDADE") ?? 1,
      });
    }
    return out;
  });
}

function janelaConsultaAno(ano: number) {
  return { inicio: `${ano - 1}-01-01`, fim: `${ano + 1}-03-31` };
}

function chaveRealizado(cod: number, comp: number, mes: string) {
  return `${cod}:${comp}:${mes}`;
}

async function loadHistPorMes(ano: number) {
  const { inicio, fim } = janelaConsultaAno(ano);
  try {
    return await withOracle(async (conn) => {
      const result = await conn.execute(
        `WITH colhedoras AS (${sqlColhedorasLub()})
         SELECT h.cod_equipamento,
                h.cod_componente,
                TO_CHAR(TRUNC(h.dt_lubrificacao), 'YYYY-MM') AS mes,
                COUNT(*) AS qtd,
                SUM(NVL(h.qtde_lubrificante, 0)) AS litros
           FROM automotivo.histlubrificacao h
           JOIN colhedoras c ON c.cod_equipamento = h.cod_equipamento
          WHERE h.dt_lubrificacao IS NOT NULL
            AND h.cod_sistema = ${SISTEMA_GRAXA}
            AND TRUNC(h.dt_lubrificacao) BETWEEN TO_DATE(:inicio, 'YYYY-MM-DD') AND TO_DATE(:fim, 'YYYY-MM-DD')
          GROUP BY h.cod_equipamento, h.cod_componente, TO_CHAR(TRUNC(h.dt_lubrificacao), 'YYYY-MM')`,
        { codGrupo: codGrupoEmpresa(), inicio, fim },
      );
      const map = new Map<string, { qtd: number; litros: number }>();
      for (const row of (result.rows ?? []) as Record<string, unknown>[]) {
        const cod = oracleNumber(row, "cod_equipamento", "COD_EQUIPAMENTO");
        const comp = oracleNumber(row, "cod_componente", "COD_COMPONENTE");
        const mes = oracleText(row, "mes", "MES");
        if (cod == null || comp == null || !mes) continue;
        map.set(chaveRealizado(cod, comp, mes), {
          qtd: oracleNumber(row, "qtd", "QTD") ?? 0,
          litros: oracleNumber(row, "litros", "LITROS") ?? 0,
        });
      }
      return map;
    });
  } catch {
    return new Map<string, { qtd: number; litros: number }>();
  }
}

async function loadOsPorMes(ano: number) {
  const { inicio, fim } = janelaConsultaAno(ano);
  try {
    return await withOracle(async (conn) => {
      const result = await conn.execute(
        `WITH colhedoras AS (${sqlColhedorasLub()})
         SELECT b.cod_equipamento,
                a.cod_componente,
                TO_CHAR(TRUNC(NVL(a.data, b.dtabertura)), 'YYYY-MM') AS mes,
                COUNT(*) AS qtd
           FROM automotivo.itens_ordemservico a
           JOIN automotivo.ordemservico b
             ON a.ano_ordemservico = b.ano_ordemservico
            AND a.numero_ordemservico = b.numero_ordemservico
           JOIN colhedoras c ON c.cod_equipamento = b.cod_equipamento
          WHERE a.cod_servicobis = ${SERVICO_LUBRIFICACAO}
            AND a.cod_sistema = ${SISTEMA_GRAXA}
            AND NVL(a.data, b.dtabertura) IS NOT NULL
            AND TRUNC(NVL(a.data, b.dtabertura)) BETWEEN TO_DATE(:inicio, 'YYYY-MM-DD') AND TO_DATE(:fim, 'YYYY-MM-DD')
          GROUP BY b.cod_equipamento, a.cod_componente, TO_CHAR(TRUNC(NVL(a.data, b.dtabertura)), 'YYYY-MM')`,
        { codGrupo: codGrupoEmpresa(), inicio, fim },
      );
      const map = new Map<string, number>();
      for (const row of (result.rows ?? []) as Record<string, unknown>[]) {
        const cod = oracleNumber(row, "cod_equipamento", "COD_EQUIPAMENTO");
        const comp = oracleNumber(row, "cod_componente", "COD_COMPONENTE");
        const mes = oracleText(row, "mes", "MES");
        if (cod == null || comp == null || !mes) continue;
        map.set(chaveRealizado(cod, comp, mes), oracleNumber(row, "qtd", "QTD") ?? 0);
      }
      return map;
    });
  } catch {
    return new Map<string, number>();
  }
}

async function loadRealizadosPorMes(ano: number): Promise<LubrificacaoRealizadoMes[]> {
  const [hist, os] = await Promise.all([loadHistPorMes(ano), loadOsPorMes(ano)]);
  const keys = new Set([...hist.keys(), ...os.keys()]);
  const out: LubrificacaoRealizadoMes[] = [];
  for (const key of keys) {
    const h = hist.get(key);
    const qtd = h?.qtd || os.get(key) || 0;
    const litros = h?.litros ?? 0;
    if (!(qtd > 0) && !(litros > 0)) continue;
    const [codEquipamento, codComponente, mes] = key.split(":");
    const equip = Number(codEquipamento);
    const comp = Number(codComponente);
    if (!Number.isFinite(equip) || !Number.isFinite(comp) || !mes) continue;
    out.push({ codEquipamento: equip, codComponente: comp, mes, qtd, litros });
  }
  return out;
}

async function loadVencimentos(): Promise<LubrificacaoComponenteVencimento[]> {
  const rows = await withOracle(async (conn) => {
    const result = await conn.execute(
      `WITH colhedoras AS (${sqlColhedorasLub()}),
       ult AS (
         SELECT b.cod_equipamento,
                a.cod_sistema,
                a.cod_componente,
                MAX(b.km_atual) KEEP (DENSE_RANK LAST ORDER BY NVL(a.data, b.dtabertura), NVL(b.km_atual, 0)) AS km_na_troca,
                MAX(NVL(a.data, b.dtabertura)) KEEP (DENSE_RANK LAST ORDER BY NVL(a.data, b.dtabertura), NVL(b.km_atual, 0)) AS dt_ultima
           FROM automotivo.itens_ordemservico a
           JOIN automotivo.ordemservico b
             ON a.ano_ordemservico = b.ano_ordemservico
            AND a.numero_ordemservico = b.numero_ordemservico
           JOIN colhedoras c ON c.cod_equipamento = b.cod_equipamento
          WHERE a.cod_servicobis = ${SERVICO_LUBRIFICACAO}
            AND a.cod_sistema = ${SISTEMA_GRAXA}
          GROUP BY b.cod_equipamento, a.cod_sistema, a.cod_componente
       )
       SELECT c.cod_equipamento,
              c.descricao,
              c.km_atual,
              ec.cod_componente,
              cp.descricao AS componente_descricao,
              ec.limite_hstrabalhada,
              u.km_na_troca,
              TO_CHAR(u.dt_ultima, 'YYYY-MM-DD') AS dt_ultima
         FROM automotivo.equipcomponente ec
         JOIN colhedoras c ON c.cod_equipamento = ec.cod_equipamento
         LEFT JOIN automotivo.componentes cp
           ON cp.cod_sistema = ec.cod_sistema
          AND cp.cod_componente = ec.cod_componente
         LEFT JOIN ult u
           ON u.cod_equipamento = ec.cod_equipamento
          AND u.cod_sistema = ec.cod_sistema
          AND u.cod_componente = ec.cod_componente
        WHERE ec.cod_sistema = ${SISTEMA_GRAXA}
          AND NVL(ec.limite_hstrabalhada, 0) > 0
        ORDER BY c.cod_equipamento, ec.cod_componente`,
      { codGrupo: codGrupoEmpresa() },
    );
    return (result.rows ?? []) as Record<string, unknown>[];
  });

  const itens: LubrificacaoComponenteVencimento[] = [];
  for (const row of rows) {
    const codEquipamento = oracleNumber(row, "cod_equipamento", "COD_EQUIPAMENTO");
    const codComponente = oracleNumber(row, "cod_componente", "COD_COMPONENTE");
    if (codEquipamento == null || codComponente == null) continue;
    const horasAtuais = oracleNumber(row, "km_atual", "KM_ATUAL");
    const horasNaUltima = oracleNumber(row, "km_na_troca", "KM_NA_TROCA");
    const limiteHs = oracleNumber(row, "limite_hstrabalhada", "LIMITE_HSTRABALHADA");
    const horasRodadas =
      horasAtuais != null && horasNaUltima != null ? Math.max(0, horasAtuais - horasNaUltima) : null;
    itens.push({
      codEquipamento,
      descricao: oracleText(row, "descricao", "DESCRICAO"),
      codComponente,
      componenteDescricao: oracleText(row, "componente_descricao", "COMPONENTE_DESCRICAO"),
      limiteHs,
      horasAtuais,
      horasNaUltima,
      horasRodadas,
      horasRestantes: lubrificacaoHorasRestantes(horasRodadas, limiteHs),
      dataUltima: isoDate(row.dt_ultima ?? row.DT_ULTIMA),
      qtdRealizada: 0,
      litrosRealizados: null,
      status: lubrificacaoStatusPonto(horasRodadas, limiteHs, ALERTA_PCT),
    });
  }
  return ordenarVencimentosLubrificacao(itens);
}

export async function gerarIndicadoresLubrificacao(params: {
  ano?: number | null;
}): Promise<LubrificacaoDashboardData> {
  const ano = params.ano ?? new Date().getFullYear();
  const [frota, eventos, pontos, horas, vencimentos, realizados] = await runLimited(
    [
      () => loadFrota(),
      () => loadEventos(ano),
      () => loadPontos(),
      () => loadHoras(ano),
      () => loadVencimentos(),
      () => loadRealizadosPorMes(ano),
    ],
    3,
  );

  return {
    atualizadoEm: new Date().toISOString(),
    ano,
    frota,
    eventos,
    pontos,
    horas,
    status: resumoVencimentosLubrificacao(vencimentos),
    vencimentos,
    realizados,
  };
}
