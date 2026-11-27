import type { DiagnosticoTalhao } from '../../lib/analiseGeralFazendas';
import { decisaoTalhao } from '../../lib/diagnosticoTchDecisao';
const fmt=(n:unknown)=>n==null?'—':typeof n==='number'?n.toLocaleString('pt-BR',{maximumFractionDigits:2}):String(n);
const date=(n:unknown)=>typeof n==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(n)?n.split('-').reverse().join('/'):fmt(n);
function Registros({rows,columns}:{rows:Record<string,unknown>[];columns:[string,string][]}) {
  return <div className="agf-tabela"><table><thead><tr>{columns.map(([key,label])=><th key={key}>{label}</th>)}</tr></thead><tbody>{rows.map((r,i)=><tr key={i}>{columns.map(([key])=><td key={key}>{key==='DATA'?date(r[key]):fmt(r[key])}</td>)}</tr>)}</tbody></table></div>;
}
export function DiagnosticoTch({talhoes,referencia}:{talhoes:DiagnosticoTalhao[];referencia:number|null}) {
  if (!talhoes.length) return <span>Sem diagnóstico biométrico disponível.</span>;
  const abaixo=referencia==null?[]:talhoes.filter(t=>t.tch<referencia).sort((a,b)=>(referencia-b.tch)*(b.area??0)-(referencia-a.tch)*(a.area??0));
  const prioritarios=abaixo.length?abaixo:talhoes.slice().sort((a,b)=>a.tch-b.tch);
  return <div className="agf-diagnostico">
    <p><strong>{referencia==null?'Sem meta definida: não é possível classificar como abaixo do esperado.':abaixo.length?`${abaixo.length} talhão(ões) abaixo da referência informada.`:'Nenhum talhão avaliado abaixo da referência informada.'}</strong></p>
    <p>Talhão {prioritarios[0].talhao}: {decisaoTalhao(prioritarios[0]).resumo}</p>
    <details><summary>Ver evidências e próximos passos · {talhoes.length} talhão(ões)</summary>
      <p>Última biometria válida por talhão na safra. Meta informada pelo usuário, sem ajuste automático por idade ou variedade. Déficit estimado não é perda realizada. Talhões sem área não têm impacto calculado.</p>
      {[...prioritarios,...talhoes.filter(t=>!prioritarios.includes(t))].map(t=>{
        const d=decisaoTalhao(t);
        const dias=t.cicloValido&&t.cadastro?.INICIO?Math.floor((Date.parse(t.data)-Date.parse(String(t.cadastro.INICIO)))/86400000):null;
        return <details key={t.talhao} className="agf-talhao">
          <summary>Talhão {t.talhao} · TCH {fmt(t.tch)} · {date(t.data)}{referencia!=null?` · Desvio ${fmt(t.tch-referencia)} t/ha`:''}{referencia!=null&&t.tch<referencia&&t.area!=null&&t.area>0?` · Déficit estimado ${fmt((referencia-t.tch)*t.area)} t`:''}</summary>
          <p><strong>O que sabemos:</strong> {d.resumo}</p>
          <p className="agf-proxima-acao"><strong>Próxima ação:</strong> {d.acao}</p>
          {t.limitacoes.map(x=><p className="agf-aviso" key={x}>{x}</p>)}
          <details><summary>Plantio e histórico</summary><p>Plantio: {date(t.cadastro?.PLANTIO)}. Início do ciclo: {date(t.cadastro?.INICIO)}. Idade na biometria: {dias==null?'não confirmada':`${dias} dias`}. Corte: {fmt(t.cadastro?.CORTE)}. Código da variedade: {fmt(t.cadastro?.VARIEDADE)}.</p><p>Conferir datas cadastrais com a execução do último corte.</p></details>
          <details><summary>Insumos · {d.adubos.length} registro(s) no grupo de fertilizantes e adubos</summary>
            <p>Aplicações do ciclo até a biometria, inclusive de outras safras. Grupo é a classificação cadastral, não validação da composição. Dose é quantidade de produto por área apontada, não quantidade de nutrientes. Áreas de aplicações repetidas não representam área única do talhão.</p>
            {!t.cicloValido?<p>Ciclo não confirmado.</p>:t.fontes?.aplicacoes!=='disponivel'?<p>Fonte indisponível.</p>:!t.aplicacoes?.length?<p>Nenhum apontamento vinculado encontrado; conferir completude.</p>:<Registros rows={t.aplicacoes} columns={[[ 'DATA','Data'],['DESCRICAO','Produto'],['GRUPO','Grupo cadastral'],['QUANTIDADE','Quantidade'],['UNIDADE','Unidade'],['AREA','Área apontada (ha)'],['DOSE','Dose (unidade/ha)'],['SAFRA','Safra Oracle']]}/>}
          </details>
          <details><summary>Irrigação</summary><p>{!t.cicloValido?'Ciclo não confirmado.':t.fontes?.irrigacao!=='disponivel'?'Fonte indisponível.':t.irrigacao?`${fmt(t.irrigacao.DIAS)} dia(s) com área positiva apontada; último em ${date(t.irrigacao.ULTIMA)}. ${Math.floor((Date.parse(t.data)-Date.parse(String(t.irrigacao.ULTIMA)))/86400000)} dia(s) até a biometria.`:'Sem registro vinculado no ciclo.'}</p><p>Conferir chuva, condição de sequeiro, planejamento e execução. O intervalo não é classificado como déficit hídrico.</p></details>
          <details><summary>Solo e recomendação</summary><p>Última análise: {date(t.solo?.ULTIMA)}. Resultados anteriores à biometria, sem classificação agronômica automática. Conferir métodos, unidades e códigos de profundidade no laudo.</p>
            {t.fontes?.soloDetalhes!=='disponivel'?<p>Consulta dos resultados indisponível.</p>:t.soloDetalhes?.length?<Registros rows={t.soloDetalhes} columns={[['DATA','Data'],['NR_ANALISE','Análise'],['NR_AMOSTRA','Amostra'],['PROFUNDIDADE','Profundidade (código)'],['PH','pH'],['FOSFORO','P'],['POTASSIO','K'],['CALCIO','Ca'],['MAGNESIO','Mg'],['ALUMINIO','Al'],['V','V'],['MATERIA_ORGANICA','MO']]}/>:<p>Sem resultados vinculados com chave unívoca.</p>}
            <p>{t.fontes?.recomendacoes!=='disponivel'?'Consulta de recomendações indisponível.':t.recomendacoes?.length?'Recomendações históricas abaixo: confirmar vigência, unidade e ciclo antes de comparar doses.':'Nenhuma recomendação vinculada anterior à biometria localizada. Não é possível classificar a adubação como insuficiente.'}</p>
            {!!t.recomendacoes?.length&&<Registros rows={t.recomendacoes} columns={[['DATA','Data da análise'],['COD_PROFUNDIDADE','Profundidade'],['NITROGENIO','N'],['FOSFORO','P'],['POTASSIO','K'],['CALCARIO','Calcário'],['GESSO','Gesso']]}/>}
          </details>
        </details>;
      })}
    </details>
  </div>;
}
