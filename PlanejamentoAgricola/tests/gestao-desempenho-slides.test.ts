import assert from "node:assert/strict";
import test from "node:test";
import type { GestaoManutencaoData, IndicadoresColheitaProducaoData } from "../src/api.ts";
import type { ConsumoOleoHidraulicoData } from "../src/lib/consumo-oleo-hidraulico.ts";
import { chartBox, defaultDeckLayout } from "../src/lib/gestao-desempenho-layout.ts";
import {
  buildGestaoDesempenhoSlides,
  nomeArquivoGestao,
  safraPeriodo,
  type GestaoDeckInput,
} from "../src/lib/gestao-desempenho-slides.ts";
import type { PneusData } from "../src/lib/pneus.ts";

const linha = {
  equipTag: "5001",
  codEquipamento: 5001,
  toneladaColhida: 3500,
  litrosCombustivel: 2800,
  hrsMotor: 120,
  hrsElevador: 90,
  kmRodados: 40,
  ltTon: 0.8,
  ltHr: 23.3,
  tonHrMotor: 29,
  tonHrElevador: 38,
  tonDia: 500,
  kmLt: 0.01,
  tonViagem: null,
  mediaDiaria: 500,
  parado: false,
  viagens: 12,
  horasPotenciais: 168,
  horasOficina: 20,
  disponibilidadePct: 88,
  frenteKey: "4001",
  frenteLabel: "Frente 4001",
};

function producao(): IndicadoresColheitaProducaoData {
  return {
    filtros: { dataInicio: "2026-10-02", dataFim: "2026-10-08", refDate: "2026-10-08", dias: 7, diasColheitaColhedora: 6 },
    resumo: { categorias: [], kpiCards: [] },
    frentes: [],
    disponibilidadeDiaria: [],
    desempenhoDiario: [
      { data: "2026-10-02", toneladas: 1800, viagens: 10, horasTratorA: 8, horasTratorB: 0, horasTratorC: 0 },
      { data: "2026-10-03", toneladas: 2100, viagens: 12, horasTratorA: 9, horasTratorB: 0, horasTratorC: 0 },
    ],
    producaoDiariaPorEquipamento: [{ data: "2026-10-02", equipTag: "5001", codEquipamento: 5001, toneladaColhida: 1800 }],
    horasOperacaoDiaria: [
      {
        data: "2026-10-02",
        horasPotenciais: 24,
        horasDisponiveis: 20,
        horasEfetivas: 14,
        horasOutrasAtividades: 1,
        horasManutencao: 3,
        horasParada: 2,
        horasParadaProgramada: 1,
        horasSemRegistro: 1,
        eficiencia: 70,
      },
    ],
    horasOperacaoPorEquipamento: [
      {
        equipTag: "5001",
        codEquipamento: 5001,
        horasPotenciais: 168,
        horasDisponiveis: 140,
        horasEfetivas: 96,
        horasOutrasAtividades: 4,
        horasManutencao: 20,
        horasParada: 10,
        horasParadaProgramada: 6,
        horasSemRegistro: 8,
        eficiencia: 68,
      },
    ],
    horasOperacaoDiariaTrator: [],
    horasOperacaoPorEquipamentoTrator: [],
    tabelas: {
      colhedora: { linhas: [linha], totais: { ...linha, equipTag: "Total" } },
      trator: { linhas: [{ ...linha, equipTag: "6101", frenteKey: "4002", frenteLabel: "Frente 4002", hrsElevador: 0 }], totais: null },
      caminhao: { linhas: [{ ...linha, equipTag: "7201", frenteKey: "4003", frenteLabel: "Frente 4003", kmRodados: 800 }], totais: null },
    },
  } as IndicadoresColheitaProducaoData;
}

