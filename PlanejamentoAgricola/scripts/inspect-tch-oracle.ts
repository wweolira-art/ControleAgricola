import { withOracle } from '../server/oracle.js';
if (process.argv[2] === '--regressao') {
  const { diagnosticoTch } = await import('../server/indicadores/diagnostico-tch.js');
  const { default: assert } = await import('node:assert/strict');
  const result = await diagnosticoTch([
    {fazenda:'40100',talhao:'3',data:'2026-11-25',tch:58.9,areaHa:27.81},
    {fazenda:'42500',talhao:'14',data:'2026-09-21',tch:38.2,areaHa:10.51},
    {fazenda:'42000',talhao:'4',data:'2026-10-07',tch:35.1,areaHa:24.26},
  ] as never, '2026/2027');
  assert.deepEqual(result.avisos, []);
  for (const t of result.talhoes) {
    if (t.fazenda===42000) assert.equal(t.cicloValido,false);
    else {
      assert.ok(t.aplicacoes.some(a=>a.GRUPO==='FERTILIZANTES E ADUBOS' && a.SAFRA===12));
      assert.ok(t.aplicacoes.every(a=>String(a.DATA)<=t.data));
    }
  }
  console.log(JSON.stringify(result.talhoes.map(t=>({fazenda:t.fazenda,talhao:t.talhao,cicloValido:t.cicloValido,irrigacao:t.irrigacao,aplicacoes:t.aplicacoes.length,adubos:t.aplicacoes.filter(a=>a.GRUPO==='FERTILIZANTES E ADUBOS').map(a=>({data:a.DATA,produto:a.DESCRICAO,dose:a.DOSE,unidade:a.UNIDADE})),solo:t.soloDetalhes.length,recomendacoes:t.recomendacoes.length}))));
  process.exit(0);
}
if (process.argv[2] === '--diagnostico') {
  const { diagnosticoTch } = await import('../server/indicadores/diagnostico-tch.js');
  const result = await diagnosticoTch([{fazenda:'41000',talhao:'4',data:'2026-11-27',tch:60,areaHa:10} as never], '2026/2027');
  console.log(JSON.stringify(result));
  process.exit(result.avisos.length ? 1 : 0);
}
await withOracle(async c => {
  c.callTimeout = 20000;
  if (process.argv[2] === '--irrigacao-origem') {
    const r=await c.execute("SELECT text FROM all_views WHERE owner='AGRICOLA' AND view_name='VW_APONTAMENTOIRRIGACAO'");
    const txt=String((r.rows?.[0] as Record<string,unknown>)?.TEXT??'');
    console.log(txt.split('\n').filter(x=>/apontamentoirrig|id_apontamento|idapontamento|data_apontamento|\.data\s/i.test(x)).join('\n'));
    return;
  }
  const sql = process.argv[2] || "SELECT table_name FROM all_tables WHERE owner='AGRICOLA' AND REGEXP_LIKE(table_name,'PLANT|TALHA|SOLO|INSUM|IDADE|CHUVA|ANALISE|APONTAMENTO') ORDER BY table_name";
  if (!/^SELECT\s/i.test(sql)) throw new Error('Somente SELECT');
  console.log(JSON.stringify((await c.execute(sql, {}, {maxRows: 350})).rows));
});
process.exit(0);
