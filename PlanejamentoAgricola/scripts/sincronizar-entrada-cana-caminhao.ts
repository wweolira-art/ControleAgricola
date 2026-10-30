import { sincronizarEntradaCanaCaminhaoLocal } from "../server/colheita/entrada-cana-caminhao-list.js";

const result = await sincronizarEntradaCanaCaminhaoLocal();
console.log(`Sincronização concluída: ${result.importados} entradas de cana por caminhão copiadas para o SQLite local (${result.paginasOrds} páginas da API).`);
if (result.truncado) console.warn("A API informou que há mais registros; execute novamente com a fonte sem limite configurado.");
