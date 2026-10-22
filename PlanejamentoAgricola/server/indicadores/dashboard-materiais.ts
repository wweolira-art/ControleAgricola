import { oracleNumber, oracleText, withOracle } from "../oracle.js";

export const SITUACOES_SOLICITACAO = [
  "Entregue",
  "Cancelada",
  "Aguardando aprovação",
  "Aguardando Pagamento",
  "Aguardando entrega",
  "Sem cotação",
  "Em cotação",
  "Em negociação",
] as const;

export type SituacaoSolicitacao = (typeof SITUACOES_SOLICITACAO)[number];

export type DashboardMateriaisFiltros = {
  dataInicio?: string | null;
  dataFim?: string | null;
  solicitantes?: string[];
  situacoes?: string[];
  gruposOperacionais?: string[];
  gruposMaterial?: string[];
  tiposSolicitacao?: string[];
  fornecedores?: string[];
};

export type DashboardMateriaisData = {
  atualizadoEm: string;
  filtros: {
    dataInicio: string;
    dataFim: string;
    solicitantes: string[];
    situacoes: string[];
    gruposOperacionais: string[];
    gruposMaterial: string[];
    tiposSolicitacao: string[];
    fornecedores: string[];
  };
  opcoes: {
    solicitantes: string[];
    situacoes: string[];
    gruposOperacionais: string[];
    gruposMaterial: string[];
    tiposSolicitacao: string[];
    fornecedores: string[];
  };
  kpis: {
    valorEstimado: number;
    atendidas: number;
    pctAtendidas: number | null;
    naoAtendidas: number;
    pctNaoAtendidas: number | null;
    leadTimeGeral: number | null;
  };
  porSituacao: Array<{ situacao: string; quantidade: number }>;
  avaliacaoEntrega: Array<{ aval: string; quantidade: number }>;
  leadTimeOc: number | null;
  leadTimeEntrega: number | null;
  porCategoria: Array<{ categoria: string; entregues: number; naoAtendidas: number; pct: number | null }>;
  entregasSemana: Array<{ dia: string; quantidade: number }>;
  porGrupoMaterial: Array<{ grupo: string; valor: number }>;
};

export type AcompanhamentoPedidoData = {
  atualizadoEm: string;
  filtros: DashboardMateriaisData["filtros"] & { busca: string };
  opcoes: DashboardMateriaisData["opcoes"];
  pedidos: Array<{
    data: string | null;
    nrSolicitacao: string | null;
    nroc: string | null;
    codMaterial: number | null;
    descricao: string;
    qtde: number;
    qtdeEntregue: number;
    preco: number | null;
    valor: number;
    situacao: string;
    tempoTotal: number | null;
    previsaoEntrega: string | null;
    dataEntrega: string | null;
    aval: string | null;
    observacao: string | null;
    codFornecedor: number | null;
    fornecedor: string;
  }>;
};

type Linha = {
  data: string | null;
  nrSolicitacao: string | null;
  nroc: string | null;
  codMaterial: number | null;
  descricao: string;
  qtde: number;
  preco: number | null;
  valor: number;
  situacao: string;
  aval: string | null;
  categoria: string;
  grupoMaterial: string;
  grupoChave: string;
  tipoSolicitacao: string;
  solicitante: string;
  fornecedor: string;
  leadOc: number | null;
  leadEntrega: number | null;
  leadGeral: number | null;
  dataEntrada: string | null;
  qtdeEntregue: number;
  previsaoEntrega: string | null;
  tempoTotal: number | null;
  observacao: string | null;
  codFornecedor: number | null;
};

function money(n: number) {
  return Math.round((n || 0) * 100) / 100;
}

function qty(n: number) {
  return Math.round((n || 0) * 1000) / 1000;
}

function isoToday() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function defaultInicio(fim: string) {
  const year = Number(fim.slice(0, 4));
  const month = Number(fim.slice(5, 7));
  const startYear = month > 3 || (month === 3 && Number(fim.slice(8, 10)) >= 21) ? year : year - 1;
  return `${startYear}-03-21`;
}

function uniqueSorted(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function avg(values: number[]) {
  if (!values.length) return null;
  return Math.round(values.reduce((acc, value) => acc + value, 0) / values.length);
}

function pct(part: number, total: number) {
  if (!(total > 0)) return null;
  return Math.round((part / total) * 100);
}

function weekdayLabel(iso: string) {
  const date = new Date(`${iso}T12:00:00`);
  const dias = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}-${dias[date.getDay()]}`;
}

function weekDays(fim: string) {
  const end = new Date(`${fim}T12:00:00`);
  const mondayOffset = (end.getDay() + 6) % 7;
  const start = new Date(end);
  start.setDate(end.getDate() - mondayOffset);
  const days: string[] = [];
  for (let i = 0; i < 7; i += 1) {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    const pad = (n: number) => String(n).padStart(2, "0");
    const iso = `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
    if (iso > fim) break;
    days.push(iso);
  }
  return days;
}

