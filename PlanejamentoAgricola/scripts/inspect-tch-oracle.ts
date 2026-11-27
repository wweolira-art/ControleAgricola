import { withOracle } from '../server/oracle.js';
if (process.argv[2] === '--diagnostico') {
  const { diagnosticoTch } = await import('../server/indicadores/diagnostico-tch.js');
  const result = await diagnosticoTch([{fazenda:'41000',talhao:'4',data:'2026-11-27',tch:60,areaHa:10} as never], '2026/2027');
  console.log(JSON.stringify(result));
  process.exit(result.avisos.length ? 1 : 0);
}
await withOracle(async c => {
  c.callTimeout = 20000;
  const sql = process.argv[2] || "SELECT table_name FROM all_tables WHERE owner='AGRICOLA' AND REGEXP_LIKE(table_name,'PLANT|TALHA|SOLO|INSUM|IDADE|CHUVA|ANALISE|APONTAMENTO') ORDER BY table_name";
  if (!/^SELECT\s/i.test(sql)) throw new Error('Somente SELECT');
  console.log(JSON.stringify((await c.execute(sql, {}, {maxRows: 350})).rows));
});
process.exit(0);
