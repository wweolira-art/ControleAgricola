import type { Express } from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { oracleNumber, oracleText, withOracle } from "./oracle.js";
import { anomesRangeForSafra } from "./externo-orcamento.js";

const MONTHS = ["SET", "OUT", "NOV", "DEZ", "JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO"];

type RhMes = {
  key: string;
  label: string;
  anomes: string;
  orcado: number;
  realizado: number;
  variacao: number;
  funcionarios: number;
  funcionariosDelta: number | null;
};

type RhQuantidadeMes = {
  anomes: string;
  label: string;
  orcado: number;
  realizado: number;
};

type RhQuantidadeLinha = {
  key: string;
  descricao: string;
  meses: RhQuantidadeMes[];
};

type RhObjetoSubempenhoLinha = {
  key: string;
  categoria: string;
  codObjetoCusto: string;
  objetoCusto: string;
  codSubempenho: string;
  subempenho: string;
  meses: Array<{ anomes: string; label: string; quantidade: number }>;
  total: number;
};

function appRoot() {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function money(n: number) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function monthLabel(anomes: string) {
  const month = Number(String(anomes).slice(4, 6));
  return MONTHS[[9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8].indexOf(month)] ?? String(anomes);
}

function anomesList(from: string, to: string) {
  const out: string[] = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(4, 6));
  const end = Number(to);
  while (y * 100 + m <= end) {
    out.push(String(y * 100 + m));
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out.slice(0, 12);
}

function readJsonData(file: string): { rows?: Array<{ r: number; c: unknown[] }> } | null {
  const candidates = [
    path.join(appRoot(), "data", file),
    path.join(appRoot(), "public", "data", file),
  ];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) return null;
  return JSON.parse(fs.readFileSync(found, "utf8")) as { rows?: Array<{ r: number; c: unknown[] }> };
}