function mapRow(raw: Record<string, unknown>): Linha {
  return {
    data: oracleText(raw, "data_solicitacao", "DATA_SOLICITACAO"),
    nrSolicitacao: oracleText(raw, "nr_solicitacao", "NR_SOLICITACAO") || null,
    nroc: oracleText(raw, "nroc", "NROC") || null,
    codMaterial: oracleNumber(raw, "cod_material", "COD_MATERIAL"),
    descricao: oracleText(raw, "descricao", "DESCRICAO") || "Material",
    qtde: qty(oracleNumber(raw, "qtde", "QTDE") ?? 0),
    preco: oracleNumber(raw, "preco", "PRECO"),
    valor: money(oracleNumber(raw, "valor", "VALOR") ?? 0),
    situacao: oracleText(raw, "situacao_nome", "SITUACAO_NOME") || "Sem cotação",
    aval: oracleText(raw, "aval", "AVAL") || null,
    categoria: oracleText(raw, "categoria", "CATEGORIA") || "Sem categoria",
    grupoMaterial: oracleText(raw, "grupo_material", "GRUPO_MATERIAL") || "Sem grupo",
    grupoChave: chaveGrupo(
      oracleNumber(raw, "cod_familia", "COD_FAMILIA"),
      oracleNumber(raw, "cod_grupomaterial", "COD_GRUPOMATERIAL"),
    ),
    tipoSolicitacao: oracleText(raw, "tipo_solicitacao", "TIPO_SOLICITACAO") || "Compra",
    solicitante: oracleText(raw, "solicitante", "SOLICITANTE") || "Sem solicitante",
    fornecedor: oracleText(raw, "fornecedor", "FORNECEDOR") || "Sem fornecedor",
    leadOc: oracleNumber(raw, "lead_oc", "LEAD_OC"),
    leadEntrega: oracleNumber(raw, "lead_entrega", "LEAD_ENTREGA"),
    leadGeral: oracleNumber(raw, "lead_geral", "LEAD_GERAL"),
    dataEntrada: oracleText(raw, "data_entrada", "DATA_ENTRADA"),
    qtdeEntregue: qty(oracleNumber(raw, "qtde_entregue", "QTDE_ENTREGUE") ?? 0),
    previsaoEntrega: oracleText(raw, "previsao_entrega", "PREVISAO_ENTREGA") || null,
    tempoTotal: (() => {
      const valor = oracleNumber(raw, "tempo_total", "TEMPO_TOTAL");
      return valor == null ? null : Math.max(0, valor);
    })(),
    observacao: oracleText(raw, "observacao", "OBSERVACAO") || null,
    codFornecedor: oracleNumber(raw, "cod_fornecedor", "COD_FORNECEDOR"),
  };
}

function aplicaFiltros(linhas: Linha[], filtros: DashboardMateriaisFiltros, chavesGrupo: Set<string> | null) {
  const has = (selected: string[] | undefined, value: string) => !selected?.length || selected.includes(value);
  return linhas.filter(
    (row) =>
      has(filtros.solicitantes, row.solicitante) &&
      has(filtros.situacoes, row.situacao) &&
      has(filtros.gruposOperacionais, row.categoria) &&
      (chavesGrupo == null || chavesGrupo.has(row.grupoChave)) &&
      has(filtros.tiposSolicitacao, row.tipoSolicitacao) &&
      has(filtros.fornecedores, row.fornecedor),
  );
}

type GrupoParametro = { tipo: string; chave: string };

const GRUPOS_MATERIAL = [
  "Combustível",
  "Lubrificante",
  "Pneu",
  "Servico",
  "Filtro",
  "Graxa",
  "Aditivo",
  "Peças e Acessórios",
] as const;

const TIPOS_SOLICITACAO = ["Aplicação direta", "Compra", "Estoque", "Serviço"] as const;

function chaveGrupo(familia: number | null, grupo: number | null) {
  if (familia == null || grupo == null) return "";
  return `${familia}-${grupo}`;
}

function tiposGrupoMaterial(catalogo: GrupoParametro[]) {
  const presentes = new Set(catalogo.map((item) => item.tipo));
  return GRUPOS_MATERIAL.filter((tipo) => presentes.has(tipo));
}

/** Tipos de grupo material: parametros_familia e, no restante, Peças e Acessórios. */
export async function listarGruposMaterialDashboard(): Promise<string[]> {
  return tiposGrupoMaterial(await carregarCatalogoGruposMaterial());
}

export async function listarOpcoesDashboardMateriais(filtros: {
  dataInicio?: string | null;
  dataFim?: string | null;
}): Promise<DashboardMateriaisData["opcoes"]> {
  const dataFim = filtros.dataFim?.trim() || isoToday();
  const dataInicio = filtros.dataInicio?.trim() || defaultInicio(dataFim);
  const cacheKey = `${dataInicio}:${dataFim}`;
  const cached = opcoesDashboardCache.get(cacheKey);
  if (cached && cached.expiraEm > Date.now()) return cached.valor;
  const [gruposMaterial, listas] = await Promise.all([
    listarGruposMaterialDashboard(),
    carregarListasFiltroPeriodo(dataInicio, dataFim),
  ]);
  const valor = {
    solicitantes: listas.solicitantes,
    situacoes: [...SITUACOES_SOLICITACAO],
    gruposOperacionais: listas.gruposOperacionais,
    gruposMaterial,
    tiposSolicitacao: uniqueSorted([...TIPOS_SOLICITACAO]),
    fornecedores: listas.fornecedores,
  };
  opcoesDashboardCache.set(cacheKey, { expiraEm: Date.now() + 10 * 60 * 1000, valor });
  if (opcoesDashboardCache.size > 24) {
    for (const [key, item] of opcoesDashboardCache) if (item.expiraEm <= Date.now()) opcoesDashboardCache.delete(key);
  }
  return valor;
}

