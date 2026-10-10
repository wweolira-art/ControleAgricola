import { useState } from "react";
import {
  CHART_SLOTS,
  defaultDeckLayout,
  slotLabel,
  slotsOverlap,
  type ChartSlot,
  type DeckLayout,
} from "../../lib/gestao-desempenho-layout";

const BOARD: ChartSlot[][] = [
  ["full"],
  ["top"],
  ["tl", "tr"],
  ["bl", "br"],
  ["bottom"],
  ["left", "right"],
];

export function ColheitaPowerPointLayout({
  layout,
  onChange,
}: {
  layout: DeckLayout;
  onChange: (next: DeckLayout) => void;
}) {
  const [selectedId, setSelectedId] = useState(layout.slides[0]?.id ?? "");
  const [pickedChart, setPickedChart] = useState<string | null>(null);
  const selected = layout.slides.find((item) => item.id === selectedId) ?? layout.slides[0];

  function update(slides: DeckLayout["slides"]) {
    onChange({ slides });
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= layout.slides.length) return;
    const slides = layout.slides.slice();
    const [item] = slides.splice(index, 1);
    if (!item) return;
    slides.splice(target, 0, item);
    update(slides);
  }

  function place(chartId: string, slot: ChartSlot) {
    if (!selected) return;
    update(
      layout.slides.map((item) =>
        item.id === selected.id
          ? { ...item, charts: item.charts.map((chart) => (chart.id === chartId ? { ...chart, slot } : chart)) }
          : item,
      ),
    );
    setPickedChart(chartId);
  }

  const overlaps = selected
    ? selected.charts.flatMap((chart, index) =>
        selected.charts.slice(index + 1).flatMap((other) =>
          slotsOverlap(chart.slot, other.slot) ? [`${chart.label} e ${other.label}`] : [],
        ),
      )
    : [];

  return (
    <div className="colheita-ppt-config">
      <div className="colheita-ppt-slides" role="list">
        {layout.slides.map((item, index) => (
          <div key={item.id} className={`colheita-ppt-slide-row${item.id === selected?.id ? " is-selected" : ""}`} role="listitem">
            <label>
              <input
                type="checkbox"
                checked={item.enabled}
                onChange={() => update(layout.slides.map((slide) => (slide.id === item.id ? { ...slide, enabled: !slide.enabled } : slide)))}
              />
              <span className="sr-only">Incluir {item.title}</span>
            </label>
            <button type="button" className="colheita-ppt-slide-name" onClick={() => { setSelectedId(item.id); setPickedChart(null); }}>
              {index + 1}. {item.title}
            </button>
            <button type="button" className="btn" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Subir ${item.title}`}>
              ↑
            </button>
            <button type="button" className="btn" disabled={index === layout.slides.length - 1} onClick={() => move(index, 1)} aria-label={`Descer ${item.title}`}>
              ↓
            </button>
          </div>
        ))}
      </div>
      <div className="colheita-ppt-editor">
        <div className="colheita-ppt-editor-head">
          <h3>{selected?.title ?? "Slide"}</h3>
          <button type="button" className="btn" onClick={() => { onChange(defaultDeckLayout()); setPickedChart(null); }}>
            Restaurar padrão
          </button>
        </div>
        {!selected?.charts.length ? (
          <p className="lead">Este slide entra inteiro. Não há gráficos para reposicionar.</p>
        ) : (
          <>
            <p className="lead">Escolha um gráfico e clique na área do slide. Gráficos na mesma área dividem o espaço.</p>
            <ul className="colheita-ppt-charts">
              {selected.charts.map((chart) => (
                <li key={chart.id}>
                  <button
                    type="button"
                    className={`colheita-ppt-chart${pickedChart === chart.id ? " is-picked" : ""}`}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData("text/plain", chart.id);
                      setPickedChart(chart.id);
                    }}
                    onClick={() => setPickedChart(chart.id)}
                  >
                    <span>{chart.label}</span>
                    <small>{slotLabel(chart.slot)}</small>
                  </button>
                </li>
              ))}
            </ul>
            <div className="colheita-ppt-board" aria-label="Áreas do slide">
              {BOARD.map((row) => (
                <div key={row.join("-")} className="colheita-ppt-board-row">
                  {row.map((slot) => {
                    const charts = selected.charts.filter((chart) => chart.slot === slot);
                    const label = CHART_SLOTS.find((item) => item.id === slot)?.label ?? slot;
                    return (
                      <button
                        key={slot}
                        type="button"
                        className={`colheita-ppt-zone${pickedChart && charts.some((chart) => chart.id === pickedChart) ? " is-target" : ""}`}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => {
                          event.preventDefault();
                          const chartId = event.dataTransfer.getData("text/plain") || pickedChart;
                          if (chartId) place(chartId, slot);
                        }}
                        onClick={() => {
                          if (pickedChart) place(pickedChart, slot);
                        }}
                      >
                        <strong>{label}</strong>
                        {charts.map((chart) => (
                          <small key={chart.id}>{chart.label}</small>
                        ))}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
            {overlaps.length ? (
              <p className="colheita-ppt-warn">Estas áreas se cruzam e um gráfico cobre o outro: {overlaps.join("; ")}.</p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
