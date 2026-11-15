export type ProducaoMaquinaFazenda = { data: string | null; codEquipamento: number; fazenda: string; talhao: number | null; toneladas: number; somenteReferencia?: boolean };
export type MetasConsumoMapa = Record<"colhedora" | "trator", { ltHora: number; ltTon: number }>;

export function selecionarProducaoMapa(rows: ProducaoMaquinaFazenda[], dataInicio: string, dataFim: string) {
  const anteriores = new Map<number, { data: string; rows: ProducaoMaquinaFazenda[] }>();
  const periodo: ProducaoMaquinaFazenda[] = [];
  for (const row of rows) {
    const data = row.data?.slice(0, 10);
    if (!data || data > dataFim || !(row.toneladas > 0)) continue;
    if (data >= dataInicio) { periodo.push({ ...row, data, somenteReferencia: false }); continue; }
    const atual = anteriores.get(row.codEquipamento);
    if (atual && atual.data > data) continue;
    const grupo = atual?.data === data ? atual : { data, rows: [] };
    grupo.rows.push({ ...row, data, somenteReferencia: true });
    anteriores.set(row.codEquipamento, grupo);
  }
  const agrupado = new Map<string, ProducaoMaquinaFazenda>();
  for (const row of [...periodo, ...[...anteriores.values()].flatMap(grupo => grupo.rows)]) {
    const key = JSON.stringify([row.data, row.codEquipamento, row.fazenda, row.talhao]);
    const atual = agrupado.get(key) ?? { ...row, toneladas: 0 };
    atual.toneladas += row.toneladas;
    agrupado.set(key, atual);
  }
  return [...agrupado.values()];
}
export type TalhaoMapa = { fazenda?: unknown; codFazenda?: unknown; codFazendaOracle?: unknown; codTalhao?: unknown; lote?: unknown };
type VinculoFazenda = { descricaoUsina: string | null; codSistema: number | null };

export function farmKey(value: unknown) {
  return String(value ?? "").replace(/^\s*\d+(?:\.\d+)*\s*-\s*/, "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ").trim().replace(/^(?:FAZENDA|FAZ)\s+/, "");
}

