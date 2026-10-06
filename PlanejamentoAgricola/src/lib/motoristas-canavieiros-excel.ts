export function valorLinha(producao: number, preco: number | null | undefined) {
  if (preco == null || !Number.isFinite(preco) || !Number.isFinite(producao)) return null;
  return producao * preco;
}

export function valorEquipamento(total: number, percentual: number) {
  if (!Number.isFinite(total) || !Number.isFinite(percentual)) return 0;
  return total * (percentual / 100);
}

export function valorFolguista(subtotalMotoristas: number, percentual: number) {
  if (!Number.isFinite(subtotalMotoristas) || !Number.isFinite(percentual)) return 0;
  if (!(percentual > 0) || percentual >= 100) return 0;
  return subtotalMotoristas * (percentual / (100 - percentual));
}

export type MotoristasExcelFazenda = {
  fazenda: string;
  producao: number;
  raio: number | null;
  preco: number | null;
};

export type MotoristasExcelEquipamento = {
  equipTag: string;
  frota: string | null;
  toneladaColhida: number;
  fazendas: MotoristasExcelFazenda[];
};

export type MotoristasExcelPessoa = {
  matricula: string;
  nome: string;
};

export type MotoristasExcelGrupoEquipamento = {
  equipTag: string;
  percentual: number;
  producao: number;
  totalFinanceiro: number;
  lookupTags: string[];
  motoristas: MotoristasExcelPessoa[];
};

export type MotoristasExcelGrupo = {
  equipamentos: MotoristasExcelGrupoEquipamento[];
  folguistas: MotoristasExcelPessoa[];
  folguistaPercentual: number;
};

export type MotoristasExcelInput = {
  dataInicio: string | null;
  dataFim: string | null;
  equipamentos: MotoristasExcelEquipamento[];
  grupos: MotoristasExcelGrupo[];
};

export type MotoristasExcelCell = {
  col: number;
  value: number | string | null;
  formula: string | null;
};

export type MotoristasExcelWorkbook = {
  xml: string;
  rows: MotoristasExcelCell[][];
};

const BORDERS = `<Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/></Borders>`;

const FAZENDA_HEADERS = [
  "MOTORISTA",
  "COD. USINA",
  "FROTA",
  "FAZENDA",
  "PRODUÇÃO (TON)",
  "RAIO MÉDIO",
  "VALOR / RAIO",
  "TOTAL",
  "DISP(%)",
  "COMBUSTÍVEL (KM/LT)",
  "LÍQUIDO À RECEBER",
];

const GRUPO_HEADERS = ["FROTA", "MATRICULA", "MOTORISTA", "PRODUÇÃO (TON)", "%", "VALOR TOTAL", "AÇÕES"];

function tagsOf(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return [];
  const key = /^\d+$/.test(raw) ? String(Number(raw)) : raw;
  const parts = key
    .split(/[-\s/]+/)
    .map((part) => (/^\d+$/.test(part) ? String(Number(part)) : part.trim()))
    .filter(Boolean);
  return [...new Set([key, ...parts])];
}

function formatPeriodo(iso: string | null | undefined) {
  if (!iso) return "-";
  const date = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("pt-BR");
}

function formatXmlNumber(value: number) {
  if (!Number.isFinite(value) || Object.is(value, -0)) return "0";
  const text = value.toFixed(10).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  return text === "-0" ? "0" : text;
}

function escapeXml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function r1c1(row: number, col: number) {
  return `R${row}C${col}`;
}

type CellDraft = {
  style: string;
  value?: number | string | null;
  formula?: string | null;
  mergeAcross?: number;
};

type PlacedCell = MotoristasExcelCell & { style: string; mergeAcross: number };

function placeRow(cells: CellDraft[]): PlacedCell[] {
  let col = 1;
  return cells.map((cell) => {
    const placed: PlacedCell = {
      col,
      style: cell.style,
      value: cell.value ?? null,
      formula: cell.formula ?? null,
      mergeAcross: cell.mergeAcross ?? 0,
    };
    col += 1 + placed.mergeAcross;
    return placed;
  });
}

function cellXml(cell: PlacedCell) {
  const attrs = [`ss:Index="${cell.col}"`, `ss:StyleID="${cell.style}"`];
  if (cell.mergeAcross > 0) attrs.push(`ss:MergeAcross="${cell.mergeAcross}"`);
  if (cell.formula) attrs.push(`ss:Formula="${escapeXml(cell.formula)}"`);
  if (typeof cell.value === "number" && Number.isFinite(cell.value)) {
    return `<Cell ${attrs.join(" ")}><Data ss:Type="Number">${formatXmlNumber(cell.value)}</Data></Cell>`;
  }
  if (typeof cell.value === "string") {
    return `<Cell ${attrs.join(" ")}><Data ss:Type="String">${escapeXml(cell.value)}</Data></Cell>`;
  }
  return `<Cell ${attrs.join(" ")}/>`;
}

