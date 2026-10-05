import { writeFileSync } from "node:fs";
import { withOracle } from "./server/oracle.ts";

async function main() {
  const rows = await withOracle(async (conn) => {
    const origens = await conn.execute(`
      SELECT origem, COUNT(*) c,
             ROUND(SUM(NVL(lamina_aplicada,0)*NVL(area,0))/NULLIF(SUM(NVL(area,0)),0),2) mm
        FROM agricola.vw_apontamentoirrigacao
       WHERE data >= TO_DATE('2025-09-01','YYYY-MM-DD')
         AND data < TO_DATE('2026-05-01','YYYY-MM-DD')
       GROUP BY origem
    `);
    return { origens: origens.rows };
  });
  console.log(JSON.stringify(rows, null, 2));
  writeFileSync("tmp-irrig-origem.json", JSON.stringify(rows, null, 2));
}
void main();
