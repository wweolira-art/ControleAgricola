export function percentualTocosDanificados(brocados: number | null | undefined, analisados: number | null | undefined): number | null {
  if (brocados == null || analisados == null || !Number.isFinite(brocados) || !Number.isFinite(analisados) || analisados <= 0) return null;
  return brocados / analisados * 100;
}
