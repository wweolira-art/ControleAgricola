import type { ContractPendingPaymentReportRow } from "../api";

function escapeHtml(value: string | number | null): string {
  return String(value ?? "—").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

export function contractPaymentsPrintHtml(rows: ContractPendingPaymentReportRow[], now = new Date()): string {
  const generated = now.toLocaleString("pt-BR", { timeZone: "America/Fortaleza" });
  const body = rows.map((row) => `<tr>${[
    row.contratoJatoba, row.empresa || "—", row.vencimento?.replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$3/$2/$1") ?? "—",
    row.parcela, row.gef || "—", row.local || "—",
  ].map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("");
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Pagamentos pendentes — Contratos</title>
  <style>
    @page { size: A4 landscape; margin: 12mm; }
    body { margin: 24px; color: #142b45; font: 12px Arial, sans-serif; }
    h1 { color: #0d3f73; font-size: 21px; margin: 0 0 8px; }
    p { margin: 6px 0 16px; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th, td { border: 1px solid #9aafc5; padding: 8px; text-align: left; overflow-wrap: anywhere; }
    th { background: #e8f1fb; color: #0d3f73; }
    th:nth-child(1) { width: 12%; } th:nth-child(2) { width: 20%; } th:nth-child(3) { width: 14%; }
    th:nth-child(4) { width: 7%; } th:nth-child(5) { width: 9%; } th:nth-child(6) { width: 26%; }
    thead { display: table-header-group; } tr { break-inside: avoid; }
    @media print { body { margin: 0; } }
  </style></head><body><h1>Pagamentos pendentes</h1>
  <p>Consulta ao ERP em ${escapeHtml(generated)} · ${rows.length} parcela(s) pendente(s)</p>
  <table><thead><tr><th>Contrato Jatobá</th><th>Empresa</th><th>Data de vencimento</th><th>Parcela</th><th>G.E.F.</th><th>Local</th></tr></thead>
  <tbody>${body || '<tr><td colspan="6">Nenhuma parcela pendente encontrada.</td></tr>'}</tbody></table></body></html>`;
}
