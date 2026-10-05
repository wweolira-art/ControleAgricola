import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { db } from '../../db.js';
import {
  fetchMatrizRhaHectares,
  fetchUnRealizadoUnitsBySheet,
  listUnRealizadoSources,
} from '../../un-realizado.js';
import { executeQuery } from '../utils/oracle.js';
import {
  consultarTotalLancamentoConsolidado,
  negociosParaConsulta,
} from './lancamentoConsolidadoService.js';
import { expandNegociosCana, normalizeNegocios, bindsObjetoCusto } from '../utils/filtros.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const MATRIZ_LINHAS_SQL = readFileSync(
  join(__dirname, '../sql/rateioMatrizLinhas.sql'),
  'utf8'
)
  .replace(/^--.*$/gm, '')
  .trim();

/** Centros de custo cujas unidades do Un realizado alimentam R$/ha da coluna. */
export const COLUNAS_SHEET = {
  preparo: 'P.SOLO',
  plantio: 'PLANTIO',
  tratos_planta: 'T.C.P.',
  colheita_mudas: 'CORTE SEMENTE',
  formacao: 'PLANTIO',
  tratos_soca: 'T.C.S.',
};

/** Colunas exibidas no relatório (formação = soma das partes). */
export const COLUNAS_SUBPROCESSO = [
  { key: 'preparo', label: 'Preparo', haKey: 'preparo', sheetName: COLUNAS_SHEET.preparo },
  { key: 'plantio', label: 'Plantio', haKey: 'plantio', sheetName: COLUNAS_SHEET.plantio },
  {
    key: 'tratos_planta',
    label: 'Tratos planta',
    haKey: 'tratos_planta',
    sheetName: COLUNAS_SHEET.tratos_planta,
  },
  {
    key: 'formacao',
    label: 'Formação',
    haKey: 'formacao',
    sheetName: COLUNAS_SHEET.formacao,
    computed: true,
  },
  {
    key: 'tratos_soca',
    label: 'Tratos soca',
    haKey: 'tratos_soca',
    sheetName: COLUNAS_SHEET.tratos_soca,
  },
];

/** Colunas que recebem parcela da irrigação (proc 4), proporcional às ha do Un realizado. */
const COLUNAS_DISTRIBUICAO_IRRIGACAO = [
  'preparo',
  'plantio',
  'tratos_planta',
  'tratos_soca',
];

/** Colunas que recebem rateio direto do Oracle (antes de derivar formação). */
const COLUNAS_ROTEAMENTO = [
  'preparo',
  'plantio',
  'tratos_planta',
  'colheita_mudas',
  'tratos_soca',
];

/** Partes que compõem a coluna Formação. */
const COLUNAS_FORMACAO_PARTES = [
  'preparo',
  'plantio',
  'tratos_planta',
  'colheita_mudas',
];

const SECOES = [
  { key: 'operacao', label: 'Operação' },
  { key: 'insumos', label: 'Insumos' },
  { key: 'adm', label: 'Adm' },
];

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function filtrosEff(filtros = {}) {
  const negociosBase = normalizeNegocios(filtros);
  const negociosExpandidos = expandNegociosCana(negociosBase);
  return {
    ...filtros,
    negocios: negociosExpandidos,
    negocio:
      negociosExpandidos?.length === 1 ? negociosExpandidos[0] : null,
  };
}

function bindsConsulta(filtros = {}) {
  const eff = filtrosEff(filtros);
  const negocios = negociosParaConsulta(eff);
  const obj = bindsObjetoCusto({ ...eff, negocios });
  return {
    negociosCsv: obj.negociosCsv,
    anomesInicio: eff.anomesInicio ?? null,
    anomesFim: eff.anomesFim ?? null,
    objetoCusto: obj.objetoCusto,
    processo: obj.processo,
    subprocesso: obj.subprocesso,
    atividade: obj.atividade,
  };
}