const opcoesDashboardCache = new Map<string, { expiraEm: number; valor: DashboardMateriaisData["opcoes"] }>();

const OBJETOS_CUSTO_SQL = [
  82, 83, 95, 416, 417, 349, 96, 99, 282, 102, 103, 104, 106, 107, 108, 140, 141, 113, 114, 115, 116, 117, 181, 118, 119,
  128, 129, 132, 135, 137, 139,
].join(", ");

/** Agrupamento operacional homologado por objeto de custo. */
function grupoOperacionalSql(campo: string) {
  return `CASE ${campo}
    WHEN 104 THEN 'CAMINHÕES'
    WHEN 103 THEN 'CAMINHÕES'
    WHEN 140 THEN 'IMPLEMENTOS RODOVIÁRIOS'
    WHEN 102 THEN 'AUTOMÓVIEIS E UTILITÁRIOS'
    WHEN 115 THEN 'TRATORES'
    WHEN 181 THEN 'TRATORES'
    WHEN 114 THEN 'TRATORES'
    WHEN 116 THEN 'TRATORES'
    WHEN 117 THEN 'TRATORES'
    WHEN 128 THEN 'PIVOT LINEAR'
    WHEN 118 THEN 'IMPLEMENTOS AGRÍCOLAS'
    WHEN 119 THEN 'COLHEDEIRAS'
    WHEN 113 THEN 'CARREGADEIRAS DE CANA'
    WHEN 139 THEN 'ELETROBOMBAS'
    WHEN 135 THEN 'ASPERSOR'
    WHEN 108 THEN 'TRANSBORDO'
    WHEN 82 THEN 'TRANSBORDO'
    WHEN 141 THEN 'MOTOCICLETA'
    WHEN 129 THEN 'HIDRO HOLL'
    WHEN 83 THEN 'HIDRO HOLL'
    WHEN 132 THEN 'CASA DAS BOMBAS'
    WHEN 137 THEN 'MOTOR BOMBA'
    WHEN 416 THEN 'OFICINA ELÉTRICA AUTOMOTIVA'
    WHEN 417 THEN 'CALDEIRARIA AUTOMOTIVA'
    WHEN 349 THEN 'SERRALHARIA AUTOMOTIVA'
    WHEN 96 THEN 'BORRACHARIA'
    WHEN 99 THEN 'COMBOIO'
    WHEN 282 THEN 'OFICINA ELÉTRICA ALTA TENSÃO'
    WHEN 95 THEN 'OFICINA MECÂNICA'
    WHEN 106 THEN 'CAMINHÃO CANAVIEIRO'
    WHEN 107 THEN 'REBOQUE'
    ELSE NVL(obj.descricao, 'Sem categoria')
  END`;
}

