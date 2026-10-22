import assert from "node:assert/strict";
import test from "node:test";
import { montarPayloadHoras } from "../server/colheita/horas-envio-payload.ts";

const input = { data: "2026-10-22", turno: "b", codEquipamento: 5001, horaMotor: 1052, horasElevador: 530 };
test("envia horímetros acumulados e diferenças nos campos de rodadas", () => {
  assert.deepEqual(montarPayloadHoras(input, { horaMotor: 1000, horasElevador: 500 }), {
    data: "2026-10-22T00:00:00Z", turno: "B", cod_equipamento: 5001,
    hora_motor: 1052, horas_elevador: 530, horas_motor_rodadas: 52, horas_elevador_rodadas: 30,
  });
});
test("sem histórico ou sem leitura de elevador não inventa horas", () => {
  const primeira = montarPayloadHoras(input, null);
  assert.equal(primeira.horas_motor_rodadas, null);
  assert.equal(primeira.horas_elevador_rodadas, null);
  const semElevador = montarPayloadHoras({ ...input, horasElevador: null }, { horaMotor: 1000, horasElevador: 500 });
  assert.equal(semElevador.horas_elevador, null);
  assert.equal(semElevador.horas_elevador_rodadas, null);
  assert.equal(semElevador.horas_motor_rodadas, 52);
});
test("leitura igual grava zero e leitura reduzida fica sem diferença válida", () => {
  assert.equal(montarPayloadHoras(input, input).horas_motor_rodadas, 0);
  assert.equal(montarPayloadHoras(input, { horaMotor: 1100, horasElevador: 540 }).horas_motor_rodadas, null);
});
