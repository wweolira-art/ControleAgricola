export const LAYOUT_STORAGE_KEY = "gestao-desempenho-layout-v1";

export const CHART_SLOTS = [
  { id: "full", label: "Slide inteiro" },
  { id: "top", label: "Metade de cima" },
  { id: "bottom", label: "Metade de baixo" },
  { id: "left", label: "Lado esquerdo" },
  { id: "right", label: "Lado direito" },
  { id: "tl", label: "Superior esquerdo" },
  { id: "tr", label: "Superior direito" },
  { id: "bl", label: "Inferior esquerdo" },
  { id: "br", label: "Inferior direito" },
] as const;

export type ChartSlot = (typeof CHART_SLOTS)[number]["id"];

export type ChartPlacement = {
  id: string;
  label: string;
  slot: ChartSlot;
};

export type SlideLayout = {
  id: string;
  title: string;
  enabled: boolean;
  charts: ChartPlacement[];
};

export type DeckLayout = {
  slides: SlideLayout[];
};

export type ChartBox = {
  x: number;
  y: number;
  w: number;
  h: number;
};

const PAGE = { x: 40, y: 140, w: 1840, h: 900 };

function chart(id: string, label: string, slot: ChartSlot): ChartPlacement {
  return { id, label, slot };
}

function slide(id: string, title: string, charts: ChartPlacement[]): SlideLayout {
  return { id, title, enabled: true, charts };
}

export function defaultDeckLayout(): DeckLayout {
  return {
    slides: [
      slide("capa", "Capa", []),
      slide("agenda", "Pauta", []),
      slide("colhedoras", "Produtividade — Colhedeiras", [
        chart("tabela-semana", "Tabela da semana", "tl"),
        chart("grafico-semana", "Produção diária da semana", "tr"),
        chart("tabela-safra", "Tabela da safra", "bl"),
        chart("grafico-safra", "Produção diária da safra", "br"),
      ]),
      slide("tratores", "Produtividade — Tratores", [
        chart("tabela-semana", "Tabela da semana", "top"),
        chart("tabela-safra", "Tabela da safra", "bottom"),
      ]),
      slide("caminhoes", "Produtividade — Caminhões", [
        chart("tabela-semana", "Tabela da semana", "top"),
        chart("tabela-safra", "Tabela da safra", "bottom"),
      ]),
      slide("horas-colhedora", "Horas — Colhedora", [
        chart("meses", "Meses da safra", "tl"),
        chart("semanas", "Semanas", "tr"),
        chart("frente", "Por frente", "bl"),
        chart("equipamento", "Por equipamento", "br"),
      ]),
      slide("horas-trator", "Horas — Trator", [
        chart("meses", "Meses da safra", "tl"),
        chart("semanas", "Semanas", "tr"),
        chart("frente", "Por frente", "bl"),
        chart("equipamento", "Por equipamento", "br"),
      ]),
      slide("disp-colhedora", "Disponibilidade — Colhedora", [
        chart("safra", "Acumulado da safra", "left"),
        chart("semana", "Semana", "right"),
      ]),
      slide("disp-trator", "Disponibilidade — Tratores", [
        chart("safra", "Acumulado da safra", "left"),
        chart("semana", "Semana", "right"),
      ]),
      slide("disp-caminhao", "Disponibilidade — Caminhões", [
        chart("safra", "Acumulado da safra", "left"),
        chart("semana", "Semana", "right"),
      ]),
      slide("qualidade", "Qualidade da colheita", [
        chart("tempo", "Linha do tempo", "tl"),
        chart("equipamento", "Perda por equipamento", "tr"),
        chart("tipo", "Tipo de perda", "bl"),
        chart("impureza", "Impureza mineral", "bl"),
        chart("operador", "Perda por operador", "br"),
        chart("fazenda", "Perda por fazenda", "br"),
      ]),
      slide("combustivel-colhedora", "Combustível — Colhedora", [
        chart("semana", "Semana", "top"),
        chart("safra", "Acumulado da safra", "bottom"),
      ]),
      slide("combustivel-trator", "Combustível — Tratores", [
        chart("semana", "Semana", "top"),
        chart("safra", "Acumulado da safra", "bottom"),
      ]),
      slide("combustivel-caminhao", "Combustível — Caminhões", [
        chart("semana", "Semana", "top"),
        chart("safra", "Acumulado da safra", "bottom"),
      ]),
      slide("conf-colhedora", "Confiabilidade — Colhedora", [chart("conteudo", "Tabela", "full")]),
      slide("conf-trator", "Confiabilidade — Tratores", [chart("conteudo", "Tabela", "full")]),
      slide("mttr-colhedora", "MTTR/MTBF — Colhedora", [
        chart("semana", "Semana", "top"),
        chart("safra", "Acumulado da safra", "bottom"),
      ]),
      slide("mttr-trator", "MTTR/MTBF — Tratores", [
        chart("semana", "Semana", "top"),
        chart("safra", "Acumulado da safra", "bottom"),
      ]),
      slide("custo-colhedora", "Custo — Colhedoras", [
        chart("semana", "Semana", "top"),
        chart("safra", "Acumulado da safra", "bottom"),
      ]),
      slide("custo-trator", "Custo — Tratores", [
        chart("semana", "Semana", "top"),
        chart("safra", "Acumulado da safra", "bottom"),
      ]),
      slide("oleo-resumo", "Óleo — resumo", [
        chart("barras", "Litros por motivo", "left"),
        chart("rosca", "Participação", "right"),
      ]),
      slide("oleo-tabela", "Óleo — relatório", [chart("conteudo", "Tabela", "full")]),
      slide("oleo-comparativo", "Óleo — comparativo", [chart("conteudo", "Gráfico", "full")]),
      slide("oleo-causas", "Óleo — causas", [
        chart("causas", "Causas", "tl"),
        chart("motivos", "Motivos", "tr"),
        chart("trocas", "Trocas por equipamento", "bottom"),
      ]),
      slide("oleo-mensal", "Óleo — mensal", [
        chart("grafico", "Consumo mensal", "left"),
        chart("meta", "Meta e litros", "right"),
      ]),
      slide("lubrificacao", "Lubrificação", [
        chart("status", "Status", "left"),
        chart("serie", "Realizado x meta", "right"),
      ]),
      slide("pneus-geral", "Descarte de pneus", [
        chart("motivo", "Motivo", "tl"),
        chart("causa", "Causa", "tr"),
        chart("tipo", "Tipo de pneu", "bl"),
      ]),
      slide("pneus-comparativo", "Descarte semanal", [chart("conteudo", "Gráfico", "full")]),
    ],
  };
}

