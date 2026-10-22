type Props = {
  active: boolean;
  label?: string;
  className?: string;
};

export function ConsultaProgressBar({ active, label = "Consultando dados…", className }: Props) {
  if (!active) return null;

  return (
    <div
      className={`consulta-progress no-print${className ? ` ${className}` : ""}`}
      role="status"
      aria-live="polite"
    >
      <i className="consulta-progress-spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