function mapLinha(row) {
  return {
    destProcesso: toNumber(row.DEST_PROCESSO ?? row.dest_processo),
    destSubprocesso: toNumber(row.DEST_SUBPROCESSO ?? row.dest_subprocesso),
    destDescricao: row.DEST_DESCRICAO ?? row.dest_descricao ?? null,
    codGrupoempenho: toNumber(row.COD_GRUPOEMPENHO ?? row.cod_grupoempenho),
    grupoEmpenho: row.GRUPO_EMPENHO ?? row.grupo_empenho ?? null,
    codEmpenho: toNumber(row.COD_EMPENHO ?? row.cod_empenho),
    empenhoDescricao: row.EMPENHO_DESCRICAO ?? row.empenho_descricao ?? null,
    codGrupoItemCusto: toNumber(
      row.COD_GRUPO_ITEM_CUSTO ?? row.cod_grupo_item_custo
    ),
    grupoItemDescricao:
      row.GRUPO_ITEM_DESCRICAO ?? row.grupo_item_descricao ?? null,
    codItemCusto: toNumber(row.COD_ITEM_CUSTO ?? row.cod_item_custo),
    itemDescricao: row.ITEM_DESCRICAO ?? row.item_descricao ?? null,
    negOrigem: toNumber(row.NEG_ORIGEM ?? row.neg_origem),
    origProcesso: toNumber(row.ORIG_PROCESSO ?? row.orig_processo),
    valor: toNumber(row.VALOR ?? row.valor),
  };
}

function isColheitaMudas(linha) {
  const desc = String(linha.destDescricao || '').toUpperCase();
  return (
    desc.includes('SEMENTE') ||
    desc.includes('MUDA') ||
    desc.includes('CORTE DE') ||
    desc.includes('CORTE SEMENT')
  );
}

/** Coluna = subprocesso destino Cana que recebeu o rateio. */
function colunaDestino(linha) {
  const proc = linha.destProcesso;
  const sub = linha.destSubprocesso;
  if (proc === 1 && sub === 1) {
    return isColheitaMudas(linha) ? 'colheita_mudas' : 'preparo';
  }
  if (proc === 1 && sub === 2) return 'plantio';
  if (proc === 1 && sub === 3) return 'tratos_planta';
  if (proc === 2 || proc === 3) return 'tratos_soca';
  return null;
}

function metaIrrigacao() {
  return {
    secao: 'operacao',
    grupo: 'irrigacao',
    chave: 'irrigacao',
    label: 'Irrigação/Fertirrigação',
    indent: 1,
  };
}

function isIrrigacaoDestino(linha) {
  return linha.destProcesso === 4;
}

/** Custo do processo irrigação (proc 4) — origem ou destino. */
function isCustoIrrigacao(linha) {
  return linha.destProcesso === 4 || linha.origProcesso === 4;
}

function aplicarLinhaIrrigacao(lin, ha, ensureRow, colTotais) {
  const row = ensureRow(metaIrrigacao());
  if (lin.destProcesso === 4) {
    const parts = distribuirIrrigacao(lin.valor, ha);
    if (!parts) return;
    for (const [col, parte] of Object.entries(parts)) {
      if (!(parte > 0.0001)) continue;
      row.celulas[col].valor += parte;
      colTotais[col] += parte;
    }
    return;
  }
  const col = colunaDestino(lin);
  if (!col) return;
  row.celulas[col].valor += lin.valor;
  colTotais[col] += lin.valor;
}

/** Rateio proc 4 → colunas preparo/plantio/tratos planta/tratos soca (peso = ha). */
function distribuirIrrigacao(valor, ha) {
  const pesos = COLUNAS_DISTRIBUICAO_IRRIGACAO.map((key) => ({
    key,
    peso: ha[key] || 0,
  }));
  const totalPeso = pesos.reduce((sum, item) => sum + item.peso, 0);
  if (!(totalPeso > 0)) return null;
  return Object.fromEntries(
    pesos.map((item) => [item.key, (valor * item.peso) / totalPeso])
  );
}

function metaMaquina() {
  return {
    secao: 'operacao',
    grupo: 'maquina',
    chave: 'maquina',
    label: 'Máquina',
    indent: 1,
  };
}

function metaMaoObra() {
  return {
    secao: 'operacao',
    grupo: 'mao_obra',
    chave: 'mao_obra',
    label: 'Mão de obra',
    indent: 1,
  };
}

function isAluguelMaquinasEmpenho(empDesc) {
  const d = empDesc.toLowerCase();
  const aluguel =
    d.includes('aluguel') || d.includes('locação') || d.includes('locacao');
  const maquina =
    d.includes('maq') || d.includes('trator') || d.includes('equip');
  return aluguel && maquina;
}

