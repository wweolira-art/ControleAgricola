import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {readFile} from 'node:fs/promises';
import {buildCompusoftPlan,compusoftRow,COMPUSOFT_HEADERS,originalTalhaoCode,initialExportLocations,normalizeExportSettings,sampleLocationKey,type ExportSettings} from '../src/lib/analise-solo-compusoft.ts';
import {COMPUSOFT_TEMPLATE,exportCompusoftWorkbook} from '../server/analise-solo-export.ts';
import type {SoilRow,SoilFile} from '../src/lib/analise-solo.ts';
const settings=():ExportSettings=>({grupo:1,empresa:1,filial:1,safra:2024,ph:'cacl2',phosphorus:'meh',potassium:'cmol',locations:{MARCAÇÃO:{fazenda:1984,talhao:1,zona:1,estagio:1,producao:120}}});
const file=(name='a.xlsx'):SoilFile=>({name,sha256:'x',base64:'',date:'2024-12-05',dateSource:'manual'});
const row=(name='a.xlsx'):SoilRow=>({file:name,sheet:'Worksheet',line:2,talhao:'MARCAÇÃO',sample:266,depth:'0-20',values:{PH_CA:5.03,CALCIO:2.65,MAGNESIO:0.61,ALUMINIO:0,K_CMOL:0.45,P_MEH:11.79,CTC_CATIONS:7.92,ZINCO:2.2}});
test('divide grupo entre fazendas por amostra, mantendo profundidades e sem duplicar registros',()=>{
 const rows=[row(),row(),row(),row()];rows.forEach(r=>r.talhao='COLTÉ 9, 10, 11, 12');rows[1].depth='20-40';rows[2].sample=267;rows[3].sample=268;
 const s=normalizeExportSettings({...settings(),locations:{}});s.sampleLocations={
  [sampleLocationKey(rows[0])]:{fazenda:72800,zona:1},[sampleLocationKey(rows[2])]:{fazenda:73300,zona:1},[sampleLocationKey(rows[3])]:{fazenda:73800,zona:1}
 };
 const p=buildCompusoftPlan(rows,[file()],s);assert.deepEqual(p.errors,[]);assert.equal(p.items.length,4);
 assert.deepEqual(p.items.map(i=>[i.location.fazenda,i.location.talhao,i.source.depth]),[[72800,266,'0-20'],[72800,266,'20-40'],[73300,267,'0-20'],[73800,268,'0-20']]);
 const other=row('b.xlsx');other.talhao=rows[0].talhao;assert.notEqual(sampleLocationKey(rows[0]),sampleLocationKey(other));
});
test('requisição antiga sem origem do talhão usa identificação por linha e mantém escolha manual explícita',()=>{
 const legacy=settings();legacy.locations.MARCAÇÃO.talhao=null;
 const normalized=normalizeExportSettings(legacy);assert.equal(normalized.talhaoSource,'identification');
 const p=buildCompusoftPlan([row()],[file()],normalized);assert.deepEqual(p.errors,[]);assert.equal(compusoftRow(p.items[0])[5],266);
 assert.equal(normalizeExportSettings({...legacy,talhaoSource:'manual'}).talhaoSource,'manual');
});
test('pendências de fazenda são agrupadas sem repetir uma mensagem por número de linha',()=>{
 const a=row(),b=row();b.sample=267;const s=normalizeExportSettings({...settings(),locations:{}});
 const p=buildCompusoftPlan([a,b],[file()],s);assert.equal(p.errors.length,1);assert.match(p.errors[0],/talhão obtido do arquivo/);
});
test('talhão por linha usa o número original e permite repetições em fazendas diferentes',()=>{
 const a=row(),b=row();b.sample=267;const c=row();c.talhao='PITOMBA';
 const s=settings();s.talhaoSource='identification';s.locations.MARCAÇÃO.talhao=null;s.locations.PITOMBA={fazenda:40800,talhao:null,zona:1,estagio:null,producao:null};
 const p=buildCompusoftPlan([a,b,c],[file()],s);assert.deepEqual(p.errors,[]);assert.equal(p.items.length,3);
 assert.deepEqual(p.items.map(i=>[i.location.fazenda,compusoftRow(i)[5]]),[[1984,266],[1984,267],[40800,266]]);
});
test('preenche automaticamente código numérico do Excel, preservando correções manuais',()=>{
 for(const text of ['8','008','TH 08','Talhão 8'])assert.equal(originalTalhaoCode(text),8);
 for(const text of ['CAXACUMBA 1','CHOAN 1, 4','TH 8/9','0','-2'])assert.equal(originalTalhaoCode(text),null);
 const r=row();r.talhao='TH 08';assert.equal(initialExportLocations([r])['TH 08'].talhao,8);
 const s=settings();s.locations={'TH 08':{fazenda:1984,talhao:null,zona:1,estagio:1,producao:120}};
 const p=buildCompusoftPlan([r],[file()],s);assert.deepEqual(p.errors,[]);assert.equal(compusoftRow(p.items[0])[5],8);
 s.locations['TH 08'].talhao=19;assert.equal(buildCompusoftPlan([r],[file()],s).items[0].location.talhao,19);
});
test('modelo confirma posições vazias, cabeçalho ZN, data e profundidade textuais',async()=>{
 const w=new ExcelJS.Workbook();await w.xlsx.load(await readFile(COMPUSOFT_TEMPLATE) as any);const s=w.worksheets[0];
 for(let i=0;i<34;i++)assert.equal(s.getCell(2,i+1).value??null,COMPUSOFT_HEADERS[i]);
 assert.equal(s.getCell('C3').value,'01/01/2018');assert.equal(s.getCell('C3').numFmt,'@');assert.equal(s.getCell('I3').value,'5,08');
});
test('mantém 34 posições, vírgula decimal, zeros e intervalos, sem preencher CTC com T',()=>{
 const p=buildCompusoftPlan([row()],[file()],settings());assert.deepEqual(p.errors,[]);const r=compusoftRow(p.items[0]);
 assert.equal(r.length,34);for(const i of[0,1,3])assert.equal(r[i],null);
 assert.equal(r[2],'05/12/2024');assert.equal(r[7],'0-20');assert.equal(r[8],'5,03');assert.equal(r[16],'0,00');assert.equal(r[20],null);assert.equal(r[30],'2,20');assert.equal(r[32],1);assert.equal(r[33],120);
 assert.ok(p.warnings.some(w=>w.includes('CTC potencial')));
});
test('consolida arquivo repetido, preservando complementos e bloqueando divergências',()=>{
 const a=row(),b=row('b.xlsx');a.values.PH_CA=null;const p=buildCompusoftPlan([a,b],[file(),file('b.xlsx')],settings());
 assert.equal(p.duplicates,1);assert.equal(p.items[0].values.PH,5.03);assert.equal(a.values.PH_CA,null);
 b.values.CALCIO=9;assert.equal(buildCompusoftPlan([a,b],[file(),file('b.xlsx')],settings()).conflicts.length,1);
});
test('mesmo número em duas profundidades mantém ambas as linhas sem renumerar',()=>{
 const a=row(),b=row();b.depth='20-40';const p=buildCompusoftPlan([a,b],[file()],settings());assert.deepEqual(p.errors,[]);assert.equal(p.items.length,2);assert.deepEqual(p.items.map(i=>i.source.sample),[266,266]);
});
test('data e códigos inválidos bloqueiam geração; estágio/produção faltantes geram aviso',async()=>{
 const f=file();f.date='2025-02-29';assert.ok(buildCompusoftPlan([row()],[f],settings()).errors.length>0);
 const s=settings();s.locations.MARCAÇÃO.fazenda=null;const p=buildCompusoftPlan([row()],[file()],s);assert.ok(p.errors.length>0);await assert.rejects(exportCompusoftWorkbook(p));
 const optional=settings();optional.locations.MARCAÇÃO.estagio=null;optional.locations.MARCAÇÃO.producao=null;const o=buildCompusoftPlan([row()],[file()],optional);assert.deepEqual(o.errors,[]);assert.ok(o.warnings.some(w=>w.includes('produção estimada')));
});
test('gerador preserva template e grava os dados na linha 3 sem exemplos ou abas extras',async()=>{
 const a=row(),b=row();b.depth='20-40';const p=buildCompusoftPlan([a,b],[file()],settings());const bytes=await exportCompusoftWorkbook(p);
 const w=new ExcelJS.Workbook();await w.xlsx.load(bytes as any);assert.equal(w.worksheets.length,1);const s=w.worksheets[0];
 assert.equal(s.name,'Exemplo Importação Excel');assert.equal(s.rowCount,4);assert.equal(s.columnCount,34);
 for(let i=1;i<=34;i++)assert.equal(s.getCell(1,i).value??null,null);
 for(const r of[3,4]){for(const c of[1,2,4])assert.equal(s.getCell(r,c).value??null,null);assert.equal(s.getCell(r,3).value,'05/12/2024');}
 assert.equal(s.getCell('H3').value,'0-20');assert.equal(s.getCell('H4').value,'20-40');assert.equal(s.getCell('E3').value,1984);assert.equal(s.getCell('I3').value,'5,03');assert.equal(s.getCell('U3').value,null);assert.equal(s.getCell('AE2').value,'ZN');
});
