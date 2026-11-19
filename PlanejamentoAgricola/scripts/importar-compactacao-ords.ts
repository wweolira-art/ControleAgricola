import { importarPenetrometroRegistros, type PenetrometroRow } from "../server/colheita/penetrometro.js";

const origem = process.env.COMPACTACAO_ORDS_URL?.trim()
  || process.env.ORDS_PENETROMETRO_URL?.trim()
  || "https://g58645a2c384a96-bd1.adb.sa-saopaulo-1.oraclecloudapps.com/ords/admin/compactacaopenetrometro/";

async function carregarOrds() {
  const registros = new Map<string, PenetrometroRow>();
  for (let offset = 0; offset < 200_000; offset += 100) {
    const url = new URL(origem);
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("limit", "100");
    const resposta = await fetch(url, { signal: AbortSignal.timeout(30_000), headers: { Accept: "application/json" } });
    if (!resposta.ok) throw new Error(`ORDS respondeu HTTP ${resposta.status}.`);
    const pagina = await resposta.json() as { items?: PenetrometroRow[]; hasMore?: boolean };
    if (!Array.isArray(pagina.items)) throw new Error("Resposta inválida da ORDS para compactação do solo.");
    for (const item of pagina.items) {
      const chave = String(item.idunico ?? item.idexibido ?? `${item.equipamento}:${item["dataehora(utc)"]}:${item.latitude}:${item.longitude}`);
      registros.set(chave, item);
    }
    if (!pagina.items.length || pagina.hasMore === false || (pagina.hasMore == null && pagina.items.length < 100)) break;
  }
  return [...registros.values()];
}

const dados = await carregarOrds();
const resultado = importarPenetrometroRegistros(dados);
console.log(`Compactação do solo: ${dados.length} registro(s) lido(s) da ORDS; ${resultado.inseridos} inserido(s), ${resultado.atualizados} atualizado(s), ${resultado.erros.length} erro(s).`);
if (resultado.erros.length) {
  console.error(resultado.erros.slice(0, 20));
  process.exitCode = 1;
}
