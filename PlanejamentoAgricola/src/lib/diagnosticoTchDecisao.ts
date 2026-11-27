import type { DiagnosticoTalhao } from './analiseGeralFazendas';
export function grupoAdubo(grupo: unknown) {
  return String(grupo??'').trim().toLocaleUpperCase('pt-BR') === 'FERTILIZANTES E ADUBOS';
}
export function decisaoTalhao(t: DiagnosticoTalhao) {
  const adubos=(t.aplicacoes??[]).filter(a=>grupoAdubo(a.GRUPO));
  if (!t.cicloValido) return { resumo:'Ciclo não confirmado: o histórico de manejo não permite concluir o motivo.', acao:'Conferir a data do último corte e o cadastro do talhão antes de avaliar adubação ou irrigação.', adubos };
  if (t.fontes?.aplicacoes!=='disponivel') return {resumo:'Consulta de materiais indisponível; adubação não avaliada.',acao:'Restabelecer a consulta de materiais e repetir a análise.',adubos};
  const comprovado=adubos.length ? `${adubos.length} registro(s) de produtos classificados no cadastro como fertilizantes e adubos. Não há evidência de ausência de adubação.` : 'Nenhum produto do grupo cadastral de fertilizantes e adubos foi localizado no ciclo; isso não comprova falta de aplicação.';
  const agua=t.fontes?.irrigacao!=='disponivel' ? 'Fonte de irrigação indisponível.' : t.irrigacao ? `Irrigação registrada em ${t.irrigacao.DIAS} dia(s).` : 'Sem irrigação vinculada no ciclo; conferir apontamentos e condição de sequeiro.';
  return {resumo:`${comprovado} ${agua} Causa do TCH ainda não confirmada.`,acao:adubos.length ? 'Comparar doses e áreas tratadas com a recomendação do ciclo; confrontar irrigação com chuva e planejamento. Conferir os componentes da biometria em campo.' : 'Conferir os apontamentos e a classificação dos produtos; só depois comparar o manejo realizado com a recomendação.',adubos};
}
