/** Retains the full contours of farms with an application in the queried operation. */
export function filterApplicationFarms<T extends { properties: Record<string, unknown> }>(features: T[]): T[] {
  const farms = new Set(features.filter(({ properties: p }) =>
    p.codFazenda != null && String(p.camada ?? "LOTES").toUpperCase() === "LOTES" && Number(p.areaAplicada) > 0,
  ).map(({ properties }) => String(properties.codFazenda)));
  return features.filter(({ properties }) => properties.codFazenda != null && farms.has(String(properties.codFazenda)));
}
