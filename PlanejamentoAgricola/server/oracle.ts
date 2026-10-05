import "./uv-threadpool.js";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import oracledb from "oracledb";

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
oracledb.fetchAsString = [oracledb.CLOB];

const ORACLE_NET_DIR = join(dirname(fileURLToPath(import.meta.url)), "oracle-net");

let loadedEnv = false;
let thickReady = false;
let pool: oracledb.Pool | null = null;
let poolPromise: Promise<oracledb.Pool> | null = null;
let resetPromise: Promise<void> | null = null;

function envFilePath() {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "..", ".env");
}

export function loadEnvFile() {
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
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] == null) process.env[key] = value;
  }
}

function appRoot() {
  return join(dirname(fileURLToPath(import.meta.url)), "..");
}

function dirWithOci(dir: string) {
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
      join(root, "instantclient-basic-windows.x64-23.26.1.0.0"),
    ]),
    String.raw`C:\instantclient-basic-windows.x64-23.26.1.0.0\instantclient_23_0`,
    String.raw`C:\instantclient-basic-windows.x64-23.26.0.0.0\instantclient_23_0`,
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
      /* pasta inacessível */
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
    const clientOpts: oracledb.InitOracleClientOptions = {};
    if (libDir) clientOpts.libDir = libDir;
    if (process.env.TNS_ADMIN) clientOpts.configDir = process.env.TNS_ADMIN;
    if (!libDir) {
      console.warn(
        "Oracle Instant Client não encontrado neste computador. Copie a pasta instantclient junto com o app (oci.dll) ou defina ORACLE_CLIENT_LIB_DIR. Indicadores tentarão o modo thin.",
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
      `Não foi possível iniciar o Oracle Instant Client${libDir ? ` em ${libDir}` : ""}. Copie a pasta do Instant Client junto com o projeto (arquivo oci.dll) ou ajuste ORACLE_CLIENT_LIB_DIR. ${message}`,
    );
  }
}

function oracleErrorText(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

function isStaleSessionError(err: unknown) {
  return /DPI-1010|DPI-1080|NJS-003|NJS-500|not connected|invalid or closed connection/i.test(oracleErrorText(err));
}

function isTunnelChecksumError(err: unknown) {
  return /ORA-12569|ORA-12537|ORA-12547|ORA-12570|packet checksum/i.test(oracleErrorText(err));
}

function isQueueTimeoutError(err: unknown) {
  return /NJS-040|NJS-076|queueTimeout|queueMax/i.test(oracleErrorText(err));
}

const TUNNEL_COOLDOWN_MS = 20_000;
const CHECKOUT_MAX = Math.max(1, Number(process.env.ORACLE_CHECKOUT_MAX || 1) || 1);
const POOL_MAX = Math.max(8, Number(process.env.ORACLE_POOL_MAX || 8) || 8);
let tunnelDownUntil = 0;
let lastTunnelLog = 0;
let lastQueueLog = 0;
let checkoutChain: Promise<unknown> = Promise.resolve();

/** Semáforo FIFO: o slot só passa ao próximo no release (sem corrida no acquire). */
class OracleSlotGate {
  generation = 0;
  private active = 0;
  private readonly waiters: Array<() => void> = [];
  constructor(private readonly max: number) {}
  acquire() {
    return new Promise<void>((resolve) => {
      if (this.active < this.max) {
        this.active += 1;
        resolve();
        return;
      }
      this.waiters.push(resolve);
    });
  }
  release(generation?: number) {
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
  private grantWaiters() {
    while (this.active < this.max && this.waiters.length) {
      this.active += 1;
      this.waiters.shift()!();
    }
  }
}

const oracleSlots = new OracleSlotGate(CHECKOUT_MAX);

function enqueueCheckout<T>(fn: () => Promise<T>): Promise<T> {
  const run = checkoutChain.then(fn, fn);
  checkoutChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** Evita Promise.all de N consultas Oracle simultâneas (NJS-040). */
export async function runLimited<T>(tasks: Array<() => Promise<T>>, limit = 1): Promise<T[]> {
  if (!tasks.length) return [];
  const out: T[] = new Array(tasks.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, limit), tasks.length) }, async () => {
    while (true) {
      const idx = next;
      next += 1;
      if (idx >= tasks.length) return;
      out[idx] = await tasks[idx]!();
    }
  });
  await Promise.all(workers);
  return out;
}

