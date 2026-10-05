import { writeFileSync } from "node:fs";
import { withOracle } from "./server/oracle.ts";

async function main() {
  const rows = await withOracle(async (conn) => {
    const insumoCols = await conn.execute(
      `SELECT column_name FROM all_tab_columns WHERE owner='AGRICOLA' AND table_name='IRRIGACAOOSINSUMO' ORDER BY column_id`,
    );
    const amostra = await conn.execute(
      `SELECT lamina_aplicada, mt_cubicos, area, tipoirrigacao, desc_tipoirrigacao_simp, desc_tipoirrigacao, cod_tipoequipamento, desc_tipoequipamento
         FROM agricola.vw_apontamentoirrigacao WHERE ROWNUM <= 5`,
    );
    const tipoirrigDistinct = await conn.execute(
      `SELECT tipoirrigacao, desc_tipoirrigacao_simp, desc_tipoirrigacao, COUNT(*) c
         FROM agricola.vw_apontamentoirrigacao
        WHERE data >= ADD_MONTHS(TRUNC(SYSDATE), -12)
        GROUP BY tipoirrigacao, desc_tipoirrigacao_simp, desc_tipoirrigacao
        ORDER BY 4 DESC`,
    );
    // programado: procura lamina em OS
    const osLamina = await conn.execute(
      `SELECT column_name FROM all_tab_columns
        WHERE owner='AGRICOLA' AND table_name LIKE 'IRRIGACAO%'
          AND (UPPER(column_name) LIKE '%LAMINA%' OR UPPER(column_name) LIKE '%MM%')
        ORDER BY table_name, column_id`,
    );
    return {
      insumoCols: (insumoCols.rows as { COLUMN_NAME: string }[]).map((r) => r.COLUMN_NAME),
      amostra: amostra.rows,
      tipoirrigDistinct: tipoirrigDistinct.rows,
      osLamina: osLamina.rows,
    };
  });
  writeFileSync("tmp-irrig-lamina-out.json", JSON.stringify(rows, null, 2));
  console.log("ok");
}

void main();
