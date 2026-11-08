type Leitura = { horaMotor: number | null; horasElevador: number | null };
export type LeituraAnterior = Leitura & { data?: string | null };

const DIAS_MAXIMOS_ENTRE_LEITURAS = 30;

function retomouAposPausa(data: string, dataAnterior?: string | null) {
  if (!dataAnterior) return false;
  const dia = Date.parse(`${data.slice(0, 10)}T00:00:00Z`);
  const anterior = Date.parse(`${dataAnterior.slice(0, 10)}T00:00:00Z`);
  return dia - anterior > DIAS_MAXIMOS_ENTRE_LEITURAS * 86_400_000;
}

function horasRodadas(atual: number | null, anterior: number | null | undefined) {
  if (atual == null || anterior == null || !Number.isFinite(atual) || !Number.isFinite(anterior)) return null;
  const diferenca = atual - anterior;
  return diferenca >= 0 ? Math.round(diferenca * 1000000) / 1000000 : null;
}

export function montarPayloadHoras(
  input: Leitura & { data: string; turno: string; codEquipamento: number },
  anterior: LeituraAnterior | null | undefined,
) {
  const retomada = retomouAposPausa(input.data, anterior?.data);
  return {
    data: `${input.data.slice(0, 10)}T00:00:00Z`,
    turno: input.turno.trim().toUpperCase(),
    cod_equipamento: Number(input.codEquipamento),
    hora_motor: input.horaMotor,
    horas_elevador: input.horasElevador,
    horas_motor_rodadas: horasRodadas(input.horaMotor, retomada ? input.horaMotor : anterior?.horaMotor),
    horas_elevador_rodadas: horasRodadas(input.horasElevador, retomada ? input.horasElevador : anterior?.horasElevador),
  };
}
