import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decisaoTalhao, grupoAdubo } from '../src/lib/diagnosticoTchDecisao';
import type { DiagnosticoTalhao } from '../src/lib/analiseGeralFazendas';
const talhao: DiagnosticoTalhao={fazenda:1,talhao:1,data:'2026-11-25',tch:50,area:10,cadastro:null,irrigacao:null,insumos:null,solo:null,limitacoes:[],cicloValido:true,fontes:{aplicacoes:'disponivel',irrigacao:'disponivel'}};
test('herbicidas e corretivos não são contabilizados como adubos',()=>{
 assert.equal(grupoAdubo('HERBICIDAS'),false);assert.equal(grupoAdubo('CORRETIVOS DE SOLO'),false);
 assert.equal(decisaoTalhao({...talhao,aplicacoes:[{GRUPO:'HERBICIDAS'},{GRUPO:'FERTILIZANTES E ADUBOS'}]}).adubos.length,1);
});
test('dados ausentes não geram conclusão de falta de adubação',()=>{
 assert.match(decisaoTalhao(talhao).resumo,/não comprova/);
 assert.match(decisaoTalhao({...talhao,cicloValido:false}).resumo,/Ciclo não confirmado/);
 assert.match(decisaoTalhao({...talhao,fontes:{aplicacoes:'indisponivel'}}).resumo,/indisponível/);
});
test('adubo localizado exige comparação com recomendação, não prescrição',()=>{
 const d=decisaoTalhao({...talhao,aplicacoes:[{GRUPO:'FERTILIZANTES E ADUBOS'}]});
 assert.match(d.resumo,/Não há evidência de ausência/);assert.match(d.acao,/Comparar doses/);
});
