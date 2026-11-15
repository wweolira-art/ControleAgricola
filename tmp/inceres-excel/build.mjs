import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {FileBlob, SpreadsheetFile} from '@oai/artifact-tool';
const root=fileURLToPath(new URL('../../',import.meta.url));
const consolidated=process.argv.includes('--collected');
const fromApi=process.argv.includes('--api');
const apiYearPos=process.argv.indexOf('--api-year');
const apiYear=apiYearPos>=0?process.argv[apiYearPos+1]:null;
const out=path.join(root,'outputs',fromApi?'inceres-todas-consultadas-20261113':consolidated?'inceres-coletados-20261113':'inceres-compusoft-20261113');
await fs.mkdir(out,{recursive:true});
const wb=await SpreadsheetFile.importXlsx(await FileBlob.load('C:/Users/rayhi/Downloads/Pasta1.xlsx'));
const sheet=wb.worksheets.getItemAt(0);
if(process.argv.includes('--inspect')) {
  console.log((await wb.inspect({kind:'region',sheetId:sheet.name,range:'A1:AH4',maxChars:2500,tableMaxRows:4,tableMaxCols:34})).ndjson);
  const p=await wb.render({sheetName:sheet.name,range:'C2:R4',scale:1.5,format:'png'});
  await fs.writeFile(path.join(out,'modelo-preview.png'),new Uint8Array(await p.arrayBuffer()));
  process.exit(0);
}
const apiExport=fromApi?JSON.parse(await fs.readFile(path.join(root,'tmp/inceres-excel/api-preparado.json'),'utf8')):null;
if(fromApi) {
  if(!/^\d{4}-\d{4}$/.test(apiYear??''))throw new Error('Selecione --api-year para não misturar safras no modelo sem coluna SAFRA');
  apiExport.resumo_global={...apiExport.resumo};
  apiExport.linhas=apiExport.linhas.filter(r=>r.origens.some(o=>o.safra===apiYear));
  apiExport.resumo={...apiExport.resumo,safra:apiYear,linhas_exportaveis_da_safra:apiExport.linhas.length};
}
const source=fromApi?{resumo:apiExport.resumo,resultados:apiExport.linhas.flatMap(r=>Object.entries(r.values).map(([elemento,valor])=>({grade_id:r.origens[0].grade,ponto_id:r.origens[0].ponto_id,ponto:r.origens[0].ponto,profundidade_cm:r.profundidade,elemento,valor})))}:JSON.parse(await fs.readFile(path.join(root,consolidated?'tmp/inceres-excel/resultados-coletados.json':'output/inceres/analise_solo_safra_2026-2027.json'),'utf8'));
const settingsPath=path.join(root,'tmp/inceres-excel/settings.json');
const settings=JSON.parse(await fs.readFile(settingsPath,'utf8'));
const spatial=fromApi?{fonte_poligonos:'PlanejamentoAgricola/public/data/Fazendas.json',pontos:apiExport.linhas.map(r=>({ponto_id:r.origens[0].ponto_id,correspondencias:[{Cod_fazend:r.fazenda,Lote:r.talhao,Fazenda:r.fazenda_nome}],zona:r.zona,data_cadastro_grade:r.data}))}:JSON.parse(await fs.readFile(path.join(root,consolidated?'tmp/inceres-excel/poligonos-coletados.json':'tmp/inceres-excel/poligonos-identificados.json'),'utf8'));
const spatialByPoint=new Map(spatial.pontos.map(p=>[p.ponto_id,p]));
const groups=new Map();
for(const r of source.resultados) {
  const key=JSON.stringify([r.grade_id,r.ponto_id,r.profundidade_cm]);
  if(!groups.has(key)) groups.set(key,{grade:r.grade_id,ponto:r.ponto,pontoId:r.ponto_id,profundidade:r.profundidade_cm,values:{}});
  const g=groups.get(key);
  if(r.elemento in g.values && g.values[r.elemento]!==r.valor) throw new Error('Resultados conflitantes');
  g.values[r.elemento]=r.valor;
}
const records=[...groups.values()];
if(!fromApi)records.sort((a,b)=>a.ponto-b.ponto||parseFloat(a.profundidade)-parseFloat(b.profundidade));
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
  if(!Number.isFinite(spatialPoint.zona)) throw new Error('Zona sem associação revisada');
  const date=consolidated||fromApi?spatialPoint.data_cadastro_grade?.split('-').reverse().join('/'):settings.data;
  if(!date || !/^\d{2}\/\d{2}\/\d{4}$/.test(date)) throw new Error('Data de referência ausente');
  const row=Array(34).fill(null);
  row[2]=date;row[4]=polygon.Cod_fazend;row[5]=polygon.Lote;row[6]=spatialPoint.zona;row[7]=g.profundidade;
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
if(consolidated||fromApi) {
  // A precisão original da matéria orgânica ultrapassa a largura dos exemplos.
  const moWidth=Math.max(...matrix.map(r=>String(r[9]??'').length))+2;
  sheet.getRange(`J2:J${records.length+2}`).format.columnWidth=Math.max(8,moWidth);
  if(fromApi)for(let col=8;col<32;col++) {
    const length=Math.max(headers[col]?.length??0,...matrix.map(r=>String(r[col]??'').length));
    if(length>8)sheet.getRangeByIndexes(1,col,records.length+1,1).format.columnWidth=length+2;
  }
}
const report={fonte:fromApi?'InCeres, consulta autenticada de todas as grades de todas as safras disponíveis':'InCeres, coleta parcial da safra 2026-2027',cobertura:source.resumo,metodos:{ph:settings.ph,fosforo:settings.p},
  data_analise:{valores:[...new Set(matrix.map(r=>r[2]))],origem:'Data de cadastro de cada grade no InCeres, seguindo o critério utilizado no primeiro arquivo; não é confirmação da data de análise laboratorial.'},
  pendencias:['Confirmar unidades exigidas pelo Compusoft.','CTC potencial da origem não foi transferida como CTC efetiva.'],
  identificacao_espacial:{arquivo:spatial.fonte_poligonos,metodo:'Contenção de cada ponto em Polygon/MultiPolygon, excluindo buracos; exige correspondência única.',zona_fonte:'Catálogo revisado server/analise-solo-associacoes.ts, SOIL_FARM_OPTIONS'},
  linhas:records.map((g,i)=>({linha:i+3,grade:g.grade,ponto:g.ponto,ponto_id:g.pontoId,profundidade:g.profundidade,...spatialByPoint.get(g.pontoId)}))};
