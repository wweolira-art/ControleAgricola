import { useEffect, useMemo, useState } from "react";
import { ConsultaProgressBar } from "../ConsultaProgressBar";
import { useApp } from "../../store";
import { safraDefaultRange } from "./colheita-utils";

interface Props {
  dataInicio: string;
  dataFim: string;
  onChange: (next: { dataInicio: string; dataFim: string }) => void;
  busca?: string;
  onBuscaChange?: (v: string) => void;
  showBusca?: boolean;
  children?: React.ReactNode;
  onConsultar: () => void;
  loading?: boolean;
  className?: string;
  title?: string;
  dateTextMode?: boolean;
}

function isoToBrDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

function maskBrDate(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function brDateToIso(value: string) {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function ColheitaFiltros({
  dataInicio,
  dataFim,
  onChange,
  busca,
  onBuscaChange,
  showBusca,
  children,
  onConsultar,
  loading,
  className,
  title = "Filtros",
  dateTextMode,
}: Props) {
  const { safra } = useApp();
  const defaults = useMemo(() => safraDefaultRange(safra?.code), [safra?.code]);
  const dataInicialValue = dataInicio || defaults.from;
  const dataFinalValue = dataFim || defaults.to;
  const [dataInicioText, setDataInicioText] = useState(() => isoToBrDate(dataInicialValue));
  const [dataFimText, setDataFimText] = useState(() => isoToBrDate(dataFinalValue));

  useEffect(() => {
    if (dateTextMode) setDataInicioText(isoToBrDate(dataInicialValue));
  }, [dataInicialValue, dateTextMode]);

  useEffect(() => {
    if (dateTextMode) setDataFimText(isoToBrDate(dataFinalValue));
  }, [dataFinalValue, dateTextMode]);

  const changeTextDate = (kind: "inicio" | "fim", value: string) => {
    const masked = maskBrDate(value);
    const iso = brDateToIso(masked);
    if (kind === "inicio") {
      setDataInicioText(masked);
      if (iso) onChange({ dataInicio: iso, dataFim });
    } else {
      setDataFimText(masked);
      if (iso) onChange({ dataInicio, dataFim: iso });
    }
  };

  return (
    <section className={`panel no-print${className ? ` ${className}` : ""}`}>
      {title ? <h3>{title}</h3> : null}
      <div className="form-grid">
        <label>
          Data inicial
          {dateTextMode ? (
            <input value={dataInicioText} onChange={(e) => changeTextDate("inicio", e.target.value)} placeholder="dd/mm/aaaa" inputMode="numeric" />
          ) : (
            <input type="date" value={dataInicialValue} onChange={(e) => onChange({ dataInicio: e.target.value, dataFim })} />
          )}
        </label>
        <label>
          Data final
          {dateTextMode ? (
            <input value={dataFimText} onChange={(e) => changeTextDate("fim", e.target.value)} placeholder="dd/mm/aaaa" inputMode="numeric" />
          ) : (
            <input type="date" value={dataFinalValue} onChange={(e) => onChange({ dataInicio, dataFim: e.target.value })} />
          )}
        </label>
        {showBusca ? (
          <label className="span-2">
            Busca
            <input value={busca ?? ""} onChange={(e) => onBuscaChange?.(e.target.value)} placeholder="Pesagem, guia, caminhão, fazenda…" />
          </label>
        ) : null}
        {children}
      </div>
      <div className="modal-actions" style={{ padding: "0 16px 16px" }}>
        <button className="btn primary" disabled={loading} onClick={onConsultar}>
          {loading ? "Consultando…" : "Consultar"}
        </button>
      </div>
      <ConsultaProgressBar active={!!loading} className="consulta-progress--compact" />
    </section>
  );
}

export function useColheitaPeriod() {
  const { safra } = useApp();
  const defaults = useMemo(() => safraDefaultRange(safra?.code), [safra?.code]);
  const [dataInicio, setDataInicio] = useState(defaults.from);
  const [dataFim, setDataFim] = useState(defaults.to);
  return { dataInicio, dataFim, setPeriod: (d: { dataInicio: string; dataFim: string }) => {
    setDataInicio(d.dataInicio);
    setDataFim(d.dataFim);
  } };
}
