// server/uv-threadpool.ts
if (!process.env.UV_THREADPOOL_SIZE) {
  process.env.UV_THREADPOOL_SIZE = "16";
}

// server/oracle.ts
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import oracledb from "oracledb";
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
oracledb.fetchAsString = [oracledb.CLOB];
var ORACLE_NET_DIR = join(dirname(fileURLToPath(import.meta.url)), "oracle-net");
var loadedEnv = false;
var thickReady = false;
var pool = null;
var poolPromise = null;
var resetPromise = null;
function envFilePath() {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "..", ".env");
}
function loadEnvFile() {
  if (loadedEnv) return;
  loadedEnv = true;
  const path = envFilePath();
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (value.startsWith('"') && value.endsWith('"') || value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    }
    if (process.env[key] == null) process.env[key] = value;
  }
}
function appRoot() {
  return join(dirname(fileURLToPath(import.meta.url)), "..");
}
function dirWithOci(dir) {
  const trimmed = dir.trim();
  if (!trimmed) return "";
  return existsSync(join(trimmed, "oci.dll")) ? trimmed : "";
}
function resolveClientLibDir() {
  const roots = [...new Set([appRoot(), process.cwd()].filter(Boolean))];
  const envDir = (process.env.ORACLE_CLIENT_LIB_DIR ?? "").trim();
  const named = [
    envDir,
    ...roots.flatMap((root) => [
      join(root, "instantclient"),
      join(root, "instantclient_23_0"),
      join(root, "instantclient-basic-windows.x64-23.26.1.0.0", "instantclient_23_0"),
      join(root, "instantclient-basic-windows.x64-23.26.1.0.0")
    ]),
    String.raw`C:\instantclient-basic-windows.x64-23.26.1.0.0\instantclient_23_0`,
    String.raw`C:\instantclient-basic-windows.x64-23.26.0.0.0\instantclient_23_0`
  ];
  for (const dir of named) {
    const found = dirWithOci(dir);
    if (found) return found;
  }
  for (const root of roots) {
    try {
      for (const ent of readdirSync(root, { withFileTypes: true })) {
        if (!ent.isDirectory() || !/instantclient/i.test(ent.name)) continue;
        const base = join(root, ent.name);
        const found = dirWithOci(base) || dirWithOci(join(base, "instantclient_23_0"));
        if (found) return found;
      }
    } catch {
    }
  }
  return "";
}
function initThickMode() {
  if (thickReady) return;
  loadEnvFile();
  const libDir = resolveClientLibDir();
  if (libDir) {
    const pathEnv = process.env.PATH ?? "";
    if (!pathEnv.toLowerCase().includes(libDir.toLowerCase())) {
      process.env.PATH = `${libDir};${pathEnv}`;
    }
    process.env.ORACLE_CLIENT_LIB_DIR = libDir;
  }
  if (existsSync(join(ORACLE_NET_DIR, "sqlnet.ora"))) {
    process.env.TNS_ADMIN = ORACLE_NET_DIR;
  }
  try {
    const clientOpts = {};
    if (libDir) clientOpts.libDir = libDir;
    if (process.env.TNS_ADMIN) clientOpts.configDir = process.env.TNS_ADMIN;
    if (!libDir) {
      console.warn(
        "Oracle Instant Client n\xE3o encontrado neste computador. Copie a pasta instantclient junto com o app (oci.dll) ou defina ORACLE_CLIENT_LIB_DIR. Indicadores tentar\xE3o o modo thin."
      );
      thickReady = true;
      return;
    }
    oracledb.initOracleClient(clientOpts);
    thickReady = true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("NJS-075") || message.toLowerCase().includes("already been initialized")) {
      thickReady = true;
      return;
    }
    throw new Error(
      `N\xE3o foi poss\xEDvel iniciar o Oracle Instant Client${libDir ? ` em ${libDir}` : ""}. Copie a pasta do Instant Client junto com o projeto (arquivo oci.dll) ou ajuste ORACLE_CLIENT_LIB_DIR. ${message}`
    );
  }
}
function oracleErrorText(err) {
  return err instanceof Error ? err.message : String(err);
}
function isStaleSessionError(err) {
  return /DPI-1010|DPI-1080|NJS-003|NJS-500|not connected|invalid or closed connection/i.test(oracleErrorText(err));
}
function isTunnelChecksumError(err) {
  return /ORA-12569|ORA-12537|ORA-12547|ORA-12570|packet checksum/i.test(oracleErrorText(err));
}
function isQueueTimeoutError(err) {
  return /NJS-040|NJS-076|queueTimeout|queueMax/i.test(oracleErrorText(err));
}
var TUNNEL_COOLDOWN_MS = 2e4;
var CHECKOUT_MAX = Math.max(1, Number(process.env.ORACLE_CHECKOUT_MAX || 1) || 1);
var POOL_MAX = Math.max(8, Number(process.env.ORACLE_POOL_MAX || 8) || 8);
var tunnelDownUntil = 0;
var lastTunnelLog = 0;
var lastQueueLog = 0;
var checkoutChain = Promise.resolve();
var OracleSlotGate = class {
  constructor(max) {
    this.max = max;
  }
  max;
  generation = 0;
  active = 0;
  waiters = [];
  acquire() {
    return new Promise((resolve) => {
      if (this.active < this.max) {
        this.active += 1;
        resolve();
        return;
      }
      this.waiters.push(resolve);
    });
  }
  release(generation) {
    if (generation != null && generation !== this.generation) return;
    const next = this.waiters.shift();
    if (next) {
      next();
      return;
    }
    this.active = Math.max(0, this.active - 1);
  }
  reset() {
    this.generation += 1;
    this.active = 0;
    const pending = this.waiters.splice(0);
    for (const waiter of pending) this.waiters.push(waiter);
    this.grantWaiters();
  }
  grantWaiters() {
    while (this.active < this.max && this.waiters.length) {
      this.active += 1;
      this.waiters.shift()();
    }
  }
};
var oracleSlots = new OracleSlotGate(CHECKOUT_MAX);
function enqueueCheckout(fn) {
  const run = checkoutChain.then(fn, fn);
  checkoutChain = run.then(
    () => void 0,
    () => void 0
  );
  return run;
}
function attachSlotRelease(conn) {
  const originalClose = conn.close.bind(conn);
  const generation = oracleSlots.generation;
  let released = false;
  const releaseOnce = () => {
    if (released) return;
    released = true;
    oracleSlots.release(generation);
  };
  conn.close = (async (...args) => {
    try {
      return await originalClose(...args);
    } finally {
      releaseOnce();
    }
  });
  return conn;
}
function noteTunnelFailure() {
  tunnelDownUntil = Date.now() + TUNNEL_COOLDOWN_MS;
  if (Date.now() - lastTunnelLog < TUNNEL_COOLDOWN_MS) return;
  lastTunnelLog = Date.now();
  console.warn(
    "Oracle indispon\xEDvel (ORA-12569): o t\xFAnel TNS/ngrok entregou um pacote corrompido. Reinicie o ngrok, atualize ORACLE_CONNECT_STRING se a porta mudou e recarregue a tela. Nova tentativa autom\xE1tica em 20s."
  );
}
function throwIfTunnelDown() {
  const waitMs = tunnelDownUntil - Date.now();
  if (waitMs <= 0) return;
  const seconds = Math.ceil(waitMs / 1e3);
  throw new Error(
    `ORA-12569: TNS:packet checksum failure. T\xFAnel Oracle indispon\xEDvel; nova tentativa em ${seconds}s.`
  );
}
async function closeWithTimeout(conn, opts, ms = 8e3) {
  let timer;
  try {
    await Promise.race([
      conn.close(opts),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("oracle close timeout")), ms);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
async function closeQuietly(conn, drop = false) {
  if (!conn) return;
  try {
    await closeWithTimeout(conn, drop ? { drop: true } : void 0);
    return;
  } catch {
  }
  try {
    await closeWithTimeout(conn, { drop: true }, 4e3);
  } catch {
    console.warn("Oracle: falha ao devolver conex\xE3o; recriando o pool.");
    await resetPool();
  }
}
async function resetPool() {
  if (resetPromise) return resetPromise;
  resetPromise = (async () => {
    const current = pool;
    pool = null;
    poolPromise = null;
    if (current) {
      try {
        await current.close(0);
      } catch {
      }
    }
    oracleSlots.reset();
  })().finally(() => {
    resetPromise = null;
  });
  return resetPromise;
}
async function createPool() {
  loadEnvFile();
  initThickMode();
  const user = process.env.ORACLE_USER || process.env.DB_USER;
  const password = process.env.ORACLE_PASSWORD || process.env.DB_PASSWORD;
  const connectString = process.env.ORACLE_CONNECT_STRING || process.env.ORACLE_DSN || process.env.DB_CONNECT_STRING;
  if (!user || !password || !connectString) {
    throw new Error("Configure ORACLE_USER, ORACLE_PASSWORD e ORACLE_CONNECT_STRING no arquivo .env.");
  }
  return oracledb.createPool({
    user,
    password,
    connectString,
    poolMin: 0,
    poolMax: POOL_MAX,
    poolIncrement: 1,
    poolTimeout: 600,
    poolPingInterval: -1,
    queueTimeout: 0,
    queueMax: 4,
    enableStatistics: false
  });
}
async function getPool() {
  if (pool) return pool;
  if (!poolPromise) {
    poolPromise = createPool().then((created) => {
      pool = created;
      return created;
    }).finally(() => {
      poolPromise = null;
    });
  }
  return poolPromise;
}
async function waitForPoolSeat() {
  const current = await getPool();
  if (current.connectionsInUse < current.poolMax) return current;
  console.warn(
    `Oracle: pool lotado (${current.connectionsInUse}/${current.poolMax}) sem devolver conex\xE3o; recriando o pool.`
  );
  await resetPool();
  return getPool();
}
async function checkoutConnection() {
  const current = await waitForPoolSeat();
  const conn = await current.getConnection();
  tunnelDownUntil = 0;
  return attachSlotRelease(conn);
}
function logQueueExhausted(err) {
  if (Date.now() - lastQueueLog < 15e3) return;
  lastQueueLog = Date.now();
  const stats = pool ? ` abertas=${pool.connectionsOpen} emUso=${pool.connectionsInUse} poolMax=${POOL_MAX} checkoutMax=${CHECKOUT_MAX}` : "";
  const message = oracleErrorText(err);
  const empty = pool != null && pool.connectionsOpen === 0 && pool.connectionsInUse === 0;
  console.warn(
    empty ? `Oracle: abertura da conex\xE3o excedeu o tempo (${message}). Nova tentativa.${stats}` : `Oracle: fila do pool esgotada (${message}). Nova tentativa sem recriar o pool.${stats}`
  );
}
async function getOracleConnection() {
  throwIfTunnelDown();
  await oracleSlots.acquire();
  try {
    return await enqueueCheckout(() => checkoutConnection());
  } catch (err) {
    if (isTunnelChecksumError(err)) {
      oracleSlots.release();
      noteTunnelFailure();
      await resetPool();
      throw err;
    }
    if (isQueueTimeoutError(err)) {
      logQueueExhausted(err);
      oracleSlots.release();
      await new Promise((resolve) => setTimeout(resolve, 400));
      await oracleSlots.acquire();
      try {
        return await enqueueCheckout(() => checkoutConnection());
      } catch (retryErr) {
        oracleSlots.release();
        throw retryErr;
      }
    }
    oracleSlots.release();
    throw err;
  }
}
async function withOracle(fn) {
  throwIfTunnelDown();
  let conn;
  try {
    conn = await getOracleConnection();
    const result = await fn(conn);
    tunnelDownUntil = 0;
    await closeQuietly(conn);
    return result;
  } catch (err) {
    await closeQuietly(conn, true);
    if (isStaleSessionError(err)) {
      await resetPool();
      const retry = await getOracleConnection();
      try {
        const result = await fn(retry);
        tunnelDownUntil = 0;
        await closeQuietly(retry);
        return result;
      } catch (retryErr) {
        await closeQuietly(retry, true);
        if (isTunnelChecksumError(retryErr)) noteTunnelFailure();
        throw retryErr;
      }
    }
    if (isTunnelChecksumError(err)) {
      noteTunnelFailure();
      await resetPool();
    }
    throw err;
  }
}
function oracleValue(row, ...names) {
  const keys = Object.keys(row);
  for (const name of names) {
    const found = keys.find((key) => key.toLowerCase() === name.toLowerCase());
    if (found && row[found] != null) return row[found];
  }
  return null;
}
function oracleNumber(row, ...names) {
  const value = Number(oracleValue(row, ...names));
  return Number.isFinite(value) ? value : null;
}
function oracleText(row, ...names) {
  const value = oracleValue(row, ...names);
  if (value == null) return "";
  return String(value).trim();
}
function oracleDate(row, ...names) {
  const value = oracleValue(row, ...names);
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === "string" && value.trim()) return value;
  return null;
}

// server/materials-entrada-saida.ts
var MATERIAL_TIPOS = [
  "Combust\xEDvel",
  "Lubrificante",
  "Pneu",
  "Servico",
  "Filtro",
  "Graxa",
  "Aditivo",
  "Pe\xE7as e Acess\xF3rios"
];

// server/indicadores/dashboard-materiais.ts
var SITUACOES_SOLICITACAO = [
  "Entregue",
  "Cancelada",
  "Aguardando aprova\xE7\xE3o",
  "Aguardando Pagamento",
  "Aguardando entrega",
  "Sem cota\xE7\xE3o",
  "Em cota\xE7\xE3o",
  "Em negocia\xE7\xE3o"
];
function money(n) {
  return Math.round((n || 0) * 100) / 100;
}
function qty(n) {
  return Math.round((n || 0) * 1e3) / 1e3;
}
function isoToday() {
  const d = /* @__PURE__ */ new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function defaultInicio(fim) {
  const year = Number(fim.slice(0, 4));
  const month = Number(fim.slice(5, 7));
  const startYear = month > 3 || month === 3 && Number(fim.slice(8, 10)) >= 21 ? year : year - 1;
  return `${startYear}-03-21`;
}
function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
}
function mapRow(raw) {
  return {
    data: oracleText(raw, "data_solicitacao", "DATA_SOLICITACAO"),
    nrSolicitacao: oracleText(raw, "nr_solicitacao", "NR_SOLICITACAO") || null,
    nroc: oracleText(raw, "nroc", "NROC") || null,
    codMaterial: oracleNumber(raw, "cod_material", "COD_MATERIAL"),
    descricao: oracleText(raw, "descricao", "DESCRICAO") || "Material",
    qtde: qty(oracleNumber(raw, "qtde", "QTDE") ?? 0),
    preco: oracleNumber(raw, "preco", "PRECO"),
    valor: money(oracleNumber(raw, "valor", "VALOR") ?? 0),
    situacao: oracleText(raw, "situacao_nome", "SITUACAO_NOME") || "Sem cota\xE7\xE3o",
    aval: oracleText(raw, "aval", "AVAL") || null,
    categoria: oracleText(raw, "categoria", "CATEGORIA") || "Sem categoria",
    grupoMaterial: oracleText(raw, "grupo_material", "GRUPO_MATERIAL") || "Sem grupo",
    grupoChave: chaveGrupo(
      oracleNumber(raw, "cod_familia", "COD_FAMILIA"),
      oracleNumber(raw, "cod_grupomaterial", "COD_GRUPOMATERIAL")
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
    codFornecedor: oracleNumber(raw, "cod_fornecedor", "COD_FORNECEDOR")
  };
}
function aplicaFiltros(linhas, filtros, chavesGrupo) {
  const has = (selected, value) => !selected?.length || selected.includes(value);
  return linhas.filter(
    (row) => has(filtros.solicitantes, row.solicitante) && has(filtros.situacoes, row.situacao) && has(filtros.gruposOperacionais, row.categoria) && (chavesGrupo == null || chavesGrupo.has(row.grupoChave)) && has(filtros.tiposSolicitacao, row.tipoSolicitacao) && has(filtros.fornecedores, row.fornecedor)
  );
}
var GRUPOS_MATERIAL = [
  "Combust\xEDvel",
  "Lubrificante",
  "Pneu",
  "Servico",
  "Filtro",
  "Graxa",
  "Aditivo",
  "Pe\xE7as e Acess\xF3rios"
];
var TIPOS_SOLICITACAO = ["Aplica\xE7\xE3o direta", "Compra", "Estoque", "Servi\xE7o"];
function chaveGrupo(familia, grupo) {
  if (familia == null || grupo == null) return "";
  return `${familia}-${grupo}`;
}
function tiposGrupoMaterial(catalogo) {
  const presentes = new Set(catalogo.map((item) => item.tipo));
  return GRUPOS_MATERIAL.filter((tipo) => presentes.has(tipo));
}
var OBJETOS_CUSTO_SQL = [
  82,
  83,
  95,
  416,
  417,
  349,
  96,
  99,
  282,
  102,
  103,
  104,
  106,
  107,
  108,
  140,
  141,
  113,
  114,
  115,
  116,
  117,
  181,
  118,
  119,
  128,
  129,
  132,
  135,
  137,
  139
].join(", ");
function grupoOperacionalSql(campo) {
  return `CASE ${campo}
    WHEN 104 THEN 'CAMINH\xD5ES'
    WHEN 103 THEN 'CAMINH\xD5ES'
    WHEN 140 THEN 'IMPLEMENTOS RODOVI\xC1RIOS'
    WHEN 102 THEN 'AUTOM\xD3VIEIS E UTILIT\xC1RIOS'
    WHEN 115 THEN 'TRATORES'
    WHEN 181 THEN 'TRATORES'
    WHEN 114 THEN 'TRATORES'
    WHEN 116 THEN 'TRATORES'
    WHEN 117 THEN 'TRATORES'
    WHEN 128 THEN 'PIVOT LINEAR'
    WHEN 118 THEN 'IMPLEMENTOS AGR\xCDCOLAS'
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
    WHEN 416 THEN 'OFICINA EL\xC9TRICA AUTOMOTIVA'
    WHEN 417 THEN 'CALDEIRARIA AUTOMOTIVA'
    WHEN 349 THEN 'SERRALHARIA AUTOMOTIVA'
    WHEN 96 THEN 'BORRACHARIA'
    WHEN 99 THEN 'COMBOIO'
    WHEN 282 THEN 'OFICINA EL\xC9TRICA ALTA TENS\xC3O'
    WHEN 95 THEN 'OFICINA MEC\xC2NICA'
    WHEN 106 THEN 'CAMINH\xC3O CANAVIEIRO'
    WHEN 107 THEN 'REBOQUE'
    ELSE NVL(obj.descricao, 'Sem categoria')
  END`;
}
async function carregarLinhas(dataInicio, dataFim) {
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
            -- Regra da p\xE1gina Dashboard do Power BI: n\xE3o considerar fam\xEDlia 1.
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
              -- O Power BI usa o valor realizado quando h\xE1 entrada e a
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
                -- Uma OC sem entrada \xE9 aguardando entrega, independentemente
                -- do \xFAltimo registro de cota\xE7\xE3o que ainda permane\xE7a vinculado.
                WHEN sc.nroc IS NOT NULL THEN 'Aguardando entrega'
                WHEN sc.situacaocotacao = 'L' THEN 'Aguardando aprova\xE7\xE3o'
                WHEN sc.situacaocotacao = 'N' THEN 'Em negocia\xE7\xE3o'
                WHEN sc.situacaocotacao = 'C' THEN 'Em cota\xE7\xE3o'
                -- A aus\xEAncia de cota\xE7\xE3o deve prevalecer sobre a situa\xE7\xE3o de
                -- aprova\xE7\xE3o: s\xE3o informa\xE7\xF5es distintas, e este status \xE9
                -- usado pelo acompanhamento para localizar solicita\xE7\xF5es que
                -- ainda n\xE3o chegaram \xE0 etapa de cota\xE7\xE3o.
                WHEN sc.situacaocotacao IS NULL THEN 'Sem cota\xE7\xE3o'
                WHEN sc.aprovada <> 'T' OR sc.situacao_cod = 'P' THEN 'Aguardando aprova\xE7\xE3o'
                ELSE 'Aguardando aprova\xE7\xE3o'
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
                WHEN sc.servico = 'T' THEN 'Servi\xE7o'
                WHEN sc.aplicacao_direta = 'T' OR sc.compra_aplicacao = 'T' THEN 'Aplica\xE7\xE3o direta'
                WHEN sc.estoque = 'T' THEN 'Estoque'
                ELSE 'Compra'
              END AS tipo_solicitacao,
              NVL(NULLIF(TRIM(func.cscfuncionario), ''), 'Funcion\xE1rio ' || sc.cod_funcionario) AS solicitante,
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
      { maxRows: 0, fetchArraySize: 400 }
    );
    return (result.rows ?? []).map(mapRow);
  });
}
async function carregarCatalogoGruposMaterial() {
  return withOracle(async (conn) => {
    const result = await conn.execute(
      `SELECT CASE
                WHEN tipo = 1 THEN 'Combust\xEDvel'
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
       SELECT 'Pe\xE7as e Acess\xF3rios' AS tipo,
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
      { maxRows: 0 }
    );
    return (result.rows ?? []).flatMap((raw) => {
      const tipo = oracleText(raw, "tipo", "TIPO").trim();
      const chave = oracleText(raw, "chave", "CHAVE").trim();
      if (!tipo || !chave) return [];
      return [{ tipo, chave }];
    });
  });
}
async function gerarAcompanhamentoPedido(filtros) {
  const dataFim = filtros.dataFim?.trim() || isoToday();
  const dataInicio = filtros.dataInicio?.trim() || defaultInicio(dataFim);
  const solicitantes = filtros.solicitantes ?? [];
  const situacoes = (filtros.situacoes ?? []).filter(
    (item) => SITUACOES_SOLICITACAO.includes(item)
  );
  const gruposOperacionais = filtros.gruposOperacionais ?? [];
  const gruposMaterial = filtros.gruposMaterial ?? [];
  const tiposSolicitacao = filtros.tiposSolicitacao ?? [];
  const fornecedores = filtros.fornecedores ?? [];
  const busca = filtros.busca?.trim() || "";
  const campoPesquisa = filtros.campoPesquisa?.trim() || "nrSolicitacao";
  const catalogoGrupos = await carregarCatalogoGruposMaterial();
  const selecionados = new Set(gruposMaterial);
  const chavesGrupo = selecionados.size ? new Set(catalogoGrupos.filter((item) => selecionados.has(item.tipo)).map((item) => item.chave)) : null;
  const todas = await carregarLinhas(dataInicio, dataFim);
  const linhas = aplicaFiltros(
    todas,
    { solicitantes, situacoes, gruposOperacionais, gruposMaterial, tiposSolicitacao, fornecedores },
    chavesGrupo
  ).filter((row) => {
    if (!busca) return true;
    const valores = {
      nrSolicitacao: row.nrSolicitacao ?? "",
      nroc: row.nroc ?? "",
      codMaterial: String(row.codMaterial ?? ""),
      descricao: row.descricao,
      observacao: row.observacao ?? ""
    };
    const valor = (valores[campoPesquisa] ?? "").toLocaleLowerCase("pt-BR");
    const termo = busca.toLocaleLowerCase("pt-BR");
    return ["nrSolicitacao", "nroc", "codMaterial"].includes(campoPesquisa) ? valor === termo : valor.includes(termo);
  });
  const opcoes = {
    solicitantes: uniqueSorted(todas.map((row) => row.solicitante)),
    situacoes: [...SITUACOES_SOLICITACAO],
    gruposOperacionais: uniqueSorted(todas.map((row) => row.categoria)),
    gruposMaterial: tiposGrupoMaterial(catalogoGrupos),
    tiposSolicitacao: uniqueSorted([...TIPOS_SOLICITACAO]),
    fornecedores: uniqueSorted(todas.map((row) => row.fornecedor).filter((item) => item !== "Sem fornecedor"))
  };
  return {
    atualizadoEm: (/* @__PURE__ */ new Date()).toISOString(),
    filtros: { dataInicio, dataFim, solicitantes, situacoes, gruposOperacionais, gruposMaterial, tiposSolicitacao, fornecedores, busca },
    opcoes,
    pedidos: linhas.sort((a, b) => (b.data ?? "").localeCompare(a.data ?? "")).map((row) => ({
      data: row.data,
      nrSolicitacao: row.nrSolicitacao,
      nroc: row.nroc,
      codMaterial: row.codMaterial,
      descricao: row.descricao,
      qtde: row.qtde,
      qtdeEntregue: row.qtdeEntregue,
      preco: row.preco,
      valor: row.valor,
      situacao: row.situacao,
      tempoTotal: row.tempoTotal,
      previsaoEntrega: row.previsaoEntrega,
      dataEntrega: row.dataEntrada,
      aval: row.aval,
      observacao: row.observacao,
      codFornecedor: row.codFornecedor,
      fornecedor: row.fornecedor
    }))
  };
}

// server/indicadores/gestao-materiais.ts
async function listarPendenciasMaterial(codMaterial) {
  const rows = await withOracle(async (conn) => {
    const result = await conn.execute(`
      SELECT sc.nr_solicitacao, oc.nroc, TO_CHAR(sc.data, 'YYYY-MM-DD') AS data,
             GREATEST(0, NVL(sc.qtdesolicitada, 0) - NVL(ent.qtde_entregue, 0)) AS pendente
        FROM material.solicitacaocompra sc
        JOIN (SELECT nr_solicitacao, cod_material, MAX(nroc) nroc
                FROM material.itensordemcompra GROUP BY nr_solicitacao, cod_material) oc
          ON oc.nr_solicitacao = sc.nr_solicitacao AND oc.cod_material = sc.cod_material
        LEFT JOIN (SELECT nr_solicitacao, cod_material, SUM(NVL(quantidade, 0)) qtde_entregue
                     FROM material.itensentrada WHERE nroc IS NOT NULL
                    GROUP BY nr_solicitacao, cod_material) ent
          ON ent.nr_solicitacao = sc.nr_solicitacao AND ent.cod_material = sc.cod_material
       WHERE sc.cod_material = :codMaterial AND sc.cod_almoxarifado = 2
         AND NVL(sc.situacao, ' ') <> 'C' AND oc.nroc IS NOT NULL
         AND NVL(ent.qtde_entregue, 0) < NVL(sc.qtdesolicitada, 0)`, { codMaterial });
    return result.rows.map((row) => ({
      solicitacao: oracleText(row, "NR_SOLICITACAO"),
      ordemCompra: oracleText(row, "NROC"),
      data: oracleText(row, "DATA"),
      quantidade: oracleNumber(row, "PENDENTE") ?? 0
    }));
  });
  if (!rows.length) return [];
  const datas = rows.map((r) => r.data).filter(Boolean).sort();
  const acompanhamento = await gerarAcompanhamentoPedido({
    dataInicio: datas[0] || "1900-01-01",
    dataFim: datas.at(-1) || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
    campoPesquisa: "codMaterial",
    busca: String(codMaterial)
  });
  return rows.map((row) => ({
    ...row,
    situacao: acompanhamento.pedidos.find((p) => String(p.nrSolicitacao) === row.solicitacao)?.situacao ?? "N\xE3o localizada no acompanhamento"
  }));
}
var TIPO_SQL = `NVL(
  CASE pf.tipo
    WHEN 1 THEN 'Combust\xEDvel'
    WHEN 2 THEN 'Lubrificante'
    WHEN 3 THEN 'Pneu'
    WHEN 4 THEN 'Servico'
    WHEN 5 THEN 'Filtro'
    WHEN 6 THEN 'Graxa'
    WHEN 7 THEN 'Aditivo'
  END,
  'Pe\xE7as e Acess\xF3rios'
)`;
function qty2(n) {
  return Math.round((n || 0) * 1e3) / 1e3;
}
function money2(n) {
  return Math.round((n || 0) * 100) / 100;
}
function parseTipos(raw) {
  const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const allowed = new Set(MATERIAL_TIPOS);
  return [
    ...new Set(
      values.flatMap((item) => String(item).split(",")).map((item) => item.trim()).filter((item) => allowed.has(item))
    )
  ];
}
function inBinds(prefix, values) {
  const binds = {};
  const names = values.map((value, i) => {
    const key = `${prefix}${i}`;
    binds[key] = value;
    return `:${key}`;
  });
  return { sql: names.join(", "), binds };
}
function parseCodMateriais(raw) {
  const values = Array.isArray(raw) ? raw : raw == null ? [] : [raw];
  return [...new Set(values.flatMap((value) => String(value).split(",")).map((value) => Number(value.trim())).filter((value) => Number.isInteger(value) && value > 0))];
}
function inNumberBinds(prefix, values) {
  const binds = {};
  const names = values.map((value, index) => {
    const key = `${prefix}${index}`;
    binds[key] = value;
    return `:${key}`;
  });
  return { sql: names.join(", "), binds };
}
function prioridade(cobertura, estoque) {
  if (estoque <= 0) return "critico";
  if (cobertura == null || !Number.isFinite(cobertura)) return "ok";
  if (cobertura < 1) return "critico";
  if (cobertura < 2) return "alto";
  if (cobertura < 3) return "medio";
  return "ok";
}
function mesesNoPeriodo(inicio, fim) {
  const start = /* @__PURE__ */ new Date(`${inicio}T12:00:00`);
  const end = /* @__PURE__ */ new Date(`${fim}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || inicio > fim) return 1;
  return Math.max(1, (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth() + 1);
}
async function listarGestaoMateriaisOpcoes() {
  return withOracle(async (conn) => {
    const [almoxRes, matRes, objRes] = await Promise.all([
      conn.execute(
        `SELECT e.cod_almoxarifado,
                MIN(NVL(a.descricaoalmoxarifado, 'Almoxarifado ' || e.cod_almoxarifado)) AS descricao
           FROM (
             SELECT est.cod_almoxarifado, est.cod_grupoempresa, est.cod_empresa, est.cod_filial, est.quantidade,
                    ROW_NUMBER() OVER (
                      PARTITION BY est.cod_material, est.cod_grupoempresa, est.cod_empresa, est.cod_filial, est.cod_almoxarifado
                      ORDER BY est.anomes DESC
                    ) AS rn
               FROM material.estoque est
              WHERE est.ano <= TO_CHAR(SYSDATE, 'YYYY') AND est.cod_empresa = 1 AND est.cod_filial = 1
           ) e
           LEFT JOIN material.almoxarifado a
             ON a.cod_grupoempresa = e.cod_grupoempresa AND a.cod_empresa = e.cod_empresa
            AND a.cod_filial = e.cod_filial AND a.cod_almoxarifado = e.cod_almoxarifado
          WHERE e.rn = 1 AND e.quantidade > 0
          GROUP BY e.cod_almoxarifado
          ORDER BY e.cod_almoxarifado`
      ),
      conn.execute(
        `SELECT DISTINCT m.cod_material, m.descricao
           FROM material.material m
          WHERE NVL(m.cod_familia, 0) <> 1
          ORDER BY m.descricao`
      ),
      conn.execute(
        `SELECT DISTINCT oc.cod_objetocusto, oc.descricao
           FROM custo.objetocusto oc
          ORDER BY oc.descricao
          FETCH FIRST 300 ROWS ONLY`
      )
    ]);
    return {
      tipos: [...MATERIAL_TIPOS],
      almoxarifados: (almoxRes.rows ?? []).map((raw) => ({
        codigo: oracleNumber(raw, "cod_almoxarifado", "COD_ALMOXARIFADO") ?? 0,
        descricao: oracleText(raw, "descricao", "DESCRICAO") || "Almoxarifado"
      })).filter((row) => row.codigo > 0),
      materiais: (matRes.rows ?? []).map((raw) => ({
        codigo: oracleNumber(raw, "cod_material", "COD_MATERIAL") ?? 0,
        descricao: oracleText(raw, "descricao", "DESCRICAO") || ""
      })).filter((row) => row.codigo > 0),
      objetosCusto: (objRes.rows ?? []).map((raw) => ({
        codigo: oracleNumber(raw, "cod_objetocusto", "COD_OBJETOCUSTO") ?? 0,
        descricao: oracleText(raw, "descricao", "DESCRICAO") || ""
      })).filter((row) => row.codigo > 0)
    };
  });
}
async function gerarGestaoMateriais(filtros) {
  const now = /* @__PURE__ */ new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const defaultFim = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const defaultInicio2 = `${now.getFullYear() - 3}-01-01`;
  const dataFim = filtros.dataFim?.trim() || defaultFim;
  const dataInicio = filtros.dataInicio?.trim() || defaultInicio2;
  const tipos = parseTipos(filtros.tipos);
  const filtraTipo = tipos.length > 0 && tipos.length < MATERIAL_TIPOS.length;
  const tipoBinds = filtraTipo ? inBinds("tp", tipos) : { sql: "", binds: {} };
  const tipoWhere = filtraTipo ? `AND NVL(gt.tipo, 'Pe\xE7as e Acess\xF3rios') IN (${tipoBinds.sql})` : "";
  const almoxRaw = Number(filtros.almoxarifado);
  const almoxarifado = Number.isFinite(almoxRaw) && almoxRaw > 0 ? almoxRaw : null;
  const codMateriais = parseCodMateriais([filtros.codMaterial, ...filtros.codMateriais ?? []]);
  const materialBinds = codMateriais.length ? inNumberBinds("mat", codMateriais) : { sql: "", binds: {} };
  const materialWhere = codMateriais.length ? `AND m.cod_material IN (${materialBinds.sql})` : "";
  const objRaw = Number(filtros.codObjetoCusto);
  const codObjetoCusto = Number.isFinite(objRaw) && objRaw > 0 ? objRaw : null;
  const mesesEstoque = mesesNoPeriodo(dataInicio, dataFim);
  const mesesSugeridaRaw = Number(filtros.mesesSugerida);
  const mesesSugerida = Number.isFinite(mesesSugeridaRaw) && mesesSugeridaRaw > 0 ? Math.round(mesesSugeridaRaw) : 4;
  const rows = await withOracle(async (conn) => {
    const result = await conn.execute(
      `WITH grp_tipo AS (
          SELECT gm.cod_familia,
                 gm.cod_grupomaterial,
                 NVL(gm.descricao, 'Grupo ' || gm.cod_grupomaterial) AS grupo,
                 ${TIPO_SQL} AS tipo
            FROM material.grupomaterial gm
            LEFT JOIN automotivo.parametros_familia pf
              ON pf.cod_familia = gm.cod_familia
             AND pf.cod_grupomaterial = gm.cod_grupomaterial
        ),
        saida_agg AS (
          SELECT r.cod_material,
                 SUM(NVL(r.quantidade, 0)) AS qtde_saida
            FROM material.itensrequisicaomaterial r
            LEFT JOIN LATERAL (
              SELECT hx.cod_objetocusto
                FROM automotivo.historicoequipamentoobcusto hx
               WHERE r.cod_objetocusto IS NULL
                 AND hx.cod_equipamento = r.cod_equipamento
                 AND TRUNC(r.dataretirada)
                     BETWEEN TRUNC(hx.data_inicio)
                     AND TRUNC(NVL(hx.data_final, SYSDATE))
               ORDER BY NVL(hx.data_final, DATE '9999-12-31') DESC, hx.data_inicio DESC
               FETCH FIRST 1 ROW ONLY
            ) h ON 1 = 1
           WHERE r.dataretirada IS NOT NULL
             AND r.data_canc IS NULL
             AND TRUNC(r.dataretirada) >= TO_DATE(:saidaInicio, 'YYYY-MM-DD')
             AND TRUNC(r.dataretirada) <= TO_DATE(:dataFim, 'YYYY-MM-DD')
             AND (:codObjetoCusto IS NULL OR NVL(r.cod_objetocusto, h.cod_objetocusto) = :codObjetoCusto)
           GROUP BY r.cod_material
        ),
        estoque_atual AS (
          SELECT e.cod_material,
                 e.cod_almoxarifado,
                 e.quantidade
            FROM (
              SELECT est.cod_material,
                     est.cod_almoxarifado,
                     est.cod_grupoempresa,
                     est.cod_empresa,
                     est.cod_filial,
                     est.quantidade,
                     ROW_NUMBER() OVER (
                       PARTITION BY est.cod_material,
                                    est.cod_grupoempresa,
                                    est.cod_empresa,
                                    est.cod_filial,
                                    est.cod_almoxarifado
                       ORDER BY est.anomes DESC
                     ) AS rn
                FROM material.estoque est
               WHERE est.ano <= TO_CHAR(SYSDATE, 'YYYY')
                 AND est.cod_empresa = 1
                 AND est.cod_filial = 1
            ) e
           WHERE e.rn = 1
             AND e.quantidade > 0
        ),
        estoque_agg AS (
          SELECT ea.cod_material,
                 SUM(NVL(ea.quantidade, 0)) AS qtde_estoque
            FROM estoque_atual ea
           WHERE (:almoxarifado IS NULL OR ea.cod_almoxarifado = :almoxarifado)
           GROUP BY ea.cod_material
        ),
        ultima_entrada AS (
          SELECT NVL(ie.cod_material, sc.cod_material) AS cod_material,
                 MAX(TRUNC(NVL(ie.dataentrada_seq, sc.data))) AS ultima_entrada
            FROM material.itensentrada ie
            JOIN material.solicitacaocompra sc ON sc.nr_solicitacao = ie.nr_solicitacao
           WHERE ie.nroc IS NOT NULL
             AND NVL(sc.situacao, ' ') <> 'C'
             AND (:codObjetoCusto IS NULL OR sc.cod_objetocusto = :codObjetoCusto)
           GROUP BY NVL(ie.cod_material, sc.cod_material)
        ),
        preco_medio AS (
          SELECT NVL(ie.cod_material, sc.cod_material) AS cod_material,
                 AVG(NVL(ie.valorunitario, 0)) AS preco_medio
            FROM material.itensentrada ie
            JOIN material.solicitacaocompra sc ON sc.nr_solicitacao = ie.nr_solicitacao
           WHERE ie.nroc IS NOT NULL
             AND NVL(ie.valorunitario, 0) > 0
             AND TRUNC(NVL(ie.dataentrada_seq, sc.data)) >= TO_DATE(:dataInicio, 'YYYY-MM-DD')
             AND TRUNC(NVL(ie.dataentrada_seq, sc.data)) <= TO_DATE(:dataFim, 'YYYY-MM-DD')
           GROUP BY NVL(ie.cod_material, sc.cod_material)
        ),
        pendentes_entrega AS (
          SELECT sc.cod_material,
                 SUM(GREATEST(0, NVL(sc.qtdesolicitada, 0) - NVL(ent.qtde_entregue, 0))) AS quantidade_pendente
            FROM material.solicitacaocompra sc
            JOIN (
              SELECT nr_solicitacao, cod_material, MAX(nroc) AS nroc
                FROM material.itensordemcompra
               GROUP BY nr_solicitacao, cod_material
            ) oc ON oc.nr_solicitacao = sc.nr_solicitacao
               AND oc.cod_material = sc.cod_material
            LEFT JOIN (
              SELECT nr_solicitacao, cod_material, SUM(NVL(quantidade, 0)) AS qtde_entregue
                FROM material.itensentrada
               WHERE nroc IS NOT NULL
               GROUP BY nr_solicitacao, cod_material
            ) ent ON ent.nr_solicitacao = sc.nr_solicitacao
                AND ent.cod_material = sc.cod_material
           WHERE sc.cod_almoxarifado = 2
             AND NVL(sc.situacao, ' ') <> 'C'
             AND oc.nroc IS NOT NULL
             AND NVL(ent.qtde_entregue, 0) < NVL(sc.qtdesolicitada, 0)
           GROUP BY sc.cod_material
        ),
        base AS (
          SELECT m.cod_material,
                 NVL(m.descricao, 'Material ' || m.cod_material) AS descricao,
                 NVL(gt.tipo, 'Pe\xE7as e Acess\xF3rios') AS tipo,
                 NVL(gt.grupo, 'Sem grupo') AS grupo,
                 NVL(sa.qtde_saida, 0) AS qtde_saida,
                 NVL(ea.qtde_estoque, 0) AS estoque,
                 ue.ultima_entrada,
                 pm.preco_medio,
                 NVL(pe.quantidade_pendente, 0) AS solicitacoes_pendentes_entrega
            FROM material.material m
            LEFT JOIN grp_tipo gt
              ON gt.cod_familia = m.cod_familia
             AND gt.cod_grupomaterial = m.cod_grupomaterial
            LEFT JOIN saida_agg sa ON sa.cod_material = m.cod_material
            LEFT JOIN estoque_agg ea ON ea.cod_material = m.cod_material
            LEFT JOIN ultima_entrada ue ON ue.cod_material = m.cod_material
            LEFT JOIN preco_medio pm ON pm.cod_material = m.cod_material
            LEFT JOIN pendentes_entrega pe ON pe.cod_material = m.cod_material
           WHERE NVL(m.cod_familia, 0) <> 1
             ${materialWhere}
             AND (NVL(sa.qtde_saida, 0) > 0 OR NVL(ea.qtde_estoque, 0) > 0)
             ${tipoWhere}
        )
        SELECT cod_material, descricao, tipo, grupo, qtde_saida, estoque, ultima_entrada, preco_medio,
               solicitacoes_pendentes_entrega
          FROM base
         ORDER BY tipo, grupo, descricao`,
      {
        dataInicio,
        dataFim,
        saidaInicio: dataInicio,
        almoxarifado,
        codObjetoCusto,
        ...tipoBinds.binds,
        ...materialBinds.binds
      },
      { maxRows: 0, fetchArraySize: 500 }
    );
    const almoxRes = await conn.execute(
      `SELECT e.cod_almoxarifado,
              MIN(NVL(a.descricaoalmoxarifado, 'Almoxarifado ' || e.cod_almoxarifado)) AS descricao
         FROM (
           SELECT est.cod_almoxarifado,
                  est.cod_grupoempresa,
                  est.cod_empresa,
                  est.cod_filial,
                  est.quantidade,
                  ROW_NUMBER() OVER (
                    PARTITION BY est.cod_material,
                                 est.cod_grupoempresa,
                                 est.cod_empresa,
                                 est.cod_filial,
                                 est.cod_almoxarifado
                    ORDER BY est.anomes DESC
                  ) AS rn
             FROM material.estoque est
            WHERE est.ano <= TO_CHAR(SYSDATE, 'YYYY')
              AND est.cod_empresa = 1
              AND est.cod_filial = 1
         ) e
         LEFT JOIN material.almoxarifado a
           ON a.cod_grupoempresa = e.cod_grupoempresa
          AND a.cod_empresa = e.cod_empresa
          AND a.cod_filial = e.cod_filial
          AND a.cod_almoxarifado = e.cod_almoxarifado
        WHERE e.rn = 1
          AND e.quantidade > 0
        GROUP BY e.cod_almoxarifado
        ORDER BY e.cod_almoxarifado`
    );
    const matRes = await conn.execute(
      `SELECT DISTINCT m.cod_material, m.descricao
         FROM material.material m
        WHERE NVL(m.cod_familia, 0) <> 1
        ORDER BY m.descricao`
    );
    const objRes = await conn.execute(
      `SELECT DISTINCT oc.cod_objetocusto, oc.descricao
         FROM custo.objetocusto oc
        ORDER BY oc.descricao
        FETCH FIRST 300 ROWS ONLY`
    );
    return {
      rows: result.rows ?? [],
      almoxarifados: almoxRes.rows ?? [],
      materiais: matRes.rows ?? [],
      objetos: objRes.rows ?? []
    };
  });
  const gruposMap = /* @__PURE__ */ new Map();
  for (const raw of rows.rows) {
    const cod = oracleNumber(raw, "cod_material", "COD_MATERIAL");
    if (cod == null) continue;
    const saida = qty2(oracleNumber(raw, "qtde_saida", "QTDE_SAIDA") ?? 0);
    const estoqueAtual = qty2(oracleNumber(raw, "estoque", "ESTOQUE") ?? 0);
    const mediaMes = qty2(saida / mesesEstoque);
    const coberturaMeses = mediaMes > 0 ? qty2(estoqueAtual / mediaMes) : null;
    const precoMedioRaw = oracleNumber(raw, "preco_medio", "PRECO_MEDIO");
    const precoMedio = precoMedioRaw != null ? money2(precoMedioRaw) : null;
    const qtdSugerida = qty2(Math.max(0, mediaMes * mesesSugerida - estoqueAtual));
    const tipo = oracleText(raw, "tipo", "TIPO") || "Pe\xE7as e Acess\xF3rios";
    const grupo = oracleText(raw, "grupo", "GRUPO") || "Sem grupo";
    const ultima = oracleDate(raw, "ultima_entrada", "ULTIMA_ENTRADA");
    const item = {
      codMaterial: cod,
      descricao: oracleText(raw, "descricao", "DESCRICAO") || `Material ${cod}`,
      tipo,
      grupo,
      codAlmoxarifado: almoxarifado,
      codObjetoCusto,
      saida,
      mediaMes,
      estoqueAtual,
      coberturaMeses,
      ultimaEntrada: ultima ? ultima.slice(0, 10) : null,
      qtdSugerida,
      prioridade: prioridade(coberturaMeses, estoqueAtual),
      precoMedio,
      quantidadePendenteEntrega: qty2(oracleNumber(raw, "solicitacoes_pendentes_entrega", "SOLICITACOES_PENDENTES_ENTREGA") ?? 0)
    };
    const key = tipo;
    const label = tipo === "Pe\xE7as e Acess\xF3rios" ? "Pe\xE7as e Acess\xF3rios Automotivos" : tipo;
    const prev = gruposMap.get(key) ?? {
      tipo: key,
      label,
      itens: [],
      totais: { saida: 0, mediaMes: 0, estoqueAtual: 0, qtdSugerida: 0 }
    };
    prev.itens.push(item);
    prev.totais.saida = qty2(prev.totais.saida + item.saida);
    prev.totais.mediaMes = qty2(prev.totais.mediaMes + item.mediaMes);
    prev.totais.estoqueAtual = qty2(prev.totais.estoqueAtual + item.estoqueAtual);
    prev.totais.qtdSugerida = qty2(prev.totais.qtdSugerida + item.qtdSugerida);
    gruposMap.set(key, prev);
  }
  const grupos = [...gruposMap.values()].sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  const totais = grupos.reduce(
    (acc, g) => ({
      saida: qty2(acc.saida + g.totais.saida),
      mediaMes: qty2(acc.mediaMes + g.totais.mediaMes),
      estoqueAtual: qty2(acc.estoqueAtual + g.totais.estoqueAtual),
      qtdSugerida: qty2(acc.qtdSugerida + g.totais.qtdSugerida)
    }),
    { saida: 0, mediaMes: 0, estoqueAtual: 0, qtdSugerida: 0 }
  );
  return {
    filtros: {
      dataInicio,
      dataFim,
      tipos,
      almoxarifado,
      codMaterial: codMateriais.length === 1 ? codMateriais[0] : null,
      codObjetoCusto,
      mesesEstoque,
      mesesSugerida
    },
    tipos: [...MATERIAL_TIPOS],
    almoxarifados: rows.almoxarifados.map((raw) => ({
      codigo: oracleNumber(raw, "cod_almoxarifado", "COD_ALMOXARIFADO") ?? 0,
      descricao: oracleText(raw, "descricao", "DESCRICAO") || "Almoxarifado"
    })).filter((row) => row.codigo > 0),
    materiais: rows.materiais.map((raw) => ({
      codigo: oracleNumber(raw, "cod_material", "COD_MATERIAL") ?? 0,
      descricao: oracleText(raw, "descricao", "DESCRICAO") || ""
    })).filter((row) => row.codigo > 0),
    objetosCusto: rows.objetos.map((raw) => ({
      codigo: oracleNumber(raw, "cod_objetocusto", "COD_OBJETOCUSTO") ?? 0,
      descricao: oracleText(raw, "descricao", "DESCRICAO") || ""
    })).filter((row) => row.codigo > 0),
    grupos,
    totais
  };
}
export {
  gerarGestaoMateriais,
  listarGestaoMateriaisOpcoes,
  listarPendenciasMaterial
};