function numero(value: unknown) {
  if (value == null || String(value).trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function talhaoMapaKey(props: TalhaoMapa) {
  const fazenda = numero(props.codFazendaOracle ?? props.codFazenda);
  const talhao = numero(props.codTalhao ?? props.lote);
  return fazenda == null || talhao == null ? null : `${fazenda}::${talhao}`;
}

export function buildTalhoes(
  combustivel: Array<{ dataAbastecimento: string | null; codEquipamento: number | null; qtdeLitros: number; codTipoEquipamento?: number | null; origem?: string; kmhsRodados?: number; horasTrabalho?: number }>,
  producao: ProducaoMaquinaFazenda[],
  poligonos: TalhaoMapa[],
  vinculos: VinculoFazenda[] = [],
  metas?: MetasConsumoMapa,
) {
  const chavesMapa = new Set<string>();
  const codigosPorNome = new Map<string, Set<number>>();
  for (const props of poligonos) {
    const chave = talhaoMapaKey(props);
    const cod = numero(props.codFazendaOracle ?? props.codFazenda);
    if (chave) chavesMapa.add(chave);
    const nome = farmKey(props.fazenda);
    if (nome && cod != null) {
      const codigos = codigosPorNome.get(nome) ?? new Set<number>();
      codigos.add(cod); codigosPorNome.set(nome, codigos);
    }
  }
  const codigosVinculados = new Map<string, Set<number>>();
  for (const row of vinculos) {
    if (row.codSistema == null || !row.descricaoUsina) continue;
    const codigo = row.descricaoUsina.match(/^\s*(\d+(?:\.\d+)*)\s*-/)?.[1];
    for (const alias of [farmKey(row.descricaoUsina), codigo ? `COD:${codigo}` : ""]) {
      if (!alias) continue;
      const codigos = codigosVinculados.get(alias) ?? new Set<number>();
      codigos.add(row.codSistema); codigosVinculados.set(alias, codigos);
    }
  }
  const resolveTalhao = (row: ProducaoMaquinaFazenda) => {
    const talhao = numero(row.talhao);
    if (talhao == null) return null;
    const codigo = row.fazenda.match(/^\s*(\d+(?:\.\d+)*)\s*-/)?.[1];
    const aliases = [codigo ? `COD:${codigo}` : "", farmKey(row.fazenda)];
    for (const alias of aliases) {
      const codigos = codigosVinculados.get(alias);
      if (codigos?.size === 1) {
        const chave = `${[...codigos][0]}::${talhao}`;
        if (chavesMapa.has(chave)) return chave;
      }
    }
    const codigos = codigosPorNome.get(farmKey(row.fazenda));
    if (codigos?.size === 1) {
      const chave = `${[...codigos][0]}::${talhao}`;
      if (chavesMapa.has(chave)) return chave;
    }
    const cod = numero(row.fazenda);
    const chave = cod == null ? null : `${cod}::${talhao}`;
    return chave && chavesMapa.has(chave) ? chave : null;
  };
  const dia = (data: string | null) => data?.match(/^(\d{4}-\d{2}-\d{2})(?:T|$| )/)?.[1] ?? null;
  const litrosPorDiaEquip = new Map<string, { data: string; cod: number; litros: number; horas: number; litrosComHoras: number; meta?: { ltHora: number; ltTon: number } }>();
  let litrosSemProducao = 0;
  for (const row of combustivel) if (row.codEquipamento != null && row.qtdeLitros > 0) {
    const data = dia(row.dataAbastecimento);
    if (!data) { litrosSemProducao += row.qtdeLitros; continue; }
    const chave = `${data}::${row.codEquipamento}`;
    const meta = row.codTipoEquipamento === 81 ? metas?.colhedora : row.codTipoEquipamento === 93 ? metas?.trator : undefined;
    const atual = litrosPorDiaEquip.get(chave) ?? { data, cod: row.codEquipamento, litros: 0, horas: 0, litrosComHoras: 0, meta };
    const horas = row.kmhsRodados ?? row.horasTrabalho ?? 0;
    // Mesma base de L/h do painel: colhedeiras usam os abastecimentos;
    // tratores usam apenas os registros do posto.
    if (Number.isFinite(horas) && horas > 0 && (row.codTipoEquipamento === 81 || (row.codTipoEquipamento === 93 && row.origem === "posto"))) {
      atual.horas += horas;
      atual.litrosComHoras += row.qtdeLitros;
    }
    atual.litros += row.qtdeLitros; litrosPorDiaEquip.set(chave, atual);
  }
  const producaoPorEquip = new Map<number, Map<string, Array<{ row: ProducaoMaquinaFazenda; index: number }>>>();
  producao.forEach((row, index) => {
    const data = dia(row.data);
    if (!data || !(row.toneladas > 0)) return;
    const datas = producaoPorEquip.get(row.codEquipamento) ?? new Map();
    const linhas = datas.get(data) ?? [];
    linhas.push({ row, index }); datas.set(data, linhas); producaoPorEquip.set(row.codEquipamento, datas);
  });
  const acumulado = new Map<string, { litros: number; toneladas: number; horas: number; litrosComHoras: number; litrosMetaHora: number; litrosMetaTon: number; horasComMeta: number; toneladasComMeta: number; equipamentos: Set<number> }>();
  const producoesUtilizadas = new Set<number>();
  let semVinculo = 0, litrosSemVinculo = 0, litrosUltimaProducao = 0;
  for (const consumo of litrosPorDiaEquip.values()) {
    const datas = producaoPorEquip.get(consumo.cod);
    const dataProducao = datas ? [...datas.keys()].filter(data => data <= consumo.data).sort().at(-1) : undefined;
    const linhas = dataProducao ? datas?.get(dataProducao) : undefined;
    if (!linhas?.length) { litrosSemProducao += consumo.litros; continue; }
    if (dataProducao !== consumo.data) litrosUltimaProducao += consumo.litros;
    const totalTon = linhas.reduce((total, { row }) => total + row.toneladas, 0);
    for (const { row, index } of linhas) {
      const litros = consumo.litros * row.toneladas / totalTon;
      const chave = resolveTalhao(row);
      if (!chave) { semVinculo++; litrosSemVinculo += litros; continue; }
      const atual = acumulado.get(chave) ?? { litros: 0, toneladas: 0, horas: 0, litrosComHoras: 0, litrosMetaHora: 0, litrosMetaTon: 0, horasComMeta: 0, toneladasComMeta: 0, equipamentos: new Set<number>() };
      atual.litros += litros;
      const fracao = row.toneladas / totalTon;
      const horas = consumo.horas * fracao;
      atual.horas += horas;
      atual.litrosComHoras += consumo.litrosComHoras * fracao;
      if (consumo.meta && consumo.meta.ltHora > 0) {
        atual.litrosMetaHora += consumo.meta.ltHora * horas;
        atual.horasComMeta += horas;
      }
      if (!producoesUtilizadas.has(index) && !row.somenteReferencia) {
        atual.toneladas += row.toneladas;
        if (consumo.meta && consumo.meta.ltTon > 0) {
          atual.litrosMetaTon += consumo.meta.ltTon * row.toneladas;
          atual.toneladasComMeta += row.toneladas;
        }
      }
      producoesUtilizadas.add(index);
      atual.equipamentos.add(row.codEquipamento);
      acumulado.set(chave, atual);
    }
  }
  const toneladasSemConsumo = producao.reduce((total, row, index) => total + (!row.somenteReferencia && !producoesUtilizadas.has(index) && row.toneladas > 0 ? row.toneladas : 0), 0);
  return {
    talhoes: new Map([...acumulado].map(([chave, row]) => [chave, {
      litros: row.litros, toneladas: row.toneladas,
      horas: row.horas, litrosComHoras: row.litrosComHoras,
      litrosPorHora: row.horas > 0 ? row.litrosComHoras / row.horas : null,
      metaLitrosPorHora: row.horasComMeta > 0 ? row.litrosMetaHora / row.horasComMeta : null,
      metaLitrosPorTonelada: row.toneladasComMeta > 0 ? row.litrosMetaTon / row.toneladasComMeta : null,
      litrosPorTonelada: row.toneladas > 0 ? row.litros / row.toneladas : null,
      equipamentos: row.equipamentos.size,
    }])), semVinculo, litrosSemVinculo, litrosSemProducao, toneladasSemConsumo, litrosUltimaProducao,
  };
}
