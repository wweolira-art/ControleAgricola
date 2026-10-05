import { Chart } from "chart.js";

/** Resolução da imagem copiada — acima do DPI da tela para não embaçar no PowerPoint. */
const EXPORT_SCALE = 3;
const MAX_CANVAS_EDGE = 4096;
const HEADER_H = 22;
const HEADER_FONT = 11;
const LIST_COPY_LIMIT = 10;

type CssSize = { width: number; height: number };

function compactText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function isPrintable(node: Element) {
  return !node.closest(".no-print");
}

function visualTitle(root: HTMLElement) {
  const fromData = compactText(root.dataset.copyTitle || "");
  if (fromData) return fromData;
  const heading = [...root.querySelectorAll("h2, h3, h4")].find(isPrintable);
  return compactText(heading?.textContent || "");
}

function cssSizeOf(root: HTMLElement, box?: CssSize): CssSize {
  const rect = root.getBoundingClientRect();
  return {
    width: Math.max(48, box?.width ?? rect.width),
    height: Math.max(48, box?.height ?? rect.height),
  };
}

function makeCanvas(width: number, height: number) {
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.min(MAX_CANVAS_EDGE, Math.ceil(width)));
  out.height = Math.max(1, Math.min(MAX_CANVAS_EDGE, Math.ceil(height)));
  const ctx = out.getContext("2d");
  if (!ctx || !out.width || !out.height) throw new Error("Não foi possível copiar o visual.");
  return { out, ctx };
}

function visibleText(root: Element, selector: string) {
  for (const node of root.querySelectorAll(selector)) {
    if (!isPrintable(node)) continue;
    const text = compactText(node.textContent || "");
    if (text) return text;
  }
  return "";
}

function canvasToPngBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Não foi possível gerar a imagem."));
    }, "image/png");
  });
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    reader.readAsDataURL(blob);
  });
}

async function copyPngViaSelection(blob: Blob) {
  const dataUrl = await blobToDataUrl(blob);
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const w = image.naturalWidth;
  const h = image.naturalHeight;
  image.width = w;
  image.height = h;
  image.style.width = `${w}px`;
  image.style.height = `${h}px`;
  image.style.maxWidth = "none";
  const holder = document.createElement("div");
  holder.setAttribute("contenteditable", "true");
  holder.style.position = "fixed";
  holder.style.left = "0";
  holder.style.top = "0";
  holder.style.width = `${w}px`;
  holder.style.height = `${h}px`;
  holder.style.opacity = "0.01";
  holder.style.pointerEvents = "none";
  holder.style.zIndex = "-1";
  holder.appendChild(image);
  document.body.appendChild(holder);
  holder.focus();
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNode(image);
  selection?.removeAllRanges();
  selection?.addRange(range);
  const ok = document.execCommand("copy");
  selection?.removeAllRanges();
  holder.remove();
  if (!ok) throw new Error("Não foi possível copiar a imagem.");
}

/** Abre o clipboard ainda no clique; a imagem pode ficar pronta depois. */
async function copyPngFromProducer(produce: () => Blob | Promise<Blob>) {
  const blobPromise = Promise.resolve().then(produce);
  if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blobPromise })]);
      return;
    } catch {
      try {
        const blob = await blobPromise;
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        return;
      } catch {
        // Office no Windows às vezes só aceita a imagem pela seleção.
      }
    }
  }
  await copyPngViaSelection(await blobPromise);
}

function visibleCanvases(root: HTMLElement) {
  return [...root.querySelectorAll("canvas")].filter((canvas) => canvas.width > 0 && canvas.clientWidth > 0);
}

