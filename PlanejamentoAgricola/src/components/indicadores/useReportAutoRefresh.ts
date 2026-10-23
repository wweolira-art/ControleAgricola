import { createContext, useContext, useEffect, useRef } from "react";

export const ReportExpandedContext = createContext(false);
export const REPORT_REFRESH_INTERVAL_MS = 30 * 60 * 1000;

export function useReportAutoRefresh(refresh: () => void | Promise<unknown>, expanded = false) {
  const parentExpanded = useContext(ReportExpandedContext);
  const enabled = expanded || parentExpanded;
  const callback = useRef(refresh);
  useEffect(() => {
    callback.current = refresh;
  }, [refresh]);

  useEffect(() => {
    if (!enabled) return;
    let pending = false;
    // Ao abrir em tela cheia, busca um retrato atual antes de aguardar os
    // próximos ciclos automáticos.
    const refreshNow = async () => {
      if (pending) return;
      pending = true;
      try {
        await callback.current();
      } finally {
        pending = false;
      }
    };
    void refreshNow();
    const timer = window.setInterval(async () => {
      if (pending) return;
      pending = true;
      try {
        await callback.current();
      } finally {
        pending = false;
      }
    }, REPORT_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [enabled]);
}
