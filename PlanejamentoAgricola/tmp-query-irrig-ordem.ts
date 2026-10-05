import { writeFileSync } from "node:fs";
import { withOracle } from "./server/oracle.ts";

async function main() {
  const rows = await withOracle(async (conn) => {
    const areaCols = await conn.execute(
      `SELECT column_name FROM all_tab_columns WHERE owner='AGRICOLA' AND table_name='ORDEMIRRIGAREA' ORDER BY column_id`,
    );
    const itemCols = await conn.execute(
      `SELECT column_name FROM all_tab_columns WHERE owner='AGRICOLA' AND table_name='ORDEMIRRIGITEM' ORDER BY column_id`,
    );
    const sample = await conn.execute(`SELECT * FROM agricola.ordemirrigitem WHERE ROWNUM <= 2`);
    const sampleArea = await conn.execute(`SELECT * FROM agricola.ordemirrigarea WHERE ROWNUM <= 2`);
    return {
      areaCols: (areaCols.rows as { COLUMN_NAME: string }[]).map((r) => r.COLUMN_NAME),
      itemCols: (itemCols.rows as { COLUMN_NAME: string }[]).map((r) => r.COLUMN_NAME),
      sampleKeys: sample.rows?.[0] ? Object.keys(sample.rows[0] as object) : [],
      sample: sample.rows,
      sampleAreaKeys: sampleArea.rows?.[0] ? Object.keys(sampleArea.rows[0] as object) : [],
      sampleArea: sampleArea.rows,
    };
  });
  writeFileSync("tmp-irrig-ordem-out.json", JSON.stringify(rows, null, 2));
  console.log("ok");
}

void main();
