type OperadorResumo = {
  codigo: string; descricao: string; viagens: number; toneladas: number;
  distribuicao: number; apontamentos: number;
};

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[c]!);
const numero = (value: number, digits = 3) => value.toLocaleString("pt-BR", { maximumFractionDigits: digits });
const percentual = (value: number) => value.toLocaleString("pt-BR", { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function producaoOperadorPrintHtml(params: {
  grupo: string; periodo: string; filtros: string; pesoLiquido: number; baseLabel?: string; funcionarios: OperadorResumo[];
}, now = new Date()) {
  const { funcionarios } = params;
  const total = (key: "viagens" | "toneladas" | "distribuicao" | "apontamentos") => funcionarios.reduce((sum, row) => sum + row[key], 0);
  const cells = (values: string[]) => values.map((value, i) => `<td${i > 1 ? ' class="num"' : ""}>${escapeHtml(value)}</td>`).join("");
  const rows = funcionarios.map((row) => `<tr>${cells([
    row.codigo, row.descricao || "—", numero(row.viagens, 2), numero(row.toneladas),
    percentual(row.distribuicao), numero(row.apontamentos, 0),
  ])}</tr>`).join("");
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Resumo de viagens — ${escapeHtml(params.grupo)}</title>
  <style>
  @page{size:A4 landscape;margin:12mm}body{font:12px Arial,sans-serif;color:#0c2a4d;margin:20px}
  h1{font-size:20px;margin:0 0 10px}p{margin:6px 0;line-height:1.5}
  table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #b8c6d6;padding:7px;text-align:left;overflow-wrap:anywhere}
  th{background:#eef3f8}td.num,th.num{text-align:right;white-space:nowrap}thead{display:table-header-group}
  tfoot{display:table-row-group;font-weight:bold;background:#eef3f8}tr{break-inside:avoid}
  .nota{font-size:10px;margin-top:12px}@media print{body{margin:0}}
  </style></head><body>
  <h1>Resumo de viagens — ${escapeHtml(params.grupo)}</h1>
  <p>Período: ${escapeHtml(params.periodo)}</p>
  ${params.filtros ? `<p>Filtros: ${escapeHtml(params.filtros)}</p>` : ""}
  <p>${escapeHtml(params.baseLabel ?? "Peso líquido (t)")}: <strong>${numero(params.pesoLiquido)}</strong> · ${funcionarios.length} operador(es)</p>
  <table><thead><tr><th>Cód. funcionário</th><th>Funcionário</th><th class="num">Viagens</th><th class="num">Toneladas</th><th class="num">Distribuição (%)</th><th class="num">Apontamentos</th></tr></thead>
  <tbody>${rows || '<tr><td colspan="6">Nenhum operador encontrado.</td></tr>'}</tbody>
  <tfoot><tr>${cells(["Total", "", numero(total("viagens"), 2), numero(total("toneladas")), percentual(total("distribuicao")), numero(total("apontamentos"), 0)])}</tr></tfoot></table>
  <p class="nota">Distribuição = toneladas do operador ÷ total das colhedeiras de cana no período.</p>
  <p class="nota">Emitido em ${escapeHtml(now.toLocaleString("pt-BR", { timeZone: "America/Fortaleza" }))}</p>
  </body></html>`;
}
