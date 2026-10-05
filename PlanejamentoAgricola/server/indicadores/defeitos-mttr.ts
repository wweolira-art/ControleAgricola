export type DefeitoOsLinha = {
  anoOs: number;
  numeroOs: number;
  descricao: string;
};

export type FalhaReparoMttr = {
  anoOs: number;
  numeroOs: number;
  tempoReparoHoras: number;
};

export type DefeitoImpactoMttr = {
  defeito: string;
  qtd: number;
  tempoReparoHoras: number;
  mttrHoras: number | null;
  participacaoPct: number;
};

function money(n: number) {
  return Math.round((n || 0) * 100) / 100;
}

function chaveDefeito(text: string) {
  const clean = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
  return clean || "SEM DESCRICAO";
}

/**
 * Agrupa os defeitos corretivos pelo impacto no MTTR.
 * O impacto é o tempo de reparo: ele entra no numerador do MTTR.
 * O.S. com mais de um defeito reparte as horas entre eles.
 */
export function agregarDefeitosMttr(
  falhas: FalhaReparoMttr[],
  linhas: DefeitoOsLinha[],
  limite = 10,
): DefeitoImpactoMttr[] {
  const porOs = new Map<string, Map<string, string>>();
  for (const linha of linhas) {
    const osKey = `${linha.anoOs}-${linha.numeroOs}`;
    const nome = linha.descricao.replace(/\s+/g, " ").trim();
    const chave = chaveDefeito(nome);
    const grupo = porOs.get(osKey) ?? new Map<string, string>();
    if (!grupo.has(chave)) grupo.set(chave, nome || "Sem descrição");
    porOs.set(osKey, grupo);
  }

  const acc = new Map<string, { defeito: string; qtd: number; horas: number }>();
  let totalHoras = 0;
  for (const falha of falhas) {
    const horas = Number.isFinite(falha.tempoReparoHoras) ? Math.max(falha.tempoReparoHoras, 0) : 0;
    totalHoras += horas;
    const grupo = porOs.get(`${falha.anoOs}-${falha.numeroOs}`);
    const nomes = grupo && grupo.size ? [...grupo.entries()] : [["SEM DESCRICAO", "Sem descrição"] as const];
    const cota = horas / nomes.length;
    for (const [chave, defeito] of nomes) {
      const cur = acc.get(chave) ?? { defeito, qtd: 0, horas: 0 };
      cur.qtd += 1;
      cur.horas += cota;
      acc.set(chave, cur);
    }
  }

  return [...acc.values()]
    .map((row) => ({
      defeito: row.defeito,
      qtd: row.qtd,
      tempoReparoHoras: money(row.horas),
      mttrHoras: row.qtd > 0 ? money(row.horas / row.qtd) : null,
      participacaoPct: totalHoras > 0 ? money((row.horas / totalHoras) * 100) : 0,
    }))
    .sort((a, b) => b.tempoReparoHoras - a.tempoReparoHoras || b.qtd - a.qtd || a.defeito.localeCompare(b.defeito, "pt-BR"))
    .slice(0, Math.max(limite, 0));
}