function isMaquina(linha) {
  const grupoItem = linha.codGrupoItemCusto;
  const grupoEmp = linha.codGrupoempenho;
  const empDesc = String(linha.empenhoDescricao || '');
  const empLower = empDesc.toLowerCase();
  if (grupoItem === 4 || grupoItem === 5) return true;
  // DESPESAS C/ TRANSPORTES DE TERCEIROS
  if (grupoEmp === 18) return true;
  if (isAluguelMaquinasEmpenho(empDesc)) return true;
  // Manutenção, materiais/consumo, combustíveis, energia (fora da linha irrigação)
  if (grupoEmp === 20 || grupoEmp === 21 || grupoEmp === 25 || grupoEmp === 23) {
    return true;
  }
  // Aluguéis operacionais; arrendamento de terra permanece em Adm
  if (grupoEmp === 17 && !empLower.includes('arrend')) return true;
  return false;
}

function isMaoObra(linha) {
  const grupoEmp = linha.codGrupoempenho;
  // 10 = DESPESAS C/ FUNCIONARIO; 19 = DESPESAS C/ SERVIÇOS DE TERCEIROS; 22 = FOLHA AVULSA
  return grupoEmp === 10 || grupoEmp === 19 || grupoEmp === 22;
}

function metaAdm(label = 'Administrativo') {
  return {
    secao: 'adm',
    grupo: 'adm',
    chave: 'administrativo',
    label,
    indent: 1,
  };
}

function classificarLinha(linha) {
  const grupoEmp = linha.codGrupoempenho;
  const empDesc = String(linha.empenhoDescricao || '').toLowerCase();

  if (isMaquina(linha)) {
    return metaMaquina();
  }

  if (isMaoObra(linha)) {
    return metaMaoObra();
  }

  if (grupoEmp === 24) {
    let label = linha.empenhoDescricao?.trim() || `Empenho ${linha.codEmpenho}`;
    if (empDesc.includes('corretiv')) label = 'Adubação corretiva';
    else if (empDesc.includes('defens')) label = 'Defensivos';
    else if (empDesc.includes('biolog')) label = 'Controle biológico';
    else if (empDesc.includes('adub') || empDesc.includes('fertiliz')) {
      label = 'Fertilizantes';
    } else if (empDesc.includes('muda')) label = 'Mudas';
    else if (empDesc.includes('torta') || empDesc.includes('filtro')) {
      label = 'Torta de filtro';
    }
    return {
      secao: 'insumos',
      grupo: 'insumo',
      chave: `ins-${linha.codEmpenho}`,
      label,
      indent: 1,
    };
  }

  if (linha.negOrigem === 5 && linha.origProcesso === 1) {
    return metaAdm();
  }

  if (empDesc.includes('royalt') || (grupoEmp === 17 && empDesc.includes('arrend'))) {
    return {
      secao: 'adm',
      grupo: 'adm',
      chave: 'royalties',
      label: 'Royalties',
      indent: 1,
    };
  }

  if (
    grupoEmp === 14 ||
    empDesc.includes('imposto') ||
    empDesc.includes('taxa') ||
    empDesc.includes('matéria-prima') ||
    empDesc.includes('materia-prima')
  ) {
    return metaAdm();
  }

  return metaMaquina();
}

function fonteApontamentoHa({ units, label, nota, sheetName, sheetTitle }) {
  return {
    sheetName: sheetName ?? null,
    sheetTitle: sheetTitle ?? null,
    units,
    configurado: true,
    sourceKind: 'apontamento_area',
    sourceLabel: label,
    metric: 'area',
    metricLabel: 'Área',
    nota,
  };
}

