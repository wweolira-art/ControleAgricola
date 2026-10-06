export type MotoristaPeriodoConfig = {
  id: string;
  matricula: string;
  nome: string;
};

export type EquipamentoPeriodoConfig = {
  id: string;
  equipTag: string;
  percentual: number;
  motoristas: MotoristaPeriodoConfig[];
};

export type GrupoMotoristaPeriodo = {
  id: string;
  equipamentos: EquipamentoPeriodoConfig[];
  folguistas: MotoristaPeriodoConfig[];
  folguistaPercentual: number;
};

export const PERIODO_MOTORISTAS_REGISTRADO = {
  dataInicio: "2026-09-01",
  dataFim: "2026-09-30",
};

const PERIODO_KEY = `${PERIODO_MOTORISTAS_REGISTRADO.dataInicio}|${PERIODO_MOTORISTAS_REGISTRADO.dataFim}`;

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function numero(value: unknown, fallback: number) {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function pessoa(value: unknown): MotoristaPeriodoConfig | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<MotoristaPeriodoConfig>;
  const id = String(row.id ?? "").trim();
  const matricula = String(row.matricula ?? "").trim();
  const nome = String(row.nome ?? "").trim();
  if (!id && !matricula && !nome) return null;
  return { id: id || uid("mot"), matricula, nome };
}

export function normalizarGruposPeriodo(value: unknown): GrupoMotoristaPeriodo[] {
  if (!Array.isArray(value)) return [];
  return value.map((grupo) => {
    const row = (grupo ?? {}) as Partial<GrupoMotoristaPeriodo> & { folguista?: MotoristaPeriodoConfig };
    const equipamentos = Array.isArray(row.equipamentos)
      ? row.equipamentos.map((equipamento) => {
          const item = (equipamento ?? {}) as Partial<EquipamentoPeriodoConfig>;
          const motoristas = Array.isArray(item.motoristas) ? item.motoristas.map(pessoa).filter((item) => item != null) : [];
          return {
            id: String(item.id ?? "").trim() || uid("eq"),
            equipTag: String(item.equipTag ?? "").trim(),
            percentual: numero(item.percentual, 24),
            motoristas,
          };
        })
      : [];
    const folguistasInformados = Array.isArray(row.folguistas) ? row.folguistas.map(pessoa).filter((item) => item != null) : [];
    const folguistaAntigo = pessoa(row.folguista);
    return {
      id: String(row.id ?? "").trim() || uid("grp"),
      equipamentos,
      folguistas: folguistasInformados.length ? folguistasInformados : folguistaAntigo ? [folguistaAntigo] : [],
      folguistaPercentual: numero(row.folguistaPercentual, 20),
    };
  });
}

export function chavePeriodoMotoristas(dataInicio: string, dataFim: string) {
  return `${dataInicio}|${dataFim}`;
}

export function registrarLegadoNoPeriodo(
  store: Record<string, GrupoMotoristaPeriodo[]>,
  legado: unknown,
): Record<string, GrupoMotoristaPeriodo[]> {
  const grupos = normalizarGruposPeriodo(legado);
  if (!grupos.length || (store[PERIODO_KEY]?.length ?? 0) > 0) return store;
  return { ...store, [PERIODO_KEY]: grupos };
}