function paintHeader(ctx: CanvasRenderingContext2D, title: string, width: number, scale: number) {
  const headerH = HEADER_H * scale;
  ctx.fillStyle = "#0c2a4d";
  ctx.fillRect(0, 0, width, headerH);
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 ${HEADER_FONT * scale}px Calibri, Arial, sans-serif`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText(title, 10 * scale, headerH / 2);
  return headerH;
}

function redrawChart(chart: Chart) {
  chart.resize();
  chart.update("none");
}

function boostChartResolution(canvases: HTMLCanvasElement[]) {
  const restores: Array<() => void> = [];
  for (const canvas of canvases) {
    const chart = Chart.getChart(canvas);
    if (!chart) continue;
    const prev = chart.options.devicePixelRatio;
    try {
      chart.options.devicePixelRatio = EXPORT_SCALE;
      redrawChart(chart);
      restores.push(() => {
        try {
          chart.options.devicePixelRatio = prev;
          redrawChart(chart);
        } catch {
          /* ignore */
        }
      });
    } catch {
      /* ignore */
    }
  }
  return () => {
    for (const restore of restores) restore();
  };
}

function composeCanvasesImage(root: HTMLElement, title: string, box?: CssSize) {
  const canvases = visibleCanvases(root);
  if (!canvases.length) throw new Error("Visual sem gráfico.");
  const scale = EXPORT_SCALE;
  const pad = 16 * scale;
  const titleH = title ? HEADER_H * scale : 0;
  const rootRect = root.getBoundingClientRect();
  const boxes = canvases.map((canvas) => {
    const rect = canvas.getBoundingClientRect();
    const cssW = Math.max(rect.width, canvas.clientWidth, 1);
    const cssH = Math.max(rect.height, canvas.clientHeight, 1);
    return {
      canvas,
      x: (rect.left - rootRect.left) * scale,
      y: (rect.top - rootRect.top) * scale,
      w: cssW * scale,
      h: cssH * scale,
    };
  });
  const minX = Math.min(...boxes.map((item) => item.x));
  const minY = Math.min(...boxes.map((item) => item.y));
  const maxX = Math.max(...boxes.map((item) => item.x + item.w));
  const maxY = Math.max(...boxes.map((item) => item.y + item.h));
  const contentW = Math.max(1, maxX - minX);
  const contentH = Math.max(1, maxY - minY);
  const size = box ? cssSizeOf(root, box) : null;
  const { out, ctx } = makeCanvas(
    size ? size.width * EXPORT_SCALE : contentW + pad * 2,
    size ? size.height * EXPORT_SCALE : contentH + pad * 2 + titleH,
  );
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, out.width, out.height);
  if (title) paintHeader(ctx, title, out.width, size ? EXPORT_SCALE : scale);
  const areaX = pad;
  const areaY = titleH + pad;
  const areaW = out.width - pad * 2;
  const areaH = out.height - titleH - pad * 2;
  const fit = size ? Math.min(areaW / contentW, areaH / contentH) : 1;
  const offsetX = size ? areaX + (areaW - contentW * fit) / 2 : pad;
  const offsetY = size ? areaY + (areaH - contentH * fit) / 2 : titleH + pad;
  for (const item of boxes) {
    const dx = offsetX + (item.x - minX) * fit;
    const dy = offsetY + (item.y - minY) * fit;
    const dw = item.w * fit;
    const dh = item.h * fit;
    ctx.imageSmoothingEnabled = fit !== 1;
    if (fit !== 1) ctx.imageSmoothingQuality = "high";
    ctx.drawImage(item.canvas, dx, dy, dw, dh);
  }
  const overlay = root.querySelector(".lub-donut-center");
  const donutBox = boxes[0];
  if (overlay instanceof HTMLElement && donutBox) {
    const cx = offsetX + (donutBox.x - minX) * fit + (donutBox.w * fit) / 2;
    const cy = offsetY + (donutBox.y - minY) * fit + (donutBox.h * fit) / 2;
    const label = compactText(overlay.querySelector("small")?.textContent || "");
    const value = compactText(overlay.querySelector("strong")?.textContent || "");
    const unit = size ? EXPORT_SCALE : scale;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#0c1d4a";
    if (label) {
      ctx.font = `700 ${13 * unit * fit}px Calibri, Arial, sans-serif`;
      ctx.fillText(label, cx, cy - 16 * unit * fit);
    }
    if (value) {
      ctx.font = `700 ${28 * unit * fit}px Calibri, Arial, sans-serif`;
      ctx.fillText(value, cx, cy + 8 * unit * fit);
    }
  }
  return out;
}

function cssColor(value: string, fallback: string) {
  const raw = compactText(value);
  if (!raw || raw === "transparent" || /^rgba?\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)$/i.test(raw)) return fallback;
  return raw;
}

function cellPaint(cell: HTMLTableCellElement, row: HTMLTableRowElement) {
  const style = window.getComputedStyle(cell);
  const inHead = row.parentElement?.tagName === "THEAD";
  const title = row.classList.contains("indicador-ctt-title") || row.classList.contains("indicador-ctt-frente");
  const cols = row.classList.contains("indicador-ctt-cols");
  const meta = cell.classList.contains("indicador-ctt-meta");
  const ok = cell.classList.contains("indicador-ctt-tom--ok");
  const bad = cell.classList.contains("indicador-ctt-tom--bad");
  const darkHead = inHead && (title || (cell.tagName === "TH" && !cols && !meta));
  return {
    background: cssColor(
      style.backgroundColor,
      darkHead || (inHead && meta) ? "#0c2a4d" : cols || meta ? "#d6e6f7" : "#ffffff",
    ),
    color: ok
      ? "#15803d"
      : bad
        ? "#b91c1c"
        : cssColor(style.color, darkHead || (inHead && meta) ? "#ffffff" : "#12355c"),
  };
}

function cellCopyText(cell: HTMLTableCellElement) {
  const field = cell.querySelector("input, textarea");
  if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
    const value = field.value.trim();
    if (value) return value;
  }
  return compactText(cell.innerText || cell.textContent || "");
}

function composeTableImage(table: HTMLTableElement, title: string) {
  const measure = document.createElement("canvas").getContext("2d");
  const cells: Array<{
    cell: HTMLTableCellElement;
    row: HTMLTableRowElement;
    x: number;
    y: number;
    w: number;
    h: number;
    text: string;
    fontPx: number;
  }> = [];
  let contentW = Math.max(table.scrollWidth, table.offsetWidth, 48);
  let contentH = 0;
  for (const row of table.rows) {
    const rowH = Math.max(row.offsetHeight, 22);
    let x = 0;
    for (const cell of row.cells) {
      const text = cellCopyText(cell);
      const style = window.getComputedStyle(cell);
      const computed = parseFloat(style.fontSize) || 13;
      const fontPx = Math.max(15, computed);
      let w = Math.max(cell.offsetWidth, 1);
      if (measure && text && !cell.querySelector(".lub-dot")) {
        measure.font = `700 ${fontPx}px Calibri, Arial, sans-serif`;
        w = Math.max(w, Math.ceil(measure.measureText(text).width) + 16);
      }
      const h = Math.max(cell.offsetHeight, rowH);
      cells.push({ cell, row, x, y: contentH, w, h, text, fontPx });
      x += w;
    }
    contentW = Math.max(contentW, x);
    contentH += rowH;
  }
  contentH = Math.max(contentH, table.scrollHeight, table.offsetHeight, 48);
  const maxW = MAX_CANVAS_EDGE - 24;
  const maxH = MAX_CANVAS_EDGE - HEADER_H - 24;
  const scale = Math.max(1, Math.min(EXPORT_SCALE, maxW / contentW, maxH / contentH));
  const pad = 8 * scale;
  const headerH = title ? HEADER_H * scale : 0;
  const { out, ctx } = makeCanvas(contentW * scale + pad * 2, contentH * scale + headerH + pad * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, out.width, out.height);
  if (title) paintHeader(ctx, title, out.width, scale);
  for (const item of cells) {
    const x = pad + item.x * scale;
    const y = headerH + pad + item.y * scale;
    const w = item.w * scale;
    const h = item.h * scale;
    const paint = cellPaint(item.cell, item.row);
    ctx.fillStyle = paint.background;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "#c5d4e6";
    ctx.strokeRect(x, y, w, h);
    const dot = item.cell.querySelector(".lub-dot");
    if (dot instanceof HTMLElement) {
      const style = window.getComputedStyle(dot);
      const radius = Math.max(3.5 * scale, Math.min(w, h) * 0.28);
      ctx.beginPath();
      ctx.arc(x + w / 2, y + h / 2, radius, 0, Math.PI * 2);
      ctx.fillStyle = cssColor(style.backgroundColor, "#4eb5e8");
      ctx.fill();
      continue;
    }
    const text = item.text;
    if (!text) continue;
    const style = window.getComputedStyle(item.cell);
    const align =
      item.cell.classList.contains("num") || style.textAlign === "right"
        ? "right"
        : style.textAlign === "left"
          ? "left"
          : "center";
    ctx.fillStyle = paint.color;
    ctx.font = `700 ${item.fontPx * scale}px Calibri, Arial, sans-serif`;
    ctx.textBaseline = "middle";
    ctx.textAlign = align;
    ctx.fillText(
      text,
      align === "right" ? x + w - 8 * scale : align === "left" ? x + 8 * scale : x + w / 2,
      y + h / 2,
    );
  }
  return out;
}

function kpiCardsOf(root: HTMLElement) {
  const nested = [...root.querySelectorAll("article, .gm-kpi, .gm-cost-kpi, .tp-kpi, .lub-kpi")].filter((card) =>
    card.querySelector("strong"),
  );
  if (nested.length) return nested;
  if (root.matches("article, .gm-kpi, .gm-cost-kpi, .tp-kpi, .lub-kpi") && root.querySelector("strong")) return [root];
  return [];
}

function listRowsOf(root: HTMLElement) {
  return [...root.querySelectorAll(".gm-cost-percent, .gm-cost-frota-row, .gm-cost-component-row")];
}

function barPercent(el: Element | null) {
  if (!(el instanceof HTMLElement)) return 0;
  return Math.min(100, parseFloat(el.style.width || el.style.height) || 0);
}

function percentBarColor(row: Element) {
  if (row.classList.contains("gm-cost-percent--preventiva")) return "#ffc000";
  if (row.classList.contains("gm-cost-percent--preditiva")) return "#a6a6a6";
  if (row.classList.contains("gm-cost-percent--melhoria")) return "#ed7d31";
  return "#5b9bd5";
}

function composeConsumoKpiGrid(root: HTMLElement, title: string) {
  const cards = [...root.querySelectorAll(".consumo-kpi-card")];
  if (!cards.length) throw new Error("Nenhum visual para copiar.");
  const scale = EXPORT_SCALE;
  const cols = 2;
  const cardW = 156 * scale;
  const cardH = 104 * scale;
  const gap = 10 * scale;
  const pad = 14 * scale;
  const headerH = 32 * scale;
  const rows = Math.ceil(cards.length / cols);
  const out = document.createElement("canvas");
  out.width = Math.ceil(pad * 2 + cols * cardW + Math.max(cols - 1, 0) * gap);
  out.height = Math.ceil(headerH + pad + rows * cardH + Math.max(rows - 1, 0) * gap + pad);
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("Não foi possível copiar o visual.");
  ctx.fillStyle = "#243044";
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.fillStyle = "#f4f6f9";
  ctx.fillRect(0, 0, out.width, headerH);
  ctx.fillStyle = "#1a2138";
  ctx.font = `800 ${12 * scale}px Calibri, Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(title.toLocaleUpperCase("pt-BR"), out.width / 2, headerH / 2);
  cards.forEach((card, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = pad + col * (cardW + gap);
    const y = headerH + pad + row * (cardH + gap);
    ctx.fillStyle = "#d8dde6";
    if (typeof ctx.roundRect === "function") {
      ctx.beginPath();
      ctx.roundRect(x, y, cardW, cardH, 8 * scale);
      ctx.fill();
    } else {
      ctx.fillRect(x, y, cardW, cardH);
    }
    const value = compactText(card.querySelector("strong")?.textContent || "");
    const label = compactText(card.querySelector("span")?.textContent || "");
    ctx.textAlign = "center";
    ctx.fillStyle = "#1a2138";
    ctx.font = `800 ${22 * scale}px Calibri, Arial, sans-serif`;
    ctx.textBaseline = "middle";
    ctx.fillText(value, x + cardW / 2, y + cardH / 2 - 12 * scale);
    ctx.fillStyle = "#334155";
    ctx.font = `600 ${11 * scale}px Calibri, Arial, sans-serif`;
    ctx.fillText(label, x + cardW / 2, y + cardH / 2 + 18 * scale);
  });
  return out;
}

