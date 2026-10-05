import assert from "node:assert/strict";
import { test } from "node:test";
import {
  destinosParadaColheita,
  horasManutencaoNasJanelasProgramadas,
  horasOutrasAtividades,
  horasParadaProgramadaNoDia,
  repartirHorasOperacao,
  somarHorasOperacao,
} from "../src/lib/horas-operacao.js";

test("o empilhamento do dia cabe nas horas disponíveis da frota", () => {
  const partes = repartirHorasOperacao({
    disponiveis: 96,
    efetivas: 20,
    outras: 10,
    parada: 5,
    manutencao: 200,
    paradaProgramada: 8,
  });
  assert.equal(partes.horasDisponiveis, 96);
  assert.equal(partes.horasEfetivas, 20);
  assert.equal(partes.horasOutrasAtividades, 10);
  assert.equal(partes.horasParada, 5);
  assert.equal(partes.horasParadaProgramada, 8);
  assert.equal(partes.horasManutencao, 53);
  assert.equal(partes.horasSemRegistro, 0);
  assert.equal(
    partes.horasEfetivas +
      partes.horasOutrasAtividades +
      partes.horasParada +
      partes.horasManutencao +
      partes.horasParadaProgramada +
      partes.horasSemRegistro,
    96,
  );
});

test("outras atividades perdem 30 min no dia em que existem e ficam zeradas se não houver", () => {
  assert.equal(horasOutrasAtividades(10, 8), 1.5);
  assert.equal(horasOutrasAtividades(8, 8), 0);
  assert.equal(horasOutrasAtividades(8.3, 8), 0);
  assert.equal(horasOutrasAtividades(8.5, 8), 0);
});

test("parada sem máquina vai para o grupo e com máquina de outro grupo não entra", () => {
  assert.deepEqual(destinosParadaColheita({}, null, [50001, 50002]), [50001, 50002]);
  assert.deepEqual(destinosParadaColheita({ maquina: 50002 }, null, [50001, 50002]), [50002]);
  assert.deepEqual(destinosParadaColheita({ codEquipamento: 50001 }, 9, [50001, 50002]), [50001]);
  assert.deepEqual(destinosParadaColheita({ maquina: 60001 }, null, [50001, 50002]), []);
});

test("sem registro da máquina não some na semana por causa da manutenção da outra", () => {
  const trabalhando = repartirHorasOperacao({
    disponiveis: 24,
    efetivas: 10,
    outras: 0,
    parada: 0,
    manutencao: 0,
    paradaProgramada: 2,
  });
  const oficina = repartirHorasOperacao({
    disponiveis: 24,
    efetivas: 0,
    outras: 0,
    parada: 0,
    manutencao: 24,
    paradaProgramada: 2,
  });
  const semana = somarHorasOperacao([trabalhando, oficina]);
  const frotaNoMesmoPote = repartirHorasOperacao({
    disponiveis: 48,
    efetivas: 10,
    outras: 0,
    parada: 0,
    manutencao: 24,
    paradaProgramada: 4,
  });
  assert.equal(semana.horasSemRegistro, trabalhando.horasSemRegistro);
  assert.ok(semana.horasSemRegistro > frotaNoMesmoPote.horasSemRegistro);
});

test("parada programada perde as horas em que a máquina estava em manutenção", () => {
  const dia = "2026-09-05";
  assert.equal(horasParadaProgramadaNoDia(0), 2);
  assert.equal(horasParadaProgramadaNoDia(1), 1);
  assert.equal(horasParadaProgramadaNoDia(2), 0);
  assert.equal(
    horasManutencaoNasJanelasProgramadas(
      [{ inicio: new Date(`${dia}T06:00:00`), fim: new Date(`${dia}T07:00:00`) }],
      dia,
    ),
    1,
  );
  assert.equal(
    horasParadaProgramadaNoDia(
      horasManutencaoNasJanelasProgramadas(
        [{ inicio: new Date(`${dia}T05:00:00`), fim: new Date(`${dia}T20:00:00`) }],
        dia,
      ),
    ),
    0,
  );
  assert.equal(
    horasParadaProgramadaNoDia(
      horasManutencaoNasJanelasProgramadas(
        [{ inicio: new Date(`${dia}T06:30:00`), fim: new Date(`${dia}T06:45:00`) }],
        dia,
      ),
    ),
    1.75,
  );
});