async function unidadesPorColuna(filtros = {}) {
  const safraId = filtros.safraId ?? null;
  const [unitsBySheet, sourcesPayload, rhaHa] = await Promise.all([
    fetchUnRealizadoUnitsBySheet(safraId),
    listUnRealizadoSources(safraId).catch(() => ({ sources: [] })),
    fetchMatrizRhaHectares(filtros.anomesInicio, filtros.anomesFim),
  ]);

  const unitsMap = new Map(unitsBySheet.map((row) => [row.sheetId, row.units]));
  const sourceBySheetId = new Map(
    (sourcesPayload.sources ?? []).map((src) => [src.sheetId, src])
  );
  const sheetRows = db
    .prepare(`SELECT id, name, title FROM sheets WHERE kind = 'cost_center'`)
    .all();
  const sheetByName = new Map(sheetRows.map((row) => [row.name, row]));

  const unidades = {};
  const fontes = {};
  const colunasUnidade = [
    ...COLUNAS_SUBPROCESSO,
    { key: 'colheita_mudas', haKey: 'colheita_mudas', sheetName: COLUNAS_SHEET.colheita_mudas },
  ];

  for (const col of colunasUnidade) {
    const sheetName = COLUNAS_SHEET[col.key];
    const sheet = sheetName ? sheetByName.get(sheetName) : null;
    let units = 0;
    let fonte = null;

    if (col.key === 'preparo' || col.key === 'plantio' || col.key === 'tratos_planta') {
      units = rhaHa.planta || 0;
      fonte = fonteApontamentoHa({
        units,
        sheetName,
        sheetTitle: sheet?.title,
        label: 'automotivo.itens_apontamento · op. 41 (área)',
        nota: 'R$/ha de preparo, plantio e tratos planta usa a coluna Área com cod_operacaoagricola = 41',
      });
    } else if (col.key === 'formacao') {
      units = rhaHa.planta || 0;
      fonte = fonteApontamentoHa({
        units,
        sheetName,
        sheetTitle: sheet?.title,
        label: 'automotivo.itens_apontamento · op. 41 (área)',
        nota: 'Formação = preparo + plantio + tratos planta + colheita de mudas; R$/ha usa a mesma área da op. 41',
      });
    } else if (col.key === 'tratos_soca') {
      units = rhaHa.soca || 0;
      fonte = fonteApontamentoHa({
        units,
        sheetName,
        sheetTitle: sheet?.title,
        label: 'agricola.apontamentoitem · M13/M56/M80/M342',
        nota: 'Área agrupada do apontamento agrícola, filtrada nas operações M13, M56, M80 e M342',
      });
    } else if (sheet) {
      units = unitsMap.get(sheet.id) ?? 0;
      const src = sourceBySheetId.get(sheet.id);
      fonte = {
        sheetId: sheet.id,
        sheetName,
        sheetTitle: sheet.title,
        units,
        configurado: Boolean(src),
        sourceKind: src?.sourceKind ?? null,
        sourceLabel: src?.sourceLabel ?? null,
        metric: src?.metric ?? null,
        metricLabel: src?.metricLabel ?? null,
      };
    } else {
      fonte = {
        sheetName: sheetName ?? null,
        units: 0,
        configurado: false,
        nota: sheetName
          ? 'Centro de custo não encontrado na planilha'
          : 'Sem centro de custo mapeado',
      };
    }

    unidades[col.haKey ?? col.key] = units;
    fontes[col.key] = fonte;
  }

  return { unidades, fontes };
}

function celulaVazia() {
  return { valor: 0, pct: 0, rHa: null };
}

function celulaFormacao(row, totalFormacao, haFormacao) {
  const valor = COLUNAS_FORMACAO_PARTES.reduce(
    (sum, key) => sum + (row.celulas[key]?.valor || 0),
    0
  );
  return {
    valor,
    pct: totalFormacao > 0 ? (valor / totalFormacao) * 100 : 0,
    rHa: haFormacao > 0 ? valor / haFormacao : null,
  };
}

function totalLinhaUnico(row) {
  return (
    COLUNAS_FORMACAO_PARTES.reduce((sum, key) => sum + (row.celulas[key]?.valor || 0), 0) +
    (row.celulas.tratos_soca?.valor || 0)
  );
}

function sortItensSecao(a, b) {
  const ordem = { irrigacao: 0, maquina: 1, mao_obra: 2 };
  const oa = ordem[a.grupo] ?? 99;
  const ob = ordem[b.grupo] ?? 99;
  if (oa !== ob) return oa - ob;
  return totalLinhaUnico(b) - totalLinhaUnico(a);
}

