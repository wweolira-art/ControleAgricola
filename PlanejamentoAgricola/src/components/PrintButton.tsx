type Props = {
  label?: string;
  className?: string;
};

export function PrintButton({ label = "Imprimir", className = "" }: Props) {
  return (
    <button type="button" className={`btn no-print ${className}`.trim()} onClick={() => window.print()}>
      {label}
    </button>
  );
}
