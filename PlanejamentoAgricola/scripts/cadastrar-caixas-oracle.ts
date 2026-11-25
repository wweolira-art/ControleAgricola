import { loadEnvFile, withOracle } from "../server/oracle.js";
import oracledb from "oracledb";

loadEnvFile();
if (!process.env.ORACLE_WRITE_USER || !process.env.ORACLE_WRITE_PASSWORD) {
  throw new Error("Configure ORACLE_WRITE_USER e ORACLE_WRITE_PASSWORD no .env.");
}
await withOracle(async (conn) => {
    const result = await conn.execute(`SELECT DISTINCT TO_NUMBER(REGEXP_SUBSTR(TRIM(cod_ferramenta), '[0-9]+$')) numero
      FROM material.ferramenta
      WHERE REGEXP_LIKE(TRIM(cod_ferramenta), '^GLJ[[:space:]]*[0-9]+[[:space:]]*-[[:space:]]*[0-9]+$', 'i')
      ORDER BY numero`);
    const existentes = await conn.execute(`SELECT cod_ferramenta FROM material.ferramenta WHERE caixa_ferramenta = 'S'`);
    const numerosExistentes = new Set((existentes.rows as Array<{ COD_FERRAMENTA: string }>).map((row) => Number(row.COD_FERRAMENTA)));
    const faltantes = (result.rows as Array<{ NUMERO: number }>).filter((row) => !numerosExistentes.has(row.NUMERO));
    const writer = await oracledb.getConnection({ user: process.env.ORACLE_WRITE_USER, password: process.env.ORACLE_WRITE_PASSWORD, connectString: process.env.ORACLE_CONNECT_STRING || process.env.ORACLE_DSN || process.env.DB_CONNECT_STRING });
    try {
    let inseridas = 0;
    for (const row of faltantes) {
      const inserted = await writer.execute(`INSERT INTO material.ferramenta
        (sequencia, cod_ferramenta, cod_grupoempresa, cod_empresa, cod_filial, datainicio, id_tipo, cod_material, cod_almoxarifado, caixa_ferramenta)
        VALUES (0, :numero, 1, 1, 1, TRUNC(SYSDATE), 34, 2994, 2, 'S')`,
        { numero: String(row.NUMERO) });
      inseridas += inserted.rowsAffected ?? 0;
    }
    await writer.commit();
    console.log(JSON.stringify({ numerosIdentificados: result.rows?.length ?? 0, caixasInseridas: inseridas }));
  } catch (error) {
    await writer.rollback();
    throw error;
  } finally {
    await writer.close();
  }
});
process.exit(0);
