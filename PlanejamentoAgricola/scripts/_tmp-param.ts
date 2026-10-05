import { withOracle } from "../server/oracle.ts";

const out = await withOracle(async (conn) => {
  const grupos = await conn.execute(
    `SELECT pf.tipo,
            pf.cod_familia,
            pf.cod_grupomaterial,
            gm.descricao
       FROM automotivo.parametros_familia pf
       LEFT JOIN material.grupomaterial gm
         ON gm.cod_familia = pf.cod_familia
        AND gm.cod_grupomaterial = pf.cod_grupomaterial
      ORDER BY pf.tipo, gm.descricao`,
  );
  const dup = await conn.execute(
    `SELECT descricao, COUNT(*) qtde
       FROM (
         SELECT DISTINCT pf.cod_familia, pf.cod_grupomaterial, gm.descricao
           FROM automotivo.parametros_familia pf
           LEFT JOIN material.grupomaterial gm
             ON gm.cod_familia = pf.cod_familia
            AND gm.cod_grupomaterial = pf.cod_grupomaterial
       )
      GROUP BY descricao
     HAVING COUNT(*) > 1`,
  );
  return { total: (grupos.rows ?? []).length, dup: dup.rows, grupos: grupos.rows };
});
console.log(JSON.stringify(out, null, 2));
