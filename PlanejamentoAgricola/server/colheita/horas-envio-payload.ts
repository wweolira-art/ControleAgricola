type Leitura = { horaMotor: number | null; horasElevador: number | null };

function horasRodadas(atual: number | null, anterior: number | null | undefined) {
  if (atual == null || anterior == null || !Number.isFinite(atual) || !Number.isFinite(anterior)) return null;
  const diferenca = atual - anterior;
  return diferenca >= 0 ? Math.round(diferenca * 1000000) / 1000000 : null;
}

export function montarPayloadHoras(
  input: Leitura & { data: string; turno: string; codEquipamento: number },
  anterior: Leitura | null | undefined,
) {
  return {
    data: `${input.data.slice(0, 10)}T00:00:00Z`,
    turno: input.turno.trim().toUpperCase(),
    cod_equipamento: Number(input.codEquipamento),
    hora_motor: input.horaMotor,
    horas_elevador: input.horasElevador,
    horas_motor_rodadas: horasRodadas(input.horaMotor, anterior?.horaMotor),
    horas_elevador_rodadas: horasRodadas(input.horasElevador, anterior?.horasElevador),
  };
}
