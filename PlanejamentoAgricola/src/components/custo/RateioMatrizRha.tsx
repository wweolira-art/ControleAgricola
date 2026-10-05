import { Fragment, useState } from "react";
import type { CustoMatrizSubprocessoData } from "../../api";
import { formatBRL } from "../../lib/format";
import { PrintButton } from "../PrintButton";

const COL_FILL: Record<string, { bg: string; color: string }> = {
  preparo: { bg: "#e3e9ef", color: "#1a2744" },
  plantio: { bg: "#e3e9ef", color: "#1a2744" },
  tratos_planta: { bg: "#e3e9ef", color: "#1a2744" },
  formacao: { bg: "#b8d88a", color: "#142018" },
  tratos_soca: { bg: "#1a2744", color: "#ffffff" },
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cellStyle(opts: { bg: string; color: string; align?: "left" | "right"; bold?: boolean }) {
  const parts = [
    `background:${opts.bg}`,
    `color:${opts.color}`,
    "border:1px solid #b8c2ce",
    "padding:5px 8px",
    `text-align:${opts.align ?? "right"}`,
    "white-space:nowrap",
    "font-family:Calibri,Arial,sans-serif",
    "font-size:11pt",
  ];
  if (opts.bold) parts.push("font-weight:700");
  return parts.join(";");
}

function fillFor(colKey: string, rowKind: "normal" | "total" | "subtotal") {
  if (colKey === "tratos_soca" && rowKind !== "normal") {
    return { bg: "#c8d2de", color: "#000000" };
  }
  if (rowKind === "total") return { bg: "#d5dde8", color: "#000000" };
  if (rowKind === "subtotal") return { bg: "#eef2f7", color: "#000000" };
  return COL_FILL[colKey] ?? { bg: "#ffffff", color: "#1a2744" };
}

function buildMatrizCopyHtml(
  data: CustoMatrizSubprocessoData,
  modo: ModoExibicao,
  modoLabel: string,
) {
  const { colunas, linhas } = data;
  const th = (text: string, style: string, extra = "") =>
    `<th ${extra} style="${style}">${escapeHtml(text)}</th>`;
  const td = (text: string, style: string) => `<td style="${style}">${escapeHtml(text)}</td>`;

  const head1 = [
    th(modoLabel, cellStyle({ bg: "#dfe5ec", color: "#1a2744", align: "left", bold: true }), 'rowspan="2"'),
    ...colunas.map((col) => {
      const fill = COL_FILL[col.key] ?? { bg: "#dfe5ec", color: "#1a2744" };
      return th(col.label, cellStyle({ ...fill, align: "center", bold: true }), 'colspan="2"');
    }),
  ].join("");

  const head2 = colunas
    .flatMap((col) => {
      const fill = COL_FILL[col.key] ?? { bg: "#dfe5ec", color: "#1a2744" };
      const style = cellStyle({ ...fill, align: "center", bold: true });
      return [th(modoLabel, style), th("%", style)];
    })
    .join("");

  const body = linhas
    .map((row) => {
      const kind =
        row.tipo === "total" ? "total" : row.tipo === "subtotal" ? "subtotal" : "normal";
      const bold = kind !== "normal";
      const labelFill =
        kind === "total" ? { bg: "#d5dde8", color: "#000000" } : kind === "subtotal" ? { bg: "#eef2f7", color: "#000000" } : { bg: "#ffffff", color: "#1a2744" };
      const cells = colunas.flatMap((col) => {
        const cell = row.celulas[col.key];
        const hasValue = kind === "total" || (cell?.valor ?? 0) > 0.005;
        const mainValue =
          modo === "valor" ? formatBRL(cell?.valor ?? 0) : fmtRha(cell?.rHa);
        const fill = fillFor(col.key, kind);
        const style = cellStyle({ ...fill, bold });
        return [td(hasValue ? mainValue : "—", style), td(hasValue ? fmtPct(cell?.pct) : "—", style)];
      });
      return `<tr>${td(row.label, cellStyle({ ...labelFill, align: "left", bold }))}${cells.join("")}</tr>`;
    })
    .join("");

  const footCells = colunas.flatMap((col) => {
    const fill = fillFor(col.key, "total");
    const style = cellStyle({ ...fill, bold: true });
    const value = modo === "valor" ? formatBRL(col.total ?? 0) : fmtRha(col.rHaTotal);
    return [th(value, style), th("100%", style)];
  });
  const foot = `<tr>${th(
    `Total ${modo === "valor" ? "R$" : "R$/ha"} (rateio)`,
    cellStyle({ bg: "#c8d2de", color: "#000000", align: "left", bold: true }),
  )}${footCells.join("")}</tr>`;

  return `<table cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-family:Calibri,Arial,sans-serif">${`<thead><tr>${head1}</tr><tr>${head2}</tr></thead><tbody>${body}</tbody><tfoot>${foot}</tfoot>`}</table>`;
}

function buildMatrizCopyText(
  data: CustoMatrizSubprocessoData,
  modo: ModoExibicao,
  modoLabel: string,
) {
  const { colunas, linhas } = data;
  const header = [
    modoLabel,
    ...colunas.flatMap((col) => [`${col.label} ${modoLabel}`, `${col.label} %`]),
  ];
  const rows = linhas.map((row) => {
    const kind = row.tipo === "total" ? "total" : "item";
    return [
      row.label,
      ...colunas.flatMap((col) => {
        const cell = row.celulas[col.key];
        const hasValue = kind === "total" || (cell?.valor ?? 0) > 0.005;
        const mainValue =
          modo === "valor" ? formatBRL(cell?.valor ?? 0) : fmtRha(cell?.rHa);
        return [hasValue ? mainValue : "—", hasValue ? fmtPct(cell?.pct) : "—"];
      }),
    ];
  });
  const foot = [
    `Total ${modo === "valor" ? "R$" : "R$/ha"} (rateio)`,
    ...colunas.flatMap((col) => [
      modo === "valor" ? formatBRL(col.total ?? 0) : fmtRha(col.rHaTotal),
      "100%",
    ]),
  ];
  return [header, ...rows, foot].map((line) => line.join("\t")).join("\r\n");
}

async function copyHtmlForOffice(html: string, plain: string) {
  try {
    if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([plain], { type: "text/plain" }),
        }),
      ]);
      return;
    }
  } catch {
    // Office no Windows costuma colar melhor o HTML via seleção + execCommand.
  }
  const holder = document.createElement("div");
  holder.setAttribute("contenteditable", "true");
  holder.style.position = "fixed";
  holder.style.left = "-9999px";
  holder.style.top = "0";
  holder.innerHTML = html;
  document.body.appendChild(holder);
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(holder);
  selection?.removeAllRanges();
  selection?.addRange(range);
  const ok = document.execCommand("copy");
  selection?.removeAllRanges();
  holder.remove();
  if (!ok) throw new Error("Não foi possível copiar a tabela.");
}

