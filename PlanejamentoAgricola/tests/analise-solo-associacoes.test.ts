import test from 'node:test';
import assert from 'node:assert/strict';
import {SOIL_ASSOCIATIONS} from '../server/analise-solo-associacoes.ts';
import {applySoilAssociations,completeVerifiedLocations} from '../src/lib/analise-solo-associacoes.ts';
import {buildCompusoftPlan} from '../src/lib/analise-solo-compusoft.ts';
import type {SoilRow} from '../src/lib/analise-solo.ts';
const row=(talhao:string):SoilRow=>({file:'a.xlsx',sheet:'Worksheet',line:2,talhao,sample:266,depth:'0-20',values:{}});
test('resolve grupos de ESCURO com correspondência cadastral única e Santa Adelia pelo mapa',()=>{
 const x=applySoilAssociations([row('ESCURO 1-17-19'),row('ESCURO 1.20-21'),row('SANTA ADELIA'),row('ESCURO 1, 7')],SOIL_ASSOCIATIONS);
 assert.equal(x['ESCURO 1-17-19'].fazenda,40300);assert.equal(x['ESCURO 1.20-21'].fazenda,40300);
 assert.equal(x['SANTA ADELIA'].fazenda,41800);assert.equal(x['SANTA ADELIA'].zona,2);
 assert.equal(x['ESCURO 1, 7'].fazenda,null);
});
test('COLTÉ 5 e 7 recebem COITE 5 e 7; grupo 9/10/11/12 mantém quatro opções',()=>{
 const x=applySoilAssociations([row('COLTÉ 5'),row('COLTÉ 7'),row('COLTÉ 9, 10, 11, 12')],SOIL_ASSOCIATIONS);
 assert.equal(x['COLTÉ 5'].fazenda,73700);assert.equal(x['COLTÉ 5'].zona,1);
 assert.equal(x['COLTÉ 7'].fazenda,73200);assert.equal(x['COLTÉ 7'].zona,1);
 assert.equal(x['COLTÉ 9, 10, 11, 12'].fazenda,null);
 assert.deepEqual(SOIL_ASSOCIATIONS.find(a=>a.source==='COLTÉ 9, 10, 11, 12')!.candidates.map(c=>c.fazenda).sort(),[72800,73000,73300,73800]);
});
test('validação recupera fazenda e zona do catálogo e informa somente o código faltante',()=>{
 const rows=[row('PITOMBA')],locations=completeVerifiedLocations(rows,SOIL_ASSOCIATIONS,{});
 const plan=buildCompusoftPlan(rows,[{name:'a.xlsx',sha256:'x',base64:'',date:'2024-12-05',dateSource:'manual'}],{grupo:1,empresa:1,filial:1,safra:1,locations,ph:'cacl2',phosphorus:'meh',potassium:'cmol'});
 assert.deepEqual(plan.errors,['PITOMBA: falta informar talhão (fazenda 40800, zona 1 já preenchidos).']);
 const manual={PITOMBA:{fazenda:40800,zona:1,talhao:7,estagio:2,producao:150}};
 assert.deepEqual(completeVerifiedLocations(rows,SOIL_ASSOCIATIONS,manual).PITOMBA,manual.PITOMBA);
});
test('catálogo cobre as 59 identificações de todos os arquivos e só atribui candidatos cadastrados',()=>{
 assert.equal(SOIL_ASSOCIATIONS.length,59);assert.equal(new Set(SOIL_ASSOCIATIONS.map(a=>a.source)).size,59);
 for(const a of SOIL_ASSOCIATIONS){
  if(a.location.fazenda!=null){const candidate=a.candidates.find(c=>c.fazenda===a.location.fazenda);assert.ok(candidate);assert.ok(candidate.zonas.includes(a.location.zona!));if(a.location.talhao!=null)assert.ok(candidate.talhoes.includes(a.location.talhao));}
  if(a.status==='review')assert.equal(a.location.fazenda,null);
 }
});
test('PITOMBA usa a fazenda 40800 confirmada pelo usuário, sem inventar talhão',()=>{
 const a=applySoilAssociations([row('PITOMBA')],SOIL_ASSOCIATIONS).PITOMBA;
 assert.equal(a.fazenda,40800);assert.equal(a.zona,1);assert.equal(a.talhao,null);
});
test('preenche fazenda e zona para todos os arquivos e os talhões inequívocos',()=>{
 const x=applySoilAssociations([row('MARCAÇÃO'),row('CHOAN 2'),row('COITE 9 LT 8')],SOIL_ASSOCIATIONS);
 assert.equal(x.MARCAÇÃO.fazenda,73500);assert.equal(x.MARCAÇÃO.zona,1);assert.equal(x.MARCAÇÃO.talhao,null);
 assert.deepEqual([x['CHOAN 2'].fazenda,x['CHOAN 2'].zona,x['CHOAN 2'].talhao],[42200,2,2]);
 assert.deepEqual([x['COITE 9 LT 8'].fazenda,x['COITE 9 LT 8'].zona,x['COITE 9 LT 8'].talhao],[72800,1,8]);
});
test('não escolhe um talhão de listas ou uma fazenda para códigos TH ambíguos',()=>{
 const x=applySoilAssociations([row('CHOAN 1, 4'),row('TH 08'),row('SANTA ADELIA')],SOIL_ASSOCIATIONS);
 assert.equal(x['CHOAN 1, 4'].fazenda,42200);assert.equal(x['CHOAN 1, 4'].talhao,null);
 assert.equal(x['TH 08'].talhao,8);assert.equal(x['TH 08'].fazenda,null);assert.equal(x['SANTA ADELIA'].fazenda,41800);assert.equal(x['SANTA ADELIA'].zona,2);
});
test('reutiliza correções salvas sem substituir dados por valores locais inválidos',()=>{
 const saved={PITOMBA:{fazenda:40800,zona:1,talhao:7,estagio:null,producao:null}};
 assert.equal(applySoilAssociations([row('PITOMBA')],SOIL_ASSOCIATIONS,saved).PITOMBA.talhao,7);
 saved.PITOMBA.talhao=-1;assert.equal(applySoilAssociations([row('PITOMBA')],SOIL_ASSOCIATIONS,saved).PITOMBA.talhao,null);
});