function gestao(): GestaoManutencaoData {
  return {
    meta: { mttrHoras: 8, mtbfHoras: 40, disponibilidade: 85, codTipoEquipamento: null, metasPorTipo: {} },
    kpis: {
      qtdFalhas: 2,
      tempoReparoHoras: 10,
      tempoOperacaoHoras: 100,
      mttrHoras: 5,
      mtbfHoras: 50,
      disponibilidade: 80.5,
      indisponibilidade: 19.5,
    },
    meses: [
      { key: "2026-09", label: "set", qtdFalhas: 1, tempoReparoHoras: 4, tempoOperacaoHoras: 40, mttrHoras: 4, mtbfHoras: 40, disponibilidade: 90, indisponibilidade: 10 },
      { key: "2026-10", label: "out", qtdFalhas: 1, tempoReparoHoras: 6, tempoOperacaoHoras: 60, mttrHoras: 6, mtbfHoras: 60, disponibilidade: 70, indisponibilidade: 30 },
    ],
    confiabilidadeEquipamentos: [
      { codEquipamento: 5001, descricao: "COLHEDORA CASE", qtdFalhas: 2, tempoOperacaoHoras: 100, mttrHoras: 5, mtbfHoras: 50, disponibilidade: 80 },
    ],
    confiabilidadeTotal: {
      qtdFalhas: 2,
      tempoReparoHoras: 10,
      tempoOperacaoHoras: 100,
      mttrHoras: 5,
      mtbfHoras: 50,
      disponibilidade: 80,
      indisponibilidade: 20,
    },
    custo: {
      total: 18000,
      tipoMaterial: null,
      tiposMaterial: [],
      codObjetoCusto: null,
      objetosCusto: [],
      porTipo: { corretiva: 12000, preventiva: 4000, preditiva: 1000, melhoria: 1000 },
      percentual: [],
      porMes: [],
      porFrota: [],
      porComponente: [{ componente: "MOTOR", label: "MOTOR", valor: 9000 }],
      porObjetoCusto: [],
      analitico: [],
    },
  } as GestaoManutencaoData;
}

