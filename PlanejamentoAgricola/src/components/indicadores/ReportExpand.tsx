import { useContext, useEffect, useState, type ReactNode } from "react";
import { ReportExpandedContext, useReportAutoRefresh } from "./useReportAutoRefresh";

export function ReportExpand({
  title,
  children,
  className,
  compactToggle = false,
  autoExpand = false,
  onRefresh,
}: {
  title: string;
  children: ReactNode;
  className?: string;
  compactToggle?: boolean;
  /** Abre o relatório já no mesmo modo do botão "Ampliar relatório em tela cheia". */
  autoExpand?: boolean;
  onRefresh?: () => void | Promise<unknown>;
}) {
  const [expanded, setExpanded] = useState(autoExpand);
  const parentExpanded = useContext(ReportExpandedContext);
  useReportAutoRefresh(() => onRefresh?.(), expanded);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [expanded]);

  // Alguns gráficos só medem o contêiner depois que o modo ampliado já foi
  // aplicado. Recalcula após a mudança de layout para ocuparem a tela toda.
  useEffect(() => {
    const firstFrame = requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
    const secondFrame = window.setTimeout(() => window.dispatchEvent(new Event("resize")), 120);
    return () => {
      cancelAnimationFrame(firstFrame);
      window.clearTimeout(secondFrame);
    };
  }, [expanded]);

  return (
    <ReportExpandedContext.Provider value={expanded || parentExpanded}>
    <div className={`indicadores-report-expand${expanded ? " is-expanded" : ""}${className ? ` ${className}` : ""}`}>
      <div className="indicadores-report-expand-toolbar no-print">
        <button
          type="button"
          className={`btn indicadores-report-expand-toggle${expanded ? " is-exit" : " primary is-compact"}${compactToggle ? " is-compact" : ""}`}
          onClick={() => setExpanded((current) => !current)}
          title={expanded ? "Sair da tela ampliada (Esc)" : "Ampliar relatório em tela cheia"}
          aria-label={expanded ? "Sair da tela ampliada" : "Ampliar relatório"}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            {expanded ? (
              <path d="M6 6l12 12M18 6 6 18" />
            ) : (
              <path d="M8 4H5a1 1 0 0 0-1 1v3M16 4h3a1 1 0 0 1 1 1v3M8 20H5a1 1 0 0 1-1-1v-3M16 20h3a1 1 0 0 0 1-1v-3" />
            )}
          </svg>
          <span className="sr-only">{expanded ? "Sair da tela" : "Ampliar relatório"}</span>
        </button>
        {expanded ? <span>Atualização automática a cada 30 min</span> : null}
      </div>
      <div className="indicadores-report-expand-body" aria-label={title}>{children}</div>
    </div>
    </ReportExpandedContext.Provider>
  );
}
