export type HorasOperacaoPartes = {
  horasDisponiveis: number;
  horasEfetivas: number;
  horasOutrasAtividades: number;
  horasParada: number;
  horasManutencao: number;
  horasParadaProgramada: number;
  horasSemRegistro: number;
};

function money(n: number) {
  return Math.round((n || 0) * 100) / 100;
}

/** 30 min retirados por dia em que a máquina teve outras atividades (motor − elevador). */
export const ABATIMENTO_OUTRAS_ATIVIDADES_H = 0.5;

export function horasOutrasAtividades(motor: number, elevador: number) {
  const bruto = Math.max(0, (motor || 0) - (elevador || 0));
  if (!(bruto > 0)) return 0;
  return money(Math.max(0, bruto - ABATIMENTO_OUTRAS_ATIVIDADES_H));
}

/** Parada programada do turno: 06h–07h e 18h–19h. */
export const JANELAS_PARADA_PROGRAMADA_H = [
  { iniH: 6, fimH: 7 },
  { iniH: 18, fimH: 19 },
] as const;
export const HORAS_PARADA_PROGRAMADA_DIA = 2;

function janelaTs(dia: string, hora: number) {
  return new Date(`${dia}T${String(hora).padStart(2, "0")}:00:00`).getTime();
}

/** Horas de OS que caem nas janelas 06–07 e 18–19 (no máximo 2 h). */
export function horasManutencaoNasJanelasProgramadas(
  intervalos: Array<{ inicio: Date; fim: Date }>,
  dia: string,
) {
  let horas = 0;
  for (const janela of JANELAS_PARADA_PROGRAMADA_H) {
    const j0 = janelaTs(dia, janela.iniH);
    const j1 = janelaTs(dia, janela.fimH);
    if (!Number.isFinite(j0) || !Number.isFinite(j1) || j1 <= j0) continue;
    let covered = 0;
    for (const it of intervalos) {
      const i0 = it.inicio.getTime();
      const i1 = it.fim.getTime();
      if (!Number.isFinite(i0) || !Number.isFinite(i1)) continue;
      covered += Math.max(0, Math.min(i1, j1) - Math.max(i0, j0));
    }
    horas += Math.min(j1 - j0, covered) / 3600000;
  }
  return money(Math.min(HORAS_PARADA_PROGRAMADA_DIA, horas));
}

export function horasParadaProgramadaNoDia(horasManutencaoNasJanelas: number) {
  return money(Math.max(0, HORAS_PARADA_PROGRAMADA_DIA - Math.max(0, horasManutencaoNasJanelas || 0)));
}

/** Sem máquina no apontamento, a parada da frente vale para o grupo (colhedoras ou tratores). */
export function destinosParadaColheita(
  evento: { maquina?: number | null; codEquipamento?: number | null },
  resolvedCod: number | null,
  grupoCods: number[],
): number[] {
  const candidatos = [evento.codEquipamento, resolvedCod, evento.maquina].filter(
    (cod): cod is number => cod != null,
  );
  if (!candidatos.length) return [...grupoCods];
  const hit = candidatos.find((cod) => grupoCods.includes(cod));
  return hit != null ? [hit] : [];
}

export function emptyHorasOperacao(): HorasOperacaoPartes {
  return {
    horasDisponiveis: 0,
    horasEfetivas: 0,
    horasOutrasAtividades: 0,
    horasParada: 0,
    horasManutencao: 0,
    horasParadaProgramada: 0,
    horasSemRegistro: 0,
  };
}

export function somarHorasOperacao(rows: HorasOperacaoPartes[]): HorasOperacaoPartes {
  const acc = emptyHorasOperacao();
  for (const row of rows) {
    acc.horasDisponiveis = money(acc.horasDisponiveis + row.horasDisponiveis);
    acc.horasEfetivas = money(acc.horasEfetivas + row.horasEfetivas);
    acc.horasOutrasAtividades = money(acc.horasOutrasAtividades + row.horasOutrasAtividades);
    acc.horasParada = money(acc.horasParada + row.horasParada);
    acc.horasManutencao = money(acc.horasManutencao + row.horasManutencao);
    acc.horasParadaProgramada = money(acc.horasParadaProgramada + row.horasParadaProgramada);
    acc.horasSemRegistro = money(acc.horasSemRegistro + row.horasSemRegistro);
  }
  return acc;
}

/** Parte as 24 h da máquina no dia sem somar categorias em cima umas das outras. */
export function repartirHorasOperacao(input: {
  disponiveis: number;
  efetivas: number;
  outras: number;
  parada: number;
  manutencao: number;
  paradaProgramada: number;
}): HorasOperacaoPartes {
  const cap = Math.max(0, input.disponiveis || 0);
  let resto = cap;
  const take = (value: number) => {
    const n = Math.max(0, value || 0);
    const used = Math.min(n, resto);
    resto = money(resto - used);
    return money(used);
  };
  const horasEfetivas = take(input.efetivas);
  const horasOutrasAtividades = take(input.outras);
  const horasParada = take(input.parada);
  const horasParadaProgramada = take(input.paradaProgramada);
  const horasManutencao = take(input.manutencao);
  return {
    horasDisponiveis: money(cap),
    horasEfetivas,
    horasOutrasAtividades,
    horasParada,
    horasManutencao,
    horasParadaProgramada,
    horasSemRegistro: money(resto),
  };
}