function composeKpiImage(root: HTMLElement, title: string, box?: CssSize) {
  const cards = kpiCardsOf(root);
  if (!cards.length) throw new Error("Nenhum visual para copiar.");
  const scale = EXPORT_SCALE;
  const size = cssSizeOf(root, box);
  const single = cards.length === 1 || Boolean(box);
  const cardW = (single ? size.width : 200) * scale;
  const gap = 8 * scale;
  const cardH = (single ? size.height : 110) * scale;
  const { out, ctx } = makeCanvas(
    single ? cardW : cards.length * cardW + Math.max(cards.length - 1, 0) * gap,
    cardH,
  );
  ctx.fillStyle = "#eef2f6";
  ctx.fillRect(0, 0, out.width, out.height);
  const targets = single ? [cards[0] ?? root] : cards;
  targets.forEach((card, index) => {
    const x = index * (cardW + gap);
    const y = 0;
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#c5d0de";
    ctx.lineWidth = Math.max(1, scale);
    ctx.fillRect(x, y, cardW, cardH);
    ctx.strokeRect(x + 0.5, y + 0.5, cardW - 1, cardH - 1);
    const label = visibleText(card, "span") || title;
    const value = visibleText(card, "strong") || compactText(card.querySelector("strong")?.textContent || "");
    const valuePx = Math.max(36, Math.min(52, cardH / scale * 0.46));
    ctx.textAlign = "center";
    ctx.fillStyle = "#1e4a8a";
    ctx.font = `700 ${12 * scale}px Calibri, Arial, sans-serif`;
    ctx.textBaseline = "top";
    ctx.fillText(label, x + cardW / 2, y + 10 * scale, cardW - 16 * scale);
    ctx.fillStyle = "#0c1d4a";
    ctx.font = `700 ${valuePx * scale}px Calibri, Arial, sans-serif`;
    ctx.textBaseline = "middle";
    ctx.fillText(value, x + cardW / 2, y + cardH * 0.62, cardW - 12 * scale);
  });
  return out;
}

