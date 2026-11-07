import type { Express, Request, Response } from 'express';
import { createHash } from 'node:crypto';
import oracledb from 'oracledb';
import * as XLSX from 'xlsx';
import { withOracle, loadEnvFile } from './oracle.js';
import { readBearerToken, verifySessionToken } from './auth.js';
import { canAccessPermission, canEditPermission } from './permissions.js';
import { parseSoilGrid, type SoilFile, type SoilRow, type SoilSettings, type SoilLocation } from '../src/lib/analise-solo.js';
import { SOIL_REPORT_DATES } from './analise-solo-datas.js';
import { readSoilWorkbook } from './analise-solo-xlsx.js';
import {buildCompusoftPlan,normalizeExportSettings,type ExportSettings} from '../src/lib/analise-solo-compusoft.js';
import {exportCompusoftWorkbook} from './analise-solo-export.js';
import {SOIL_ASSOCIATIONS,SOIL_FARM_OPTIONS} from './analise-solo-associacoes.js';
import {completeVerifiedLocations} from '../src/lib/analise-solo-associacoes.js';

const PREFIX = '/api/analise-solo';
const PERMISSION = 'nativeTab:indicadores:analise-solo';
const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
function inputFiles(input: unknown) {
  if (!Array.isArray(input) || !input.length || input.length > 12) throw new Error('Selecione de 1 a 12 arquivos Excel.');
  let size = 0; const names = new Set<string>(); const rows: SoilRow[] = [];
  const files: SoilFile[] = input.map((f: any) => {
    if (!f || typeof f.name !== 'string' || !/\.xlsx$/i.test(f.name) || typeof f.base64 !== 'string' || f.base64.length > 20_000_000) throw new Error('Arquivo inválido. Utilize .xlsx de até 15 MB.');
    if (names.has(f.name)) throw new Error('Não selecione arquivos com nomes iguais.'); names.add(f.name);
    const data = Buffer.from(f.base64, 'base64'); size += data.length;
    if (size > 23_000_000) throw new Error('O lote deve ter até 23 MB.');
    const workbook = readSoilWorkbook(data);
    let found = 0;
    for (const name of workbook.SheetNames) {
      const parsed = parseSoilGrid(XLSX.utils.sheet_to_json(workbook.Sheets[name], {header: 1, defval: null, raw: true}), f.name, name);
      found += parsed.length; rows.push(...parsed);
    }
    if (!found) throw new Error(`${f.name}: nenhuma tabela de amostras reconhecida.`);
    if (rows.length > 10000) throw new Error('O lote deve ter até 10.000 linhas.');
    const report = SOIL_REPORT_DATES.find(d => d.excelSha256 === sha(data));
    const date = typeof f.date === 'string' ? f.date : '';
    const dateSource = typeof f.dateSource === 'string' ? f.dateSource : '';
    if (dateSource !== 'manual' && dateSource && (!report || report[dateSource as 'conclusao'|'recebimento'|'emissao'] !== date)) throw new Error(`${f.name}: a data diverge do PDF. Escolha entrada manual para informar outra data.`);
    return {name: f.name, base64: f.base64, sha256: sha(data), date, dateSource};
  });
  return {files, rows};
}
const scope = (s: SoilSettings) => ({g:s.grupo,e:s.empresa,f:s.filial,s:s.safra});
async function locations(s: SoilSettings): Promise<SoilLocation[]> {
  return withOracle(async c => (await c.execute<SoilLocation>(`SELECT t.cod_safra,t.cod_safradetalhe,t.cod_fazenda,t.zona,t.cod_talhao,t.descricao_talhao,f.descricao fazenda
    FROM agricola.talhao t JOIN agricola.fazenda f ON f.cod_fazenda=t.cod_fazenda
    WHERE (f.cod_grupoempresa=:g OR f.cod_grupoempresa IS NULL) AND (f.cod_empresa=:e OR f.cod_empresa IS NULL) AND (f.cod_filial=:f OR f.cod_filial IS NULL) AND t.cod_safra=:s
    ORDER BY f.descricao,t.zona,t.cod_talhao,t.cod_safradetalhe`, scope(s), {outFormat: oracledb.OUT_FORMAT_OBJECT, maxRows: 10000})).rows ?? []);
}
async function prepare(body: any) {
  const parsed=inputFiles(body.files);let settings=body.settings as ExportSettings;
  if(!settings||!settings.locations)throw new Error('Informe as associações dos talhões.');
  settings=normalizeExportSettings({...settings,locations:completeVerifiedLocations(parsed.rows,SOIL_ASSOCIATIONS,settings.locations)});
  if(body.methodsConfirmed!==true)throw new Error('Confirme os métodos e os códigos de destino antes de validar.');
  const plan=buildCompusoftPlan(parsed.rows,parsed.files,settings);
  const fingerprint=sha(JSON.stringify({files:parsed.files.map(({base64,...f})=>f),settings}));
  return {...parsed,settings,plan,fingerprint};
}
function reportOf(p:Awaited<ReturnType<typeof prepare>>){return {fingerprint:p.fingerprint,plan:p.plan,files:p.files.map(({base64,...f})=>f),settings:p.settings};}
export function registerAnaliseSoloRoutes(app:Express){
  app.use(PREFIX,(req,res,next)=>{
    const u=verifySessionToken(readBearerToken(req.headers.authorization));
    if(!u)return res.status(401).json({error:'Sessão expirada ou inválida.'});
    const allowed=req.method==='GET'?canAccessPermission(u.permissions??[],PERMISSION):canEditPermission(u.permissions??[],PERMISSION);
    if(!allowed)return res.status(403).json({error:'Sem permissão para análise de solo.'});
    next();
  });
  const route=(fn:(req:Request,res:Response)=>Promise<unknown>)=>async(req:Request,res:Response)=>{try{await fn(req,res);}catch(e){res.status(400).json({error:e instanceof Error?e.message:'Não foi possível processar o lote.'});}};
  app.get(PREFIX+'/config',route(async(_req,res)=>{
    loadEnvFile();res.json({grupo:Number(process.env.COD_GRUPOEMPRESA)||1,empresa:Number(process.env.COD_EMPRESA)||1,filial:Number(process.env.COD_FILIAL)||1,mode:'xlsx'});
  }));
  app.get(PREFIX+'/talhoes',route(async(req,res)=>{
    const s={grupo:Number(req.query.grupo),empresa:Number(req.query.empresa),filial:Number(req.query.filial),safra:Number(req.query.safra)} as SoilSettings;
    if(Object.values(scope(s)).some(v=>!Number.isSafeInteger(v)||v<1))throw new Error('Informe grupo, empresa, filial e safra válidos para consultar os talhões.');
    res.json(await locations(s));
  }));
  app.post(PREFIX+'/ler',route(async(req,res)=>{
    const {files,rows}=inputFiles(req.body.files);
    res.json({rows,farmOptions:SOIL_FARM_OPTIONS,associations:SOIL_ASSOCIATIONS.filter(a=>rows.some(r=>r.talhao.trim()===a.source)),files:files.map(({base64,...f})=>({...f,report:SOIL_REPORT_DATES.find(d=>d.excelSha256===f.sha256)??null}))});
  }));
  app.post(PREFIX+'/validar',route(async(req,res)=>{res.json(reportOf(await prepare(req.body)));}));
  app.post(PREFIX+'/exportar',route(async(req,res)=>{
    const p=await prepare(req.body);
    if(req.body.fingerprint!==p.fingerprint)throw new Error('O lote mudou. Valide novamente antes de gerar o arquivo.');
    if(req.body.warningsAccepted!==true)throw new Error('Confira e aceite os avisos sobre os campos sem resultado.');
    const buffer=await exportCompusoftWorkbook(p.plan);
    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition','attachment; filename="analise-solo-compusoft.xlsx"');
    res.setHeader('Cache-Control','no-store');res.send(buffer);
  }));
  app.post(PREFIX+'/enviar',(_req,res)=>{res.status(410).json({error:'O envio direto ao Oracle foi substituído pela geração do Excel para importação no Compusoft.'});});
}
