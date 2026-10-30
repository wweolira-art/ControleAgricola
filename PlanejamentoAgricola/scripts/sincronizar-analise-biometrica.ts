import { gerarAnaliseBiometrica, sincronizarTodosLancamentosBiometricos } from "../server/indicadores/analise-biometrica.js";

const [inicio, fim] = process.argv.slice(2);
if (!inicio && !fim) {
  const result = await sincronizarTodosLancamentosBiometricos();
  console.log(`Sincronização completa concluída: ${result.itens} itens e ${result.lancamentos} lançamentos copiados para o SQLite local.`);
} else {
  if (!inicio || !fim) throw new Error("Informe as duas datas no formato AAAA-MM-DD ou nenhuma data para migrar todo o histórico.");
  const data = await gerarAnaliseBiometrica(inicio, fim);
  console.log(`Sincronização do período concluída: ${data.registros.length} registros consolidados e ${data.pontos.length} pontos no período ${inicio} a ${fim}.`);
}