function composeMonthColumnChart(root: HTMLElement, title: string, box?: CssSize) {
  const months = [...root.querySelectorAll(".gm-cost-month")];
  if (!months.length) throw new Error("Nenhum visual para copiar.");
  const scale = EXPORT_SCALE;
  const size = cssSizeOf(root, box);
  const { out, ctx } = makeCanvas(size.width * scale, size.height * scale);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, out.width, out.height);
  const headerH = title ? paintHeader(ctx, title, out.width, scale) : 0;
  const padX = 16 * scale;
  const padTop = 28 * scale;
  const padBottom = 28 * scale;
  const areaX = padX;
  const areaY = headerH + padTop;
  const areaW = out.width - padX * 2;
  const areaH = Math.max(40 * scale, out.height - headerH - padTop - padBottom);
  const colW = areaW / months.length;
  const barW = Math.min(34 * scale, Math.max(12 * scale, colW * 0.35));
  months.forEach((month, index) => {
    const bar = month.querySelector(".gm-cost-vbar") as HTMLElement | null;
    const pct = Math.max(4, barPercent(bar)) / 100;
    const barH = Math.max(4 * scale, areaH * pct);
    const cx = areaX + index * colW + colW / 2;
    const x = cx - barW / 2;
    const y = areaY + areaH - barH;
    ctx.fillStyle = "#08296b";
    ctx.fillRect(x, y, barW, barH);
    const value = visibleText(month, ".gm-cost-vbar span") || visibleText(month, "span");
    const label = visibleText(month, "small");
    ctx.fillStyle = "#111827";
    ctx.font = `700 ${10 * scale}px Calibri, Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(value, cx, y - 4 * scale);
    ctx.textBaseline = "top";
    ctx.fillText(label, cx, areaY + areaH + 6 * scale);
  });
  return out;
}

function composePercentPanel(root: HTMLElement, title: string, box?: CssSize) {
  const rows = [...root.querySelectorAll(".gm-cost-percent")];
  if (!rows.length) throw new Error("Nenhum visual para copiar.");
  const scale = EXPORT_SCALE;
  const size = cssSizeOf(root, box);
  const headerH = title ? HEADER_H * scale : 0;
  const pad = 14 * scale;
  const naturalH = headerH + pad + rows.length * 28 * scale + pad;
  const { out, ctx } = makeCanvas(size.width * scale, box ? size.height * scale : naturalH);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, out.width, out.height);
  if (title) paintHeader(ctx, title, out.width, scale);
  const rowH = (out.height - headerH - pad * 2) / rows.length;
  rows.forEach((row, index) => {
    const y = headerH + pad + index * rowH;
    const label = visibleText(row, ":scope > span") || visibleText(row, "span");
    const value = visibleText(row, "strong");
    const pct = barPercent(row.querySelector("i"));
    const labelW = 86 * scale;
    const valueW = 52 * scale;
    const barX = pad + labelW;
    const barW = Math.max(24 * scale, out.width - pad * 2 - labelW - valueW);
    ctx.fillStyle = "#111827";
    ctx.font = `700 ${11 * scale}px Calibri, Arial, sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(label, pad, y + rowH / 2);
    ctx.fillStyle = "#e5e7eb";
    const barH = 10 * scale;
    ctx.fillRect(barX, y + (rowH - barH) / 2, barW, barH);
    ctx.fillStyle = percentBarColor(row);
    ctx.fillRect(barX, y + (rowH - barH) / 2, barW * (pct / 100), barH);
    ctx.fillStyle = "#111827";
    ctx.textAlign = "right";
    ctx.fillText(value, out.width - pad, y + rowH / 2);
  });
  return out;
}

function composeListPanel(root: HTMLElement, title: string, box?: CssSize) {
  const rows = listRowsOf(root).slice(0, LIST_COPY_LIMIT);
  if (!rows.length) throw new Error("Nenhum visual para copiar.");
  const scale = EXPORT_SCALE;
  const size = cssSizeOf(root, box);
  const pad = 14 * scale;
  const headerH = title ? HEADER_H * scale : 0;
  const rowH = 32 * scale;
  const naturalH = headerH + pad + rows.length * rowH + pad;
  const { out, ctx } = makeCanvas(size.width * scale, naturalH);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, out.width, out.height);
  if (title) paintHeader(ctx, title, out.width, scale);
  rows.forEach((row, index) => {
    const y = headerH + pad + index * rowH;
    const label = visibleText(row, ":scope > span") || visibleText(row, "span");
    const value = visibleText(row, "strong, b");
    const pct = barPercent(row.querySelector("i"));
    const labelW = Math.min(180 * scale, out.width * 0.38);
    ctx.fillStyle = "#12355c";
    ctx.font = `700 ${11 * scale}px Calibri, Arial, sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(label, pad, y + rowH / 2, labelW - 8 * scale);
    const barX = pad + labelW;
    const barW = Math.max(24 * scale, out.width - pad * 2 - labelW - 90 * scale);
    ctx.fillStyle = "#d6e6f7";
    ctx.fillRect(barX, y + rowH * 0.28, barW, rowH * 0.44);
    ctx.fillStyle = "#08296b";
    ctx.fillRect(barX, y + rowH * 0.28, barW * (pct / 100), rowH * 0.44);
    ctx.fillStyle = "#0c2a4d";
    ctx.textAlign = "right";
    ctx.fillText(value, out.width - pad, y + rowH / 2);
  });
  return out;
}

function composeTpVerticalBars(root: HTMLElement, title: string, box?: CssSize) {
  const cols = [...root.querySelectorAll(".tp-bar-col")].slice(0, LIST_COPY_LIMIT);
  if (!cols.length) throw new Error("Nenhum visual para copiar.");
  const scale = EXPORT_SCALE;
  const size = cssSizeOf(root, box);
  const { out, ctx } = makeCanvas(size.width * scale, size.height * scale);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, out.width, out.height);
  const headerH = title ? paintHeader(ctx, title, out.width, scale) : 0;
  const padX = 16 * scale;
  const padTop = 28 * scale;
  const padBottom = 36 * scale;
  const areaY = headerH + padTop;
  const areaH = Math.max(40 * scale, out.height - headerH - padTop - padBottom);
  const colW = (out.width - padX * 2) / cols.length;
  const barW = Math.min(44 * scale, Math.max(14 * scale, colW * 0.42));
  cols.forEach((col, index) => {
    const bar = col.querySelector(".tp-bar") as HTMLElement | null;
    const pct = Math.max(4, barPercent(bar)) / 100;
    const barH = Math.max(4 * scale, areaH * pct);
    const cx = padX + index * colW + colW / 2;
    const x = cx - barW / 2;
    const y = areaY + areaH - barH;
    ctx.fillStyle = bar?.style.background || "#0c2a4d";
    ctx.fillRect(x, y, barW, barH);
    const value = visibleText(col, "strong");
    const count = visibleText(col, "small");
    const label = visibleText(col, ":scope > span");
    ctx.fillStyle = "#111827";
    ctx.font = `700 ${10 * scale}px Calibri, Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(count ? `${value} (${count})` : value, cx, y - 4 * scale);
    ctx.textBaseline = "top";
    ctx.fillText(label, cx, areaY + areaH + 8 * scale, colW - 6 * scale);
  });
  return out;
}

