import { writeFileSync } from "node:fs";
import { withOracle } from "./server/oracle.ts";

async function main() {
  const rows = await withOracle(async (conn) => {
    const real = await conn.execute(`
      SELECT ROUND(SUM(NVL(lamina_aplicada,0)*NVL(area,0))/NULLIF(SUM(NVL(area,0)),0),2) AS mm_avg_pond,
             ROUND(SUM(NVL(mt_cubicos,0)*NVL(area,0))/NULLIF(SUM(NVL(area,0)),0)/10,2) AS mm_vol,
             ROUND(SUM(NVL(lamina_aplicada,0)),2) AS sum_lamina,
             ROUND(SUM(NVL(lamina_aplicada,0)*NVL(area,0))/NULLIF(SUM(DISTINCT NVL(area_talhao, area)),0),2) AS mm_sobre_area_talhao,
             COUNT(*) n,
             SUM(area) area_sum
        FROM agricola.vw_apontamentoirrigacao
       WHERE data >= TO_DATE('2025-09-01','YYYY-MM-DD')
         AND data < TO_DATE('2026-05-01','YYYY-MM-DD')
    `);
    // acumulado por talhao depois media ponderada
    const porTalhao = await conn.execute(`
      SELECT ROUND(SUM(acum * area_ref) / NULLIF(SUM(area_ref),0), 2) AS mm_acum
        FROM (
          SELECT cod_fazenda, cod_talhao,
                 SUM(NVL(lamina_aplicada,0)) AS acum,
                 MAX(NVL(area_talhao, area)) AS area_ref
            FROM agricola.vw_apontamentoirrigacao
           WHERE data >= TO_DATE('2025-09-01','YYYY-MM-DD')
             AND data < TO_DATE('2026-05-01','YYYY-MM-DD')
           GROUP BY cod_fazenda, cod_talhao
        )
    `);
    // soma mensal das laminas medias
    const mensal = await conn.execute(`
      SELECT TO_CHAR(TRUNC(data,'MM'),'YYYY-MM') mes,
             ROUND(SUM(NVL(lamina_aplicada,0)*NVL(area,0))/NULLIF(SUM(NVL(area,0)),0),2) mm
        FROM agricola.vw_apontamentoirrigacao
       WHERE data >= TO_DATE('2025-09-01','YYYY-MM-DD')
         AND data < TO_DATE('2026-05-01','YYYY-MM-DD')
       GROUP BY TRUNC(data,'MM')
       ORDER BY 1
    `);
    return { real: real.rows, porTalhao: porTalhao.rows, mensal: mensal.rows };
  });
  writeFileSync("tmp-irrig-mm-test.json", JSON.stringify(rows, null, 2));
  console.log(JSON.stringify(rows, null, 2));
}

void main();