async function carregarLinhas(dataInicio: string, dataFim: string): Promise<Linha[]> {
  return withOracle(async (conn) => {
    const result = await conn.execute(
      `WITH        tipo AS (
         SELECT cod_equipamento, categoria
           FROM (
             SELECT h.cod_equipamento,
                    t.descricaotipoequipamento AS categoria,
                    ROW_NUMBER() OVER (
                      PARTITION BY h.cod_equipamento
                      ORDER BY h.data_inicio DESC NULLS LAST
                    ) AS rn
               FROM automotivo.historico_tipoequipamento h
               JOIN automotivo.tipoequipamento t ON t.cod_tipoequipamento = h.cod_tipoequipamento
              WHERE h.data_fim IS NULL
           )
          WHERE rn = 1
       ),
       cotacaoSolicitacao AS (
         SELECT nr_solicitacao
           FROM material.cotacaoxsolicitacao
          GROUP BY nr_solicitacao
       ),
       negociacao AS (
         SELECT nr_solicitacao
           FROM material.resultadocotacaoitem
          WHERE nr_calculo > 0
          GROUP BY nr_solicitacao
       ),
       aguardandoaprovacao AS (
         SELECT nr_solicitacao
           FROM material.resultadocotacaoitem
          WHERE nr_calculo > 0
            AND situacao = 'L'
          GROUP BY nr_solicitacao
       ),
       situacaoCotacao AS (
         SELECT a.nr_solicitacao,
                CASE
                  WHEN c.nr_solicitacao IS NOT NULL THEN 'L'
                  WHEN b.nr_solicitacao IS NOT NULL THEN 'N'
                  WHEN a.nr_solicitacao IS NULL AND c.nr_solicitacao IS NULL THEN NULL
                  ELSE 'C'
                END AS situacaocotacao
           FROM cotacaoSolicitacao a
           LEFT JOIN negociacao b ON a.nr_solicitacao = b.nr_solicitacao
           LEFT JOIN aguardandoaprovacao c ON a.nr_solicitacao = c.nr_solicitacao
       ),
       base AS (
         SELECT a.nr_solicitacao,
                TRUNC(a.data) AS data_solicitacao,
                a.cod_funcionario,
                a.cod_material,
                a.cod_objetocusto,
                a.cod_equipamento,
                NVL(a.cod_familia, mat_base.cod_familia) AS cod_familia,
                NVL(a.cod_grupomaterial, mat_base.cod_grupomaterial) AS cod_grupomaterial,
                a.observacao,
                NVL(a.qtdesolicitada, 0) AS qtde,
                NVL(a.sugestao_preco, 0) AS sugestao_preco,
                a.situacao AS situacao_cod,
                NVL(a.solicitacaoaprovada, 'F') AS aprovada,
                NVL(a.servico, 'F') AS servico,
                NVL(a.aplicacaodireta, 'F') AS aplicacao_direta,
                NVL(a.compra_aplicacaodireta, 'F') AS compra_aplicacao,
                NVL(a.estoque, 'F') AS estoque,
                TRUNC(a.datautilizacaoprevista) AS data_prevista_uso,
                ent.qtde_entregue,
                ent.vlrunitarionf,
                ent.valor_nf,
                ent.dataentrada_seq,
                b.nroc,
                b.preco,
                b.valortotal_pend,
                f.situacaocotacao,
                oc.dataoc,
                pgto.datapgto,
                ant.antecipado,
                prev.dataprevistaentrega,
                oc.cod_fornecedor
           FROM material.solicitacaocompra a
           LEFT JOIN material.material mat_base ON mat_base.cod_material = a.cod_material
           LEFT JOIN (
             SELECT nr_solicitacao,
                    cod_material,
                    MAX(nroc) AS nroc,
                    MAX(preco) AS preco,
                    MAX(valortotal_pend) AS valortotal_pend
               FROM material.itensordemcompra
              GROUP BY nr_solicitacao, cod_material
           ) b ON a.nr_solicitacao = b.nr_solicitacao
              AND a.cod_material = b.cod_material
           LEFT JOIN (
             SELECT nroc, antecipado
               FROM material.ordemcomprapagamento
              WHERE parcela = 1
                AND antecipado = 'S'
              GROUP BY nroc, antecipado
           ) ant ON ant.nroc = b.nroc
           LEFT JOIN situacaoCotacao f ON a.nr_solicitacao = f.nr_solicitacao
           LEFT JOIN (
             SELECT nr_solicitacao,
                    cod_material,
                    SUM(quantidade) AS qtde_entregue,
                    SUM(valortotal) AS valor_nf,
                    MAX(dataentrada_seq) AS dataentrada_seq,
                    MAX(nrnf) AS nrnf,
                    MAX(valorunitario) AS vlrunitarionf
               FROM material.itensentrada
              WHERE nroc IS NOT NULL
              GROUP BY nr_solicitacao, cod_material
           ) ent ON a.nr_solicitacao = ent.nr_solicitacao
             AND a.cod_material = ent.cod_material
           LEFT JOIN (
             SELECT nr_solicitacao,
                    MAX(
                      CASE
                        WHEN diasparaentrega IS NULL OR diasparaentrega = 0 THEN dataprevistaentrega
                        ELSE dataoc + diasparaentrega
                      END
                    ) AS dataprevistaentrega
               FROM (
                 SELECT e.nr_solicitacao,
                        e.diasparaentrega,
                        e.dataprevistaentrega,
                        o.dataoc
                   FROM material.itensordemcompraentrega e
                   LEFT JOIN material.ordemcompra o ON e.nroc = o.nroc
                  WHERE e.sequencia = 1
               )
              GROUP BY nr_solicitacao
           ) prev ON a.nr_solicitacao = prev.nr_solicitacao
           LEFT JOIN material.ordemcompra oc ON b.nroc = oc.nroc
           LEFT JOIN (
             SELECT documento, MAX(datapgto) AS datapgto
               FROM financeiro.parcelascontaspagar
              WHERE origem = 11
              GROUP BY documento
           ) pgto ON pgto.documento = oc.nroc
          WHERE a.cod_almoxarifado = 2
            AND a.data IS NOT NULL
            -- Regra da página Dashboard do Power BI: não considerar família 1.
            AND NVL(NVL(a.cod_familia, mat_base.cod_familia), -1) <> 1
            AND EXTRACT(YEAR FROM a.data) >= EXTRACT(YEAR FROM SYSDATE) - 4
            AND a.cod_objetocusto IN (${OBJETOS_CUSTO_SQL})
            AND TRUNC(a.data) >= TO_DATE(:dataInicio, 'YYYY-MM-DD')
            AND TRUNC(a.data) <= TO_DATE(:dataFim, 'YYYY-MM-DD')
       )
       SELECT TO_CHAR(sc.data_solicitacao, 'YYYY-MM-DD') AS data_solicitacao,
              TO_CHAR(sc.nr_solicitacao) AS nr_solicitacao,
              TO_CHAR(sc.nroc) AS nroc,
              sc.observacao,
              sc.cod_fornecedor,
              sc.cod_familia,
              sc.cod_grupomaterial,
              sc.cod_material,
              NVL(m.descricao, 'Material ' || sc.cod_material) AS descricao,
              sc.qtde,
              NVL(sc.qtde_entregue, 0) AS qtde_entregue,
              -- O Power BI usa o valor realizado quando há entrada e a
              -- estimativa original apenas enquanto o item segue pendente.
              NVL(sc.vlrunitarionf, NVL(sc.preco, sc.sugestao_preco)) AS preco,
              CASE
                WHEN sc.dataentrada_seq IS NOT NULL THEN NVL(sc.valor_nf, 0)
                ELSE sc.qtde * sc.sugestao_preco
              END AS valor,
              CASE
                WHEN sc.situacao_cod = 'C' THEN 'Cancelada'
                WHEN sc.dataentrada_seq IS NOT NULL THEN 'Entregue'
                WHEN sc.nroc IS NOT NULL AND sc.datapgto IS NULL AND sc.antecipado = 'S' THEN 'Aguardando Pagamento'
                -- Uma OC sem entrada é aguardando entrega, independentemente
                -- do último registro de cotação que ainda permaneça vinculado.
                WHEN sc.nroc IS NOT NULL THEN 'Aguardando entrega'
                WHEN sc.situacaocotacao = 'L' THEN 'Aguardando aprovação'
                WHEN sc.situacaocotacao = 'N' THEN 'Em negociação'
                WHEN sc.situacaocotacao = 'C' THEN 'Em cotação'
                WHEN sc.aprovada <> 'T' OR sc.situacao_cod = 'P' THEN 'Aguardando aprovação'
                ELSE 'Sem cotação'
              END AS situacao_nome,
              CASE
                WHEN sc.situacao_cod = 'C' THEN NULL
                WHEN NVL(TRUNC(sc.dataentrada_seq), TRUNC(SYSDATE))
                     <= NVL(TRUNC(sc.dataprevistaentrega), NVL(sc.data_prevista_uso, sc.data_solicitacao))
                THEN 'D. Prazo'
                ELSE 'F. Prazo'
              END AS aval,
              ${grupoOperacionalSql("sc.cod_objetocusto")} AS categoria,
              NVL(gm.descricao, 'Sem grupo') AS grupo_material,
              CASE
                WHEN sc.servico = 'T' THEN 'Serviço'
                WHEN sc.aplicacao_direta = 'T' OR sc.compra_aplicacao = 'T' THEN 'Aplicação direta'
                WHEN sc.estoque = 'T' THEN 'Estoque'
                ELSE 'Compra'
              END AS tipo_solicitacao,
              NVL(NULLIF(TRIM(func.cscfuncionario), ''), 'Funcionário ' || sc.cod_funcionario) AS solicitante,
              NVL(forn.razaosocial, 'Sem fornecedor') AS fornecedor,
              CASE WHEN sc.dataoc IS NULL THEN NULL ELSE TRUNC(sc.dataoc) - sc.data_solicitacao END AS lead_oc,
              CASE
                WHEN sc.dataentrada_seq IS NULL OR sc.dataoc IS NULL THEN NULL
                ELSE TRUNC(sc.dataentrada_seq) - TRUNC(sc.dataoc)
              END AS lead_entrega,
              CASE
                WHEN sc.dataentrada_seq IS NULL THEN NULL
                ELSE TRUNC(sc.dataentrada_seq) - sc.data_solicitacao
              END AS lead_geral,
              TO_CHAR(TRUNC(sc.dataentrada_seq), 'YYYY-MM-DD') AS data_entrada,
              TO_CHAR(TRUNC(sc.dataprevistaentrega), 'YYYY-MM-DD') AS previsao_entrega,
              TRUNC(NVL(sc.dataentrada_seq, SYSDATE)) - sc.data_solicitacao AS tempo_total
         FROM base sc
         LEFT JOIN material.material m ON m.cod_material = sc.cod_material
         LEFT JOIN material.grupomaterial gm
           ON gm.cod_familia = sc.cod_familia
          AND gm.cod_grupomaterial = sc.cod_grupomaterial
         LEFT JOIN custo.objetocusto obj ON obj.cod_objetocusto = sc.cod_objetocusto
         LEFT JOIN tipo ON tipo.cod_equipamento = sc.cod_equipamento
         LEFT JOIN agricola.sga_funcionario func
           ON TRIM(TO_CHAR(func.cdgfuncionario)) = TRIM(TO_CHAR(sc.cod_funcionario))
         LEFT JOIN (
           SELECT cod_fornecedor, MAX(razaosocial) AS razaosocial
             FROM material.vw_parceironegocio
            GROUP BY cod_fornecedor
         ) forn ON forn.cod_fornecedor = sc.cod_fornecedor`,
      { dataInicio, dataFim },
      { maxRows: 0, fetchArraySize: 400 },
    );
    return ((result.rows ?? []) as Record<string, unknown>[]).map(mapRow);
  });
}