function composeTpHorizontalBars(root: HTMLElement, title: string, box?: CssSize) {
  const rows = [...root.querySelectorAll(".tp-horizontal > div")].slice(0, LIST_COPY_LIMIT);
  if (!rows.length) throw new Error("Nenhum visual para copiar.");
  const scale = EXPORT_SCALE;
  const size = cssSizeOf(root, box);
  const pad = 14 * scale;
  const headerH = title ? HEADER_H * scale : 0;
  const rowH = 26 * scale;
  const { out, ctx } = makeCanvas(size.width * scale, box ? size.height * scale : headerH + pad + rows.length * rowH + pad);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, out.width, out.height);
  if (title) paintHeader(ctx, title, out.width, scale);
  const usable = (out.height - headerH - pad * 2) / rows.length;
  rows.forEach((row, index) => {
    const y = headerH + pad + index * usable;
    const label = visibleText(row, ":scope > span") || visibleText(row, "span");
    const value = visibleText(row, "b");
    const bar = row.querySelector("i");
    const pct = barPercent(bar);
    const color = bar instanceof HTMLElement ? bar.style.background || "#0c2a4d" : "#0c2a4d";
    const labelW = Math.min(200 * scale, out.width * 0.42);
    ctx.fillStyle = "#0c2a4d";
    ctx.font = `700 ${10 * scale}px Calibri, Arial, sans-serif`;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(label, pad + labelW - 8 * scale, y + usable / 2, labelW - 8 * scale);
    const barX = pad + labelW;
    const barW = Math.max(24 * scale, out.width - pad * 2 - labelW - 56 * scale);
    ctx.fillStyle = "#e8eef5";
    ctx.fillRect(barX, y + usable * 0.3, barW, usable * 0.4);
    ctx.fillStyle = color;
    ctx.fillRect(barX, y + usable * 0.3, barW * (pct / 100), usable * 0.4);
    ctx.fillStyle = "#0c2a4d";
    ctx.textAlign = "left";
    ctx.fillText(value, barX + barW + 8 * scale, y + usable / 2);
  });
  return out;
}

function composeTpLifePie(root: HTMLElement, title: string, box?: CssSize) {
  const items = [...root.querySelectorAll(".tp-life span")].filter((node) => node.querySelector("i"));
  if (!items.length) throw new Error("Nenhum visual para copiar.");
  const scale = EXPORT_SCALE;
  const size = cssSizeOf(root, box);
  const { out, ctx } = makeCanvas(size.width * scale, size.height * scale);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, out.width, out.height);
  const headerH = title ? paintHeader(ctx, title, out.width, scale) : 0;
  const slices = items.map((item, index) => {
    const mark = item.querySelector("i");
    const color = mark instanceof HTMLElement ? mark.style.background || "#0c2a4d" : "#0c2a4d";
    const text = compactText(item.textContent || "");
    const pctMatch = text.match(/\(([\d.,]+)\s*%\)/);
    const pct = pctMatch ? Number(pctMatch[1].replace(",", ".")) : 100 / items.length;
    return { color, text, pct: Number.isFinite(pct) ? pct : 100 / items.length, index };
  });
  const pieR = Math.min(out.width * 0.18, (out.height - headerH) * 0.32, 70 * scale);
  const pieX = padForPie(out.width, pieR, scale);
  const pieY = headerH + (out.height - headerH) / 2;
  let angle = -Math.PI / 2;
  for (const slice of slices) {
    const next = angle + (slice.pct / 100) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(pieX, pieY);
    ctx.arc(pieX, pieY, pieR, angle, next);
    ctx.closePath();
    ctx.fillStyle = slice.color;
    ctx.fill();
    angle = next;
  }
  ctx.font = `700 ${11 * scale}px Calibri, Arial, sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const legendX = pieX + pieR + 20 * scale;
  const lineH = 20 * scale;
  const legendY = pieY - ((slices.length - 1) * lineH) / 2;
  slices.forEach((slice, index) => {
    const y = legendY + index * lineH;
    ctx.fillStyle = slice.color;
    ctx.beginPath();
    ctx.arc(legendX, y, 5 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#0c2a4d";
    ctx.fillText(slice.text, legendX + 12 * scale, y, out.width - legendX - 24 * scale);
  });
  return out;
}

function padForPie(width: number, radius: number, scale: number) {
  return Math.max(radius + 20 * scale, width * 0.28);
}

function composeTextBlock(root: HTMLElement, title: string, box?: CssSize) {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const node of root.querySelectorAll("h3, h4, p, li, strong, span")) {
    if (!isPrintable(node)) continue;
    if (node.querySelector("h3, h4, p, li, strong")) continue;
    const text = compactText(node.textContent || "");
    if (!text || text === title || seen.has(text)) continue;
    seen.add(text);
    lines.push(text);
  }
  if (!lines.length && !title) throw new Error("Nenhum visual para copiar.");
  const scale = EXPORT_SCALE;
  const size = cssSizeOf(root, box);
  const pad = 14 * scale;
  const headerH = title ? HEADER_H * scale : 0;
  const rowH = 26 * scale;
  const naturalH = headerH + pad + Math.max(lines.length, 1) * rowH + pad;
  const { out, ctx } = makeCanvas(size.width * scale, box ? size.height * scale : naturalH);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, out.width, out.height);
  if (title) paintHeader(ctx, title, out.width, scale);
  ctx.fillStyle = "#12355c";
  ctx.font = `700 ${12 * scale}px Calibri, Arial, sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const usable = Math.max(rowH, (out.height - headerH - pad * 2) / Math.max(lines.length, 1));
  lines.forEach((line, index) => {
    ctx.fillText(line, pad, headerH + pad + index * usable + usable / 2, out.width - pad * 2);
  });
  return out;
}

function confDotColor(el: Element) {
  if (el.classList.contains("gm-conf-dot--excelente")) return "#22c55e";
  if (el.classList.contains("gm-conf-dot--atencao")) return "#eab308";
  if (el.classList.contains("gm-conf-dot--critico")) return "#ef4444";
  if (el.classList.contains("gm-conf-dot--na")) return "#94a3b8";
  return cssColor(window.getComputedStyle(el as HTMLElement).backgroundColor, "#94a3b8");
}

