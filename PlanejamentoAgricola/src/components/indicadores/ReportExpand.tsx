import { useContext, useEffect, useState, type ReactNode } from "react";
import { ReportExpandedContext, useReportAutoRefresh } from "./useReportAutoRefresh";

export function ReportExpand({
  title,
  children,
  className,
  compactToggle = false,
  onRefresh,
}: {
  title: string;
  children: ReactNode;
  className?: string;
  compactToggle?: boolean;
  onRefresh?: () => void | Promise<unknown>;
}) {
  const [expanded, setExpanded] = useState(false);
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

  return (
    <ReportExpandedContext.Provider value={expanded || parentExpanded}>
    <div className={`indicadores-report-expand${expanded ? " is-expanded" : ""}${className ? ` ${className}` : ""}`}>
      <div className="indicadores-report-expand-toolbar no-print">
        <button
          type="button"
          className={`btn indicadores-report-expand-toggle${expanded ? "" : " primary"}${compactToggle ? " is-compact" : ""}`}
          onClick={() => setExpanded((current) => !current)}
          title={expanded ? "Sair da tela ampliada (Esc)" : "Ampliar relatório em tela cheia"}
          aria-label={expanded ? "Sair da tela ampliada" : "Ampliar relatório"}
        >
          {compactToggle ? (
            <>
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                {expanded ? (
                  <path d="M9 4H5a1 1 0 0 0-1 1v4M15 4h4a1 1 0 0 1 1 1v4M9 20H5a1 1 0 0 1-1-1v-4M15 20h4a1 1 0 0 0 1-1v-4" />
                ) : (
                  <path d="M8 4H5a1 1 0 0 0-1 1v3M16 4h3a1 1 0 0 1 1 1v3M8 20H5a1 1 0 0 1-1-1v-3M16 20h3a1 1 0 0 0 1-1v-3" />
                )}
              </svg>
              <span className="sr-only">{expanded ? "Fechar ampliação" : "Ampliar relatório"}</span>
            </>
          ) : (
            expanded ? "Fechar ampliação" : "Ampliar relatório"
          )}
        </button>
        {expanded ? <span>Atualização automática a cada 30 min</span> : null}
      </div>
      {expanded ? (
        <header className="indicadores-report-expand-brand">
          <img src="/elejota-agro-logo.png" alt="Elejota Agro" className="liberacao-colheita-logo" />
          <h2>{title}</h2>
        </header>
      ) : null}
      <div className="indicadores-report-expand-body">{children}</div>
    </div>
    </ReportExpandedContext.Provider>
  );
}
