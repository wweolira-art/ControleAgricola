import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import oracledb from 'oracledb';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8').replace(/^\uFEFF/, ''));
const inputIndex = process.argv.indexOf('--input');
const full = inputIndex < 0 ? null : JSON.parse(fs.readFileSync(process.argv[inputIndex+1], 'utf8').replace(/^\uFEFF/, ''));
if(full && (full.formato !== 'inceres-conta-v1' || !Array.isArray(full.grades) || !Array.isArray(full.indices?.indices))) throw new Error('Formato da coleta inválido');
const index = full ? full.indices.indices.flatMap(s=>s.grades) : read('tmp/inceres-season-index.json');
const areas = full ? [...new Map(full.grades.flatMap(g=>g.talhoes).map(a=>[a.id,a])).values()] : read('tmp/inceres-season/areas_safra.json');
let season = full ? {resumo:{safra:null},resultados:[]} : read('output/inceres/analise_solo_safra_2026-2027.json');
const documents = [];
function document(type, key, safra, payload) {
  const json = JSON.stringify(payload);
  documents.push({type, key:String(key), safra, json, hash:crypto.createHash('sha256').update(json).digest('hex')});
}
for (const g of index) document('GRADE_INDICE', g.amostragemId, g.anoSafra, g);
for (const a of areas) document('TALHAO', a.id, a.cropYear, a);
if(full) {
  const aliases={h_al:'h+Al',ctc:'t',p_mehl:'p',p_res:'p'};
  const coverage=[];
  for(const row of full.grades) {
    const g=row.grade;
    document('GRADE',g.id,g.cropYear,g);
    document('GRADE_TALHOES',g.id,g.cropYear,row.talhoes.map(a=>a.id));
    for(const a of row.talhoes) document('FAZENDA',a.farmId,null,{id:a.farmId,nome:a.farm,cliente_id:a.clientId,cliente_nome:a.clientName});
    for(const point of row.pontos) {
      document('PONTO',`${g.id}/${point.ponto.id}`,g.cropYear,point);
      for(const value of point.resultados) season.resultados.push({grade_id:g.id,ponto_id:point.ponto.id,
        profundidade_cm:value.size,elemento:value.name,valor:value.value,
        safra:g.cropYear,fazenda:row.talhoes.length===1?row.talhoes[0].farm:null,
        talhao:row.talhoes.length===1?row.talhoes[0].field:null,ponto:point.ponto.displayId,
        unidade:g.specifications?.[aliases[value.name]||value.name]??null});
    }
    coverage.push({grade_id:g.id,safra:g.cropYear,pontos_esperados:g.pieces.length,pontos_coletados:row.pontos.length,
      completa:row.pontos.length===g.pieces.length && g.areasIds.every(id=>row.talhoes.some(a=>a.id===id))});
  }
  season.resumo={safra:null,safras:full.indices.safras,grades_identificadas:new Set(index.map(g=>g.amostragemId)).size,
    grades_consultadas:full.grades.length,talhoes_identificados:areas.length,registros_coletados:season.resultados.length,
    cobertura_completa:coverage.every(g=>g.completa)&&coverage.length===new Set(index.map(g=>g.amostragemId)).size&&!full.erros.length&&!full.indices.erros.length};
  document('COBERTURA','CONTA',null,{resumo:season.resumo,cobertura:coverage,falhas:full.erros,indices_falhas:full.indices.erros});
} else {
  document('COBERTURA', season.resumo.safra, season.resumo.safra, {resumo:season.resumo,cobertura:season.cobertura,falhas:season.falhas});
  document('RESULTADOS_ORIGINAIS', '478767', '2026-2027', read('tmp/inceres-soil-points.json'));
  for(const a of areas) document('FAZENDA',a.farmId,null,{id:a.farmId,nome:a.farm,cliente_id:a.clientId,cliente_nome:a.clientName});
  const har=read('tmp/inceres-soil-478767.har');
  for(const e of har.log.entries) {
    if(e.response.status!==200 || !/^https:\/\/solo\.inceres\.com\.br\/api\/farmers\/me\/cars\/478767$/.test(e.request.url)) continue;
    const g=JSON.parse(e.response.content.encoding==='base64'?Buffer.from(e.response.content.text,'base64').toString('utf8'):e.response.content.text);
    document('GRADE',g.id,g.cropYear,g);
  }
  const gradeFile = 'tmp/inceres-season/grade_433080.json';
  if (fs.existsSync(path.join(root, gradeFile))) document('GRADE',433080,'2026-2027',read(gradeFile));
}
const uniqueDocuments=[...new Map(documents.map(d=>[`${d.type}/${d.key}`,d])).values()];
const keys = new Set();
for (const r of season.resultados) {
  const key = JSON.stringify([r.grade_id,r.ponto_id,r.profundidade_cm,r.elemento]);
  if (keys.has(key)) throw new Error(`Resultado duplicado: ${key}`);
  keys.add(key);
  if (r.valor !== null && !Number.isFinite(r.valor)) throw new Error('Valor não numérico');
}
if (!process.argv.includes('--apply')) {
  console.log(JSON.stringify({mode:'validation',documents:uniqueDocuments.length,results:keys.size,coverage:season.resumo},null,2));
  process.exit(0);
}
const env = {};
for (const line of fs.readFileSync(path.join(root,'.env'),'utf8').split(/\r?\n/)) {
  const m=line.match(/^\s*([A-Z_0-9]+)\s*=\s*(.*?)\s*$/);
  if(m) env[m[1]]=m[2].replace(/^(['"])(.*)\1$/,'$2');
}
if(env.ORACLE_CLIENT_LIB_DIR && fs.existsSync(path.join(env.ORACLE_CLIENT_LIB_DIR,'oci.dll'))) oracledb.initOracleClient({libDir:env.ORACLE_CLIENT_LIB_DIR});
const conn=await oracledb.getConnection({user:env.ORACLE_SOLO_WRITE_USER,password:env.ORACLE_SOLO_WRITE_PASSWORD,connectString:env.ORACLE_SOLO_WRITE_CONNECT_STRING});
conn.callTimeout=30000;
try {
  const tables = new Set((await conn.execute("SELECT table_name FROM user_tables WHERE table_name IN ('INCERES_DOCUMENTO','INCERES_RESULTADO')")).rows.map(r=>r[0]));
  if(!tables.has('INCERES_DOCUMENTO')) await conn.execute(`CREATE TABLE INCERES_DOCUMENTO (
    TIPO VARCHAR2(40) NOT NULL, CHAVE VARCHAR2(200) NOT NULL, SAFRA VARCHAR2(30),
    CONTEUDO CLOB NOT NULL, HASH_SHA256 VARCHAR2(64) NOT NULL,
    ATUALIZADO_EM TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT INCERES_DOCUMENTO_PK PRIMARY KEY(TIPO,CHAVE))`);
  if(!tables.has('INCERES_RESULTADO')) await conn.execute(`CREATE TABLE INCERES_RESULTADO (
    GRADE_ID NUMBER NOT NULL, PONTO_ID NUMBER NOT NULL, PROFUNDIDADE VARCHAR2(100) NOT NULL,
    ELEMENTO VARCHAR2(100) NOT NULL, SAFRA VARCHAR2(30), FAZENDA VARCHAR2(500),
    TALHAO VARCHAR2(500), PONTO VARCHAR2(100), VALOR NUMBER, UNIDADE VARCHAR2(100),
    ATUALIZADO_EM TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT INCERES_RESULTADO_PK PRIMARY KEY(GRADE_ID,PONTO_ID,PROFUNDIDADE,ELEMENTO))`);
  for(const d of uniqueDocuments) await conn.execute(`MERGE INTO INCERES_DOCUMENTO t
    USING (SELECT :type TIPO,:key CHAVE FROM dual) s ON(t.TIPO=s.TIPO AND t.CHAVE=s.CHAVE)
    WHEN MATCHED THEN UPDATE SET SAFRA=:safra,CONTEUDO=:json,HASH_SHA256=:hash,ATUALIZADO_EM=SYSTIMESTAMP
    WHEN NOT MATCHED THEN INSERT(TIPO,CHAVE,SAFRA,CONTEUDO,HASH_SHA256) VALUES(:type,:key,:safra,:json,:hash)`,
    {...d,json:{val:d.json,type:oracledb.CLOB}});
  if(season.resultados.length) await conn.executeMany(`MERGE INTO INCERES_RESULTADO t
    USING(SELECT :grade GRADE_ID,:point PONTO_ID,:depth PROFUNDIDADE,:element ELEMENTO FROM dual) s
    ON(t.GRADE_ID=s.GRADE_ID AND t.PONTO_ID=s.PONTO_ID AND t.PROFUNDIDADE=s.PROFUNDIDADE AND t.ELEMENTO=s.ELEMENTO)
    WHEN MATCHED THEN UPDATE SET SAFRA=:season,FAZENDA=:farm,TALHAO=:field,PONTO=:display,VALOR=:value,UNIDADE=:unit,ATUALIZADO_EM=SYSTIMESTAMP
    WHEN NOT MATCHED THEN INSERT(GRADE_ID,PONTO_ID,PROFUNDIDADE,ELEMENTO,SAFRA,FAZENDA,TALHAO,PONTO,VALOR,UNIDADE)
    VALUES(:grade,:point,:depth,:element,:season,:farm,:field,:display,:value,:unit)`,
    season.resultados.map(r=>({grade:r.grade_id,point:r.ponto_id,depth:r.profundidade_cm,element:r.elemento,season:r.safra,farm:r.fazenda,field:r.talhao,display:String(r.ponto),value:r.valor,unit:r.unidade})),
    {bindDefs:{grade:{type:oracledb.NUMBER},point:{type:oracledb.NUMBER},depth:{type:oracledb.STRING,maxSize:400},
      element:{type:oracledb.STRING,maxSize:400},season:{type:oracledb.STRING,maxSize:120},farm:{type:oracledb.STRING,maxSize:2000},
      field:{type:oracledb.STRING,maxSize:2000},display:{type:oracledb.STRING,maxSize:400},value:{type:oracledb.NUMBER},unit:{type:oracledb.STRING,maxSize:400}}});
  const counts=(await conn.execute(`SELECT COUNT(*) TOTAL,COUNT(VALOR) COM_VALOR,COUNT(DISTINCT GRADE_ID) GRADES FROM INCERES_RESULTADO WHERE (:season IS NULL OR SAFRA=:season)`,{season:{val:season.resumo.safra,type:oracledb.STRING}},{outFormat:oracledb.OUT_FORMAT_OBJECT})).rows;
  if(counts[0].TOTAL < keys.size) throw new Error('Contagem de verificação inferior à carga');
  await conn.commit();
  console.log(JSON.stringify({committed:true,documents:uniqueDocuments.length,verification:counts,coverage:season.resumo},null,2));
} catch(error) {
  await conn.rollback();
  console.error(JSON.stringify({code:error.code,errorNum:error.errorNum}));
  process.exitCode=1;
} finally {await conn.close();}