function montarMatriz(linhas, ha) {
  const rowMap = new Map();
  const colTotais = Object.fromEntries(
    COLUNAS_ROTEAMENTO.map((key) => [key, 0])
  );

  const allCellKeys = [...COLUNAS_ROTEAMENTO, 'formacao'];

  const ensureRow = (meta) => {
    if (!rowMap.has(meta.chave)) {
      rowMap.set(meta.chave, {
        chave: meta.chave,
        label: meta.label,
        secao: meta.secao,
        grupo: meta.grupo,
        indent: meta.indent ?? 0,
        tipo: meta.tipo || 'item',
        celulas: Object.fromEntries(allCellKeys.map((key) => [key, celulaVazia()])),
      });
    }
    return rowMap.get(meta.chave);
  };

  for (const lin of linhas) {
    if (!(lin.valor > 0.0001)) continue;

    if (isCustoIrrigacao(lin)) {
      aplicarLinhaIrrigacao(lin, ha, ensureRow, colTotais);
      continue;
    }

    const col = colunaDestino(lin);
    if (!col) continue;

    const meta = classificarLinha(lin);
    const row = ensureRow(meta);
    row.celulas[col].valor += lin.valor;
    colTotais[col] += lin.valor;
  }

  const totalFormacao = COLUNAS_FORMACAO_PARTES.reduce(
    (sum, key) => sum + (colTotais[key] || 0),
    0
  );
  const haFormacao = ha.formacao || 0;
  colTotais.formacao = totalFormacao;

  const fillDerived = (valor, totalCol, haCol) => ({
    valor,
    pct: totalCol > 0 ? (valor / totalCol) * 100 : 0,
    rHa: haCol > 0 ? valor / haCol : null,
  });

  // Totais por coluna, % e R$/ha (inclui formação derivada)
  for (const row of rowMap.values()) {
    for (const col of COLUNAS_SUBPROCESSO) {
      if (col.key === 'formacao') {
        row.celulas.formacao = celulaFormacao(row, totalFormacao, haFormacao);
        continue;
      }
      const cell = row.celulas[col.key];
      const totalCol = colTotais[col.key] || 0;
      cell.pct = totalCol > 0 ? (cell.valor / totalCol) * 100 : 0;
      const haCol = ha[col.haKey] || 0;
      cell.rHa = haCol > 0 ? cell.valor / haCol : null;
    }
  }

  const totalRow = {
    chave: 'total',
    label: 'TOTAL',
    secao: 'total',
    grupo: 'total',
    indent: 0,
    tipo: 'total',
    celulas: Object.fromEntries(
      COLUNAS_SUBPROCESSO.map((col) => {
        if (col.key === 'formacao') {
          return [
            col.key,
            {
              valor: totalFormacao,
              pct: totalFormacao > 0 ? 100 : 0,
              rHa: haFormacao > 0 ? totalFormacao / haFormacao : null,
            },
          ];
        }
        const valor = colTotais[col.key] || 0;
        const haCol = ha[col.haKey] || 0;
        return [
          col.key,
          {
            valor,
            pct: valor > 0 ? 100 : 0,
            rHa: haCol > 0 ? valor / haCol : null,
          },
        ];
      })
    ),
  };

  const operacaoSubtotal = ensureRow({
    chave: 'operacao-subtotal',
    label: 'Operação',
    secao: 'operacao',
    grupo: 'subtotal',
    indent: 0,
    tipo: 'subtotal',
  });
  const insumosSubtotal = ensureRow({
    chave: 'insumos-subtotal',
    label: 'Insumos',
    secao: 'insumos',
    grupo: 'subtotal',
    indent: 0,
    tipo: 'subtotal',
  });
  const admSubtotal = ensureRow({
    chave: 'adm-subtotal',
    label: 'Adm',
    secao: 'adm',
    grupo: 'subtotal',
    indent: 0,
    tipo: 'subtotal',
  });

  for (const col of COLUNAS_SUBPROCESSO) {
    let op = 0;
    let ins = 0;
    let adm = 0;
    for (const row of rowMap.values()) {
      if (row.tipo === 'subtotal') continue;
      const v =
        col.key === 'formacao'
          ? celulaFormacao(row, totalFormacao, haFormacao).valor
          : row.celulas[col.key].valor;
      if (row.secao === 'operacao') op += v;
      if (row.secao === 'insumos') ins += v;
      if (row.secao === 'adm') adm += v;
    }
    const fillSubtotal = (row, valor) => {
      if (col.key === 'formacao') {
        row.celulas.formacao = fillDerived(valor, totalFormacao, haFormacao);
        return;
      }
      const totalCol = colTotais[col.key] || 0;
      const haCol = ha[col.haKey] || 0;
      row.celulas[col.key] = fillDerived(valor, totalCol, haCol);
    };
    fillSubtotal(operacaoSubtotal, op);
    fillSubtotal(insumosSubtotal, ins);
    fillSubtotal(admSubtotal, adm);
  }

  const linhasOut = [];
  linhasOut.push(totalRow);

  for (const sec of SECOES) {
    const subtotal = [...rowMap.values()].find(
      (r) => r.secao === sec.key && r.tipo === 'subtotal'
    );
    if (subtotal) linhasOut.push(subtotal);

    const items = [...rowMap.values()]
      .filter((r) => r.secao === sec.key && r.tipo !== 'subtotal')
      .sort(sortItensSecao);
    linhasOut.push(...items);
  }

  const stripInternalCells = (row) => ({
    ...row,
    celulas: Object.fromEntries(
      COLUNAS_SUBPROCESSO.map((col) => [col.key, row.celulas[col.key] ?? celulaVazia()])
    ),
  });

  return {
    colunas: COLUNAS_SUBPROCESSO.map((col) => {
      const total =
        col.key === 'formacao'
          ? totalFormacao
          : colTotais[col.key] || 0;
      const haCol = ha[col.haKey] || 0;
      return {
        ...col,
        total,
        hectareas: haCol,
        rHaTotal: haCol > 0 ? total / haCol : null,
      };
    }),
    linhas: linhasOut.map(stripInternalCells),
    hectareas: Object.fromEntries(
      COLUNAS_SUBPROCESSO.map((col) => [col.key, ha[col.haKey] || 0])
    ),
  };
}

