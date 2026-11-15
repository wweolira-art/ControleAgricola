import type { IndicadoresCombustivelLinha, ResumoTransporteCanaData } from "../api";

type FazendaConsumo = {
  nome: string;
  litros: number;
  toneladas: number;
  litrosPorTonelada: number;
  equipamentos: number;
};

export function farmKey(value: string | null | undefined) {
  return String(value ?? "")
    .replace(/^\s*\d+(?:\.\d+)*\s*-\s*/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

export type ProducaoMaquinaFazenda = { codEquipamento: number; fazenda: string; toneladas: number };

export function buildFazendas(rows: Array<Pick<IndicadoresCombustivelLinha, "codEquipamento" | "qtdeLitros">>, transporte: ResumoTransporteCanaData | null, producaoMaquina: ProducaoMaquinaFazenda[] = []) {
  const equipamentosMaquina = new Set(producaoMaquina.map(row => row.codEquipamento));
  const producao = producaoMaquina.map(row => ({ fazenda: row.fazenda, equipamentos: { [row.codEquipamento]: row.toneladas } }));
  for (const bloco of transporte?.blocos ?? []) for (const linha of bloco.linhas) {
    producao.push({ fazenda: linha.fazenda, equipamentos: Object.fromEntries(Object.entries(linha.equipamentos).filter(([cod]) => !equipamentosMaquina.has(Number(cod)))) });
  }
  const litrosPorEquipamento = new Map<number, number>();
  for (const row of rows) {
    if (row.codEquipamento == null || !(row.qtdeLitros > 0)) continue;
    litrosPorEquipamento.set(row.codEquipamento, (litrosPorEquipamento.get(row.codEquipamento) ?? 0) + row.qtdeLitros);
  }
  const toneladasPorEquipamento = new Map<number, number>();
  for (const linha of producao) {
    for (const [equipamento, toneladas] of Object.entries(linha.equipamentos)) {
      const codigo = Number(equipamento);
      if (Number.isFinite(codigo) && toneladas > 0) toneladasPorEquipamento.set(codigo, (toneladasPorEquipamento.get(codigo) ?? 0) + toneladas);
    }
  }
  const byFarm = new Map<string, { nome: string; litros: number; toneladas: number; equipamentos: Set<number> }>();
  for (const linha of producao) {
    const key = farmKey(linha.fazenda);
    if (!key) continue;
    const current = byFarm.get(key) ?? { nome: linha.fazenda, litros: 0, toneladas: 0, equipamentos: new Set<number>() };
    for (const [equipamento, toneladas] of Object.entries(linha.equipamentos)) {
      const codigo = Number(equipamento);
      const toneladasEquipamento = toneladasPorEquipamento.get(codigo) ?? 0;
      const litrosEquipamento = litrosPorEquipamento.get(codigo) ?? 0;
      if (!(codigo > 0) || !(toneladas > 0) || !(toneladasEquipamento > 0) || !(litrosEquipamento > 0)) continue;
      // O tanque pertence ao equipamento; seus litros são rateados pelas toneladas
      // que o mesmo equipamento levou de cada fazenda no período.
      current.litros += litrosEquipamento * (toneladas / toneladasEquipamento);
      current.toneladas += toneladas;
      current.equipamentos.add(codigo);
    }
    if (current.toneladas > 0) byFarm.set(key, current);
  }
  return new Map<string, FazendaConsumo>([...byFarm.entries()].map(([key, item]) => [key, {
    nome: item.nome,
    litros: item.litros,
    toneladas: item.toneladas,
    litrosPorTonelada: item.toneladas > 0 ? item.litros / item.toneladas : 0,
    equipamentos: item.equipamentos.size,
  }]));
}