function attachSlotRelease(conn: oracledb.Connection) {
  const originalClose = conn.close.bind(conn);
  const generation = oracleSlots.generation;
  let released = false;
  const releaseOnce = () => {
    if (released) return;
    released = true;
    oracleSlots.release(generation);
  };
  conn.close = (async (...args: never[]) => {
    try {
      return await originalClose(...args);
    } finally {
      releaseOnce();
    }
  }) as typeof conn.close;
  return conn;
}

function noteTunnelFailure() {
  tunnelDownUntil = Date.now() + TUNNEL_COOLDOWN_MS;
  if (Date.now() - lastTunnelLog < TUNNEL_COOLDOWN_MS) return;
  lastTunnelLog = Date.now();
  console.warn(
    "Oracle indisponível (ORA-12569): o túnel TNS/ngrok entregou um pacote corrompido. Reinicie o ngrok, atualize ORACLE_CONNECT_STRING se a porta mudou e recarregue a tela. Nova tentativa automática em 20s.",
  );
}

function throwIfTunnelDown() {
  const waitMs = tunnelDownUntil - Date.now();
  if (waitMs <= 0) return;
  const seconds = Math.ceil(waitMs / 1000);
  throw new Error(
    `ORA-12569: TNS:packet checksum failure. Túnel Oracle indisponível; nova tentativa em ${seconds}s.`,
  );
}

async function closeWithTimeout(conn: oracledb.Connection, opts?: { drop: boolean }, ms = 8_000) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      conn.close(opts),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("oracle close timeout")), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function closeQuietly(conn: oracledb.Connection | undefined, drop = false) {
  if (!conn) return;
  try {
    await closeWithTimeout(conn, drop ? { drop: true } : undefined);
    return;
  } catch {
    /* tenta descartar a sessão antes de recriar o pool */
  }
  try {
    await closeWithTimeout(conn, { drop: true }, 4_000);
  } catch {
    console.warn("Oracle: falha ao devolver conexão; recriando o pool.");
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
        /* pool já pode ter caído com o túnel */
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
  const connectString =
    process.env.ORACLE_CONNECT_STRING || process.env.ORACLE_DSN || process.env.DB_CONNECT_STRING;
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
    enableStatistics: false,
  });
}

async function getPool() {
  if (pool) return pool;
  if (!poolPromise) {
    poolPromise = createPool()
      .then((created) => {
        pool = created;
        return created;
      })
      .finally(() => {
        poolPromise = null;
      });
  }
  return poolPromise;
}

async function waitForPoolSeat() {
  const current = await getPool();
  if (current.connectionsInUse < current.poolMax) return current;
  console.warn(
    `Oracle: pool lotado (${current.connectionsInUse}/${current.poolMax}) sem devolver conexão; recriando o pool.`,
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

function logQueueExhausted(err: unknown) {
  if (Date.now() - lastQueueLog < 15_000) return;
  lastQueueLog = Date.now();
  const stats = pool
    ? ` abertas=${pool.connectionsOpen} emUso=${pool.connectionsInUse} poolMax=${POOL_MAX} checkoutMax=${CHECKOUT_MAX}`
    : "";
  const message = oracleErrorText(err);
  const empty = pool != null && pool.connectionsOpen === 0 && pool.connectionsInUse === 0;
  console.warn(
    empty
      ? `Oracle: abertura da conexão excedeu o tempo (${message}). Nova tentativa.${stats}`
      : `Oracle: fila do pool esgotada (${message}). Nova tentativa sem recriar o pool.${stats}`,
  );
}

export async function getOracleConnection() {
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

export async function withOracle<T>(fn: (conn: oracledb.Connection) => Promise<T>) {
  throwIfTunnelDown();
  let conn: oracledb.Connection | undefined;
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

export function oracleValue(row: Record<string, unknown>, ...names: string[]) {
  const keys = Object.keys(row);
  for (const name of names) {
    const found = keys.find((key) => key.toLowerCase() === name.toLowerCase());
    if (found && row[found] != null) return row[found];
  }
  return null;
}

export function oracleNumber(row: Record<string, unknown>, ...names: string[]) {
  const value = Number(oracleValue(row, ...names));
  return Number.isFinite(value) ? value : null;
}

export function oracleText(row: Record<string, unknown>, ...names: string[]) {
  const value = oracleValue(row, ...names);
  if (value == null) return "";
  return String(value).trim();
}

export function oracleDate(row: Record<string, unknown>, ...names: string[]) {
  const value = oracleValue(row, ...names);
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === "string" && value.trim()) return value;
  return null;
}