export async function consultarMatrizSubprocesso(filtros = {}) {
  const eff = filtrosEff(filtros);
  const binds = bindsConsulta(filtros);

  const [result, totalPool] = await Promise.all([
    executeQuery(MATRIZ_LINHAS_SQL, binds),
    consultarTotalLancamentoConsolidado(eff),
  ]);

  const linhas = (result.rows || []).map(mapLinha);
  const { unidades, fontes } = await unidadesPorColuna(eff);
  const matriz = montarMatriz(linhas, unidades);
  const totalMatriz =
    (matriz.linhas[0]?.celulas?.formacao?.valor || 0) +
    (matriz.linhas[0]?.celulas?.tratos_soca?.valor || 0);
  const totalForaMatriz = Math.max(0, totalPool - totalMatriz);

  return {
    filtros: {
      ...eff,
      negociosConsulta: negociosParaConsulta(eff),
      negociosSelecionados: normalizeNegocios(filtros),
    },
    logica: {
      colunas:
        'Preparo 1/1, plantio 1/2, tratos planta 1/3, colheita de mudas (1/1 semente/muda), tratos soca proc 2 e colheita proc 3; formação = soma preparo + plantio + tratos planta + colheita de mudas',
      irrigacao:
        'Linha Irrigação/Fertirrigação: custos com origem ou destino proc 4 (incl. energia e demais empenhos), agregados sem separar grupo de empenho; destino proc 4 distribuído por ha, demais destinos na coluna do subprocesso',
      maquina:
        'Equip. automotivo/industrial (grupo_item 4/5), transportes de terceiros (18), aluguel de máquinas, manutenção (20), materiais/consumo (21), combustíveis (25), energia fora irrigação (23) e demais aluguéis operacionais (17)',
      insumos: 'Empenho grupo 24 (produtos e insumos) — uma linha por empenho',
      operacao:
        'Operação = Irrigação/Fertirrigação, Máquina e Mão de obra (grupos 10, 19 e 22); sem linhas por grupo de empenho',
      adm: 'Origem negócio 5 processo 1 + royalties/arrendamento quando aplicável',
      rHa:
        'Valor rateado ÷ ha do apontamento: preparo/plantio/tratos planta/formação usam automotivo.itens_apontamento.area com cod_operacaoagricola = 41; tratos soca usa agricola.apontamentoitem nas operações M13, M56, M80 e M342',
      unidades:
        'Preparo, plantio, tratos planta e formação → área da op. 41 em automotivo.itens_apontamento; tratos soca → área do apontamento agrícola (M13, M56, M80, M342); CORTE SEMENTE permanece no Un realizado só para detalhe da colheita de mudas',
      formacao:
        'Coluna calculada: preparo + plantio + tratos planta + colheita de mudas; R$/ha usa a área da op. 41',
    },
    resumo: {
      totalPool,
      totalMatriz,
      totalForaMatriz,
      qtdLinhasOracle: linhas.length,
    },
    fontesUnidades: fontes,
    ...matriz,
  };
}
