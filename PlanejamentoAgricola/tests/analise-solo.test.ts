import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSoilPlan, parseSoilGrid, validSoilDate, type SoilSettings, type SoilFile, type SoilRow } from '../src/lib/analise-solo.ts';

const location={COD_SAFRA:2024,COD_SAFRADETALHE:1,COD_FAZENDA:1,ZONA:1,COD_TALHAO:1,DESCRICAO_TALHAO:'MARCAÇÃO',FAZENDA:'Teste'};
const config=():SoilSettings=>({grupo:1,empresa:1,filial:1,safra:2024,locations:{'MARCAÇÃO':location},depths:{'0-20':20,'20-40':40},numbering:'original',phosphorus:'meh',potassium:'cmol',texture:'pending',method:0});
const file=(name='a.xlsx'):SoilFile=>({name,sha256:'hash',base64:'',date:'2024-12-05',dateSource:'conclusao'});
const row=(file='a.xlsx'):SoilRow=>({file,sheet:'Worksheet',line:2,talhao:'MARCAÇÃO',sample:266,depth:'0-20',values:{CALCIO:2.65,K_CMOL:0.45,P_MEH:11.79,PH_CA:null,ALUMINIO:null}});
test('data obrigatória e validação de calendário, sem usar ano do arquivo',()=>{
  assert.equal(validSoilDate('2025-02-29'),false);assert.equal(validSoilDate('2024-02-29'),true);
  const f=file();f.date='';assert.ok(buildSoilPlan([row()],[f],config()).errors.some(e=>e.includes('data')));
});
test('lê os cabeçalhos Descrição, Id e identificação da amostra, preserva zero e vazio',()=>{
  for(const h of ['Descrição','Id','identificação da amostra']){
    const rows=parseSoilGrid([['Talhão',h,'Profundidade','pH (CaCl2) ()','Al ()','S (mg/dm³)'],['MARCAÇÃO',266,'0-20','',0,'']],'a.xlsx','Worksheet');
    assert.equal(rows[0].values.PH_CA,null);assert.equal(rows[0].values.ALUMINIO,0);assert.equal(rows[0].values.ENXOFRE,null);
    assert.equal(rows[0].original?.[h],266);
  }
});
test('consolida mesmo laudo e complementa campos sem modificar dados de origem',()=>{
  const a=row(),b=row('b.xlsx');b.values.PH_CA=5.03;b.values.ALUMINIO=0.1;
  const p=buildSoilPlan([a,b],[file(),file('b.xlsx')],config());
  assert.equal(p.duplicates,1);assert.equal(p.groups[0].items.length,1);
  assert.equal(p.groups[0].items[0].values.PH_CA,5.03);assert.equal(a.values.PH_CA,null);
});
test('bloqueia resultado divergente e não escolhe um arquivo silenciosamente',()=>{
  const a=row(),b=row('b.xlsx');b.values.CALCIO=8;
  assert.equal(buildSoilPlan([a,b],[file(),file('b.xlsx')],config()).conflicts.length,1);
});
test('mesmo número em datas diferentes continua sendo análise separada',()=>{
  const f=file('b.xlsx');f.date='2025-01-15';
  const p=buildSoilPlan([row(),row('b.xlsx')],[file(),f],config());assert.equal(p.groups.length,2);assert.equal(p.duplicates,0);
});
test('profundidades repetidas bloqueiam numeração original; sequencial preserva origem',()=>{
  const a=row(),b=row();b.depth='20-40';
  assert.ok(buildSoilPlan([a,b],[file()],config()).errors.some(e=>e.includes('várias profundidades')));
  const s=config();s.numbering='sequential';const p=buildSoilPlan([a,b],[file()],s);
  assert.deepEqual(p.groups[0].items.map(i=>i.number),[1,2]);assert.deepEqual(p.groups[0].items.map(i=>i.row.sample),[266,266]);assert.equal(p.errors.length,0);
});
test('profundidade e textura exigem definição explícita',()=>{
  const s=config();s.depths={};assert.ok(buildSoilPlan([row()],[file()],s).errors.length>0);
  const r=row();r.values.ARGILA=251.5;
  assert.ok(buildSoilPlan([r],[file()],config()).errors.some(e=>e.includes('textura')));
  const settings=config();settings.texture='percent';assert.equal(buildSoilPlan([r],[file()],settings).groups[0].items[0].values.PERC_ARGILA,25.15);
});
test('não transfere pH em CaCl2 para pH água ou troca fósforo automaticamente',()=>{
  const r=row();r.values.PH_CA=5.03;const s=config();s.phosphorus='res';
  const p=buildSoilPlan([r],[file()],s);assert.ok(p.errors.some(e=>e.includes('fósforo')));assert.equal(p.groups[0].items[0].values.PH,undefined);
});
test('rejeita identificador fracionário e profundidade invertida',()=>{
  assert.throws(()=>parseSoilGrid([['Talhão','Descrição','Profundidade'],['A',2.5,'0-20']],'a','w'));
  assert.throws(()=>parseSoilGrid([['Talhão','Descrição','Profundidade'],['A',2,'40-20']],'a','w'));
});
