import assert from "node:assert/strict";
import {test} from "node:test";
import {isPneusView,pneuDescarteLookbackFrom,pneuSafraCode,pneuSafraWeek,pneusAverage,pneusAverageCost,pneusComparativoSemanal,pneusCost,pneusCostPerDistance,pneusCustoReposicao,pneusDeliveryDays,pneusDurabilidade,pneusDurabilidadeMedia,pneusEconomiaReforma,pneusInPeriod,type PneuItem} from "../src/lib/pneus.js";
const tire=(custo:number|null,rodado:number|null)=>({custo,rodado}) as PneuItem;
test("estimated cost sums known tire prices and does not turn all missing prices into zero",()=>{
 assert.equal(pneusCost([tire(100,10),tire(null,20)]),100);
 assert.equal(pneusCost([]),null);
 assert.equal(pneusCost([tire(null,10)]),null);
 assert.equal(pneusCost([tire(0,10)]),0);
});
test("average cost per measure uses the available annual tire estimates",()=>{
 assert.equal(pneusAverageCost([tire(2400,10),tire(2600,20),tire(null,30)]),2500);
 assert.equal(pneusAverageCost([tire(null,10)]),null);
});
test("cost per distance uses weighted totals and rejects missing denominators",()=>{
 assert.equal(pneusCostPerDistance([tire(100,10),tire(200,90)]),3);
 assert.equal(pneusCostPerDistance([tire(100,0)]),null);
 assert.equal(pneusCostPerDistance([tire(100,null)]),null);
 assert.equal(pneusCostPerDistance([tire(null,100)]),null);
 assert.equal(pneusCostPerDistance([tire(100,10),tire(null,90)]),10);
});
test("tread averages keep zero measurements and omit missing measurements",()=>{
 assert.equal(pneusAverage([0,4,null]),2);
 assert.equal(pneusAverage([null]),null);
});
test("pneus views are the five report tabs",()=>{
 assert.equal(isPneusView("descarte"),true);
 assert.equal(isPneusView("estoque"),true);
 assert.equal(isPneusView("todas"),false);
});
test("date filters include boundaries and exclude undated records",()=>{
 assert.equal(pneusInPeriod("2026-09-01","2026-09-01","2026-09-30"),true);
 assert.equal(pneusInPeriod("2026-09-30","2026-09-01","2026-09-30"),true);
 assert.equal(pneusInPeriod(null,"2026-09-01","2026-09-30"),false);
 assert.equal(pneusInPeriod("2026-08-31","2026-09-01","2026-09-30"),false);
});
test("delivery days counts calendar days between send and return",()=>{
 assert.equal(pneusDeliveryDays("2026-08-25","2026-08-31"),6);
 assert.equal(pneusDeliveryDays("2026-08-25",null),null);
 assert.equal(pneusDeliveryDays(null,"2026-08-31"),null);
});
test("durabilidade is km rodado divided by vidas",()=>{
 assert.equal(pneusDurabilidade({rodado:120000,vida:3}),40000);
 assert.equal(pneusDurabilidade({rodado:null,vida:2}),null);
 assert.equal(pneusDurabilidade({rodado:10000,vida:0}),null);
});
test("durabilidade media uses weighted totals by brand set",()=>{
 assert.equal(pneusDurabilidadeMedia([{rodado:100000,vida:2},{rodado:80000,vida:2}]),45000);
 assert.equal(pneusDurabilidadeMedia([{rodado:null,vida:2}]),null);
 assert.equal(pneusDurabilidadeMedia([{rodado:50000,vida:0}]),null);
});
test("economia reforma compares replacement cost minus repair",()=>{
 assert.equal(pneusCustoReposicao({custo:5000,aquisicao:4000}),5000);
 assert.equal(pneusCustoReposicao({custo:null,aquisicao:4000}),4000);
 assert.deepEqual(pneusEconomiaReforma([
  {custoReposicao:5000,valorReforma:1200},
  {custoReposicao:5000,valorReforma:800},
 ]),{compra:10000,reforma:2000,economia:8000});
 assert.equal(pneusEconomiaReforma([{custoReposicao:null,valorReforma:100}]).economia,null);
});
test("safra code and lookback start on september",()=>{
 assert.equal(pneuSafraCode("2026-09-01"),"26/27");
 assert.equal(pneuSafraCode("2026-08-31"),"25/26");
 assert.equal(pneuDescarteLookbackFrom("2026-09-24"),"2023-09-01");
});
test("safra week starts in september and groups discards across harvest years",()=>{
 assert.equal(pneuSafraWeek("2026-09-01"),1);
 assert.equal(pneuSafraWeek("2026-09-07"),1);
 assert.equal(pneuSafraWeek("2026-09-08"),2);
 assert.equal(pneuSafraWeek("2026-08-31"),53);
 assert.equal(pneuSafraWeek("2026-01-05"),19);
 const chart = pneusComparativoSemanal([
  {descarte:"2024-10-07"},
  {descarte:"2024-10-08"},
  {descarte:"2025-10-06"},
  {descarte:"2026-09-10"},
 ],"2026-09-24");
 assert.equal(chart.safras.some((s)=>s.acumulado && s.label==="Acumulado até o momento"),true);
 assert.equal(chart.safras.find((s)=>s.codigo==="24/25")?.total,2);
 assert.deepEqual(chart.semanas,[2,6]);
 assert.equal(chart.safras.find((s)=>s.codigo==="24/25")?.valores[1],2);
 assert.equal(chart.safras.find((s)=>s.codigo==="25/26")?.valores[1],1);
});
