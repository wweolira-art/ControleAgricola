import {useEffect,useState} from 'react';
import {authStorage} from '../../api';
import {useCanEditItems} from '../../lib/editAccess';
import {useApp} from '../../store';
import type {SoilFile,SoilLocation,SoilRow} from '../../lib/analise-solo';
import {COMPUSOFT_HEADERS,compusoftRow,normalizeExportSettings,type CompusoftPlan,type ExportSettings,type ExportLocation} from '../../lib/analise-solo-compusoft';
import {applySoilAssociations,type SoilAssociation} from '../../lib/analise-solo-associacoes';
import {SoilSampleAssociations} from './SoilSampleAssociations';
import './analise-solo.css';
type Report={pdf:string;conclusao:string;recebimento:string;emissao:string};
type FileView=SoilFile&{report:Report|null};
type Preview={fingerprint:string;plan:CompusoftPlan;files:Omit<SoilFile,'base64'>[];settings:ExportSettings};
async function request<T>(path:string,body?:unknown):Promise<T>{
  const token=authStorage.getToken();const res=await fetch('/api/analise-solo'+path,{method:body?'POST':'GET',headers:{...(token?{Authorization:`Bearer ${token}`} : {}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  const data=await res.json();if(!res.ok)throw new Error(data.error||'Não foi possível concluir a operação.');return data;
}
function encode(file:File):Promise<string>{return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]);r.onerror=()=>reject(new Error('Falha ao ler '+file.name));r.readAsDataURL(file);});}
function save(blob:Blob,name:string){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
const showDate=(v:string)=>v?v.split('-').reverse().join('/'):'Não informada';
const emptyLocation=():ExportLocation=>({fazenda:null,talhao:null,zona:null,estagio:null,producao:null});
export function ImportacaoAnaliseSolo(){
  const {safra}=useApp();const canEdit=useCanEditItems();
  const [files,setFiles]=useState<FileView[]>([]),[rows,setRows]=useState<SoilRow[]>([]),[locations,setLocations]=useState<SoilLocation[]>([]);
  const [settings,setSettings]=useState<ExportSettings>({grupo:1,empresa:1,filial:1,safra:Number(safra?.code)||0,locations:{},talhaoSource:'identification',phosphorus:'meh',potassium:'cmol',ph:'cacl2'});
  const [preview,setPreview]=useState<Preview|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[confirmed,setConfirmed]=useState(false),[warningsAccepted,setWarningsAccepted]=useState(false);
  const [associations,setAssociations]=useState<SoilAssociation[]>([]);
  const [farmOptions,setFarmOptions]=useState<SoilAssociation['candidates']>([]);
  const [stageDefault,setStageDefault]=useState(''),[productionDefault,setProductionDefault]=useState('');
  useEffect(()=>{void request<{grupo:number;empresa:number;filial:number}>('/config').then(c=>setSettings(s=>({...s,grupo:c.grupo,empresa:c.empresa,filial:c.filial}))).catch(e=>setError(e.message));},[]);
  function invalidate(){setPreview(null);setWarningsAccepted(false);setMessage('');}
  function change(patch:Partial<ExportSettings>){setSettings(s=>({...s,...patch}));invalidate();setConfirmed(false);}
  async function run(fn:()=>Promise<void>){setBusy(true);setError('');try{await fn();}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}}
  async function readFiles(selected:FileList|null){if(!selected?.length)return;await run(async()=>{
    if(selected.length>12||Array.from(selected).reduce((n,f)=>n+f.size,0)>23_000_000)throw new Error('Selecione até 12 Excel, com total de até 23 MB.');
    const input=[];for(const f of Array.from(selected))input.push({name:f.name,base64:await encode(f)});
    const result=await request<{files:FileView[];rows:SoilRow[];associations:SoilAssociation[];farmOptions:SoilAssociation['candidates']}>('/ler',{files:input});
    setFiles(result.files.map(f=>({...f,base64:input.find(i=>i.name===f.name)!.base64,date:'',dateSource:''})));setRows(result.rows);setAssociations(result.associations??[]);setFarmOptions(result.farmOptions??[]);let saved:Record<string,ExportLocation>={};try{saved=JSON.parse(localStorage.getItem('soil-geographic-associations:'+settings.grupo+':'+settings.empresa+':'+settings.filial)||'{}');}catch{/* Sem associações locais válidas. */}let sampleLocations:ExportSettings['sampleLocations']={};try{sampleLocations=JSON.parse(localStorage.getItem('soil-sample-associations:'+settings.grupo+':'+settings.empresa+':'+settings.filial)||'{}')??{};}catch{/* Sem associações individuais salvas. */}setSettings(s=>({...s,talhaoSource:s.talhaoSource??'identification',locations:applySoilAssociations(result.rows,result.associations??[],saved),sampleLocations}));invalidate();setConfirmed(false);
  });}
  function updateFile(index:number,patch:Partial<FileView>){setFiles(fs=>fs.map((f,i)=>i===index?{...f,...patch}:f));invalidate();}
  function updateLocation(t:string,patch:Partial<ExportLocation>){change({locations:{...settings.locations,[t]:{...(settings.locations[t]??emptyLocation()),...patch}}});}
  function associationSelector(t:string){
    const a=associations.find(a=>a.source===t);if(!a)return null;
    const current=settings.locations[t]??emptyLocation();
    const complete=((settings.talhaoSource??'identification')==='identification'?[current.fazenda,current.zona]:[current.fazenda,current.zona,current.talhao]).every(v=>v!=null&&v>0);
    return <div className="soil-association"><small>{complete?'Códigos preenchidos':current.fazenda?'Fazenda associada; confira os códigos pendentes':'Associação pendente'}</small><small>{(settings.talhaoSource??'identification')==='identification'&&current.fazenda?'Fazenda/zona associadas. O talhão será o número informado em cada linha do arquivo.':a.reason}</small>{a.candidates.length>0&&<select aria-label={'Fazenda associada a '+t} value={current.fazenda??''} onChange={e=>{const candidate=a.candidates.find(c=>c.fazenda===Number(e.target.value));if(candidate)updateLocation(t,{fazenda:candidate.fazenda,zona:candidate.zonas.length===1?candidate.zonas[0]:null,talhao:current.talhao!=null&&candidate.talhoes.includes(current.talhao)?current.talhao:null});}}><option value="">Confirme a fazenda correspondente</option>{a.candidates.map(c=><option key={c.fazenda} value={c.fazenda}>{c.fazenda} — {c.name} — zona {c.zonas.join('/')}</option>)}</select>}{a.candidates.length===0&&<small>Nenhuma fazenda única localizada. Preencha os códigos confirmados.</small>}</div>;
  }
  function saveAssociations(){void run(async()=>{
    const saved=Object.fromEntries(Object.entries(settings.locations).map(([name,l])=>[name,{fazenda:l.fazenda,talhao:l.talhao,zona:l.zona,estagio:null,producao:null}]));
    localStorage.setItem('soil-geographic-associations:'+settings.grupo+':'+settings.empresa+':'+settings.filial,JSON.stringify(saved));
    localStorage.setItem('soil-sample-associations:'+settings.grupo+':'+settings.empresa+':'+settings.filial,JSON.stringify(settings.sampleLocations??{}));
    setMessage('Associações de fazenda, zona e talhão salvas neste navegador para os próximos arquivos.');
  });}
  const payload=()=>({files,settings:normalizeExportSettings(settings),methodsConfirmed:confirmed});
  const ready=preview&&!preview.plan.errors.length&&!preview.plan.conflicts.length&&preview.plan.items.length>0;
  const talhoes=[...new Set(rows.map(r=>r.talhao))].sort();
  async function downloadExcel(){if(!preview)return;await run(async()=>{
    const token=authStorage.getToken();const res=await fetch('/api/analise-solo/exportar',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify({...payload(),fingerprint:preview.fingerprint,warningsAccepted})});
    if(!res.ok){const data=await res.json();throw new Error(data.error||'Não foi possível gerar o Excel.');}
    if(!res.headers.get('Content-Type')?.includes('spreadsheetml'))throw new Error('A API não retornou um arquivo Excel. Atualize e reinicie o servidor.');
    save(await res.blob(),'analise-solo-compusoft.xlsx');setMessage('Excel gerado. Importe o arquivo pela rotina de análise de solo do Compusoft.');
  });}
  return <section className="soil-import">
    <header><h2>Gerar Excel de análise de solo</h2><p>Prepare a planilha de importação do Compusoft conforme o modelo fornecido: 34 colunas, cabeçalhos na linha 2 e dados a partir da linha 3.</p></header>
    <fieldset disabled={busy||!canEdit}>

      <div className="panel"><h3>1. Arquivos e datas</h3><label>Arquivos Excel (.xlsx)<input type="file" accept=".xlsx" multiple onChange={e=>void readFiles(e.target.files)}/></label>
        <p>Os Excel conferidos não trazem data da análise. Os PDFs informam recebimento, conclusão e emissão; a data de coleta não está informada. Escolha a referência usada pelo sistema ou digite a data manualmente.</p>
        {files.map((f,i)=><article className="soil-file" key={f.name}><strong>{f.name}</strong>{f.report?<><p>PDF de referência: {f.report.pdf}</p><p>Recebimento: {showDate(f.report.recebimento)} · Conclusão: {showDate(f.report.conclusao)} · Emissão: {showDate(f.report.emissao)}</p></>:<p>Arquivo sem PDF de referência no catálogo. Informe a data manualmente.</p>}
          <div className="soil-fields"><label>Origem da data<select value={f.dateSource} onChange={e=>{const source=e.target.value;updateFile(i,{dateSource:source,date:source==='manual'?'':source&&f.report?f.report[source as keyof Omit<Report,'pdf'>]:''});}}><option value="">Selecione</option>{f.report&&<><option value="conclusao">Conclusão da amostra (PDF)</option><option value="recebimento">Recebimento (PDF)</option><option value="emissao">Emissão do laudo (PDF)</option></>}<option value="manual">Informar manualmente</option></select></label>
          <label>Data da análise *<input aria-label={'Data da análise de '+f.name} required type="date" value={f.date} onChange={e=>updateFile(i,{date:e.target.value,dateSource:'manual'})}/></label></div>
        </article>)}
      </div>

      <div className="panel" id="soil-codes"><h3>2. Códigos de fazenda, talhão e zona</h3><label>Origem do código TALHAO<select value={settings.talhaoSource??'identification'} onChange={e=>change({talhaoSource:e.target.value as ExportSettings['talhaoSource']})}><option value="identification">Número da coluna Descrição / Id, por linha</option><option value="talhao-column">Código da coluna Talhão (ex.: TH 08)</option><option value="manual">Informar um talhão manualmente por grupo</option></select></label><p>Na opção por linha, não é necessário digitar novamente o número. A fazenda e a zona continuam sendo associadas pelo nome do grupo; números de talhão podem se repetir em fazendas diferentes.</p><p>O código do talhão é aproveitado automaticamente do Excel quando está numérico ou identificado como TH 08, por exemplo. Complete fazenda e zona ou consulte os talhões do sistema. As fazendas e zonas reconhecidas no cadastro já são preenchidas. Nomes que abrangem vários talhões ou fazendas ficam sinalizados para conferência. A consulta usa apenas leitura; a geração do Excel não depende de permissão de gravação.</p>
        <details><summary>Consultar códigos no Oracle (opcional)</summary><div className="soil-fields">{(['grupo','empresa','filial','safra'] as const).map(k=><label key={k}>{k[0].toUpperCase()+k.slice(1)}<input type="number" min="1" value={settings[k]||''} onChange={e=>{change({[k]:Number(e.target.value)});setLocations([]);}}/></label>)}<button className="btn" type="button" onClick={()=>void run(async()=>{const found=await request<SoilLocation[]>('/talhoes?'+new URLSearchParams({grupo:String(settings.grupo),empresa:String(settings.empresa),filial:String(settings.filial),safra:String(settings.safra)}));setLocations(found);invalidate();setMessage(`${found.length} talhões disponíveis para associação.`);})}>Consultar talhões</button></div></details>
        <div className="soil-fields"><label>Estágio de cultura para todos os talhões (opcional)<input type="number" min="1" value={stageDefault} onChange={e=>setStageDefault(e.target.value)}/></label><label>Produção estimada para todos os talhões (opcional)<input type="number" min="0" step="any" value={productionDefault} onChange={e=>setProductionDefault(e.target.value)}/></label><button className="btn" type="button" disabled={!talhoes.length} onClick={()=>{const next={...settings.locations};for(const t of talhoes)next[t]={...(next[t]??emptyLocation()),estagio:stageDefault===''?null:Number(stageDefault),producao:productionDefault===''?null:Number(productionDefault)};change({locations:next});}}>Aplicar estágio e produção</button></div>
        {talhoes.length>0&&<div className="soil-scroll"><table><thead><tr><th>Fazenda/grupo no arquivo</th>{locations.length>0&&<th>Selecionar no sistema</th>}<th>FAZENDA *</th><th>TALHAO *</th><th>ZONA *</th><th>ESTAGIO_CULTURA</th><th>PRODUCAO_ESTIMADA</th></tr></thead><tbody>{talhoes.map(t=><tr key={t}><td><strong>{t}</strong>{associationSelector(t)}</td>{locations.length>0&&<td><select aria-label={'Associar '+t} value="" onChange={e=>{if(e.target.value){const l=locations[Number(e.target.value)-1];updateLocation(t,{fazenda:l.COD_FAZENDA,talhao:l.COD_TALHAO,zona:l.ZONA});}}}><option value="">Selecionar para preencher códigos</option>{locations.map((l,i)=><option key={i} value={i+1}>{l.FAZENDA} — {l.COD_FAZENDA}/{l.ZONA}/{l.COD_TALHAO} — {l.DESCRICAO_TALHAO}</option>)}</select></td>}{(['fazenda','talhao','zona','estagio','producao'] as const).map(k=><td key={k}>{k==='talhao'&&(settings.talhaoSource??'identification')==='identification'?<span>Número por linha: {[...new Set(rows.filter(r=>r.talhao===t).map(r=>r.sample))].slice(0,5).join(', ')}…</span>:k==='talhao'&&(settings.talhaoSource??'identification')==='talhao-column'?<span>{t}</span>:<input aria-label={`${k} de ${t}`} className="soil-code" aria-invalid={Boolean(preview)&&['fazenda','talhao','zona'].includes(k)&&!settings.locations[t]?.[k]} type="number" min={k==='producao'?0:1} step={k==='producao'?'any':1} value={settings.locations[t]?.[k]??''} onChange={e=>updateLocation(t,{[k]:e.target.value===''?null:Number(e.target.value)})}/>}</td>)}</tr>)}</tbody></table></div>}
        <SoilSampleAssociations rows={rows} associations={associations} farms={farmOptions} values={settings.sampleLocations??{}} onChange={sampleLocations=>change({sampleLocations})}/>{talhoes.length>0&&<div className="soil-actions"><button type="button" className="btn" onClick={saveAssociations}>Salvar associações neste navegador</button><span>As associações confirmadas serão reutilizadas nos próximos arquivos.</span></div>}
      </div>
      <div className="panel"><h3>3. Resultados e métodos</h3><div className="soil-fields"><label>Resultado usado em PH<select value={settings.ph} onChange={e=>change({ph:e.target.value as ExportSettings['ph']})}><option value="cacl2">pH em CaCl₂, conforme os laudos</option><option value="agua">pH em água, somente se constar no Excel</option></select></label><label>Fósforo<select value={settings.phosphorus} onChange={e=>change({phosphorus:e.target.value as ExportSettings['phosphorus']})}><option value="meh">Mehlich</option><option value="res">Resina</option></select></label><label>Potássio<select value={settings.potassium} onChange={e=>change({potassium:e.target.value as ExportSettings['potassium']})}><option value="cmol">cmolc/dm³</option><option value="mg">mg/dm³ (NH₄Cl)</option></select></label></div>
        <p>PROFUNDIDADE preserva o intervalo em centímetros, como 0-20. Datas ficam em DD/MM/AAAA. Os resultados seguem o modelo com vírgula decimal. As colunas A, B e D ficam vazias; não são acrescentadas colunas de identificação da amostra.</p>
        <p>O campo T do laudo representa CTC potencial e não será usado como CTC efetiva. Resultados ausentes, como CE, SB e CTC efetiva, permanecem vazios e são apontados na conferência. Não serão calculados ou preenchidos com zero.</p>
        <label className="soil-check"><input type="checkbox" checked={confirmed} onChange={e=>{setConfirmed(e.target.checked);invalidate();}}/>Conferi datas, códigos, método de pH, fósforo e unidade de potássio conforme a rotina de importação do Compusoft.</label>
      </div>
      <div className="soil-actions"><button className="btn primary" type="button" disabled={!files.length||!confirmed} onClick={()=>void run(async()=>{const result=await request<Preview>('/validar',payload());setPreview(result);setSettings(result.settings);setWarningsAccepted(false);})}>Validar e conferir Excel</button></div>
      {preview&&<div className="panel"><h3>4. Conferência e download</h3><p><strong>Origem do TALHAO:</strong> {preview.settings.talhaoSource==='identification'?'número da coluna Descrição / Id em cada linha':preview.settings.talhaoSource==='talhao-column'?'código da coluna Talhão':'preenchimento manual por grupo'}.</p><p>{rows.length} linhas lidas · {preview.plan.duplicates} repetições consolidadas · {preview.plan.items.length} linhas preparadas para importação.</p>
        {[...preview.plan.errors,...preview.plan.conflicts].length>0&&<div role="alert"><h4>Pendências que impedem a geração</h4><p>Os códigos conhecidos foram preenchidos automaticamente. Complete somente os campos indicados abaixo. <a href="#soil-codes">Ir para os códigos pendentes na seção 2</a>.</p><ul>{[...preview.plan.errors,...preview.plan.conflicts].map((e,i)=><li key={i}>{e}</li>)}</ul></div>}
        <h4>Avisos sobre o conteúdo</h4><ul>{preview.plan.warnings.map((w,i)=><li key={i}>{w}</li>)}</ul>
        <p>Prévia das primeiras 30 linhas de dados, na mesma ordem de colunas do modelo:</p><div className="soil-scroll"><table><thead><tr>{COMPUSOFT_HEADERS.map((h,i)=><th key={i}>{i+1} — {h??'Vazia'}</th>)}</tr></thead><tbody>{preview.plan.items.slice(0,30).map((item,i)=><tr key={i}>{compusoftRow(item).map((value,j)=><td key={j}>{value??''}</td>)}</tr>)}</tbody></table></div>
        <label className="soil-check"><input type="checkbox" checked={warningsAccepted} onChange={e=>setWarningsAccepted(e.target.checked)}/>Revisei os avisos e os campos vazios. A planilha será importada pelo usuário na rotina do Compusoft.</label>
        <div className="soil-actions"><button className="btn" type="button" onClick={()=>save(new Blob([JSON.stringify(preview,null,2)],{type:'application/json'}),'conferencia-analise-solo.json')}>Baixar conferência e origem das amostras</button><button className="btn primary" type="button" disabled={!ready||!warningsAccepted} title={!ready?'Complete os códigos pendentes na seção 2.':!warningsAccepted?'Marque a confirmação dos avisos.':'Baixar o Excel de importação'} onClick={()=>void downloadExcel()}>Gerar Excel para o Compusoft</button></div>
      </div>}
    </fieldset>
    {busy&&<p role="status">Processando…</p>}{error&&<p className="soil-error" role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
  </section>;
}
