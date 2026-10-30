import { gerarAnaliseBiometrica } from "../server/indicadores/analise-biometrica.js";

const [inicio, fim] = process.argv.slice(2);
if (!inicio || !fim) {
  throw new Error("Uso: npx tsx scripts/sincronizar-analise-biometrica.ts AAAA-MM-DD AAAA-MM-DD");
}

const data = await gerarAnaliseBiometrica(inicio, fim);
console.log(`Sincronização concluída: ${data.registros.length} registros consolidados e ${data.pontos.length} pontos no período ${inicio} a ${fim}.`);
