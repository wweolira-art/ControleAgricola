import { carregarDescricoesFazendas, gerarAnaliseBiometrica } from "./analise-biometrica.js";
import { carregarCompactacaoSolo } from "./compactacao-solo.js";
import { carregarEntomologicoOracle } from "./mapa-fazendas.js";
import { resolveOracleCodSafra } from "../colheita/oracle-safra.js";
import { withOracle } from "../oracle.js";
import { diagnosticoTch } from './diagnostico-tch.js';
import { consolidarAnaliseGeralFazendas, type AnaliseGeralFazendasData } from "../../src/lib/analiseGeralFazendas.js";
import { periodosAnaliseGeralPadrao, validarPeriodosAnaliseGeral, type AnaliseGeralPeriodos } from "../../src/lib/analiseGeralPeriodos.js";

export async function gerarAnaliseGeralFazendas(inicio: string, fim: string, safraCode: string | null, filtrosPeriodos?: AnaliseGeralPeriodos): Promise<AnaliseGeralFazendasData> {
  const periodos = validarPeriodosAnaliseGeral(filtrosPeriodos ?? periodosAnaliseGeralPadrao(inicio, fim));
  const entomologia = async () => {
    const codSafra = safraCode ? await withOracle((conn) => resolveOracleCodSafra(conn, safraCode)) : null;
    if (safraCode && codSafra == null) throw new Error("Não foi possível identificar a safra da entomologia.");
    return [...(await carregarEntomologicoOracle(periodos.tocos.inicio, periodos.tocos.fim, codSafra)).values()];
  };
  const [cadastro, compactacao, tocos, biometria] = await Promise.allSettled([
    carregarDescricoesFazendas(), carregarCompactacaoSolo({ dataInicio: periodos.compactacao.inicio, dataFim: periodos.compactacao.fim }), entomologia(), gerarAnaliseBiometrica(periodos.tch.inicio, periodos.tch.fim),
  ]);
  const avisos: string[] = [];
  for (const [label, result] of [["Cadastro de fazendas", cadastro], ["Compactação do solo", compactacao], ["Tocos %", tocos], ["Análise biométrica", biometria]] as const) {
    if (result.status === "rejected") {
      console.warn(`[analise-geral-fazendas] ${label}:`, result.reason instanceof Error ? result.reason.message : result.reason);
      avisos.push(label === "Análise biométrica" && result.reason instanceof Error && result.reason.message.includes("Não há dados biométricos locais")
        ? "Análise biométrica: ainda não existem dados importados neste servidor."
        : `${label}: não foi possível consultar os dados. Tente novamente.`);
    }
  }
  if (compactacao.status === "rejected" && tocos.status === "rejected" && biometria.status === "rejected") throw new Error("Não foi possível consultar as fontes da análise geral. Tente novamente.");
  const ultimas = new Map<string, import('./analise-biometrica.js').AnaliseBiometricaRegistro>();
  if (biometria.status === 'fulfilled') for (const r of biometria.value.registros) {
    if (r.tch == null || !Number.isFinite(r.tch)) continue;
    const key = `${r.fazenda}:${r.talhao}`;
    if (!ultimas.has(key) || ultimas.get(key)!.data < r.data) ultimas.set(key, r);
  }
  let diagnostico: Awaited<ReturnType<typeof diagnosticoTch>> | undefined;
  if (biometria.status === 'fulfilled') {
    try { diagnostico = await diagnosticoTch([...ultimas.values()], safraCode); }
    catch { avisos.push('Diagnóstico por talhão indisponível: não foi possível consultar o Oracle.'); }
  }
  return {
    diagnostico,
    fazendas: consolidarAnaliseGeralFazendas({
      cadastro: cadastro.status === "fulfilled" ? [...cadastro.value].map(([codigo, nome]) => ({ codigo, nome })) : [],
      compactacao: compactacao.status === "fulfilled" ? compactacao.value : null,
      entomologia: tocos.status === "fulfilled" ? tocos.value : [],
      biometria: [...ultimas.values()],
    }), avisos, atualizadoEm: new Date().toISOString(), periodos,
  };
}
