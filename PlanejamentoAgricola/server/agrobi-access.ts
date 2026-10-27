const DEFAULT_ACCESS_URL =
  "https://g58645a2c384a96-bd1.adb.sa-saopaulo-1.oraclecloudapps.com/ords/admin/app_acesso_aba/";

export const AGROBI_TABS = [
  { id: "mapa", label: "Mapa" },
  { id: "cadastros", label: "Cadastros" },
  { id: "insumos", label: "Insumos" },
  { id: "mao-de-obra", label: "Mão de obra" },
  { id: "irrigacao", label: "Irrigação" },
  { id: "salvos", label: "Apontamentos salvos" },
  { id: "perdas", label: "Perdas de colheita" },
  { id: "biometria", label: "Análise biométrica" },
  { id: "talhoes-admin", label: "Talhões (administrador)" },
  { id: "usuarios", label: "Usuários (administrador)" },
  { id: "conexao", label: "Conexão Oracle (administrador)" },
] as const;

export type AgroBiTabId = (typeof AGROBI_TABS)[number]["id"];
export type AgroBiAccess = { idUsuario: number; abas: AgroBiTabId[] };

const requiredTabs: AgroBiTabId[] = ["cadastros", "salvos"];
const validTabs = new Set<string>(AGROBI_TABS.map((tab) => tab.id));
type OrdsRow = { id_usuario?: unknown; aba?: unknown; links?: Array<{ rel?: unknown; href?: unknown }> };

function baseUrl() {
  const value = process.env.AGROBI_ACCESS_TABS_ORDS_URL?.trim() || DEFAULT_ACCESS_URL;
  return new URL(value.endsWith("/") ? value : `${value}/`);
}

function normalizeUserId(value: unknown) {
  const idUsuario = Number(value);
  if (!Number.isSafeInteger(idUsuario) || idUsuario <= 0) throw new Error("Informe um código de usuário válido.");
  return idUsuario;
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

function asAccess(idUsuario: number, rows: OrdsRow[]): AgroBiAccess {
  const abas = [...new Set(rows
    .filter((row) => Number(row.id_usuario) === idUsuario)
    .map((row) => String(row.aba ?? "").trim())
    .filter((tab): tab is AgroBiTabId => validTabs.has(tab)))];
  return { idUsuario, abas: [...new Set([...requiredTabs, ...abas])] };
}

export async function getAgroBiAccess(value: unknown) {
  const idUsuario = normalizeUserId(value);
  return asAccess(idUsuario, await allRows());
}

export async function setAgroBiAccess(value: unknown, desiredInput: unknown) {
  const idUsuario = normalizeUserId(value);
  if (!Array.isArray(desiredInput) || desiredInput.some((tab) => typeof tab !== "string" || !validTabs.has(tab))) {
    throw new Error("Lista de telas do AgroBi inválida.");
  }
  const desired = [...new Set([...requiredTabs, ...desiredInput])] as AgroBiTabId[];
  const base = baseUrl();
  const existingRows = (await allRows()).filter((row) => Number(row.id_usuario) === idUsuario);

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
    if (!existingTabs.has(aba)) await request(base, "POST", { id_usuario: idUsuario, aba });
  }
  return getAgroBiAccess(idUsuario);
}

/** Remove todas as linhas de acesso de um código que deixou de identificar o usuário. */
export async function clearAgroBiAccess(value: unknown) {
  const idUsuario = normalizeUserId(value);
  const base = baseUrl();
  const existingRows = (await allRows()).filter((row) => Number(row.id_usuario) === idUsuario);
  for (const row of existingRows) {
    const href = row.links?.find((link) => link.rel === "self")?.href;
    if (!href) throw new Error("A API do AgroBi não retornou o link de um acesso a remover.");
    const target = new URL(String(href), base);
    if (target.origin !== base.origin || !target.pathname.startsWith(base.pathname) || target.pathname === base.pathname) {
      throw new Error("A API do AgroBi retornou um link de remoção inválido.");
    }
    await request(target, "DELETE");
  }
}