function composeGmConfBoard(root: HTMLElement) {
  const table = root.querySelector<HTMLTableElement>(".gm-conf-table");
  if (!table) throw new Error("Nenhum visual para copiar.");
  const period = compactText(root.querySelector(".gm-conf-period strong")?.textContent || "");
  const dias = (root.querySelector(".gm-conf-dias input") as HTMLInputElement | null)?.value?.trim() || "";
  const scale = 2;
  const pad = 14 * scale;
  const toolH = 56 * scale;
  const cells: Array<{
    cell: HTMLTableCellElement;
    row: HTMLTableRowElement;
    section: "head" | "body" | "foot";
    x: number;
    y: number;
    w: number;
    h: number;
    even: boolean;
  }> = [];
  let contentW = 0;
  let contentH = 0;
  for (const row of table.rows) {
    const parent = row.parentElement?.tagName;
    const section = parent === "THEAD" ? "head" : parent === "TFOOT" ? "foot" : "body";
    const even = section === "body" && row.sectionRowIndex % 2 === 1;
    const h = Math.max(row.offsetHeight, section === "head" ? 32 : 28) * scale;
    let x = 0;
    for (const cell of row.cells) {
      const w = Math.max(cell.offsetWidth, cell.colSpan > 1 ? 160 : 72) * scale;
      cells.push({ cell, row, section, x, y: contentH, w, h, even });
      x += w;
    }
    contentW = Math.max(contentW, x);
    contentH += h;
  }
  contentW = Math.max(contentW, 980 * scale);
  const { out, ctx } = makeCanvas(contentW + pad * 2, toolH + contentH + pad * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.fillStyle = "#0c2a4d";
  ctx.fillRect(0, 0, out.width, toolH);
  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.font = `700 ${15 * scale}px Calibri, Arial, sans-serif`;
  ctx.fillText("CONFIABILIDADE / DISPONIBILIDADE", pad, toolH / 2 - 8 * scale);
  ctx.font = `600 ${11 * scale}px Calibri, Arial, sans-serif`;
  const meta = [period ? `Período MTBF: ${period}` : "", dias ? `Dias estimado: ${dias}` : ""].filter(Boolean).join("   ");
  ctx.fillText(meta, pad, toolH / 2 + 12 * scale);
  const legend = [
    { color: "#22c55e", label: "Excelente" },
    { color: "#eab308", label: "Atenção" },
    { color: "#ef4444", label: "Crítico" },
  ];
  let lx = out.width - pad;
  ctx.textAlign = "right";
  for (let i = legend.length - 1; i >= 0; i--) {
    const item = legend[i]!;
    ctx.fillStyle = "#ffffff";
    ctx.font = `700 ${11 * scale}px Calibri, Arial, sans-serif`;
    ctx.fillText(item.label, lx, toolH / 2);
    const tw = ctx.measureText(item.label).width;
    lx -= tw + 8 * scale;
    ctx.beginPath();
    ctx.arc(lx, toolH / 2, 5 * scale, 0, Math.PI * 2);
    ctx.fillStyle = item.color;
    ctx.fill();
    lx -= 18 * scale;
  }
  const tableY = toolH + pad;
  for (const item of cells) {
    const x = pad + item.x;
    const y = tableY + item.y;
    const bg =
      item.section === "head" ? "#0c2a4d" : item.section === "foot" ? "#e8eef7" : item.even ? "#f4f7fb" : "#ffffff";
    const fg = item.section === "head" ? "#ffffff" : "#0c1d4a";
    ctx.fillStyle = bg;
    ctx.fillRect(x, y, item.w, item.h);
    ctx.strokeStyle = item.section === "head" ? "#0c2a4d" : "#d6e0ec";
    ctx.strokeRect(x + 0.5, y + 0.5, item.w - 1, item.h - 1);
    const text = compactText(item.cell.innerText || item.cell.textContent || "");
    const dot = item.cell.querySelector(".gm-conf-dot");
    const num = item.cell.classList.contains("num");
    ctx.fillStyle = fg;
    ctx.font = `${item.section === "foot" || item.section === "head" ? 700 : 600} ${item.section === "head" ? 11 * scale : 13 * scale}px Calibri, Arial, sans-serif`;
    ctx.textBaseline = "middle";
    if (dot instanceof HTMLElement) {
      const padR = 10 * scale;
      ctx.textAlign = "right";
      ctx.fillText(text, x + item.w - padR, y + item.h / 2, item.w - 28 * scale);
      ctx.beginPath();
      ctx.arc(x + item.w - padR - ctx.measureText(text).width - 12 * scale, y + item.h / 2, 5 * scale, 0, Math.PI * 2);
      ctx.fillStyle = confDotColor(dot);
      ctx.fill();
      continue;
    }
    ctx.textAlign = num ? "right" : "left";
    ctx.fillText(
      text,
      num ? x + item.w - 10 * scale : x + 10 * scale,
      y + item.h / 2,
      item.w - 16 * scale,
    );
  }
  return out;
}

function rasterizeVisual(root: HTMLElement, box?: CssSize) {
  const title = visualTitle(root);
  const table = root.querySelector("table");
  const canvases = visibleCanvases(root);
  if (canvases.length) return composeCanvasesImage(root, title, box);
  if (root.querySelector(".gm-conf-table") || root.classList.contains("gm-conf-board")) {
    return composeGmConfBoard(root);
  }
  if (table) return composeTableImage(table, title);
  if (root.querySelector(".consumo-kpi-card") || root.classList.contains("consumo-kpi-grid")) {
    return composeConsumoKpiGrid(root, title);
  }
  if (root.querySelector(".gm-cost-month")) return composeMonthColumnChart(root, title, box);
  if (root.querySelector(".gm-cost-percent")) return composePercentPanel(root, title, box);
  if (root.querySelector(".tp-pie, .tp-life")) return composeTpLifePie(root, title, box);
  if (root.querySelector(".tp-horizontal")) return composeTpHorizontalBars(root, title, box);
  if (root.querySelector(".tp-bar-col")) return composeTpVerticalBars(root, title, box);
  if (kpiCardsOf(root).length) return composeKpiImage(root, title, box);
  if (listRowsOf(root).length) return composeListPanel(root, title, box);
  return composeTextBlock(root, title, box);
}

function drawImageContain(
  ctx: CanvasRenderingContext2D,
  image: HTMLCanvasElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
) {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(dx, dy, dw, dh);
  const fit = Math.min(dw / Math.max(image.width, 1), dh / Math.max(image.height, 1));
  const w = image.width * fit;
  const h = image.height * fit;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, dx + (dw - w) / 2, dy, w, h);
}

