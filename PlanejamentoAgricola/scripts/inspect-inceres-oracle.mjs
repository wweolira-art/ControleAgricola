import fs from 'node:fs';
import path from 'node:path';
import oracledb from 'oracledb';
oracledb.fetchAsString = [oracledb.CLOB];

const env = {};
for (const line of fs.readFileSync(new URL('../../.env', import.meta.url), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_0-9]+)\s*=\s*(.*?)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
}
if (env.ORACLE_CLIENT_LIB_DIR && fs.existsSync(path.join(env.ORACLE_CLIENT_LIB_DIR, 'oci.dll'))) {
  oracledb.initOracleClient({libDir: env.ORACLE_CLIENT_LIB_DIR});
}
let conn;
try {
  const useReadUser = !process.argv.includes('--cscliente') && process.argv.some(x=>['--procedure','--depara','--diagnose'].includes(x));
  conn = await oracledb.getConnection({
    user: useReadUser ? env.ORACLE_USER : env.ORACLE_SOLO_WRITE_USER,
    password: useReadUser ? env.ORACLE_PASSWORD : env.ORACLE_SOLO_WRITE_PASSWORD,
    connectString: useReadUser ? env.ORACLE_CONNECT_STRING : env.ORACLE_SOLO_WRITE_CONNECT_STRING,
  });
  conn.callTimeout = 20000;
  const options = {outFormat: oracledb.OUT_FORMAT_OBJECT};
  if(process.argv.includes('--depth-permissions')) {
    console.log(JSON.stringify({
      identity:(await conn.execute(`SELECT USER usuario FROM dual`,{},options)).rows,
      system:(await conn.execute(`SELECT privilege FROM session_privs ORDER BY privilege`,{},options)).rows,
      table:(await conn.execute(`SELECT grantee,privilege FROM all_tab_privs WHERE table_schema='CSINTEGRACAO' AND table_name='PROFUNDIDADE_DE_PARA' ORDER BY grantee,privilege`,{},options)).rows,
      roles:(await conn.execute(`SELECT role FROM session_roles ORDER BY role`,{},options)).rows
    },null,2));
    await conn.close();conn=null;process.exit(0);
  }
  if(process.argv.includes('--fix-depth')) {
    try {
      const changes=[];
      for(const [depth,code] of [['0-20',1],['20-40',2],['40-60',3]]) {
        const existing=(await conn.execute(`SELECT cod_profundidade_para FROM csintegracao.profundidade_de_para WHERE cod_profundidade_de=:depth`,{depth},options)).rows??[];
        if(existing.length>1 || (existing.length===1 && existing[0].COD_PROFUNDIDADE_PARA!==code)) throw new Error(`Vínculo existente conflitante: ${depth}`);
        if(!existing.length) {
          await conn.execute(`INSERT INTO csintegracao.profundidade_de_para (cod_profundidade_de,cod_profundidade_para) VALUES (:depth,:code)`,{depth,code});
          changes.push({depth,code});
        }
      }
      const verified=(await conn.execute(`SELECT cod_profundidade_de,cod_profundidade_para FROM csintegracao.profundidade_de_para WHERE cod_profundidade_de IN ('0-20','20-40','40-60') ORDER BY cod_profundidade_de`,{},options)).rows??[];
      if(verified.length!==3) throw new Error('Contagem inesperada na conferência');
      await conn.commit();
      console.log(JSON.stringify({committed:true,inserted:changes,verified},null,2));
    } catch(e) {await conn.rollback();throw e;}
    await conn.close();conn=null;process.exit(0);
  }
  if(process.argv.includes('--depth-structure')) {
    const queries={
      columns:`SELECT column_name,data_type,nullable,data_default FROM dba_tab_columns WHERE owner='CSINTEGRACAO' AND table_name='PROFUNDIDADE_DE_PARA' ORDER BY column_id`,
      triggers:`SELECT trigger_name,trigger_body,status FROM dba_triggers WHERE table_owner='CSINTEGRACAO' AND table_name='PROFUNDIDADE_DE_PARA'`,
      constraints:`SELECT c.constraint_name,c.constraint_type,k.column_name FROM dba_constraints c JOIN dba_cons_columns k ON k.owner=c.owner AND k.constraint_name=c.constraint_name WHERE c.owner='CSINTEGRACAO' AND c.table_name='PROFUNDIDADE_DE_PARA' ORDER BY c.constraint_name,k.position`
    };
    for(const [label,sql] of Object.entries(queries)) {
      try {console.log(JSON.stringify({label,rows:(await conn.execute(sql,{},options)).rows}));}
      catch(e){console.log(JSON.stringify({label,error:e.code}));}
    }
    await conn.close();conn=null;process.exit(0);
  }
  if(process.argv.includes('--depth-map')) {
    for(const [label,sql] of Object.entries({
      columns:`SELECT owner,table_name,column_name,data_type FROM all_tab_columns WHERE owner='CSINTEGRACAO' AND table_name='PROFUNDIDADE_DE_PARA' ORDER BY column_id`,
      mappings:`SELECT cod_profundidade_de,cod_profundidade_para,DUMP(cod_profundidade_de,1016) BYTES_ORIGEM FROM csintegracao.profundidade_de_para ORDER BY cod_profundidade_de`,
      validation:`SELECT x.profundidade,p.cod_profundidade_para FROM (SELECT '0-20' profundidade FROM dual UNION ALL SELECT '20-40' FROM dual UNION ALL SELECT '40-60' FROM dual) x LEFT JOIN csintegracao.profundidade_de_para p ON TRIM(x.profundidade)=p.cod_profundidade_de`
    })) {try {console.log(JSON.stringify({label,rows:(await conn.execute(sql,{}, {...options,maxRows:100})).rows}));}catch(e){console.log(JSON.stringify({label,error:e.code}));}}
    await conn.close();conn=null;process.exit(0);
  }
  if(process.argv.includes('--import-source')) {
    const rows=(await conn.execute(`SELECT line,text FROM dba_source WHERE owner='CSINTEGRACAO' AND name='PR_CS_AGR_IMPANALISESOLO' ORDER BY line`,{},options)).rows??[];
    const selected=new Set();
    rows.forEach((r,i)=>{if(/depara|cod_profundidade|buscaArquivo/i.test(r.TEXT))for(let j=Math.max(0,i-10);j<Math.min(rows.length,i+11);j++)selected.add(j);});
    console.log(JSON.stringify({lines:rows.length,source:[...selected].sort((a,b)=>a-b).map(i=>rows[i])},null,2));
    await conn.close();conn=null;process.exit(0);
  }
  if(process.argv.includes('--diagnose')) {
    const queries={
      identity:`SELECT SYS_CONTEXT('USERENV','SESSION_USER') USUARIO,SYS_CONTEXT('USERENV','DB_NAME') BANCO,SYS_CONTEXT('USERENV','SERVICE_NAME') SERVICO FROM dual`,
      lookup:`SELECT '0-20' ORIGEM,geral.fn_depara('ELEJOTAAGRO','TESTE','0-20','I','N') DESTINO FROM dual
        UNION ALL SELECT '20-40',geral.fn_depara('ELEJOTAAGRO','TESTE','20-40','I','N') FROM dual
        UNION ALL SELECT '40-60',geral.fn_depara('ELEJOTAAGRO','TESTE','40-60','I','N') FROM dual`,
      depths:`SELECT id_profun,cod_profundidade,descricao FROM agricola.profundidade ORDER BY cod_profundidade`,
      source_references:`SELECT owner,name,type,line,text FROM all_source WHERE (UPPER(text) LIKE '%FN_DEPARA%' AND (owner='AGRICOLA' OR owner='CSINTEGRACAO')) OR UPPER(text) LIKE '%PROFUNDIDADE NA PLANILHA%' ORDER BY owner,name,line`,
      metadata:`SELECT DBMS_METADATA.GET_DDL('PROCEDURE','PR_CS_AGR_IMPANALISESOLO','CSINTEGRACAO') TEXTO FROM dual`,
      dba_source:`SELECT line,text FROM dba_source WHERE owner='CSINTEGRACAO' AND name='PR_CS_AGR_IMPANALISESOLO' AND line BETWEEN 315 AND 365 ORDER BY line`,
      source_names:`SELECT DISTINCT owner,name,type FROM all_source WHERE (owner='CSINTEGRACAO' AND name LIKE '%AGR%') OR (owner='GERAL' AND name='FN_DEPARA') ORDER BY owner,name`,
      privileges:`SELECT privilege FROM session_privs WHERE privilege LIKE '%DICTIONARY%' OR privilege LIKE '%PROCEDURE%'`,
      synonyms:`SELECT owner,synonym_name,table_owner,table_name,db_link FROM all_synonyms WHERE synonym_name LIKE '%IMPANALISE%'`,
      parameters:`SELECT cod_grupoempresa,cod_empresa,cod_filial,cod_safra,metodo_analise_solo FROM csintegracao.vw_cs_agr_parametros WHERE cod_grupoempresa=1 AND cod_empresa=1 AND cod_filial=1`
    };
    for(const [label,sql] of Object.entries(queries)) {
      try {const r=await conn.execute(sql,{}, {...options,maxRows:200});console.log(JSON.stringify({label,rows:r.rows}));}
      catch(e){console.log(JSON.stringify({label,error:e.code}));}
    }
    await conn.close();conn=null;process.exit(0);
  }
  if(process.argv.includes('--depara')) {
    console.log(JSON.stringify({
      mappings:(await conn.execute(`SELECT p.id projeto_id,p.descricao,p.chave projeto_chave,c.id campo_id,c.chave campo_chave,v.de,v.para
        FROM geral.deparaprojeto p LEFT JOIN geral.deparacampo c ON c.id_deparaprojeto=p.id
        LEFT JOIN geral.deparavalor v ON v.id_deparacampo=c.id ORDER BY p.id,c.id,v.id`,{}, {...options,maxRows:100})).rows,
    },null,2));
    await conn.close();conn=null;process.exit(0);
  }
  if (process.argv.includes('--procedure')) {
    const source = await conn.execute(`SELECT line,text FROM all_source
      WHERE owner='CSINTEGRACAO' AND name='PR_CS_AGR_IMPANALISESOLO'
      ORDER BY line`,{},options);
    const rows=source.rows??[];
    const selected=new Set();
    rows.forEach((r,i)=>{if(/de.?para|profund|projeto|raise_application_error|20001/i.test(r.TEXT)) for(let j=Math.max(0,i-7);j<Math.min(rows.length,i+8);j++)selected.add(j);});
    console.log(JSON.stringify({sourceLines:rows.length,source:[...selected].sort((a,b)=>a-b).map(i=>rows[i])},null,2));
    await conn.close();conn=null;
    process.exit(0);
  }
  console.log(JSON.stringify({
    identity: (await conn.execute("SELECT SYS_CONTEXT('USERENV','SESSION_USER') USUARIO, SYS_CONTEXT('USERENV','DB_NAME') BANCO FROM dual", {}, options)).rows,
    privileges: (await conn.execute("SELECT privilege FROM session_privs WHERE privilege IN ('CREATE TABLE', 'CREATE VIEW', 'UNLIMITED TABLESPACE')", {}, options)).rows,
    tables: (await conn.execute("SELECT table_name FROM user_tables WHERE table_name LIKE 'INCERES%' ORDER BY table_name", {}, options)).rows,
    ...(process.argv.includes('--verify') ? {
      results: (await conn.execute('SELECT SAFRA, COUNT(*) TOTAL, COUNT(VALOR) COM_VALOR, COUNT(DISTINCT GRADE_ID) GRADES FROM INCERES_RESULTADO GROUP BY SAFRA', {}, options)).rows,
      documents: (await conn.execute('SELECT TIPO, COUNT(*) TOTAL FROM INCERES_DOCUMENTO GROUP BY TIPO ORDER BY TIPO', {}, options)).rows,
    } : {}),
    ...(process.argv.includes('--locations') ? {
      locations: (await conn.execute(`SELECT DISTINCT t.cod_safra,t.cod_fazenda,t.zona,t.cod_talhao,t.descricao_talhao,f.descricao fazenda
        FROM agricola.talhao t JOIN agricola.fazenda f ON f.cod_fazenda=t.cod_fazenda
        WHERE t.cod_fazenda=72500 AND t.cod_talhao IN (9,10)
        ORDER BY t.cod_safra DESC,t.cod_talhao`, {}, {...options,maxRows:100})).rows,
    } : {}),
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({code:error.code, errorNum:error.errorNum, message:String(error.message).replace(/\([^)]*HOST[^)]*\)/gi, '(destino omitido)')}));
  process.exitCode = 1;
} finally {
  if (conn) await conn.close();
}