async function carregarListasFiltroPeriodo(dataInicio: string, dataFim: string) {
  // Consulta exclusiva para preencher filtros: evita os joins de cotação, entrega e pagamento usados no relatório.
  return withOracle(async (conn) => {
    const result = await conn.execute(
      `WITH tipo AS (
         SELECT cod_equipamento, categoria
           FROM (
             SELECT h.cod_equipamento,
                    t.descricaotipoequipamento AS categoria,
                    ROW_NUMBER() OVER (PARTITION BY h.cod_equipamento ORDER BY h.data_inicio DESC NULLS LAST) AS rn
               FROM automotivo.historico_tipoequipamento h
               JOIN automotivo.tipoequipamento t ON t.cod_tipoequipamento = h.cod_tipoequipamento
              WHERE h.data_fim IS NULL
           ) WHERE rn = 1
       ), base AS (
         SELECT NVL(NULLIF(TRIM(func.cscfuncionario), ''), 'Funcionário ' || a.cod_funcionario) AS solicitante,
                ${grupoOperacionalSql("a.cod_objetocusto")} AS grupo_operacional,
                NVL(forn.razaosocial, 'Sem fornecedor') AS fornecedor
           FROM material.solicitacaocompra a
           LEFT JOIN custo.objetocusto obj ON obj.cod_objetocusto = a.cod_objetocusto
           LEFT JOIN tipo ON tipo.cod_equipamento = a.cod_equipamento
           LEFT JOIN agricola.sga_funcionario func ON TRIM(TO_CHAR(func.cdgfuncionario)) = TRIM(TO_CHAR(a.cod_funcionario))
           LEFT JOIN (
             SELECT nr_solicitacao, MAX(nroc) AS nroc
               FROM material.itensordemcompra
              GROUP BY nr_solicitacao
           ) ioc ON ioc.nr_solicitacao = a.nr_solicitacao
           LEFT JOIN material.ordemcompra oc ON oc.nroc = ioc.nroc
           LEFT JOIN (
             SELECT cod_fornecedor, MAX(razaosocial) AS razaosocial
               FROM material.vw_parceironegocio
              GROUP BY cod_fornecedor
           ) forn ON forn.cod_fornecedor = oc.cod_fornecedor
          WHERE a.cod_almoxarifado = 2
            AND a.data IS NOT NULL
            -- Mantém as opções de filtro no mesmo universo do Dashboard.
            AND NVL(a.cod_familia, -1) <> 1
            AND a.cod_objetocusto IN (${OBJETOS_CUSTO_SQL})
            AND TRUNC(a.data) >= TO_DATE(:dataInicio, 'YYYY-MM-DD')
            AND TRUNC(a.data) <= TO_DATE(:dataFim, 'YYYY-MM-DD')
       )
       SELECT 'solicitante' AS tipo, solicitante AS valor FROM base GROUP BY solicitante
       UNION ALL
       SELECT 'grupo_operacional' AS tipo, grupo_operacional AS valor FROM base GROUP BY grupo_operacional
       UNION ALL
       SELECT 'fornecedor' AS tipo, fornecedor AS valor FROM base GROUP BY fornecedor`,
      { dataInicio, dataFim },
      { maxRows: 0, fetchArraySize: 300 },
    );
    const solicitantes: string[] = [];
    const gruposOperacionais: string[] = [];
    const fornecedores: string[] = [];
    for (const raw of (result.rows ?? []) as Record<string, unknown>[]) {
      const tipo = oracleText(raw, "tipo", "TIPO");
      const valor = oracleText(raw, "valor", "VALOR");
      if (!valor) continue;
      if (tipo === "solicitante") solicitantes.push(valor);
      else if (tipo === "grupo_operacional") gruposOperacionais.push(valor);
      else if (tipo === "fornecedor" && valor !== "Sem fornecedor") fornecedores.push(valor);
    }
    return { solicitantes: uniqueSorted(solicitantes), gruposOperacionais: uniqueSorted(gruposOperacionais), fornecedores: uniqueSorted(fornecedores) };
  });
}