function toNum(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function mensalFuncionarios() {
  const data = readJsonData("DIM__PESSOAL_MENSAL.json");
  const totals = Array.from({ length: 12 }, () => 0);
  for (const row of data?.rows ?? []) {
    const first = String(row.c?.[0] ?? "").trim().toUpperCase();
    if (!first || first === "TOTAL" || first.includes("SUB PROCESSO")) continue;
    for (let i = 0; i < 12; i += 1) totals[i] += toNum(row.c?.[i + 1]);
  }
  return totals;
}

function orcadoFuncionariosPorSubprocesso() {
  const data = readJsonData("DIM__PESSOAL_MENSAL.json");
  return (data?.rows ?? [])
    .map((row) => ({
      descricao: String(row.c?.[0] ?? "").trim(),
      meses: Array.from({ length: 12 }, (_, i) => toNum(row.c?.[i + 1])),
    }))
    .filter((row) => {
      const upper = row.descricao.toUpperCase();
      return row.descricao && upper !== "TOTAL" && !upper.includes("SUB PROCESSO");
    });
}

function normalizeKey(text: string) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

function categoriaFuncionario(descricao: string) {
  const text = normalizeKey(descricao);
  if (/PLANTIO/.test(text)) return "PLANTIO";
  if (/COLHEITA.*MANUAL|CORTE.*CANA.*MANUAL|C\.? MANUAL/.test(text)) return "COLHEITA MANUAL";
  if (/COLHEITA.*MEC|C\.? MECANIZADA|TRANSBORDO|COLHEDORA/.test(text)) return "COLHEITA MEC.";
  if (/MECANIZACAO|MECANIZAÇÃO|TRATOR|CARREGADEIRA/.test(text)) return "MECANIZAÇÃO";
  if (/OFICINA|MANUTENCAO|MANUTENÇÃO/.test(text)) return "OFICINA";
  if (/IRRIG|FERTIRRIG/.test(text)) return "SIST. IRRIGAÇÃO";
  if (/TRANSPORTE|CAMINHAO|CAMINHÃO/.test(text)) return "TRANSPORTE";
  if (/ADMIN|CONTROLE|FINANCEIRO|JURIDICO|JURID|CONTABIL|RECURSOS HUMANOS|SUPRIMENTOS|DIRETORIA|PECUARIA|PECUÁRIA/.test(text)) {
    return "ADMINISTRATIVO";
  }
  return text || "NÃO INFORMADO";
}

async function custosFuncionario(anomesInicio: string, anomesFim: string) {
  return withOracle(async (conn) => {
    const result = await conn.execute(
      `SELECT TO_CHAR(c.anomes) AS anomes,
              NVL(SUM(CASE WHEN c.tipo = 'O' THEN c.valor ELSE 0 END), 0) AS orcado,
              NVL(SUM(CASE WHEN c.tipo = 'R' THEN c.valor ELSE 0 END), 0) AS realizado
         FROM custo.lancamento_custo c
         JOIN custo.empenho emp
           ON emp.cod_empenho = c.cod_empenho
         JOIN custo.grupoempenho ge
           ON ge.cod_grupoempenho = emp.cod_grupoempenho
        WHERE c.anomes BETWEEN :anomesInicio AND :anomesFim
          AND c.tipo IN ('O', 'R')
          AND emp.cod_tipoempenho IN (1, 2)
          AND ge.cod_grupoempenho = 10
        GROUP BY TO_CHAR(c.anomes)
        ORDER BY TO_CHAR(c.anomes)`,
      { anomesInicio, anomesFim },
    );
    return (result.rows ?? []).map((raw) => ({
      anomes: oracleText(raw, "anomes", "ANOMES"),
      orcado: oracleNumber(raw, "orcado", "ORCADO") ?? 0,
      realizado: oracleNumber(raw, "realizado", "REALIZADO") ?? 0,
    }));
  });
}

async function funcionariosRealizados(anomesInicio: string, anomesFim: string) {
  return withOracle(async (conn) => {
    const result = await conn.execute(
      `SELECT TO_CHAR(anomes) AS anomes,
              NVL(desc_objetocusto, desc_departamento) AS descricao,
              COUNT(DISTINCT cod_funcionario) AS realizado
         FROM rh.view_informacoesfunc_mensal
        WHERE anomes BETWEEN :anomesInicio AND :anomesFim
          AND cod_grupoempresa = 1
          AND cod_empresa = 1
          AND cod_filial = 1
        GROUP BY TO_CHAR(anomes), NVL(desc_objetocusto, desc_departamento)
        ORDER BY TO_CHAR(anomes), NVL(desc_objetocusto, desc_departamento)`,
      { anomesInicio, anomesFim },
    );
    return (result.rows ?? []).map((raw) => ({
      anomes: oracleText(raw, "anomes", "ANOMES"),
      descricao: oracleText(raw, "descricao", "DESCRICAO") || "Não informado",
      realizado: oracleNumber(raw, "realizado", "REALIZADO") ?? 0,
    }));
  });
}

async function objetosSubempenhosFuncionarios(anomesInicio: string, anomesFim: string) {
  return withOracle(async (conn) => {
    const result = await conn.execute(
      `SELECT TO_CHAR(v.anomes) AS anomes,
              v.cod_objetocusto,
              NVL(v.desc_objetocusto, 'Objeto ' || v.cod_objetocusto) AS objeto_custo,
              oc.atividade AS cod_subempenho,
              sg.descricao AS subempenho,
              COUNT(DISTINCT v.cod_funcionario) AS quantidade
         FROM rh.view_informacoesfunc_mensal v
         LEFT JOIN rh.objetocusto oc
           ON oc.cod_objetocusto = TO_NUMBER(v.cod_objetocusto DEFAULT NULL ON CONVERSION ERROR)
         LEFT JOIN planejamento.subempgenerico sg
           ON sg.cod_subempenho = oc.atividade
        WHERE v.anomes BETWEEN :anomesInicio AND :anomesFim
          AND v.cod_grupoempresa = 1
          AND v.cod_empresa = 1
          AND v.cod_filial = 1
          AND v.cod_objetocusto IS NOT NULL
        GROUP BY TO_CHAR(v.anomes),
                 v.cod_objetocusto,
                 NVL(v.desc_objetocusto, 'Objeto ' || v.cod_objetocusto),
                 oc.atividade,
                 sg.descricao
        ORDER BY NVL(v.desc_objetocusto, 'Objeto ' || v.cod_objetocusto), TO_CHAR(v.anomes)`,
      { anomesInicio, anomesFim },
    );
    return (result.rows ?? []).map((raw) => ({
      anomes: oracleText(raw, "anomes", "ANOMES"),
      codObjetoCusto: oracleText(raw, "cod_objetocusto", "COD_OBJETOCUSTO"),
      objetoCusto: oracleText(raw, "objeto_custo", "OBJETO_CUSTO"),
      codSubempenho: oracleText(raw, "cod_subempenho", "COD_SUBEMPENHO"),
      subempenho: oracleText(raw, "subempenho", "SUBEMPENHO"),
      quantidade: oracleNumber(raw, "quantidade", "QUANTIDADE") ?? 0,
    }));
  });
}

function comparativoQuantidadeFuncionarios(
  months: string[],
  realizados: Awaited<ReturnType<typeof funcionariosRealizados>>,
) {
  const orcados = orcadoFuncionariosPorSubprocesso();
  const labels = new Map<string, string>();
  const values = new Map<string, { orcado: number[]; realizado: number[] }>();
  const ensure = (key: string, label: string) => {
    labels.set(key, labels.get(key) ?? label);
    if (!values.has(key)) {
      values.set(key, {
        orcado: Array.from({ length: months.length }, () => 0),
        realizado: Array.from({ length: months.length }, () => 0),
      });
    }
    return values.get(key)!;
  };

  for (const row of orcados) {
    const key = normalizeKey(row.descricao);
    const target = ensure(key, row.descricao);
    for (let i = 0; i < months.length; i += 1) target.orcado[i] += row.meses[i] ?? 0;
  }

  const monthIndex = new Map(months.map((anomes, index) => [anomes, index]));
  for (const row of realizados) {
    const index = monthIndex.get(row.anomes);
    if (index == null) continue;
    const label = categoriaFuncionario(row.descricao);
    const target = ensure(normalizeKey(label), label);
    target.realizado[index] += row.realizado;
  }

  const rows: RhQuantidadeLinha[] = [...values.entries()]
    .map(([key, row]) => ({
      key,
      descricao: labels.get(key) ?? key,
      meses: months.map((anomes, index) => ({
        anomes,
        label: monthLabel(anomes),
        orcado: row.orcado[index] ?? 0,
        realizado: row.realizado[index] ?? 0,
      })),
    }))
    .filter((row) => row.meses.some((mes) => mes.orcado || mes.realizado))
    .sort((a, b) => a.descricao.localeCompare(b.descricao, "pt-BR"));

  const totais = months.map((anomes, index) => ({
    anomes,
    label: monthLabel(anomes),
    orcado: rows.reduce((sum, row) => sum + (row.meses[index]?.orcado ?? 0), 0),
    realizado: rows.reduce((sum, row) => sum + (row.meses[index]?.realizado ?? 0), 0),
  }));

  return { meses: months.map((anomes) => ({ anomes, label: monthLabel(anomes) })), linhas: rows, totais };
}

function matrizObjetosSubempenhos(
  months: string[],
  rows: Awaited<ReturnType<typeof objetosSubempenhosFuncionarios>>,
) {
  const monthIndex = new Map(months.map((anomes, index) => [anomes, index]));
  const map = new Map<string, RhObjetoSubempenhoLinha>();
  for (const row of rows) {
    const index = monthIndex.get(row.anomes);
    if (index == null) continue;
    const codObjetoCusto = row.codObjetoCusto || "—";
    const codSubempenho = row.codSubempenho || "—";
    const objetoCusto = row.objetoCusto || `Objeto ${codObjetoCusto}`;
    const key = `${codObjetoCusto}|${codSubempenho}`;
    if (!map.has(key)) {
      map.set(key, {
        key,
        categoria: categoriaFuncionario(objetoCusto),
        codObjetoCusto,
        objetoCusto,
        codSubempenho,
        subempenho: row.subempenho || "Sem subempenho vinculado",
        meses: months.map((anomes) => ({ anomes, label: monthLabel(anomes), quantidade: 0 })),
        total: 0,
      });
    }
    const target = map.get(key)!;
    target.meses[index]!.quantidade += row.quantidade;
    target.total += row.quantidade;
  }
  return [...map.values()].sort((a, b) => {
    const byCategoria = a.categoria.localeCompare(b.categoria, "pt-BR");
    if (byCategoria) return byCategoria;
    return a.objetoCusto.localeCompare(b.objetoCusto, "pt-BR");
  });
}

function normalizeAnomes(value: unknown) {
  const text = String(value ?? "").replace(/\D/g, "");
  return /^\d{6}$/.test(text) ? text : null;
}

export async function gerarRecursosHumanos(params?: {
  safraId?: number | null;
  anomesInicio?: string | null;
  anomesFim?: string | null;
}) {
  const range = anomesRangeForSafra(params?.safraId);
  const anomesInicio = normalizeAnomes(params?.anomesInicio) ?? range.anomesInicio;
  const anomesFim = normalizeAnomes(params?.anomesFim) ?? range.anomesFim;
  const months = anomesList(anomesInicio, anomesFim);
  const [custos, funcionarios, objetosSubempenhos] = await Promise.all([
    custosFuncionario(anomesInicio, anomesFim),
    Promise.resolve(mensalFuncionarios()),
    objetosSubempenhosFuncionarios(anomesInicio, anomesFim),
  ]);
  const realizadosFuncionarios = await funcionariosRealizados(anomesInicio, anomesFim);
  const custoPorMes = new Map(custos.map((row) => [row.anomes, row]));
  const mensal: RhMes[] = months.map((anomes, index) => {
    const custo = custoPorMes.get(anomes);
    const qtd = funcionarios[index] ?? 0;
    const prev = index > 0 ? funcionarios[index - 1] ?? 0 : null;
    const orcado = money(custo?.orcado ?? 0);
    const realizado = money(custo?.realizado ?? 0);
    return {
      key: anomes,
      label: monthLabel(anomes),
      anomes,
      orcado,
      realizado,
      variacao: money(realizado - orcado),
      funcionarios: qtd,
      funcionariosDelta: prev == null ? null : qtd - prev,
    };
  });
  const totalOrcado = money(mensal.reduce((sum, row) => sum + row.orcado, 0));
  const totalRealizado = money(mensal.reduce((sum, row) => sum + row.realizado, 0));
  const totalFuncionariosMedio = mensal.length
    ? Math.round((mensal.reduce((sum, row) => sum + row.funcionarios, 0) / mensal.length) * 10) / 10
    : 0;
  return {
    safraId: range.safraId,
    safraCode: range.safraCode,
    anomesInicio,
    anomesFim,
    mensal,
    quantidadeFuncionarios: comparativoQuantidadeFuncionarios(months, realizadosFuncionarios),
    objetosSubempenhos: matrizObjetosSubempenhos(months, objetosSubempenhos),
    totais: {
      orcado: totalOrcado,
      realizado: totalRealizado,
      variacao: money(totalRealizado - totalOrcado),
      funcionariosMedio: totalFuncionariosMedio,
      funcionariosPico: Math.max(0, ...mensal.map((row) => row.funcionarios)),
    },
  };
}

export function registerRecursosHumanosRoutes(app: Express) {
  app.get("/api/recursos-humanos", async (req, res) => {
    try {
      const safraId = req.query.safraId != null ? Number(req.query.safraId) : null;
      res.json(await gerarRecursosHumanos({
        safraId: Number.isFinite(safraId) ? safraId : null,
        anomesInicio: normalizeAnomes(req.query.anomesInicio),
        anomesFim: normalizeAnomes(req.query.anomesFim),
      }));
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });
}