function isSlot(value: unknown): value is ChartSlot {
  return CHART_SLOTS.some((slot) => slot.id === value);
}

export function mergeDeckLayout(saved: DeckLayout | null | undefined): DeckLayout {
  const defaults = defaultDeckLayout().slides;
  const savedSlides = saved?.slides ?? [];
  const known = new Set(defaults.map((item) => item.id));
  const order = [
    ...savedSlides.map((item) => item.id).filter((id) => known.has(id)),
    ...defaults.map((item) => item.id).filter((id) => !savedSlides.some((slide) => slide.id === id)),
  ];
  return {
    slides: order.map((id) => {
      const base = defaults.find((item) => item.id === id)!;
      const prev = savedSlides.find((item) => item.id === id);
      return {
        ...base,
        enabled: prev?.enabled ?? true,
        charts: base.charts.map((chart) => {
          const previous = prev?.charts.find((item) => item.id === chart.id);
          return { ...chart, slot: previous && isSlot(previous.slot) ? previous.slot : chart.slot };
        }),
      };
    }),
  };
}

export function loadDeckLayout(): DeckLayout {
  if (typeof localStorage === "undefined") return defaultDeckLayout();
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!raw) return defaultDeckLayout();
    return mergeDeckLayout(JSON.parse(raw) as DeckLayout);
  } catch {
    return defaultDeckLayout();
  }
}

export function saveDeckLayout(layout: DeckLayout) {
  localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout));
}

export function slotLabel(slot: ChartSlot) {
  return CHART_SLOTS.find((item) => item.id === slot)?.label ?? slot;
}

function areaBox(slot: ChartSlot, top: number, bottom: number): ChartBox {
  const x = PAGE.x;
  const y = top;
  const w = PAGE.w;
  const h = Math.max(120, 1080 - top - bottom);
  const gap = 16;
  const colW = (w - gap) / 2;
  const rowH = (h - gap) / 2;
  const right = x + colW + gap;
  const lower = y + rowH + gap;
  switch (slot) {
    case "top":
      return { x, y, w, h: rowH };
    case "bottom":
      return { x, y: lower, w, h: rowH };
    case "left":
      return { x, y, w: colW, h };
    case "right":
      return { x: right, y, w: colW, h };
    case "tl":
      return { x, y, w: colW, h: rowH };
    case "tr":
      return { x: right, y, w: colW, h: rowH };
    case "bl":
      return { x, y: lower, w: colW, h: rowH };
    case "br":
      return { x: right, y: lower, w: colW, h: rowH };
    default:
      return { x, y, w, h };
  }
}

function divideBox(box: ChartBox, index: number, count: number): ChartBox {
  if (count <= 1) return box;
  const gap = 12;
  if (box.w >= box.h) {
    const w = (box.w - gap * (count - 1)) / count;
    return { x: box.x + index * (w + gap), y: box.y, w, h: box.h };
  }
  const h = (box.h - gap * (count - 1)) / count;
  return { x: box.x, y: box.y + index * (h + gap), w: box.w, h };
}

export function chartBox(layout: DeckLayout, slideId: string, chartId: string, opts?: { top?: number; bottom?: number }): ChartBox {
  const top = opts?.top ?? PAGE.y;
  const bottom = opts?.bottom ?? 40;
  const slide = layout.slides.find((item) => item.id === slideId);
  const charts = slide?.charts ?? [];
  const mine = charts.find((item) => item.id === chartId);
  const slot = mine?.slot ?? "full";
  const mates = charts.filter((item) => item.slot === slot);
  const index = Math.max(0, mates.findIndex((item) => item.id === chartId));
  return divideBox(areaBox(slot, top, bottom), index, Math.max(mates.length, 1));
}

export function slotsOverlap(a: ChartSlot, b: ChartSlot) {
  if (a === b) return false;
  const left = areaBox(a, PAGE.y, 40);
  const right = areaBox(b, PAGE.y, 40);
  return left.x < right.x + right.w && left.x + left.w > right.x && left.y < right.y + right.h && left.y + left.h > right.y;
}
