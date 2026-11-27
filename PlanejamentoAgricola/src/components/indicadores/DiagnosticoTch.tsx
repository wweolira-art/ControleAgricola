import type { DiagnosticoTalhao } from '../../lib/analiseGeralFazendas';
const fmt=(n:number)=>n.toLocaleString('pt-BR',{maximumFractionDigits:1});
export function DiagnosticoTch({talhoes,referencia}:{talhoes:DiagnosticoTalhao[];referencia:number|null}) {
  if (!talhoes.length) return <span>Sem diagnóstico biométrico disponível.</span>;
  const abaixo=referencia==null?[]:talhoes.filter(t=>t.tch<referencia).sort((a,b)=>(referencia-b.tch)*(b.area??0)-(referencia-a.tch)*(a.area??0));
  const lacunas=abaixo.length ? [abaixo.filter(t=>!t.solo).length ? 'há talhões sem análise de solo vinculada' : '', abaixo.filter(t=>!t.irrigacao).length ? 'há talhões sem apontamento de irrigação vinculado no ciclo' : '', abaixo.filter(t=>!t.insumos).length ? 'há talhões sem apontamento de insumos vinculado no ciclo' : ''].filter(Boolean).join('; ') : '';
  return <details><summary>{referencia==null ? 'Informe uma referência de TCH para identificar os desvios.' : abaixo.length ? `${abaixo.length} talhão(ões) abaixo da referência informada. Prioridade: ${abaixo.slice(0,3).map(t=>t.talhao).join(', ')}. Evidências insuficientes para confirmar o motivo.${lacunas ? ` Verificar cobertura: ${lacunas}.` : ' Há registros de solo, irrigação e insumos para investigação.'}` : 'Nenhum talhão avaliado abaixo da referência informada.'}</summary>
    <p>Última biometria de cada talhão no período. A coluna de TCH da fazenda mantém a média das avaliações. Referência informada pelo usuário, não ajustada por idade ou variedade.</p>
    {(abaixo.length ? [...abaixo,...talhoes.filter(t=>!abaixo.includes(t))] : talhoes).map(t=><details key={t.talhao}>
      <summary>Talhão {t.talhao} · TCH {fmt(t.tch)} · {t.data} {referencia!=null ? `· Desvio ${fmt(t.tch-referencia)} t/ha` : ''}{referencia!=null&&t.tch<referencia&&t.area!=null&&t.area>0 ? ` · Déficit estimado ${fmt((referencia-t.tch)*t.area)} t` : ''}</summary>
      {t.limitacoes.map(x=><p key={x}>{x}</p>)}
      <p><strong>Visão geral:</strong> Os registros contextualizam o manejo, mas não comprovam a causa do resultado. Sem recomendação validada e balanço hídrico, não é possível afirmar insuficiência de insumos ou água.</p>
      <p><strong>Plantio e histórico:</strong> plantio {String(t.cadastro?.PLANTIO??'não identificado')}; início do ciclo {String(t.cadastro?.INICIO??'não identificado')}; corte {String(t.cadastro?.CORTE??'—')}; código da variedade {String(t.cadastro?.VARIEDADE??'—')}.</p>
      <p><strong>Irrigação:</strong> {t.irrigacao ? `${t.irrigacao.DIAS} dia(s) com apontamento de área positiva no ciclo; último em ${t.irrigacao.ULTIMA}.` : 'Sem registro vinculado disponível no ciclo.'} Ausência de registro não comprova ausência de irrigação. Chuva e planejamento não avaliados.</p>
      <p><strong>Insumos:</strong> {t.insumos ? `${t.insumos.REGISTROS} registro(s) de materiais, ${t.insumos.PRODUTOS} produto(s); último em ${t.insumos.ULTIMA}.` : 'Sem registro vinculado disponível no ciclo.'} Doses e adequação à recomendação ainda não avaliadas.</p>
      <p><strong>Solo:</strong> {t.solo ? `${t.solo.ANALISES} análise(s) anterior(es) à biometria; última em ${t.solo.ULTIMA}. Resultados químicos ainda não classificados.` : 'Sem análise vinculada disponível anterior à biometria.'}</p>
    </details>)}
  </details>;
}
