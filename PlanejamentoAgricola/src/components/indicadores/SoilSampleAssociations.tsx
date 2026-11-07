import {useState} from 'react';
import {sampleLocationKey,type SampleLocation} from '../../lib/analise-solo-compusoft';
import type {SoilRow} from '../../lib/analise-solo';
import type {SoilAssociation} from '../../lib/analise-solo-associacoes';
type Farm=SoilAssociation['candidates'][number];
type Props={rows:SoilRow[];associations:SoilAssociation[];farms:Farm[];values:Record<string,SampleLocation>;onChange:(value:Record<string,SampleLocation>)=>void};
function SampleGroup({name,rows,association,farms,values,onChange}:Props&{name:string;association?:SoilAssociation}){
 const [from,setFrom]=useState(''),[to,setTo]=useState(''),[farm,setFarm]=useState(''),[file,setFile]=useState(''),[all,setAll]=useState(false);
 const samples=[...new Map(rows.map(r=>[sampleLocationKey(r),r])).values()];
 const files=[...new Set(samples.map(r=>r.file))];
 const candidates=association?.candidates??[];
 const options=[...candidates,...farms.filter(f=>!candidates.some(c=>c.fazenda===f.fazenda))];
 const resolved=samples.filter(r=>values[sampleLocationKey(r)]?.fazenda&&values[sampleLocationKey(r)]?.zona).length;
 function valueFor(id:number):SampleLocation{const f=options.find(f=>f.fazenda===id);return {fazenda:id,zona:f?.zonas.length===1?f.zonas[0]:null};}
 function assignRange(){
  if(!from||!to||!farm||Number(from)>Number(to))return;
  const next={...values};for(const r of samples)if((!file||r.file===file)&&r.sample>=Number(from)&&r.sample<=Number(to))next[sampleLocationKey(r)]=valueFor(Number(farm));onChange(next);
 }
 return <details className="soil-file"><summary><strong>{name}</strong> — {resolved} de {samples.length} identificações associadas individualmente</summary>
  <p>{association?.reason??'Defina a fazenda de cada amostra quando o nome do grupo não identificar um único cadastro.'} A associação individual tem prioridade sobre a associação geral do grupo e vale para todas as profundidades do mesmo número no mesmo arquivo.</p>
  <div className="soil-fields"><label>Arquivo<select value={file} onChange={e=>setFile(e.target.value)}><option value="">Todos os arquivos selecionados</option>{files.map(f=><option key={f}>{f}</option>)}</select></label><label>Número inicial<input type="number" min="1" step="1" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>Número final<input type="number" min="1" step="1" value={to} onChange={e=>setTo(e.target.value)}/></label><label>Fazenda do intervalo<select value={farm} onChange={e=>setFarm(e.target.value)}><option value="">Selecione</option>{options.map(f=><option key={f.fazenda} value={f.fazenda}>{f.fazenda} — {f.name}</option>)}</select></label><button type="button" className="btn" disabled={!from||!to||!farm||Number(from)>Number(to)} onClick={assignRange}>Associar intervalo informado</button></div>
  <p>O intervalo é informado por você; o sistema não divide as análises igualmente nem as replica entre fazendas.</p>
  <div className="soil-scroll"><table><thead><tr><th>Arquivo</th><th>Número no arquivo / TALHAO</th><th>Fazenda</th><th>Zona</th></tr></thead><tbody>{(all?samples:samples.slice(0,50)).map(r=>{
   const key=sampleLocationKey(r),value=values[key],selected=options.find(f=>f.fazenda===value?.fazenda);
   return <tr key={key}><td>{r.file}</td><td>{r.sample}</td><td><select aria-label={`Fazenda da amostra ${r.sample} em ${r.file}`} value={value?.fazenda??''} onChange={e=>{const next={...values};if(e.target.value)next[key]=valueFor(Number(e.target.value));else delete next[key];onChange(next);}}><option value="">Usar a associação geral do grupo</option>{options.map(f=><option key={f.fazenda} value={f.fazenda}>{f.fazenda} — {f.name}</option>)}</select></td><td>{selected&&selected.zonas.length>1?<select aria-label={`Zona da amostra ${r.sample}`} value={value?.zona??''} onChange={e=>onChange({...values,[key]:{fazenda:value?.fazenda??null,zona:e.target.value?Number(e.target.value):null}})}><option value="">Selecione</option>{selected.zonas.map(z=><option key={z}>{z}</option>)}</select>:value?.zona??'—'}</td></tr>;
  })}</tbody></table></div>
  {!all&&samples.length>50&&<button type="button" className="btn" onClick={()=>setAll(true)}>Mostrar todas as {samples.length} identificações</button>}
 </details>;
}
export function SoilSampleAssociations(props:Props){
 const groups=[...new Set(props.rows.map(r=>r.talhao))].filter(name=>{const a=props.associations.find(a=>a.source===name);return !a||a.status==='review'||a.candidates.length>1;});
 if(!groups.length)return null;
 return <div><h4>Grupos que precisam de associação por amostra</h4><p>Quando um nome reúne várias fazendas, abra o grupo e selecione a fazenda de cada número ou informe intervalos conhecidos.</p>{groups.map(name=><SampleGroup {...props} key={name} name={name} rows={props.rows.filter(r=>r.talhao===name)} association={props.associations.find(a=>a.source===name)}/>)}</div>;
}
