import assert from "node:assert/strict";
import test from "node:test";
import { horasDisponiveisParaRodar, somarHorasOperacao, emptyHorasOperacao, intervalosParadaProgramada, eficienciaHorasParaRodar } from "../src/lib/horas-operacao.ts";

const instante = (hora: string, dia = "2026-10-24") => new Date(`${dia}T${hora}:00:00`);
const janela = { inicio: instante("07"), fim: instante("07", "2026-10-25") };
const intervalo = (inicio: string, fim: string) => ({ inicio: instante(inicio), fim: instante(fim) });

test("eficiência usa horas para rodar e trata ausência de disponibilidade", () => {
  assert.equal(eficienciaHorasParaRodar(12, 18), 66.67);
  assert.equal(eficienciaHorasParaRodar(0, 18), 0);
  assert.equal(eficienciaHorasParaRodar(12, 0), null);
  assert.equal(eficienciaHorasParaRodar(12, undefined), null);
  const base = emptyHorasOperacao();
  const total = somarHorasOperacao([
    { ...base, horasEfetivas: 10, horasDisponiveisRodar: 10 },
    { ...base, horasEfetivas: 0, horasDisponiveisRodar: 30 },
  ]);
  assert.equal(eficienciaHorasParaRodar(total.horasEfetivas, total.horasDisponiveisRodar), 25);
});

test("desconta manutenção e colheita uma vez nos períodos sobrepostos", () => {
  assert.equal(horasDisponiveisParaRodar(24, janela, [intervalo("10", "14"), intervalo("12", "16")]), 18);
  assert.equal(horasDisponiveisParaRodar(24, janela, [intervalo("10", "14"), intervalo("10", "14")]), 20);
  assert.equal(horasDisponiveisParaRodar(24, janela, [intervalo("10", "16"), intervalo("12", "14")]), 18);
});

test("soma paradas separadas e recorta paradas que cruzam a janela", () => {
  assert.equal(horasDisponiveisParaRodar(24, janela, [intervalo("08", "10"), intervalo("12", "14")]), 20);
  assert.equal(horasDisponiveisParaRodar(24, janela, [{ inicio: instante("05"), fim: instante("09") }]), 22);
  assert.equal(horasDisponiveisParaRodar(24, janela, [{ inicio: instante("00"), fim: instante("12", "2026-10-25") }]), 0);
  assert.equal(horasDisponiveisParaRodar(24, janela, []), 24);
});

test("agregação soma disponibilidade para rodar de cada equipamento sem limitar a frota a 24h", () => {
  const base = emptyHorasOperacao();
  const soma = somarHorasOperacao([{ ...base, horasDisponiveisRodar: 18 }, { ...base, horasDisponiveisRodar: 20 }]);
  assert.equal(soma.horasDisponiveisRodar, 38);
});

test("desconta as duas horas programadas na janela 07h–07h sem duplicar manutenção", () => {
  const programadas = intervalosParadaProgramada(janela);
  assert.equal(horasDisponiveisParaRodar(24, janela, programadas), 22);
  assert.equal(horasDisponiveisParaRodar(24, janela, [...programadas, intervalo("18", "19")]), 22);
  assert.equal(horasDisponiveisParaRodar(24, janela, [...programadas, intervalo("17", "20")]), 20);
  assert.equal(horasDisponiveisParaRodar(24, janela, [...programadas, {
    inicio: instante("05", "2026-10-25"), fim: instante("07", "2026-10-25"),
  }]), 21);
});
