type Grupo = "colhedora" | "trator" | "caminhao";
type Abastecimento = { litros: number; kmhs: number; litrosPosto: number; kmhsPosto: number };
type Producao = { data: string | null; codEquipamento: number | null; toneladas: number; fazenda?: string | null };
type Equipamento = { grupo: Grupo; codEquipamento: number; equipamento: string; codigos: number[] };

const arredondar = (value: number) => Math.round(value * 100) / 100;

export function montarConsumoAnalitico(input: {
  dias: string[];
  equipamentos: Equipamento[];
  abastecimento: Map<string, Abastecimento>;
  abastecimentoTrator: Map<string, Abastecimento>;
  producaoMaquina: Producao[];
  producaoCaminhao: Producao[];
}) {
  // Agregar cada fonte antes da junção impede que várias fazendas ou viagens
  // no mesmo dia multipliquem os abastecimentos do equipamento.
  const agregarProducao = (rows: Producao[]) => {
    const map = new Map<string, { toneladas: number; fazendas: Set<string> }>();
    for (const row of rows) {
      if (!row.data || row.codEquipamento == null) continue;
      const key = `${row.data}::${row.codEquipamento}`;
      const atual = map.get(key) ?? { toneladas: 0, fazendas: new Set<string>() };
      atual.toneladas += row.toneladas;
      if (row.fazenda?.trim()) atual.fazendas.add(row.fazenda.trim());
      map.set(key, atual);
    }
    return map;
  };
  const maquina = agregarProducao(input.producaoMaquina);
  const caminhao = agregarProducao(input.producaoCaminhao);
  const linhas: Array<{
    data: string; codEquipamento: number; equipamento: string; grupo: Grupo; fazenda: string | null;
    litrosCombustivel: number; toneladaColhida: number; ltHr: number | null; ltTon: number | null;
  }> = [];
  for (const item of input.equipamentos) {
    const abastecimentos = item.grupo === "trator" ? input.abastecimentoTrator : input.abastecimento;
    const producao = item.grupo === "caminhao" ? caminhao : maquina;
    for (const data of input.dias) {
      let litros = 0, toneladas = 0, horas = 0, litrosPosto = 0, horasPosto = 0;
      const fazendas = new Set<string>();
      for (const cod of new Set(item.codigos)) {
        const key = `${data}::${cod}`;
        const abastecimento = abastecimentos.get(key);
        litros += abastecimento?.litros ?? 0;
        horas += abastecimento?.kmhs ?? 0;
        litrosPosto += abastecimento?.litrosPosto ?? 0;
        horasPosto += abastecimento?.kmhsPosto ?? 0;
        const entrada = producao.get(key);
        toneladas += entrada?.toneladas ?? 0;
        for (const fazenda of entrada?.fazendas ?? []) fazendas.add(fazenda);
      }
      if (!litros && !toneladas && !horas) continue;
      linhas.push({
        data, codEquipamento: item.codEquipamento, equipamento: item.equipamento, grupo: item.grupo,
        fazenda: [...fazendas].sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true })).join("; ") || null,
        litrosCombustivel: arredondar(litros), toneladaColhida: arredondar(toneladas),
        ltHr: item.grupo === "caminhao" ? null : item.grupo === "colhedora"
          ? (horas > 0 ? arredondar(litros / horas) : null)
          : (horasPosto > 0 ? arredondar(litrosPosto / horasPosto) : null),
        ltTon: toneladas > 0 ? arredondar(litros / toneladas) : null,
      });
    }
  }
  return linhas.sort((a, b) => a.data.localeCompare(b.data) || a.equipamento.localeCompare(b.equipamento, "pt-BR", { numeric: true }));
}