function expandScrollableCopyRoots(roots: HTMLElement[]) {
  const prev: Array<{ el: HTMLElement; maxHeight: string; overflow: string }> = [];
  for (const root of roots) {
    for (const el of root.querySelectorAll<HTMLElement>(".lub-grid-scroll, .lub-venc-scroll, .gm-conf-wrap")) {
      prev.push({ el, maxHeight: el.style.maxHeight, overflow: el.style.overflow });
      el.style.maxHeight = "none";
      el.style.overflow = "visible";
    }
  }
  if (prev.length) prev[0]?.el.offsetHeight;
  return () => {
    for (const item of prev) {
      item.el.style.maxHeight = item.maxHeight;
      item.el.style.overflow = item.overflow;
    }
  };
}

const PPT_PT = 14;
const PPT_VALUE_COL = 92;

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function toHexColor(value: string, fallback: string) {
  const raw = cssColor(value, fallback).trim();
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(raw)) {
    return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`.toLowerCase();
  }
  const rgb = raw.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (!rgb) return fallback;
  const hex = (n: string) => Number(n).toString(16).padStart(2, "0");
  return `#${hex(rgb[1])}${hex(rgb[2])}${hex(rgb[3])}`;
}

function luminance(hex: string) {
  const n = (i: number) => parseInt(hex.slice(i, i + 2), 16) / 255;
  const [r, g, b] = [1, 3, 5].map(n);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** O PowerPoint pinta a primeira linha de branco quando a célula é th. Texto e fundo precisam contrastar. */
function contrastColor(color: string, background: string) {
  const text = luminance(color);
  const fill = luminance(background);
  if (fill > 0.72 && text > 0.72) return "#12355c";
  if (fill < 0.4 && text < 0.4) return "#ffffff";
  return color;
}

function pptCell(
  text: string,
  opts: { color?: string; background?: string; align?: "left" | "right" | "center"; colspan?: number; width?: number; wrap?: boolean } = {},
) {
  const background = opts.background ?? "#ffffff";
  const color = contrastColor(opts.color ?? "#12355c", background);
  const align = opts.align ?? "left";
  const colspan = opts.colspan && opts.colspan > 1 ? ` colspan="${opts.colspan}"` : "";
  const width = opts.width ? ` width="${opts.width}"` : "";
  const nowrap = opts.wrap ? "" : " nowrap";
  return `<td${colspan}${width}${nowrap} bgcolor="${background}" align="${align}" valign="middle" style="width:${opts.width ? `${opts.width}px` : "auto"};font-family:Calibri,Arial,sans-serif;font-size:${PPT_PT}pt;font-weight:700;color:${color};background:${background};background-color:${background};border:1px solid #b7c9dc;padding:5px 8px;text-align:${align};vertical-align:middle;white-space:${opts.wrap ? "normal" : "nowrap"}"><font face="Calibri" color="${color}">${escapeHtml(text)}</font></td>`;
}

function pptTable(rows: string[], title: string, colCount: number) {
  const cols = Array.from({ length: colCount }, (_, index) =>
    index === 0 ? "<col>" : `<col width="${PPT_VALUE_COL}">`,
  ).join("");
  const caption = title
    ? `<tr><td colspan="${colCount}" bgcolor="#ffffff" style="font-family:Calibri,Arial,sans-serif;font-size:16pt;font-weight:700;color:#0c2a4d;background:#ffffff;border:none;padding:0 0 8px;text-align:left"><font face="Calibri" color="#0c2a4d">${escapeHtml(title)}</font></td></tr>`
    : "";
  return `<table border="1" cellspacing="0" cellpadding="4" style="border-collapse:collapse;font-family:Calibri,Arial,sans-serif;font-size:${PPT_PT}pt"><colgroup>${cols}</colgroup>${caption}${rows.join("")}</table>`;
}

function tableColumnCount(table: HTMLTableElement) {
  return Math.max(
    1,
    ...[...table.rows].map((row) => [...row.cells].reduce((count, cell) => count + (cell.colSpan || 1), 0)),
  );
}

function tableToPowerPointHtml(table: HTMLTableElement, title: string) {
  const rows = [...table.rows].map((row) => {
    const cells = [...row.cells].map((cell, index) => {
      const paint = cellPaint(cell, row);
      const numeric = cell.classList.contains("num");
      const first = index === 0 && (cell.colSpan || 1) === 1;
      return pptCell(cellCopyText(cell), {
        color: toHexColor(paint.color, "#12355c"),
        background: toHexColor(paint.background, "#ffffff"),
        align: numeric ? "right" : "left",
        colspan: cell.colSpan,
        width: first ? undefined : PPT_VALUE_COL,
        wrap: false,
      });
    });
    return `<tr>${cells.join("")}</tr>`;
  });
  return pptTable(rows, title, tableColumnCount(table));
}

function formatCopiedNumber(value: unknown) {
  const raw = value && typeof value === "object" && "y" in value ? (value as { y: unknown }).y : value;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return raw == null ? "" : String(raw);
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(n);
}

function chartLabel(label: unknown) {
  if (Array.isArray(label)) return label.map((part) => String(part)).join(" ");
  return label == null ? "" : String(label);
}

function chartToPowerPointHtml(canvas: HTMLCanvasElement, title: string) {
  const chart = Chart.getChart(canvas);
  if (!chart) return "";
  const labels = chart.data.labels ?? [];
  const datasets = chart.data.datasets ?? [];
  if (!datasets.length) return "";
  const head = `<tr>${pptCell(title || "Série", { background: "#0c2a4d", color: "#ffffff" })}${datasets
    .map((dataset) =>
      pptCell(String(dataset.label || "Valor"), {
        background: "#0c2a4d",
        color: "#ffffff",
        align: "right",
        width: PPT_VALUE_COL,
      }),
    )
    .join("")}</tr>`;
  const body = labels.map((label, index) => {
    const values = datasets.map((dataset) =>
      pptCell(formatCopiedNumber(dataset.data?.[index]), { align: "right", width: PPT_VALUE_COL }),
    );
    return `<tr>${pptCell(chartLabel(label))}${values.join("")}</tr>`;
  });
  if (!labels.length) {
    datasets.forEach((dataset) => {
      (dataset.data ?? []).forEach((value, index) => {
        body.push(
          `<tr>${pptCell(String(dataset.label || index + 1))}${pptCell(formatCopiedNumber(value), { align: "right", width: PPT_VALUE_COL })}</tr>`,
        );
      });
    });
  }
  return pptTable([head, ...body], "", Math.max(1, datasets.length + (labels.length ? 1 : 1)));
}

function cardsToPowerPointHtml(cards: Element[], title: string) {
  const rows = cards.map((card) => {
    const label = visibleText(card, "span") || title;
    const value = visibleText(card, "strong") || compactText(card.querySelector("strong")?.textContent || "");
    return `<tr>${pptCell(label)}${pptCell(value, { align: "right", width: PPT_VALUE_COL })}</tr>`;
  });
  return pptTable(rows, title, 2);
}

function textToPowerPointHtml(root: HTMLElement, title: string) {
  const lines: string[] = [];
  const seen = new Set<string>();
  for (const node of root.querySelectorAll("h3, h4, p, li, strong, span")) {
    if (!isPrintable(node) || node.querySelector("h3, h4, p, li, strong")) continue;
    const text = compactText(node.textContent || "");
    if (!text || text === title || seen.has(text)) continue;
    seen.add(text);
    lines.push(text);
  }
  if (!lines.length && title) lines.push(title);
  return lines
    .map(
      (line) =>
        `<p style="font-family:Calibri,Arial,sans-serif;font-size:${PPT_PT}pt;font-weight:700;color:#12355c;margin:4px 0">${escapeHtml(line)}</p>`,
    )
    .join("");
}

function visualToPowerPointHtml(root: HTMLElement) {
  const title = visualTitle(root);
  const parts: string[] = [];
  const canvases = visibleCanvases(root);
  for (const canvas of canvases) {
    const html = chartToPowerPointHtml(canvas, title);
    if (html) parts.push(html);
  }
  const table = root.querySelector("table");
  if (table) parts.push(tableToPowerPointHtml(table, parts.length ? "" : title));
  const consumo = [...root.querySelectorAll(".consumo-kpi-card")];
  if (consumo.length) parts.push(cardsToPowerPointHtml(consumo, title));
  const cards = kpiCardsOf(root);
  if (!parts.length && cards.length) parts.push(cardsToPowerPointHtml(cards, title));
  if (!parts.length) {
    const text = textToPowerPointHtml(root, title);
    if (text) parts.push(text);
  }
  return parts.join(`<p style="margin:14px 0;font-size:${PPT_PT}pt">&nbsp;</p>`);
}

function htmlToPlain(fragment: string) {
  return fragment
    .replace(/<tr[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "\t")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function officeHtmlDocument(fragment: string) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><!--StartFragment-->${fragment}<!--EndFragment--></body></html>`;
}

async function copyHtmlViaSelection(fragment: string) {
  const holder = document.createElement("div");
  holder.setAttribute("contenteditable", "true");
  holder.style.position = "fixed";
  holder.style.left = "0";
  holder.style.top = "0";
  holder.style.opacity = "0.01";
  holder.style.pointerEvents = "none";
  holder.innerHTML = fragment;
  document.body.appendChild(holder);
  holder.focus();
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(holder);
  selection?.removeAllRanges();
  selection?.addRange(range);
  const ok = document.execCommand("copy");
  selection?.removeAllRanges();
  holder.remove();
  if (!ok) throw new Error("Não foi possível copiar para o PowerPoint.");
}

async function copyHtmlForPowerPoint(fragment: string) {
  if (!fragment.trim()) throw new Error("Nenhum visual para copiar.");
  const html = officeHtmlDocument(fragment);
  const plain = htmlToPlain(fragment);
  if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([plain], { type: "text/plain" }),
        }),
      ]);
      return;
    } catch {
      // O PowerPoint no Windows cola a tabela editável quando a cópia sai pela seleção.
    }
  }
  await copyHtmlViaSelection(fragment);
}

export async function copyVisualElement(root: HTMLElement) {
  const collapse = expandScrollableCopyRoots([root]);
  try {
    await copyHtmlForPowerPoint(visualToPowerPointHtml(root));
  } finally {
    collapse();
  }
}

function rasterizeVisualSafe(root: HTMLElement, box?: CssSize) {
  try {
    const rect = box ?? root.getBoundingClientRect();
    if (!(rect.width > 2 && rect.height > 2)) return null;
    return rasterizeVisual(root, { width: rect.width, height: rect.height });
  } catch (error) {
    console.error("[copy-visual]", error);
    return null;
  }
}

function composeGroupImage(roots: HTMLElement[]) {
  const collapse = expandScrollableCopyRoots(roots);
  const restore = boostChartResolution(roots.flatMap((root) => visibleCanvases(root)));
  try {
    const boxes = roots.flatMap((root) => {
      const rect = root.getBoundingClientRect();
      const image = rasterizeVisualSafe(root, rect);
      return image ? [{ rect, image }] : [];
    });
    if (!boxes.length) throw new Error("Não foi possível copiar os visuais selecionados.");
    const minL = Math.min(...boxes.map((item) => item.rect.left));
    const minT = Math.min(...boxes.map((item) => item.rect.top));
    const maxR = Math.max(...boxes.map((item) => item.rect.right));
    const maxB = Math.max(...boxes.map((item) => item.rect.bottom));
    const cssW = Math.max(48, maxR - minL);
    const cssH = Math.max(48, maxB - minT);
    const scale = Math.max(
      1,
      Math.min(EXPORT_SCALE, MAX_CANVAS_EDGE / (cssW + 24), MAX_CANVAS_EDGE / (cssH + 24)),
    );
    const pad = 12 * scale;
    const { out, ctx } = makeCanvas(cssW * scale + pad * 2, cssH * scale + pad * 2);
    ctx.fillStyle = "#eef2f6";
    ctx.fillRect(0, 0, out.width, out.height);
    for (const item of boxes) {
      const dx = pad + (item.rect.left - minL) * scale;
      const dy = pad + (item.rect.top - minT) * scale;
      const dw = Math.max(1, item.rect.width * scale);
      const dh = Math.max(1, item.rect.height * scale);
      if (Math.abs(item.image.width - dw) < 2 && Math.abs(item.image.height - dh) < 2) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(item.image, dx, dy);
      } else {
        drawImageContain(ctx, item.image, dx, dy, dw, dh);
      }
    }
    return out;
  } finally {
    restore();
    collapse();
  }
}

export async function copyVisualElements(roots: HTMLElement[]) {
  const unique = [...new Set(roots.filter((root) => root && root.isConnected))];
  if (!unique.length) throw new Error("Selecione ao menos um visual.");
  if (unique.length === 1) {
    await copyVisualElement(unique[0]);
    return;
  }
  const collapse = expandScrollableCopyRoots(unique);
  try {
    const fragment = unique
      .map((root) => visualToPowerPointHtml(root))
      .filter(Boolean)
      .join(`<p style="margin:18px 0">&nbsp;</p>`);
    await copyHtmlForPowerPoint(fragment);
  } finally {
    collapse();
  }
}
