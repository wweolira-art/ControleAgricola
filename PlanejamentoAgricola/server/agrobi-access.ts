const DEFAULT_ACCESS_URL =
  "https://g58645a2c384a96-bd1.adb.sa-saopaulo-1.oraclecloudapps.com/ords/admin/app_acesso_aba/";

export const AGROBI_TABS = [
  { id: "mapa", label: "Mapa" },
  { id: "cadastros", label: "Cadastros" },
  { id: "insumos", label: "Insumos" },
  { id: "mao-de-obra", label: "Mão de obra" },
  { id: "salvos", label: "Apontamentos salvos" },
  { id: "perdas", label: "Perdas de colheita" },
  { id: "biometria", label: "Análise biométrica" },
  { id: "talhoes-admin", label: "Talhões (administrador)" },
  { id: "usuarios", label: "Usuários (administrador)" },
  { id: "conexao", label: "Conexão Oracle (administrador)" },
] as const;

export type AgroBiTabId = (typeof AGROBI_TABS)[number]["id"];
export type AgroBiAccess = { email: string; abas: AgroBiTabId[] };

const requiredTabs: AgroBiTabId[] = ["cadastros", "salvos"];
const validTabs = new Set<string>(AGROBI_TABS.map((tab) => tab.id));
type OrdsRow = { email?: unknown; aba?: unknown; links?: Array<{ rel?: unknown; href?: unknown }> };

function baseUrl() {
  const value = process.env.AGROBI_ACCESS_TABS_ORDS_URL?.trim() || DEFAULT_ACCESS_URL;
  return new URL(value.endsWith("/") ? value : `${value}/`);
}

function normalizeEmail(value: unknown) {
  const email = String(value ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Informe um e-mail válido.");
  return email;
}

async function request(url: URL, method = "GET", body?: unknown) {
  const response = await fetch(url, {
    method,
    headers: { Accept: "application/json", ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`API de permissões do AgroBi retornou HTTP ${response.status}.`);
  return response;
}

async function allRows() {
  const base = baseUrl();
  const rows: OrdsRow[] = [];
  let offset = 0;
  while (true) {
    const url = new URL(base);
    url.searchParams.set("limit", "500");
    url.searchParams.set("offset", String(offset));
    const payload = (await request(url)).json() as Promise<{ items?: OrdsRow[]; hasMore?: boolean }>;
    const data = await payload;
    const items = Array.isArray(data.items) ? data.items : [];
    rows.push(...items);
    if (!data.hasMore || !items.length) return rows;
    offset += items.length;
    if (offset > 100_000) throw new Error("Não foi possível concluir a leitura das permissões do AgroBi.");
  }
}

function asAccess(email: string, rows: OrdsRow[]): AgroBiAccess {
  const abas = [...new Set(rows
    .filter((row) => String(row.email ?? "").trim().toLowerCase() === email)
    .map((row) => String(row.aba ?? "").trim())
    .filter((tab): tab is AgroBiTabId => validTabs.has(tab)))];
  return { email, abas: [...new Set([...requiredTabs, ...abas])] };
}

export async function getAgroBiAccess(value: unknown) {
  const email = normalizeEmail(value);
  return asAccess(email, await allRows());
}

export async function setAgroBiAccess(value: unknown, desiredInput: unknown) {
  const email = normalizeEmail(value);
  if (!Array.isArray(desiredInput) || desiredInput.some((tab) => typeof tab !== "string" || !validTabs.has(tab))) {
    throw new Error("Lista de telas do AgroBi inválida.");
  }
  const desired = [...new Set([...requiredTabs, ...desiredInput])] as AgroBiTabId[];
  const base = baseUrl();
  const existingRows = (await allRows()).filter((row) => String(row.email ?? "").trim().toLowerCase() === email);

  for (const row of existingRows.filter((row) => !desired.includes(String(row.aba ?? "") as AgroBiTabId))) {
    const href = row.links?.find((link) => link.rel === "self")?.href;
    if (!href) throw new Error("A API do AgroBi não retornou o link de um acesso a remover.");
    const target = new URL(String(href), base);
    if (target.origin !== base.origin || !target.pathname.startsWith(base.pathname) || target.pathname === base.pathname) {
      throw new Error("A API do AgroBi retornou um link de remoção inválido.");
    }
    await request(target, "DELETE");
  }

  const existingTabs = new Set(existingRows.map((row) => String(row.aba ?? "").trim()));
  for (const aba of desired) {
    if (!existingTabs.has(aba)) await request(base, "POST", { email, aba });
  }
  return getAgroBiAccess(email);
}