async function carregarCatalogoGruposMaterial(): Promise<GrupoParametro[]> {
  return withOracle(async (conn) => {
    const result = await conn.execute(
      `SELECT CASE
                WHEN tipo = 1 THEN 'Combustível'
                WHEN tipo = 2 THEN 'Lubrificante'
                WHEN tipo = 3 THEN 'Pneu'
                WHEN tipo = 4 THEN 'Servico'
                WHEN tipo = 5 THEN 'Filtro'
                WHEN tipo = 6 THEN 'Graxa'
                WHEN tipo = 7 THEN 'Aditivo'
                ELSE NULL
              END AS tipo,
              cod_familia || '-' || cod_grupomaterial AS chave
         FROM automotivo.parametros_familia
        WHERE NVL(cod_familia, -1) <> 1
       UNION ALL
       SELECT 'Peças e Acessórios' AS tipo,
              gm.cod_familia || '-' || gm.cod_grupomaterial AS chave
         FROM material.grupomaterial gm
        WHERE NVL(gm.cod_familia, -1) <> 1
          AND NOT EXISTS (
          SELECT 1
            FROM automotivo.parametros_familia pf
           WHERE pf.cod_familia = gm.cod_familia
             AND pf.cod_grupomaterial = gm.cod_grupomaterial
        )`,
      {},
      { maxRows: 0 },
    );
    return ((result.rows ?? []) as Record<string, unknown>[]).flatMap((raw) => {
      const tipo = oracleText(raw, "tipo", "TIPO").trim();
      const chave = oracleText(raw, "chave", "CHAVE").trim();
      if (!tipo || !chave) return [];
      return [{ tipo, chave }];
    });
  });
}

