import { sincronizarEntradaCanaMaquinaLocal } from "../server/colheita/entrada-cana-maquina-list.js";

const result = await sincronizarEntradaCanaMaquinaLocal();
console.log(`Sincronização concluída: ${result.importados} entradas de cana por máquina copiadas para o SQLite local (${result.paginasOrds} páginas da API).`);
if (result.truncado) console.warn("A API informou que há mais registros; execute novamente com a fonte sem limite configurado.");
