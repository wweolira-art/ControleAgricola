import { authStorage } from "../api";
import type { RendimentoData, RendimentoOpcoes, RendimentoParametro } from "./rendimento-agricola";

async function request<T>(path: string, body?: unknown): Promise<T> {
  const token = authStorage.getToken();
  const response = await fetch(`/api/indicadores/rendimento-agricola${path}`, {
    method: body === undefined ? "GET" : "PUT", cache: "no-store", redirect: "manual",
    headers: { Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.headers.get("content-type")?.includes("application/json")) throw new Error("Rendimento Agrícola indisponível nesta versão do servidor. Atualize e reinicie o sistema.");
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Não foi possível concluir a solicitação.");
  return data as T;
}

export const rendimentoAgricolaApi = {
  opcoes: () => request<RendimentoOpcoes>("/opcoes"),
  consultar: (inicio: string, fim: string) => request<RendimentoData>(`?${new URLSearchParams({ inicio, fim })}`),
  salvar: (parametro: Pick<RendimentoParametro, "codObjetoCusto" | "codOperacao" | "rendimentoPrevisto" | "consumoPrevisto">) => request<RendimentoParametro>("/parametros", parametro),
};
