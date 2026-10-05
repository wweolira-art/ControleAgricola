import { writeFileSync } from "node:fs";
import { withOracle } from "./server/oracle.ts";

async function main() {
  const rows = await withOracle(async (conn) => {
    const vazao = await conn.execute(`
      SELECT ROUND(AVG(ins.vazao),2) avg_v, ROUND(MIN(ins.vazao),2) min_v, ROUND(MAX(ins.vazao),2) max_v,
             ROUND(AVG(it.area),2) avg_a
        FROM agricola.irrigacaoosinsumo ins
        JOIN agricola.irrigacaoositem it
          ON ins.ano_ordemservico = it.ano_ordemservico AND ins.nr_ordemservico = it.nr_ordemservico AND ins.item_ordemservico = it.item_ordemservico
         AND ins.cod_grupoempresa = it.cod_grupoempresa
        JOIN agricola.ordemservico o ON o.ano_ordemservico = it.ano_ordemservico AND o.nr_ordemservico = it.nr_ordemservico
       WHERE o.tipo_ordem='I' AND ins.tipo_insumo='E'
         AND o.data_inicio >= TO_DATE('2025-09-01','YYYY-MM-DD')
         AND ROWNUM <= 5000
    `);
    // tentativa: media ponderada de (vazao) como se fosse lamina por OS
    const mensal = await conn.execute(`
      SELECT TO_CHAR(TRUNC(o.data_inicio,'MM'),'YYYY-MM') mes,
             ROUND(SUM(NVL(ins.vazao,0)*NVL(it.area,0))/NULLIF(SUM(NVL(it.area,0)),0),2) mm_vazao_como_lamina,
             COUNT(*) n
        FROM agricola.irrigacaoosinsumo ins
        JOIN agricola.irrigacaoositem it
          ON ins.ano_ordemservico = it.ano_ordemservico AND ins.nr_ordemservico = it.nr_ordemservico AND ins.item_ordemservico = it.item_ordemservico
         AND ins.cod_grupoempresa = it.cod_grupoempresa AND ins.cod_empresa=it.cod_empresa AND ins.cod_filial=it.cod_filial
        JOIN agricola.ordemservico o ON o.ano_ordemservico = it.ano_ordemservico AND o.nr_ordemservico = it.nr_ordemservico
       WHERE o.tipo_ordem='I' AND ins.tipo_insumo='E'
         AND o.data_inicio >= TO_DATE('2025-09-01','YYYY-MM-DD')
         AND o.data_inicio < TO_DATE('2026-05-01','YYYY-MM-DD')
       GROUP BY TRUNC(o.data_inicio,'MM')
       ORDER BY 1
    `);
    return { vazao: vazao.rows, mensal: mensal.rows };
  });
  console.log(JSON.stringify(rows, null, 2));
  writeFileSync("tmp-irrig-vazao.json", JSON.stringify(rows, null, 2));
}
void main();
