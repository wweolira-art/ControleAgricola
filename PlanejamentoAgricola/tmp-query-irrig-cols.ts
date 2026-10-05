import { writeFileSync } from "node:fs";
import { withOracle } from "./server/oracle.ts";

async function main() {
  const rows = await withOracle(async (conn) => {
    const vwCols = await conn.execute(
      `SELECT column_name FROM all_tab_columns WHERE owner='AGRICOLA' AND table_name='VW_APONTAMENTOIRRIGACAO' ORDER BY column_id`,
    );
    const insumoCols = await conn.execute(
      `SELECT column_name FROM all_tab_columns WHERE owner='AGRICOLA' AND table_name='IRRIGACAOOSINSUMO' ORDER BY column_id`,
    );
    const amostra = await conn.execute(
      `SELECT * FROM agricola.vw_apontamentoirrigacao WHERE ROWNUM <= 1`,
    );
    const laminaTables = await conn.execute(
      `SELECT table_name, column_name FROM all_tab_columns
        WHERE owner='AGRICOLA'
          AND (UPPER(column_name) LIKE '%LAMINA%' OR UPPER(column_name) LIKE 'MM_HA%' OR UPPER(column_name)='MMHA')
          AND table_name LIKE '%IRRIG%'
        ORDER BY table_name, column_id`,
    );
    return {
      vwCols: (vwCols.rows as { COLUMN_NAME: string }[]).map((r) => r.COLUMN_NAME),
      insumoCols: (insumoCols.rows as { COLUMN_NAME: string }[]).map((r) => r.COLUMN_NAME),
      amostraKeys: amostra.rows?.[0] ? Object.keys(amostra.rows[0] as object) : [],
      amostra: amostra.rows?.[0] ?? null,
      laminaTables: laminaTables.rows,
    };
  });
  writeFileSync("tmp-irrig-cols-out.json", JSON.stringify(rows, null, 2));
  console.log("ok");
}

void main();