function linhasDoEquipamento(item: MotoristasExcelEquipamento): MotoristasExcelFazenda[] {
  if (item.fazendas.length) return item.fazendas;
  return [{ fazenda: "SEM FAZENDA", producao: item.toneladaColhida, raio: null, preco: null }];
}

function totalFinanceiroLinhas(linhas: MotoristasExcelFazenda[]) {
  return linhas.reduce((sum, row) => sum + (valorLinha(row.producao, row.preco) ?? 0), 0);
}

export function buildMotoristasCanavieirosWorkbook(input: MotoristasExcelInput): MotoristasExcelWorkbook {
  const rows: PlacedCell[][] = [];
  const push = (cells: CellDraft[]) => {
    const placed = placeRow(cells);
    rows.push(placed);
    return rows.length;
  };
  const blank = () => {
    rows.push([]);
    return rows.length;
  };

  const text = (value: string, style = "text", mergeAcross = 0): CellDraft => ({ style, value, mergeAcross });
  const empty = (style = "text"): CellDraft => ({ style });
  const num = (value: number | null, style = "num", formula: string | null = null): CellDraft =>
    value == null ? { style, formula } : { style, value, formula };
  const header = (labels: string[]) => labels.map((label) => text(label, "header"));

  push([text("PRODUÇÃO DOS MOTORISTAS CANAVIEIROS", "title", 10)]);
  push([
    text(
      `${formatPeriodo(input.dataInicio)} A ${formatPeriodo(input.dataFim)}`,
      "subtitle",
      10,
    ),
  ]);
  blank();

  const totaisPorTag = new Map<string, Array<{ total: number; ref: string }>>();
  const registrarTotal = (tag: string | null | undefined, total: number, ref: string) => {
    for (const key of tagsOf(tag)) {
      const lista = totaisPorTag.get(key) ?? [];
      lista.push({ total, ref });
      totaisPorTag.set(key, lista);
    }
  };

  for (const item of input.equipamentos) {
    const linhas = linhasDoEquipamento(item);
    const frota = item.frota || item.equipTag || "-";
    push(header(FAZENDA_HEADERS));
    const primeiraLinha = rows.length + 1;
    for (const [index, row] of linhas.entries()) {
      const linha = push([]);
      const valor = valorLinha(row.producao, row.preco);
      const formulaTotal = valor == null ? null : `=${r1c1(linha, 5)}*${r1c1(linha, 7)}`;
      rows[linha - 1] = placeRow([
        empty(),
        text(index === 0 ? item.equipTag || "-" : ""),
        text(index === 0 ? frota : ""),
        text(row.fazenda || "SEM FAZENDA"),
        num(row.producao),
        num(row.raio),
        num(row.preco),
        num(valor, "num", formulaTotal),
        empty(),
        empty(),
        num(valor, "num", valor == null ? null : `=${r1c1(linha, 8)}`),
      ]);
    }
    const ultimaLinha = rows.length;
    const totalProducao = linhas.reduce((sum, row) => sum + (Number.isFinite(row.producao) ? row.producao : 0), 0);
    const totalFinanceiro = totalFinanceiroLinhas(linhas);
    const totalRow = push([]);
    const mostraFinanceiro = totalFinanceiro > 0;
    const formulaProducao = `=SUM(${r1c1(primeiraLinha, 5)}:${r1c1(ultimaLinha, 5)})`;
    const formulaFinanceiro = `=SUM(${r1c1(primeiraLinha, 8)}:${r1c1(ultimaLinha, 8)})`;
    rows[totalRow - 1] = placeRow([
      text("TOTAL", "totalText", 3),
      num(totalProducao, "totalNum", formulaProducao),
      empty("totalText"),
      empty("totalText"),
      mostraFinanceiro ? num(totalFinanceiro, "totalNum", formulaFinanceiro) : empty("totalText"),
      empty("totalText"),
      empty("totalText"),
      mostraFinanceiro ? num(totalFinanceiro, "totalNum", `=${r1c1(totalRow, 8)}`) : empty("totalText"),
    ]);
    if (mostraFinanceiro) {
      const ref = r1c1(totalRow, 8);
      registrarTotal(item.equipTag, totalFinanceiro, ref);
      registrarTotal(item.frota, totalFinanceiro, ref);
      if (item.equipTag && item.frota) {
        registrarTotal(`${item.equipTag}-${item.frota}`, totalFinanceiro, ref);
        registrarTotal(`${item.frota}-${item.equipTag}`, totalFinanceiro, ref);
      }
    }
    blank();
  }

  const referenciaTotal = (tags: string[], total: number) => {
    for (const tag of tags) {
      for (const key of tagsOf(tag)) {
        const hit = (totaisPorTag.get(key) ?? []).find((item) => Math.abs(item.total - total) <= 0.02);
        if (hit) return hit.ref;
      }
    }
    return null;
  };

  const totaisGrupo: Array<{ producaoRef: string; valorRef: string; producao: number; valor: number }> = [];

  for (const grupo of input.grupos) {
    push(header(GRUPO_HEADERS));
    const motoristaValorRefs: string[] = [];
    let primeiraLinhaMotorista: number | null = null;
    let ultimaLinhaMotorista: number | null = null;
    for (const eq of grupo.equipamentos) {
      const motoristas = eq.motoristas.length ? eq.motoristas : [{ matricula: "", nome: "" }];
      const percentual = Number.isFinite(eq.percentual) ? eq.percentual : 0;
      const fracao = percentual / 100;
      const totalRef = referenciaTotal(eq.lookupTags.length ? eq.lookupTags : [eq.equipTag], eq.totalFinanceiro);
      const baseFormula = totalRef ?? formatXmlNumber(eq.totalFinanceiro);
      let primeiraPercentual: number | null = null;
      for (const [index, motorista] of motoristas.entries()) {
        const linha = push([]);
        if (primeiraLinhaMotorista == null) primeiraLinhaMotorista = linha;
        ultimaLinhaMotorista = linha;
        const percentualFormula = primeiraPercentual == null ? null : `=${r1c1(primeiraPercentual, 5)}`;
        if (primeiraPercentual == null) primeiraPercentual = linha;
        const valor = valorEquipamento(eq.totalFinanceiro, percentual);
        motoristaValorRefs.push(r1c1(linha, 6));
        rows[linha - 1] = placeRow([
          text(eq.equipTag || "-"),
          text(motorista.matricula),
          text(motorista.nome),
          index === 0 ? num(eq.producao) : empty(),
          num(fracao, "pct", percentualFormula),
          num(valor, "num", `=${baseFormula}*${r1c1(linha, 5)}`),
          empty(),
        ]);
      }
    }

    const subtotalMotoristas = grupo.equipamentos.reduce((sum, eq) => {
      const motoristas = eq.motoristas.length ? eq.motoristas.length : 1;
      return sum + valorEquipamento(eq.totalFinanceiro, eq.percentual) * motoristas;
    }, 0);
    const folga = valorFolguista(subtotalMotoristas, grupo.folguistaPercentual);
    const folguistas = grupo.folguistas.length ? grupo.folguistas : [{ matricula: "", nome: "" }];
    const valorPorFolguista = folguistas.length ? folga / folguistas.length : 0;
    const folguistaValido = grupo.folguistaPercentual > 0 && grupo.folguistaPercentual < 100;
    let primeiraFolguista: number | null = null;
    for (const [index, folguista] of folguistas.entries()) {
      const linha = push([]);
      if (primeiraFolguista == null) primeiraFolguista = linha;
      const somaMotoristas =
        primeiraLinhaMotorista != null && ultimaLinhaMotorista != null
          ? `SUM(${r1c1(primeiraLinhaMotorista, 6)}:${r1c1(ultimaLinhaMotorista, 6)})`
          : formatXmlNumber(subtotalMotoristas);
      const percentualRef = primeiraFolguista == null ? r1c1(linha, 5) : r1c1(primeiraFolguista, 5);
      const formula = folguistaValido ? `=${somaMotoristas}*${percentualRef}/(1-${percentualRef})/${folguistas.length}` : "=0";
      rows[linha - 1] = placeRow([
        text(index === 0 ? "FOLGUISTA" : ""),
        text(folguista.matricula),
        text(folguista.nome),
        empty(),
        index === 0 ? num(grupo.folguistaPercentual / 100, "pct") : empty(),
        num(valorPorFolguista, "num", formula),
        empty(),
      ]);
    }

    const producaoGrupo = grupo.equipamentos.reduce((sum, eq) => sum + (Number.isFinite(eq.producao) ? eq.producao : 0), 0);
    const valorGrupo = subtotalMotoristas + folga;
    const totalRow = push([]);
    const producaoFormula =
      primeiraLinhaMotorista != null && ultimaLinhaMotorista != null
        ? `=SUM(${r1c1(primeiraLinhaMotorista, 4)}:${r1c1(ultimaLinhaMotorista, 4)})`
        : "=0";
    const valorFormula = motoristaValorRefs.length
      ? `=SUM(${r1c1(primeiraLinhaMotorista ?? totalRow, 6)}:${r1c1(totalRow - 1, 6)})`
      : "=0";
    rows[totalRow - 1] = placeRow([
      text("TOTAL", "blueText", 2),
      num(producaoGrupo, "blueNum", producaoFormula),
      empty("blueText"),
      num(valorGrupo, "blueNum", valorFormula),
      empty("blueText"),
    ]);
    totaisGrupo.push({
      producaoRef: r1c1(totalRow, 4),
      valorRef: r1c1(totalRow, 6),
      producao: producaoGrupo,
      valor: valorGrupo,
    });
    blank();
  }

  const producaoGeral = totaisGrupo.reduce((sum, row) => sum + row.producao, 0);
  const valorGeral = totaisGrupo.reduce((sum, row) => sum + row.valor, 0);
  push([
    text("TOTAL GERAL", "blueText", 2),
    num(producaoGeral, "blueNum", totaisGrupo.length ? `=${totaisGrupo.map((row) => row.producaoRef).join("+")}` : "=0"),
    empty("blueText"),
    num(valorGeral, "blueNum", totaisGrupo.length ? `=${totaisGrupo.map((row) => row.valorRef).join("+")}` : "=0"),
    empty("blueText"),
  ]);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet" xmlns:html="http://www.w3.org/TR/REC-html40">
<Styles>
<Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Center"/><Font ss:FontName="Arial" ss:Size="10"/></Style>
<Style ss:ID="title"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Font ss:FontName="Arial" ss:Size="14" ss:Bold="1"/></Style>
<Style ss:ID="subtitle"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Font ss:FontName="Arial" ss:Size="10" ss:Bold="1"/></Style>
<Style ss:ID="header"><Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/><Font ss:FontName="Arial" ss:Size="10" ss:Bold="1"/>${BORDERS}<Interior ss:Color="#FFFF00" ss:Pattern="Solid"/></Style>
<Style ss:ID="text"><Alignment ss:Vertical="Center"/><Font ss:FontName="Arial" ss:Size="10"/>${BORDERS}</Style>
<Style ss:ID="num"><Alignment ss:Horizontal="Right" ss:Vertical="Center"/><Font ss:FontName="Arial" ss:Size="10"/>${BORDERS}<NumberFormat ss:Format="#,##0.00"/></Style>
<Style ss:ID="pct"><Alignment ss:Horizontal="Right" ss:Vertical="Center"/><Font ss:FontName="Arial" ss:Size="10"/>${BORDERS}<NumberFormat ss:Format="0.00%"/></Style>
<Style ss:ID="totalText"><Alignment ss:Horizontal="Right" ss:Vertical="Center"/><Font ss:FontName="Arial" ss:Size="10" ss:Bold="1"/>${BORDERS}<Interior ss:Color="#FFFF00" ss:Pattern="Solid"/></Style>
<Style ss:ID="totalNum"><Alignment ss:Horizontal="Right" ss:Vertical="Center"/><Font ss:FontName="Arial" ss:Size="10" ss:Bold="1"/>${BORDERS}<Interior ss:Color="#FFFF00" ss:Pattern="Solid"/><NumberFormat ss:Format="#,##0.00"/></Style>
<Style ss:ID="blueText"><Alignment ss:Horizontal="Right" ss:Vertical="Center"/><Font ss:FontName="Arial" ss:Size="10" ss:Bold="1" ss:Color="#FFFFFF"/>${BORDERS}<Interior ss:Color="#08245C" ss:Pattern="Solid"/></Style>
<Style ss:ID="blueNum"><Alignment ss:Horizontal="Right" ss:Vertical="Center"/><Font ss:FontName="Arial" ss:Size="10" ss:Bold="1" ss:Color="#FFFFFF"/>${BORDERS}<Interior ss:Color="#08245C" ss:Pattern="Solid"/><NumberFormat ss:Format="#,##0.00"/></Style>
</Styles>
<Worksheet ss:Name="Motoristas">
<Table>
<Column ss:Width="110"/><Column ss:Width="100"/><Column ss:Width="160"/><Column ss:Width="180"/><Column ss:Width="120"/><Column ss:Width="100"/><Column ss:Width="110"/><Column ss:Width="120"/><Column ss:Width="80"/><Column ss:Width="130"/><Column ss:Width="140"/>
${rows
  .map((row) => (row.length ? `<Row>${row.map(cellXml).join("")}</Row>` : "<Row/>"))
  .join("")}
</Table>
</Worksheet>
</Workbook>`;

  return {
    xml,
    rows: rows.map((row) => row.map(({ col, value, formula }) => ({ col, value, formula }))),
  };
}
