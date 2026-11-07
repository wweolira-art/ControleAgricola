import {validSoilDate, type SoilFile, type SoilRow} from './analise-solo';

export const COMPUSOFT_HEADERS = [null,null,'DATA_ANALISE',null,'FAZENDA','TALHAO','ZONA','PROFUNDIDADE','PH','MO','P','S','CA','MG','NA','K','AL','H_AL','CE','SB','CTC','V','C','SAT_CA','SAT_MG','SAT_NA','SAT_K','CU','FE','MN','ZN','B','ESTAGIO_CULTURA','PRODUCAO_ESTIMADA'] as const;
export type ExportLocation = {fazenda:number|null;talhao:number|null;zona:number|null;estagio:number|null;producao:number|null};
export type SampleLocation = {fazenda:number|null;zona:number|null};
export function sampleLocationKey(row:SoilRow):string{return JSON.stringify([row.file,row.talhao,row.sample]);}
export type ExportSettings = {
  grupo:number;empresa:number;filial:number;safra:number;
  locations:Record<string,ExportLocation>;
  phosphorus:'meh'|'res';potassium:'cmol'|'mg';ph:'cacl2'|'agua';
  talhaoSource?:'identification'|'talhao-column'|'manual';
  sampleLocations?:Record<string,SampleLocation>;
};
export type ExportItem = {date:string;source:SoilRow;sources:SoilRow[];location:ExportLocation;values:Record<string,number|null>};
export type CompusoftPlan = {items:ExportItem[];errors:string[];conflicts:string[];warnings:string[];duplicates:number};
export function normalizeExportSettings(settings:ExportSettings):ExportSettings{
  return {...settings,talhaoSource:settings.talhaoSource??'identification'};
}
const mappings:Record<string,string>={MO:'MATERIA_ORGANICA',S:'ENXOFRE',CA:'CALCIO',MG:'MAGNESIO',NA:'NA',AL:'ALUMINIO',H_AL:'H_AL',CE:'CE',SB:'SOMA_BASES',CTC:'CTC_EFETIVA',V:'V',C:'CARBONO',SAT_CA:'SAT_CA',SAT_MG:'SAT_MG',SAT_NA:'SAT_NA',SAT_K:'SAT_K',CU:'COBRE',FE:'FERRO',MN:'MANGANES',ZN:'ZINCO',B:'BORO'};
export function originalTalhaoCode(value:unknown):number|null{
  const text=String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  const match=text.match(/^(?:(?:TH|TALHAO)\s*)?(\d+)$/i);
  if(!match)return null;
  const code=Number(match[1]);return Number.isSafeInteger(code)&&code>0?code:null;
}
export function initialExportLocations(rows:SoilRow[]):Record<string,ExportLocation>{
  return Object.fromEntries([...new Set(rows.map(r=>r.talhao))].map(t=>[t,{fazenda:null,talhao:originalTalhaoCode(t),zona:null,estagio:null,producao:null}]));
}
export function buildCompusoftPlan(rows:SoilRow[],files:SoilFile[],settings:ExportSettings):CompusoftPlan{
  const errors:string[]=[],conflicts:string[]=[],warnings:string[]=[];let duplicates=0;
  const keyed=new Map<string,ExportItem>();
  if(settings.talhaoSource&&!['identification','talhao-column','manual'].includes(settings.talhaoSource))errors.push('Selecione a coluna de origem do talhão.');
  if(!['meh','res'].includes(settings.phosphorus)||!['cmol','mg'].includes(settings.potassium)||!['cacl2','agua'].includes(settings.ph))errors.push('Selecione os métodos de pH, fósforo e a unidade de potássio.');
  for(const f of files)if(!validSoilDate(f.date)||!['manual','conclusao','recebimento','emissao'].includes(f.dateSource))errors.push(`${f.name}: informe uma data válida e a origem da data.`);
  for(const row of rows){
    const f=files.find(f=>f.name===row.file);if(!f||!validSoilDate(f.date))continue;
    const assigned=settings.locations[row.talhao];
    const l:ExportLocation={fazenda:assigned?.fazenda??null,talhao:assigned?.talhao??originalTalhaoCode(row.talhao),zona:assigned?.zona??null,estagio:assigned?.estagio??null,producao:assigned?.producao??null};
    const sampleLocation=settings.sampleLocations?.[sampleLocationKey(row)];
    if(sampleLocation){l.fazenda=sampleLocation.fazenda;l.zona=sampleLocation.zona;}
    if(settings.talhaoSource==='identification')l.talhao=row.sample;
    if(settings.talhaoSource==='talhao-column')l.talhao=originalTalhaoCode(row.talhao);
    const missing=(['fazenda','talhao','zona'] as const).filter(k=>!Number.isSafeInteger(l[k])||Number(l[k])<=0);
    if(missing.length){
      const labels={fazenda:'fazenda',talhao:'talhão',zona:'zona'};
      const known=[l.fazenda!=null?`fazenda ${l.fazenda}`:'',l.talhao!=null?(settings.talhaoSource==='identification'?'talhão obtido do arquivo':`talhão ${l.talhao}`):'',l.zona!=null?`zona ${l.zona}`:''].filter(Boolean);
      errors.push(`${row.talhao}: falta informar ${missing.map(k=>labels[k]).join(', ')}${known.length?` (${known.join(', ')} já preenchidos)`:''}.`);continue;
    }
    if(l.estagio!=null&&(!Number.isSafeInteger(l.estagio)||l.estagio<=0))errors.push(`${row.talhao}: código do estágio de cultura inválido.`);
    if(l.producao!=null&&(!Number.isFinite(l.producao)||l.producao<0))errors.push(`${row.talhao}: produção estimada inválida.`);
    const key=[f.date,l.fazenda,l.zona,l.talhao,row.sample,row.depth].join('|');
    const old=keyed.get(key);
    if(old){
      if(old.location.estagio!==l.estagio||old.location.producao!==l.producao)conflicts.push(`${row.talhao}: estágio ou produção divergente nas associações do mesmo talhão.`);
      for(const [k,v]of Object.entries(row.values)){
        const previous=old.source.values[k];
        if(v!=null&&previous!=null&&v!==previous)conflicts.push(`Amostra ${row.sample}, profundidade ${row.depth}, ${row.talhao}: ${k} difere entre ${old.source.file} e ${row.file}.`);
        else if(v!=null&&previous==null)old.source.values[k]=v;
      }
      old.sources.push(row);duplicates++;continue;
    }
    keyed.set(key,{date:f.date,source:{...row,values:{...row.values}},sources:[row],location:{...l},values:{}});
  }
  const items=[...keyed.values()];
  const missing=new Map<string,number>();
  for(const item of items){
    const v=item.source.values;
    for(const [out,input]of Object.entries(mappings))item.values[out]=v[input]??null;
    item.values.PH=v[settings.ph==='cacl2'?'PH_CA':'PH_AGUA']??null;
    item.values.P=v[settings.phosphorus==='meh'?'P_MEH':'P_RES']??null;
    item.values.K=v[settings.potassium==='cmol'?'K_CMOL':'K_MG']??null;
    for(const k of ['PH','MO','P','S','CA','MG','NA','K','AL','H_AL','CE','SB','CTC','V','C','SAT_CA','SAT_MG','SAT_NA','SAT_K','CU','FE','MN','ZN','B'])if(item.values[k]==null)missing.set(k,(missing.get(k)??0)+1);
  }
  if(!rows.length)errors.push('Nenhuma amostra para exportar.');
  if(missing.size)warnings.push('Campos sem resultado na origem, exportados vazios: '+[...missing].map(([k,n])=>`${k}: ${n}`).join('; ')+'.');
  if(items.some(i=>i.source.values.CTC_CATIONS!=null&&i.values.CTC==null))warnings.push('O campo T dos laudos é CTC potencial. Ele não preenche CTC, que o layout exige como CTC efetiva. Nenhum valor foi calculado ou substituído.');
  if(items.some(i=>i.location.estagio==null))warnings.push('Há talhões sem estágio de cultura. AG ficará vazia nesses registros; preencha se a rotina do Compusoft exigir.');
  if(items.some(i=>i.location.producao==null))warnings.push('Há talhões sem produção estimada. AH ficará vazia nesses registros.');
  warnings.push('As colunas A, B e D permanecem vazias, conforme Pasta2.xlsx. O número original da amostra fica no relatório de conferência, pois o modelo não possui essa coluna.');
  if(settings.talhaoSource==='identification')warnings.push('TALHAO preenchido com o número original da coluna Descrição/Id/identificação da amostra de cada linha, conforme a regra selecionada. O mesmo número pode existir em fazendas diferentes.');
  warnings.push('Textura, métodos alternativos e relações que não constam do modelo permanecem no arquivo original e na conferência; não são acrescentadas colunas ao Excel de importação.');
  return {items,errors:[...new Set(errors)],conflicts:[...new Set(conflicts)],warnings,duplicates};
}
export function compusoftRow(item:ExportItem):Array<string|number|null>{
  const row:Array<string|number|null>=Array(34).fill(null);
  row[2]=item.date.split('-').reverse().join('/');row[4]=item.location.fazenda;row[5]=item.location.talhao;row[6]=item.location.zona;row[7]=item.source.depth;
  for(let i=8;i<=31;i++){
    const h=COMPUSOFT_HEADERS[i]!;const v=item.values[h];
    // O modelo do fornecedor usa resultados como texto com vírgula decimal.
    row[i]=v==null?null:v.toLocaleString('pt-BR',{useGrouping:false,minimumFractionDigits:2,maximumFractionDigits:15});
  }
  row[32]=item.location.estagio;row[33]=item.location.producao;
  return row;
}