await fs.writeFile(path.join(out,fromApi?`conferencia-${apiYear}.json`:'conferencia.json'),JSON.stringify(report,null,2));
if(fromApi)await fs.writeFile(path.join(out,`pendencias-identificacao-${apiYear}.json`),JSON.stringify({resumo:apiExport.resumo,pendencias:apiExport.pendencias,cobertura:apiExport.cobertura},null,2));
wb.recalculate();
console.log((await wb.inspect({kind:'region',sheetId:sheet.name,range:'C2:R5',maxChars:2500,tableMaxRows:4,tableMaxCols:16})).ndjson);
const preview=await wb.render({sheetName:sheet.name,range:'C2:R8',scale:1.5,format:'png'});
await fs.writeFile(path.join(out,fromApi?`preview-${apiYear}.png`:'preview.png'),new Uint8Array(await preview.arrayBuffer()));
if(consolidated||fromApi) {
  const lastRow=records.length+2;
  const p=await wb.render({sheetName:sheet.name,range:fromApi?`C${Math.max(2,lastRow-5)}:AH${lastRow}`:'C14:AH19',scale:1,format:'png'});
  await fs.writeFile(path.join(out,fromApi?`preview-final-${apiYear}.png`:'preview-adicionais.png'),new Uint8Array(await p.arrayBuffer()));
}
await (await SpreadsheetFile.exportXlsx(wb)).save(path.join(out,fromApi?`Importacao_Analise_Solo_InCeres_${apiYear}.xlsx`:consolidated?'Importacao_Compusoft_Todos_Resultados_Coletados.xlsx':'Importacao_Analise_Solo_InCeres_Compusoft.xlsx'));
console.log(JSON.stringify({rows:matrix.length,columns:headers.length,out}));
