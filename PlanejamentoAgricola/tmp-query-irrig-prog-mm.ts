import { writeFileSync } from "node:fs";
import { withOracle } from "./server/oracle.ts";

async function main() {
  const rows = await withOracle(async (conn) => {
    // Programado: volume estimado = vazao * horas; mm = vol/area/10; acumular por mes media ponderada por area
    const mensal = await conn.execute(`
      WITH base AS (
        SELECT TRUNC(o.data_inicio, 'MM') AS mes,
               it.area,
               NVL(ins.vazao, 0) AS vazao,
               GREATEST(0,
                 NVL(TO_NUMBER(REGEXP_SUBSTR(ins.hora_termino, '^\\d+')),0)
                 + NVL(TO_NUMBER(REGEXP_SUBSTR(ins.hora_termino, ':(\\d+)', 1, 1, NULL, 1)),0)/60
                 - NVL(TO_NUMBER(REGEXP_SUBSTR(ins.hora_inicio, '^\\d+')),0)
                 - NVL(TO_NUMBER(REGEXP_SUBSTR(ins.hora_inicio, ':(\\d+)', 1, 1, NULL, 1)),0)/60
               ) * (TRUNC(NVL(o.data_termino, o.data_inicio)) - TRUNC(o.data_inicio) + 1) AS horas
          FROM agricola.irrigacaoosinsumo ins
          JOIN agricola.irrigacaoositem it
            ON ins.cod_grupoempresa = it.cod_grupoempresa
           AND ins.cod_empresa = it.cod_empresa
           AND ins.cod_filial = it.cod_filial
           AND ins.ano_ordemservico = it.ano_ordemservico
           AND ins.nr_ordemservico = it.nr_ordemservico
           AND ins.item_ordemservico = it.item_ordemservico
          JOIN agricola.ordemservico o
            ON o.ano_ordemservico = it.ano_ordemservico
           AND o.nr_ordemservico = it.nr_ordemservico
         WHERE o.tipo_ordem = 'I'
           AND ins.tipo_insumo = 'E'
           AND o.data_inicio >= TO_DATE('2025-09-01','YYYY-MM-DD')
           AND o.data_inicio < TO_DATE('2026-05-01','YYYY-MM-DD')
      )
      SELECT TO_CHAR(mes,'YYYY-MM') mes,
             ROUND(SUM(vazao * horas) / NULLIF(SUM(area),0) / 10, 2) AS mm_prog,
             ROUND(SUM(area),2) area,
             COUNT(*) n
        FROM base
       GROUP BY mes
       ORDER BY 1
    `);
    return { mensal: mensal.rows };
  });
  writeFileSync("tmp-irrig-prog-mm.json", JSON.stringify(rows, null, 2));
  console.log(JSON.stringify(rows, null, 2));
}

void main();