function buildDashboard(
  linhas: Linha[],
  opcoes: DashboardMateriaisData["opcoes"],
  filtros: DashboardMateriaisData["filtros"],
  tipoGrupoPorChave: Map<string, string>,
): DashboardMateriaisData {
  const atendidas = linhas.filter((row) => row.situacao === "Entregue").length;
  const naoAtendidas = linhas.filter((row) => row.situacao !== "Entregue" && row.situacao !== "Cancelada").length;
  const basePct = atendidas + naoAtendidas;
  const porSituacao = SITUACOES_SOLICITACAO.map((situacao) => ({
    situacao,
    quantidade: linhas.filter((row) => row.situacao === situacao).length,
  })).filter((row) => row.quantidade > 0);

  const avalMap = new Map<string, number>();
  for (const row of linhas) {
    if (!row.aval) continue;
    avalMap.set(row.aval, (avalMap.get(row.aval) ?? 0) + 1);
  }

  const categorias = new Map<string, { entregues: number; naoAtendidas: number }>();
  const gruposMaterial = new Map<string, number>();
  for (const row of linhas) {
    const bucket = categorias.get(row.categoria) ?? { entregues: 0, naoAtendidas: 0 };
    if (row.situacao === "Entregue") bucket.entregues += 1;
    else if (row.situacao !== "Cancelada") bucket.naoAtendidas += 1;
    categorias.set(row.categoria, bucket);
    const tipoGrupo = tipoGrupoPorChave.get(row.grupoChave) ?? "Peças e Acessórios";
    gruposMaterial.set(tipoGrupo, (gruposMaterial.get(tipoGrupo) ?? 0) + row.valor);
  }

  const dias = weekDays(isoToday());
  const entregasSemana = dias.map((iso) => ({
    dia: weekdayLabel(iso),
    quantidade: linhas.filter((row) => row.situacao === "Entregue" && row.dataEntrada === iso).length,
  }));

  return {
    atualizadoEm: new Date().toISOString(),
    filtros,
    opcoes,
    kpis: {
      valorEstimado: money(linhas.reduce((acc, row) => acc + row.valor, 0)),
      atendidas,
      pctAtendidas: pct(atendidas, basePct),
      naoAtendidas,
      pctNaoAtendidas: pct(naoAtendidas, basePct),
      leadTimeGeral: avg(linhas.map((row) => row.leadGeral).filter((value): value is number => value != null && value >= 0)),
    },
    porSituacao,
    avaliacaoEntrega: [...avalMap.entries()]
      .map(([aval, quantidade]) => ({ aval, quantidade }))
      .sort((a, b) => b.quantidade - a.quantidade),
    leadTimeOc: avg(linhas.map((row) => row.leadOc).filter((value): value is number => value != null && value >= 0)),
    leadTimeEntrega: avg(linhas.map((row) => row.leadEntrega).filter((value): value is number => value != null && value >= 0)),
    porCategoria: [...categorias.entries()]
      .map(([categoria, bucket]) => {
        const total = bucket.entregues + bucket.naoAtendidas;
        return {
          categoria,
          entregues: bucket.entregues,
          naoAtendidas: bucket.naoAtendidas,
          pct: pct(bucket.naoAtendidas, total),
        };
      })
      .filter((row) => row.entregues > 0 || row.naoAtendidas > 0)
      .sort((a, b) => b.entregues + b.naoAtendidas - (a.entregues + a.naoAtendidas)),
    entregasSemana,
    porGrupoMaterial: [...gruposMaterial.entries()]
      .map(([grupo, valor]) => ({ grupo, valor: money(valor) }))
      .sort((a, b) => b.valor - a.valor),
  };
}

