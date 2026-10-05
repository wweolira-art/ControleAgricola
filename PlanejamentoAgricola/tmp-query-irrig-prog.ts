import { writeFileSync } from "node:fs";
import { withOracle } from "./server/oracle.ts";

async function main() {
  const rows = await withOracle(async (conn) => {
    const laminaTables = await conn.execute(
      `SELECT table_name FROM all_tables WHERE owner='AGRICOLA' AND (UPPER(table_name) LIKE '%LAMINA%' OR UPPER(table_name) LIKE '%IRRIG%PROG%' OR UPPER(table_name) LIKE '%IRRIG%PLAN%') ORDER BY 1`,
    );
    // OS irrigacao: ligação com lamina
    const osSample = await conn.execute(
      `SELECT o.ano_ordemservico, o.nr_ordemservico, o.data_inicio, o.data_termino,
              it.area, it.cod_tipoirrigacao, it.cod_fazenda, it.cod_talhao
         FROM agricola.ordemservico o
         JOIN agricola.irrigacaoositem it
           ON it.ano_ordemservico = o.ano_ordemservico AND it.nr_ordemservico = o.nr_ordemservico
        WHERE o.tipo_ordem = 'I' AND ROWNUM <= 5`,
    );
    // Existe tabela de laminas?
    const allLamina = await conn.execute(
      `SELECT owner, table_name, column_name FROM all_tab_columns
        WHERE UPPER(column_name) IN ('LAMINA','LAMINA_MM','LAMINA_PREVISTA','LAMINA_NECESSARIA','LAMINA_APLICACAO')
          AND owner IN ('AGRICOLA','AUTOMOTIVO')
        ORDER BY 1,2`,
    );
    return { laminaTables: laminaTables.rows, osSample: osSample.rows, allLamina: allLamina.rows };
  });
  writeFileSync("tmp-irrig-prog-out.json", JSON.stringify(rows, null, 2));
  console.log("ok");
}

void main();