type Props = {
  data: CustoMatrizSubprocessoData;
  printMeta?: string;
};

type ModoExibicao = "valor" | "rha";

function fmtRha(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(n);
}

function fmtPct(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(n)}%`;
}

function fmtHa(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "0";
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(n);
}

const COL_CLASS: Record<string, string> = {
  preparo: "matriz-col-preparo",
  plantio: "matriz-col-plantio",
  tratos_planta: "matriz-col-tratos-planta",
  formacao: "matriz-col-formacao",
  tratos_soca: "matriz-col-tratos-soca",
};

export function RateioMatrizRha({ data, printMeta }: Props) {
  const [modo, setModo] = useState<ModoExibicao>("rha");
  const [copyState, setCopyState] = useState<"idle" | "ok" | "err">("idle");
  const { colunas, linhas, hectareas, fontesUnidades, resumo } = data;
  const modoLabel = modo === "valor" ? "R$" : "R$/ha";

  const copyTable = async () => {
    try {
      await copyHtmlForOffice(
        buildMatrizCopyHtml(data, modo, modoLabel),
        buildMatrizCopyText(data, modo, modoLabel),
      );
      setCopyState("ok");
    } catch {
      setCopyState("err");
    }
    window.setTimeout(() => setCopyState("idle"), 2500);
  };

  return (
    <section className="panel matriz-rha-panel">
      <div className="matriz-rha-head">
        <div>
          <h3>
            Rateio por subprocesso (Cana)
            <span className="panel-h3-actions">
              <button
                type="button"
                className="btn no-print"
                onClick={() => void copyTable()}
                title="Copia a tabela para colar no PowerPoint ou Excel"
              >
                {copyState === "ok" ? "Copiada" : copyState === "err" ? "Falhou" : "Copiar tabela"}
              </button>
              <PrintButton />
            </span>
          </h3>
          {printMeta ? <p className="print-only-meta">{printMeta}</p> : null}
          <p className="lead" style={{ marginTop: 0 }}>
            Colunas = subprocessos que receberam o rateio. <strong>Operação</strong> agrega três linhas:{" "}
            <strong>Irrigação/Fertirrigação</strong> (proc 4), <strong>Máquina</strong> (equipamento,
            transportes, manutenção, materiais/consumo, combustíveis, aluguéis operacionais) e{" "}
            <strong>Mão de obra</strong> (grupos 10, 19 e 22). Insumos = empenhos do grupo 24. Em{" "}
            <strong>R$/ha</strong>, preparo, plantio, tratos planta e formação usam a coluna Área de{" "}
            <code>automotivo.itens_apontamento</code> (operação 41). Tratos soca usa a área de{" "}
            <code>agricola.apontamentoitem</code> nas operações M13, M56, M80 e M342.{" "}
            <strong>Formação</strong> = preparo + plantio + tratos planta + colheita de mudas (sem centro
            próprio).
          </p>
        </div>
        <div className="kind-toggle matriz-rha-toggle no-print">
          <button
            type="button"
            className={`btn ${modo === "valor" ? "primary" : ""}`}
            onClick={() => setModo("valor")}
          >
            R$
          </button>
          <button
            type="button"
            className={`btn ${modo === "rha" ? "primary" : ""}`}
            onClick={() => setModo("rha")}
          >
            R$/ha
          </button>
        </div>
      </div>

      <div className="matriz-rha-meta print-meta-inline">
        {colunas.map((col) => {
          const fonte = fontesUnidades?.[col.key];
          const sheetLabel = fonte?.sheetTitle ?? fonte?.sheetName ?? col.sheetName ?? "—";
          const formacaoHint =
            col.key === "formacao"
              ? " · soma preparo + plantio + tratos planta + colheita de mudas"
              : col.key === "tratos_soca"
                ? " · proc 2 + colheita proc 3 (cana soca)"
                : "";
          return (
            <span key={col.key}>
              <strong>{col.label}</strong> ({sheetLabel}): {fmtHa(col.hectareas)} ha
              {formacaoHint}
              {fonte && !fonte.configurado && col.key !== "formacao" ? " · sem fonte Un realizado" : null}
            </span>
          );
        })}
        <span>
          <strong>Pool:</strong> {formatBRL(resumo?.totalPool ?? 0)}
        </span>
        {(resumo?.totalForaMatriz ?? 0) > 1 ? (
          <span>
            <strong>Fora das colunas:</strong> {formatBRL(resumo?.totalForaMatriz ?? 0)}
          </span>
        ) : null}
      </div>

      <div className="table-wrap matriz-rha-wrap">
        <table className="data matriz-rha">
          <thead>
            <tr>
              <th rowSpan={2} className="matriz-row-label">
                {modoLabel}
              </th>
              {colunas.map((col) => (
                <th
                  key={col.key}
                  colSpan={2}
                  className={`matriz-col-head ${COL_CLASS[col.key] ?? ""}`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
            <tr>
              {colunas.flatMap((col) => [
                <th key={`${col.key}-v`} className={`num ${COL_CLASS[col.key] ?? ""}`}>
                  {modoLabel}
                </th>,
                <th key={`${col.key}-p`} className={`num ${COL_CLASS[col.key] ?? ""}`}>
                  %
                </th>,
              ])}
            </tr>
          </thead>
          <tbody>
            {linhas.map((row) => {
              const isTotal = row.tipo === "total";
              const isSubtotal = row.tipo === "subtotal";
              const isIrrigacao = row.grupo === "irrigacao";
              const cls = isTotal
                ? "matriz-total"
                : isSubtotal
                  ? "matriz-subtotal"
                  : isIrrigacao
                    ? "matriz-row-irrigacao"
                    : "";
              return (
                <Fragment key={row.chave}>
                  <tr className={cls}>
                    <td
                      className="matriz-row-label"
                      style={{ paddingLeft: 8 + (row.indent ?? 0) * 16 }}
                    >
                      {row.label}
                    </td>
                    {colunas.flatMap((col) => {
                      const cell = row.celulas[col.key];
                      const hasValue = isTotal || (cell?.valor ?? 0) > 0.005;
                      const mainValue =
                        modo === "valor"
                          ? formatBRL(cell?.valor ?? 0)
                          : fmtRha(cell?.rHa);
                      return [
                        <td key={`${row.chave}-${col.key}-v`} className={`num ${COL_CLASS[col.key] ?? ""}`}>
                          {hasValue ? mainValue : "—"}
                        </td>,
                        <td key={`${row.chave}-${col.key}-p`} className={`num ${COL_CLASS[col.key] ?? ""}`}>
                          {hasValue ? fmtPct(cell?.pct) : "—"}
                        </td>,
                      ];
                    })}
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th>Total {modo === "valor" ? "R$" : "R$/ha"} (rateio)</th>
              {colunas.flatMap((col) => [
                <th key={`ft-${col.key}-v`} className={`num ${COL_CLASS[col.key] ?? ""}`}>
                  {modo === "valor"
                    ? formatBRL(col.total ?? 0)
                    : fmtRha(col.rHaTotal)}
                </th>,
                <th key={`ft-${col.key}-p`} className={`num ${COL_CLASS[col.key] ?? ""}`}>
                  100%
                </th>,
              ])}
            </tr>
          </tfoot>
        </table>
      </div>

      <details className="matriz-rha-details no-print">
        <summary>Unidades por coluna (R$/ha)</summary>
        <ul style={{ margin: "8px 0 0", paddingLeft: 20, fontSize: 13 }}>
          {colunas.map((col) => {
            const fonte = fontesUnidades?.[col.key];
            if (!fonte) {
              return (
                <li key={col.key}>
                  <strong>{col.label}:</strong> {fmtHa(hectareas[col.key])} ha
                </li>
              );
            }
            const origem =
              fonte.configurado && fonte.sourceLabel
                ? `${fonte.sourceLabel}${fonte.metricLabel ? ` (${fonte.metricLabel})` : ""}`
                : fonte.nota ?? "Não configurado";
            return (
              <li key={col.key}>
                <strong>{col.label}</strong>
                {fonte.sheetTitle ? ` · ${fonte.sheetTitle}` : null}: {fmtHa(fonte.units ?? hectareas[col.key])}{" "}
                ha — {origem}
              </li>
            );
          })}
          {fontesUnidades?.colheita_mudas ? (
            <li>
              <strong>Colheita de mudas</strong>
              {fontesUnidades.colheita_mudas.sheetTitle
                ? ` · ${fontesUnidades.colheita_mudas.sheetTitle}`
                : null}
              : {fmtHa(fontesUnidades.colheita_mudas.units)} ha — compõe a coluna Formação (
              {fontesUnidades.colheita_mudas.configurado && fontesUnidades.colheita_mudas.sourceLabel
                ? fontesUnidades.colheita_mudas.sourceLabel
                : "configure CORTE SEMENTE em Un realizado"}
              )
            </li>
          ) : null}
        </ul>
      </details>
    </section>
  );
}
