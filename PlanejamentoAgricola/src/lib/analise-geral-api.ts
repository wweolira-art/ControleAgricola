import type { AnaliseGeralFazendasData } from "./analiseGeralFazendas";
import { ANALISE_GERAL_COLUNAS, type AnaliseGeralPeriodos } from "./analiseGeralPeriodos";

/** Cliente próprio da aba, independente de versões anteriores do objeto global api. */
export async function consultarAnaliseGeralFazendas(
  params: { inicio: string; fim: string; periodos?: AnaliseGeralPeriodos; safraCode?: string; token: string | null }, transport: typeof fetch = fetch,
): Promise<AnaliseGeralFazendasData> {
  const query = new URLSearchParams({ inicio: params.inicio, fim: params.fim });
  if (params.safraCode) query.set("safraCode", params.safraCode);
  if (params.periodos) for (const { key } of ANALISE_GERAL_COLUNAS) {
    query.set(`${key}Inicio`, params.periodos[key].inicio);
    query.set(`${key}Fim`, params.periodos[key].fim);
  }
  const response = await transport(`/api/indicadores/analise-geral-fazendas?${query}`, {
    headers: { Accept: "application/json", ...(params.token ? { Authorization: `Bearer ${params.token}` } : {}) },
    cache: "no-store", redirect: "manual",
  });
  if (response.status === 401) throw new Error("Sessão expirada ou inválida. Entre novamente no sistema.");
  if (response.status === 404 || !response.headers.get("content-type")?.includes("application/json")) {
    throw new Error("A análise geral ainda não está disponível nesta versão do servidor. Atualize e reinicie o sistema.");
  }
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Não foi possível consultar a análise geral das fazendas.");
  if (!Array.isArray(body.fazendas) || !Array.isArray(body.avisos) || typeof body.atualizadoEm !== "string") {
    throw new Error("A resposta da análise geral está incompleta. Atualize o sistema e tente novamente.");
  }
  if (params.periodos && ANALISE_GERAL_COLUNAS.some(({ key }) => body.periodos?.[key]?.inicio !== params.periodos![key].inicio || body.periodos?.[key]?.fim !== params.periodos![key].fim)) {
    throw new Error("O servidor ainda não aplicou os períodos independentes. Atualize e reinicie o sistema.");
  }
  return body as AnaliseGeralFazendasData;
}
