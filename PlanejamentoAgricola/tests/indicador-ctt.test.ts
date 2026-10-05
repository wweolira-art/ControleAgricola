import assert from "node:assert/strict";
import { test } from "node:test";
import {
  INDICADORES_CTT,
  INDICADORES_CTT_TRATOR,
  metaNoPeriodo,
  resumirIndicadorCtt,
  type CttMaquina,
} from "../src/lib/indicador-ctt.js";

function maquina(horasElevador: number, horasMotor = 0): CttMaquina {
  return {
    equipTag: String(horasElevador),
    frenteKey: "1",
    frenteLabel: "Frente 1",
    valores: {
      hrsElevador: horasElevador,
      hrsMotor: horasMotor,
      disponibilidade: null,
      tonDia: 0,
      tonHrMotor: null,
      tonHrElevador: null,
      dieselHr: null,
      dieselTon: null,
      perdasHa: null,
      impurezaMineral: null,
    },
    pesoTon: 0,
    horasMotor: 0,
    horasElevador: 0,
    litros: 0,
    kmRodados: 0,
    litrosOleo: 0,
    oleoInformado: false,
    horasPotenciais: 0,
    horasOficina: 0,
  };
}

test("horas elevador usa a média da frente contra uma única meta", () => {
  const def = INDICADORES_CTT.find((item) => item.id === "hrsElevador");
  assert.ok(def);
  const resumo = resumirIndicadorCtt(def, [0, 0, 3, 4].map((horas) => maquina(horas)));
  assert.equal(resumo.total, 7);
  assert.equal(resumo.media, 1.75);
  assert.equal(resumo.pctMeta, 17.2);
});

test("horas de motor seguem a mesma conta da planilha", () => {
  const def = INDICADORES_CTT.find((item) => item.id === "hrsMotor");
  assert.ok(def);
  const resumo = resumirIndicadorCtt(
    def,
    [
      [0, 0],
      [0, 0],
      [0, 6],
      [0, 8],
    ].map(([elevador, motor]) => maquina(elevador, motor)),
  );
  assert.equal(resumo.total, 14);
  assert.equal(resumo.media, 3.5);
  assert.equal(resumo.pctMeta, 20.6);
});

test("consumo de diesel da colhedora usa litros e horas do abastecimento", () => {
  const def = INDICADORES_CTT.find((item) => item.id === "dieselHr");
  assert.ok(def);
  const colhedora: CttMaquina = {
    ...maquina(0, 90),
    equipTag: "5001",
    litros: 2788,
    horasMotor: 90,
    litrosAbastecimento: 2788,
    horasAbastecimento: 78,
    valores: {
      ...maquina(0, 90).valores,
      dieselHr: 2788 / 78,
      hrsMotor: 90,
    },
  };
  const resumo = resumirIndicadorCtt(def, [colhedora], 7);
  assert.equal(resumo.total, 35.74);
  assert.equal(resumo.media, 35.74);
});

test("consumo de diesel do trator usa litros e horas do abastecimento", () => {
  const def = INDICADORES_CTT_TRATOR.find((item) => item.id === "dieselHr");
  assert.ok(def);
  const trator: CttMaquina = {
    ...maquina(0, 66),
    equipTag: "4001",
    litros: 332,
    horasMotor: 66,
    litrosAbastecimento: 332,
    horasAbastecimento: 49,
    valores: {
      ...maquina(0, 66).valores,
      dieselHr: 332 / 49,
      hrsMotor: 66,
    },
  };
  const resumo = resumirIndicadorCtt(def, [trator], 7);
  assert.equal(resumo.total, 6.78);
  assert.equal(resumo.media, 6.78);
});

test("metas diárias de volume acompanham os dias do filtro", () => {
  const elevador = INDICADORES_CTT.find((item) => item.id === "hrsElevador");
  const toneladas = INDICADORES_CTT.find((item) => item.id === "tonDia");
  const disponibilidade = INDICADORES_CTT.find((item) => item.id === "disponibilidade");
  assert.ok(elevador && toneladas && disponibilidade);
  assert.equal(metaNoPeriodo(elevador, 5), 51);
  assert.equal(metaNoPeriodo(toneladas, 5), 2820);
  assert.equal(metaNoPeriodo(disponibilidade, 5), 85);
  const resumo = resumirIndicadorCtt(elevador, [0, 0, 3, 4].map((horas) => maquina(horas)), 5);
  assert.equal(resumo.media, 1.75);
  assert.equal(resumo.pctMeta, 3.4);
});
