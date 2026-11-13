import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {FileBlob, SpreadsheetFile} from '@oai/artifact-tool';
const root=fileURLToPath(new URL('../../',import.meta.url));
const out=path.join(root,'outputs','inceres-compusoft-20261113');
await fs.mkdir(out,{recursive:true});
const wb=await SpreadsheetFile.importXlsx(await FileBlob.load('C:/Users/rayhi/Downloads/Pasta1.xlsx'));
const sheet=wb.worksheets.getItemAt(0);
if(process.argv.includes('--inspect')) {
  console.log((await wb.inspect({kind:'region',sheetId:sheet.name,range:'A1:AH4',maxChars:2500,tableMaxRows:4,tableMaxCols:34})).ndjson);
  const p=await wb.render({sheetName:sheet.name,range:'C2:R4',scale:1.5,format:'png'});
  await fs.writeFile(path.join(out,'modelo-preview.png'),new Uint8Array(await p.arrayBuffer()));
  process.exit(0);
}
const source=JSON.parse(await fs.readFile(path.join(root,'output/inceres/analise_solo_safra_2026-2027.json'),'utf8'));
const settingsPath=path.join(root,'tmp/inceres-excel/settings.json');
const settings=JSON.parse(await fs.readFile(settingsPath,'utf8'));
const spatial=JSON.parse(await fs.readFile(path.join(root,'tmp/inceres-excel/poligonos-identificados.json'),'utf8'));
const spatialByPoint=new Map(spatial.pontos.map(p=>[p.ponto_id,p]));
const groups=new Map();
for(const r of source.resultados) {
  const key=JSON.stringify([r.grade_id,r.ponto_id,r.profundidade_cm]);
  if(!groups.has(key)) groups.set(key,{grade:r.grade_id,ponto:r.ponto,pontoId:r.ponto_id,profundidade:r.profundidade_cm,values:{}});
  const g=groups.get(key);
  if(r.elemento in g.values && g.values[r.elemento]!==r.valor) throw new Error('Resultados conflitantes');
  g.values[r.elemento]=r.valor;
}
const records=[...groups.values()].sort((a,b)=>a.ponto-b.ponto||parseFloat(a.profundidade)-parseFloat(b.profundidade));
const originalHeader=sheet.getRange('A2:AH2').values[0];
const headers=[null,null,'DATA_ANALISE',null,'FAZENDA','TALHAO','ZONA','PROFUNDIDADE','PH','MO','P','S','CA','MG','NA','K','AL','H_AL','CE','SB','CTC','V','C','SAT_CA','SAT_MG','SAT_NA','SAT_K','CU','FE','MN','ZN','B','ESTAGIO_CULTURA','PRODUCAO_ESTIMADA'];
if(JSON.stringify(originalHeader.map(v=>v??null))!==JSON.stringify(headers)) throw new Error('Cabeçalhos diferentes do modelo');
for(let row=4;row<=records.length+2;row++) sheet.getRange(`A${row}:AH${row}`).copyFrom(sheet.getRange('A3:AH3'),'all');
sheet.getRange(`A3:AH${records.length+2}`).clear({applyTo:'contents'});
const mappings={I:settings.ph,J:'mos',K:settings.p,L:'s',M:'ca',N:'mg',O:'na',P:'k',Q:'al',R:'h_al',S:'ce',T:'sb',U:'ctc_efetiva',V:'v',W:'c',X:'sat_ca',Y:'sat_mg',Z:'sat_na',AA:'sat_k',AB:'cu',AC:'fe',AD:'mn',AE:'zn',AF:'b'};
const matrix=records.map(g=>{
  const spatialPoint=spatialByPoint.get(g.pontoId);
  if(!spatialPoint || spatialPoint.correspondencias.length!==1) throw new Error(`Ponto sem correspondência espacial única: ${g.ponto}`);
  const polygon=spatialPoint.correspondencias[0];
  if(polygon.Cod_fazend!==72500||![9,10].includes(polygon.Lote)) throw new Error('Correspondência fora da associação de zona revisada');
  const row=Array(34).fill(null);
  row[2]=settings.data??null;row[4]=polygon.Cod_fazend;row[5]=polygon.Lote;row[6]=1;row[7]=g.profundidade;
  for(const [col,key] of Object.entries(mappings)) {
    const value=g.values[key];
    const column=[...col].reduce((v,c)=>v*26+c.charCodeAt(0)-64,0)-1;
    // O modelo Compusoft usa texto com vírgula decimal nos resultados.
    row[column]=value===null||value===undefined?null:String(value).replace('.',',');
  }
  row[32]=settings.estagio??null;row[33]=settings.producao??null;
  return row;
});
sheet.getRange(`A3:AH${records.length+2}`).values=matrix;
const report={fonte:'InCeres, coleta parcial da safra 2026-2027',cobertura:source.resumo,metodos:{ph:settings.ph,fosforo:settings.p},
  data_analise:{valor:settings.data,origem:'Data de cadastro da grade no InCeres; uso em DATA_ANALISE autorizado pelo usuário.'},
  pendencias:['Confirmar unidades exigidas pelo Compusoft.','CTC potencial da origem não foi transferida como CTC efetiva.'],
  identificacao_espacial:{arquivo:spatial.fonte_poligonos,metodo:'Contenção de cada ponto em Polygon/MultiPolygon, excluindo buracos; exige correspondência única.',zona_fonte:'Catálogo revisado server/analise-solo-associacoes.ts, associação PAU PARAIBA 5-9-10',consulta_oracle_atual:'Falhou: ORA-01017; utilizada associação previamente revisada no projeto.'},
  linhas:records.map((g,i)=>({linha:i+3,grade:g.grade,ponto:g.ponto,ponto_id:g.pontoId,profundidade:g.profundidade,...spatialByPoint.get(g.pontoId)}))};
await fs.writeFile(path.join(out,'conferencia.json'),JSON.stringify(report,null,2));
wb.recalculate();
console.log((await wb.inspect({kind:'region',sheetId:sheet.name,range:'C2:R5',maxChars:2500,tableMaxRows:4,tableMaxCols:16})).ndjson);
const preview=await wb.render({sheetName:sheet.name,range:'C2:R8',scale:1.5,format:'png'});
await fs.writeFile(path.join(out,'preview.png'),new Uint8Array(await preview.arrayBuffer()));
await (await SpreadsheetFile.exportXlsx(wb)).save(path.join(out,'Importacao_Analise_Solo_InCeres_Compusoft.xlsx'));
console.log(JSON.stringify({rows:matrix.length,columns:headers.length,out}));