test("monta o deck no roteiro da gestão de desempenho", () => {
  assert.equal(safraPeriodo("2026-10-08").code, "26/27");
  assert.equal(safraPeriodo("2026-10-08").inicio, "2026-09-01");
  assert.equal(nomeArquivoGestao("2026-10-02", "2026-10-08"), "Gestão de desempenho - 02.10 a 08.10.2026.pptx");

  const manut = gestao();
  const oleo = {
    filtros: { dataInicio: "2026-09-01", dataFim: "2026-10-08", safraCode: "26/27", dias: 38, metaLtTon: 0.018 },
    resumo: { litrosRemonta: 120, litrosTroca: 40, litrosTotal: 160, qtdRemontas: 4, ltTon: 0.012, toneladas: 13000 },
    motivos: [{ codigo: "EST", label: "Estouro", litros: 90, qtdRemontas: 2 }],
    equipamentos: [{ codEquipamento: 5001, descricao: "5001 COLHEDORA", troca: 40, remonta: 80, total: 120, qtdRemontas: 2, qtdTrocas: 1, codMaterial: 2394, material: "OLEO W100" }],
    mensal: [{ chave: "2026-09", label: "SET", litros: 160, toneladas: 10000, ltTon: 0.016 }],
    comparativo: { equipamentos: [5001], safras: [{ codigo: "26/27", label: "Safra 26/27", dataInicio: "2026-09-01", dataFim: "2026-10-08", dias: 38, litros: 160, toneladas: 13000, ltTon: 0.012, porEquipamento: [{ codEquipamento: 5001, litros: 160 }] }] },
  } satisfies ConsumoOleoHidraulicoData;
  const pneus = {
    pneus: [{ id: 1, numero: "1", medida: "18", tipo: "Novo", categoria: "A", marca: "X", descarte: "2026-10-03", motivo: "Corte", causa: "Estrada", equipamento: "5001", tipoEquipamento: "Colhedora", colocado: null, montado: false, emReforma: false, vida: 2, sulco: 10, rodado: 1000, aquisicao: 1500, custo: 1800, posicao: "", eixo: "", posicaoDescricao: "", medicao: null }],
    consertos: [],
    atualizadoEm: "2026-10-08",
  } satisfies PneusData;

  const input: GestaoDeckInput = {
    inicio: "2026-10-02",
    fim: "2026-10-08",
    safraInicio: "2026-09-01",
    safraCode: "26/27",
    semana: producao(),
    safra: producao(),
    horasSemana: producao(),
    horasSafra: producao(),
    qualidade: {
      resumo: { pctPerda: 4.2, tonHaPerda: 3.1, amostras: 10, impurezaMineral: 8 },
      linhaTempo: [{ label: "SET", pctPerda: 4, tonHaPerda: 3, amostras: 4, mesRef: "2026-09" }],
      porEquipamento: [{ label: "5001", pctPerda: 4.2, tonHaPerda: 3, amostras: 4 }],
      porTipoPerda: [{ label: "Estilhaço", pctPerda: 2, tonHaPerda: 1, amostras: 4, quantidade: 2 }],
      porOperador: [],
      porFazenda: [{ label: "BOM SUCESSO", pctPerda: 3.5, tonHaPerda: 2.2, amostras: 3 }],
      impurezaPorEquipamento: [{ codEquipamento: 5001, label: "5001", impurezaMineral: 8, amostras: 4 }],
    },
    colhedoraSemana: manut,
    colhedoraSafra: manut,
    tratorSemana: manut,
    tratorSafra: manut,
    caminhaoSemana: manut,
    caminhaoSafra: manut,
    custoColhedoraSemana: manut,
    custoColhedoraSafra: manut,
    custoTratorSemana: manut,
    custoTratorSafra: manut,
    oleo,
    lub: null,
    pneus,
    capaUrl: "",
    logoUrl: "",
  };

  const slides = buildGestaoDesempenhoSlides(input);
  assert.equal(slides.length, 28);
  assert.deepEqual(
    slides.map((item) => item.title),
    [
      "Capa",
      "Safra 26/27",
      "Colhedeiras",
      "Tratores",
      "Caminhões",
      "Horas trabalhadas x Horas disponíveis Colhedora",
      "Horas trabalhadas x Horas disponíveis Trator",
      "DISPONIBILIDADE COLHEDEIRA DE CANA",
      "DISPONIBILIDADE TRATORES",
      "DISPONIBILIDADE CAMINHÕES",
      "Colheita Mecanizada",
      "Colhedeira de cana",
      "Tratores",
      "Caminhões canavieiros",
      "Confiabilidade e Disponibilidade - Colhedeira",
      "Confiabilidade e Disponibilidade - Tratores",
      "MTTR-MTBF - COLHEDEIRA DE CANA",
      "MTTR-MTBF - TRATORES",
      "Relatório de custo Colhedoras",
      "Relatório de custo Tratores",
      "Consumo de Óleo Hidráulico relatório Colhedeira",
      "Consumo de Óleo Hidráulico relatório Colhedeira",
      "Consumo de Óleo Hidráulico Comparativo - Colhedeira",
      "Consumo de Óleo Hidráulico Safra - Colhedeira",
      "Consumo de Óleo Hidráulico Mensal Colhedeira",
      "Acompanhamento de lubrificações das Colhedeiras",
      "Descarte de Pneus Geral",
      "Comparativo de descartes Safra",
    ],
  );
  for (const item of slides) {
    assert.equal(item.svg.includes("NaN"), false, item.title);
    assert.equal(item.svg.includes("undefined"), false, item.title);
    assert.match(item.svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
  }
  const colhedoras = slides.find((item) => item.title === "Colhedeiras");
  assert.match(colhedoras?.svg ?? "", /4001/);
  assert.match(colhedoras?.svg ?? "", /SEMANA 02\/10 A 08\/10\/2026/);
  assert.match(colhedoras?.svg ?? "", /ACUMULADO SAFRA 26\/27/);
  assert.match(slides[0]?.svg ?? "", /Gestão de Desempenho/);
  assert.match(slides[0]?.svg ?? "", /Manutenção Automotiva/);

  const layout = defaultDeckLayout();
  layout.slides[0]!.enabled = false;
  const semCapa = buildGestaoDesempenhoSlides(input, layout);
  assert.equal(semCapa.length, 27);
  assert.notEqual(semCapa[0]?.title, "Capa");
  assert.ok(chartBox(defaultDeckLayout(), "colhedoras", "grafico-semana").x > 900);
});