export async function gerarDashboardMateriais(filtros: DashboardMateriaisFiltros): Promise<DashboardMateriaisData> {
  const dataFim = filtros.dataFim?.trim() || isoToday();
  const dataInicio = filtros.dataInicio?.trim() || defaultInicio(dataFim);
  const solicitantes = filtros.solicitantes ?? [];
  const situacoes = (filtros.situacoes ?? []).filter((item) =>
    (SITUACOES_SOLICITACAO as readonly string[]).includes(item),
  );
  const gruposOperacionais = filtros.gruposOperacionais ?? [];
  const gruposMaterial = filtros.gruposMaterial ?? [];
  const tiposSolicitacao = filtros.tiposSolicitacao ?? [];
  const fornecedores = filtros.fornecedores ?? [];

  const catalogoGrupos = await carregarCatalogoGruposMaterial();
  const tipoGrupoPorChave = new Map(catalogoGrupos.map((item) => [item.chave, item.tipo]));
  const selecionados = new Set(gruposMaterial);
  const chavesGrupo = selecionados.size
    ? new Set(catalogoGrupos.filter((item) => selecionados.has(item.tipo)).map((item) => item.chave))
    : null;

  const todas = await carregarLinhas(dataInicio, dataFim);
  const linhas = aplicaFiltros(
    todas,
    {
      solicitantes,
      situacoes,
      gruposOperacionais,
      gruposMaterial,
      tiposSolicitacao,
      fornecedores,
    },
    chavesGrupo,
  );

  const opcoes = {
    solicitantes: uniqueSorted(todas.map((row) => row.solicitante)),
    situacoes: [...SITUACOES_SOLICITACAO],
    gruposOperacionais: uniqueSorted(todas.map((row) => row.categoria)),
    gruposMaterial: tiposGrupoMaterial(catalogoGrupos),
    tiposSolicitacao: uniqueSorted([...TIPOS_SOLICITACAO]),
    fornecedores: uniqueSorted(todas.map((row) => row.fornecedor).filter((item) => item !== "Sem fornecedor")),
  };

  return buildDashboard(linhas, opcoes, {
    dataInicio,
    dataFim,
    solicitantes,
    situacoes,
    gruposOperacionais,
    gruposMaterial,
    tiposSolicitacao,
    fornecedores,
  }, tipoGrupoPorChave);
}

/** Tabela analítica equivalente à aba Relatório do Power BI. */
export async function gerarAcompanhamentoPedido(
  filtros: DashboardMateriaisFiltros & { busca?: string | null; campoPesquisa?: string | null },
): Promise<AcompanhamentoPedidoData> {
  const dataFim = filtros.dataFim?.trim() || isoToday();
  const dataInicio = filtros.dataInicio?.trim() || defaultInicio(dataFim);
  const solicitantes = filtros.solicitantes ?? [];
  const situacoes = (filtros.situacoes ?? []).filter((item) =>
    (SITUACOES_SOLICITACAO as readonly string[]).includes(item),
  );
  const gruposOperacionais = filtros.gruposOperacionais ?? [];
  const gruposMaterial = filtros.gruposMaterial ?? [];
  const tiposSolicitacao = filtros.tiposSolicitacao ?? [];
  const fornecedores = filtros.fornecedores ?? [];
  const busca = filtros.busca?.trim() || "";
  const campoPesquisa = filtros.campoPesquisa?.trim() || "nrSolicitacao";
  const catalogoGrupos = await carregarCatalogoGruposMaterial();
  const selecionados = new Set(gruposMaterial);
  const chavesGrupo = selecionados.size
    ? new Set(catalogoGrupos.filter((item) => selecionados.has(item.tipo)).map((item) => item.chave))
    : null;
  const todas = await carregarLinhas(dataInicio, dataFim);
  const linhas = aplicaFiltros(
    todas,
    { solicitantes, situacoes, gruposOperacionais, gruposMaterial, tiposSolicitacao, fornecedores },
    chavesGrupo,
  ).filter((row) => {
    if (!busca) return true;
    const valores: Record<string, string> = {
      nrSolicitacao: row.nrSolicitacao ?? "",
      nroc: row.nroc ?? "",
      codMaterial: String(row.codMaterial ?? ""),
      descricao: row.descricao,
      observacao: row.observacao ?? "",
    };
    const valor = (valores[campoPesquisa] ?? "").toLocaleLowerCase("pt-BR");
    const termo = busca.toLocaleLowerCase("pt-BR");
    // Códigos identificam um único registro; descrição e observação permitem trecho do texto.
    return ["nrSolicitacao", "nroc", "codMaterial"].includes(campoPesquisa)
      ? valor === termo
      : valor.includes(termo);
  });
  const opcoes = {
    solicitantes: uniqueSorted(todas.map((row) => row.solicitante)),
    situacoes: [...SITUACOES_SOLICITACAO],
    gruposOperacionais: uniqueSorted(todas.map((row) => row.categoria)),
    gruposMaterial: tiposGrupoMaterial(catalogoGrupos),
    tiposSolicitacao: uniqueSorted([...TIPOS_SOLICITACAO]),
    fornecedores: uniqueSorted(todas.map((row) => row.fornecedor).filter((item) => item !== "Sem fornecedor")),
  };
  return {
    atualizadoEm: new Date().toISOString(),
    filtros: { dataInicio, dataFim, solicitantes, situacoes, gruposOperacionais, gruposMaterial, tiposSolicitacao, fornecedores, busca },
    opcoes,
    pedidos: linhas
      .sort((a, b) => (b.data ?? "").localeCompare(a.data ?? ""))
      .map((row) => ({
        data: row.data, nrSolicitacao: row.nrSolicitacao, nroc: row.nroc, codMaterial: row.codMaterial,
        descricao: row.descricao, qtde: row.qtde, qtdeEntregue: row.qtdeEntregue, preco: row.preco,
        valor: row.valor, situacao: row.situacao, tempoTotal: row.tempoTotal,
        previsaoEntrega: row.previsaoEntrega, dataEntrega: row.dataEntrada, aval: row.aval, observacao: row.observacao,
        codFornecedor: row.codFornecedor, fornecedor: row.fornecedor,
      })),
  };
}
