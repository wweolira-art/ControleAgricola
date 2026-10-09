export type HorasLeitura = {
  id: number | null;
  codEquipamento: number | null;
  data: string | null;
  horaMotor: number | null;
  horasElevador: number | null;
  turno: string | null;
};

export type HorasLeituraComRodadas = HorasLeitura & {
  horasMotorRodadas: number | null;
  horasElevadorRodadas: number | null;
};

const MAX_HORAS_POR_DIA_ENTRE_LEITURAS = 24;

function rowOrderKey(row: HorasLeitura) {
  const data = String(row.data ?? "");
  const turno = String(row.turno ?? "").trim().toUpperCase();
  const id = row.id ?? 0;
  return `${data} ${turno.padStart(3, " ")} ${String(id).padStart(12, "0")}`;
}

function diasEntre(inicio: string | null, fim: string | null) {
  if (!inicio || !fim) return 0;
  const a = new Date(`${inicio.slice(0, 10)}T12:00:00`);
  const b = new Date(`${fim.slice(0, 10)}T12:00:00`);
  if (!Number.isFinite(a.getTime()) || !Number.isFinite(b.getTime())) return 0;
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86_400_000));
}

function delta(
  atual: number | null,
  anterior: number | null,
  dataAtual: string | null,
  dataAnterior: string | null,
): number | null {
  if (atual == null || !Number.isFinite(atual) || anterior == null || !Number.isFinite(anterior)) return null;
  const diff = Math.max(0, atual - anterior);
  const limite = Math.max(1, diasEntre(dataAnterior, dataAtual)) * MAX_HORAS_POR_DIA_ENTRE_LEITURAS;
  return diff <= limite ? diff : null;
}

/**
 * Horas rodadas por leitura = diferença vs. a leitura anterior do mesmo equipamento
 * (ordenado por data, turno e id). A primeira leitura do equipamento fica sem rodadas.
 */
export function anexarHorasRodadas(rows: HorasLeitura[]): HorasLeituraComRodadas[] {
  const porEquip = new Map<number, HorasLeitura[]>();
  for (const row of rows) {
    if (row.codEquipamento == null) continue;
    const list = porEquip.get(row.codEquipamento) ?? [];
    list.push(row);
    porEquip.set(row.codEquipamento, list);
  }

  const rodadas = new Map<HorasLeitura, { motor: number | null; elevador: number | null }>();
  for (const leituras of porEquip.values()) {
    const ordenadas = leituras.slice().sort((a, b) => rowOrderKey(a).localeCompare(rowOrderKey(b)));
    let ultimoMotor: number | null = null;
    let ultimoElevador: number | null = null;
    let dataUltimoMotor: string | null = null;
    let dataUltimoElevador: string | null = null;
    for (let i = 0; i < ordenadas.length; i++) {
      const atual = ordenadas[i]!;
      rodadas.set(atual, {
        motor: delta(atual.horaMotor, ultimoMotor, atual.data, dataUltimoMotor),
        elevador: delta(atual.horasElevador, ultimoElevador, atual.data, dataUltimoElevador),
      });
      if (atual.horaMotor != null && Number.isFinite(atual.horaMotor)) {
        ultimoMotor = atual.horaMotor;
        dataUltimoMotor = atual.data;
      }
      if (atual.horasElevador != null && Number.isFinite(atual.horasElevador)) {
        ultimoElevador = atual.horasElevador;
        dataUltimoElevador = atual.data;
      }
    }
  }

  return rows.map((row) => {
    const calc = rodadas.get(row);
    return {
      ...row,
      horasMotorRodadas: calc?.motor ?? null,
      horasElevadorRodadas: calc?.elevador ?? null,
    };
  });
}
