export type SoilFile = { name: string; sha256: string; base64: string; date: string; dateSource: string };
export type SoilRow = { file: string; sheet: string; line: number; talhao: string; sample: number; depth: string; values: Record<string, number | null>; original?: Record<string, unknown> };
export type SoilLocation = { COD_SAFRA: number; COD_SAFRADETALHE: number; COD_FAZENDA: number; ZONA: number; COD_TALHAO: number; DESCRICAO_TALHAO: string; FAZENDA: string };
export type SoilSettings = {
  grupo: number; empresa: number; filial: number; safra: number;
  locations: Record<string, SoilLocation>; depths: Record<string, number>;
  numbering: 'original' | 'sequential'; phosphorus: 'meh' | 'res'; potassium: 'cmol' | 'mg';
  texture: 'pending' | 'percent'; method: number;
};
export type SoilGroup = { key: string; date: string; location: SoilLocation; items: Array<{ row: SoilRow; number: number; depth: number; values: Record<string, number | null>; sources: SoilRow[] }> };
export type SoilPlan = { groups: SoilGroup[]; errors: string[]; duplicates: number; conflicts: string[]; unmapped: string[] };
export const normalizeSoil = (v: unknown) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLowerCase();
export function validSoilDate(s: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
const fieldMap: Record<string, string> = {
  'ca + mg': 'CA_MG', ca: 'CALCIO', mg: 'MAGNESIO', al: 'ALUMINIO', 'h + al': 'H_AL',
  s: 'ENXOFRE', 'm.o': 'MATERIA_ORGANICA', 'c.o.': 'CARBONO', b: 'BORO', 'cu': 'COBRE',
  fe: 'FERRO', mn: 'MANGANES', zn: 'ZINCO', na: 'NA', t: 'CTC_CATIONS', v: 'V',
  'sat. al': 'SATURACAO_AL', 'ca/ctc': 'SAT_CA', 'mg/ctc': 'SAT_MG', 'k/ctc': 'SAT_K',
  ce: 'CE', sb: 'SOMA_BASES', 'soma de bases': 'SOMA_BASES', 'ctc efetiva': 'CTC_EFETIVA', 'sat. na': 'SAT_NA', 'na/ctc': 'SAT_NA',
};
export function soilColumn(header: unknown): string | null {
  const h = normalizeSoil(header);
  if (h.startsWith('ph (cacl2)')) return 'PH_CA';
  if (h.startsWith('ph (agua)')) return 'PH_AGUA';
  if (h.startsWith('k (cmolc)')) return 'K_CMOL';
  if (h.startsWith('k (nh4cl)')) return 'K_MG';
  if (h.startsWith('p (meh)')) return 'P_MEH';
  if (h.startsWith('p (res)')) return 'P_RES';
  if (h.startsWith('argila')) return 'ARGILA';
  if (h.startsWith('silte')) return 'SILTE';
  if (h.startsWith('areia')) return 'AREIA';
  const label = h.replace(/\s*\(.*$/, '').trim().replace(/^m\.o$/, 'm.o');
  return fieldMap[label] ?? null;
}
export function soilNumber(value: unknown): number | null {
  if (value == null || String(value).trim() === '' || String(value).trim() === '-') return null;
  const s = typeof value === 'number' ? value : Number(String(value).trim().replace(',', '.'));
  if (!Number.isFinite(s) || Number(s) < 0) throw new Error(`Valor numérico inválido: ${String(value)}`);
  return Number(s);
}
export function parseSoilGrid(grid: unknown[][], file: string, sheet: string): SoilRow[] {
  const headerIndex = grid.findIndex(row => row.some(v => ['descricao', 'id', 'identificacao da amostra'].includes(normalizeSoil(v))) && row.some(v => normalizeSoil(v) === 'profundidade'));
  if (headerIndex < 0) return [];
  const headers = grid[headerIndex];
  const index = (names: string[]) => headers.findIndex(h => names.includes(normalizeSoil(h)));
  const sampleCol = index(['descricao', 'id', 'identificacao da amostra']);
  const talhaoCol = index(['talhao']); const depthCol = index(['profundidade']);
  if (talhaoCol < 0) throw new Error(`${file}: coluna Talhão ausente.`);
  const result: SoilRow[] = [];
  grid.slice(headerIndex + 1).forEach((cells, offset) => {
    if (!cells.some(v => v != null && String(v).trim() !== '')) return;
    const line = headerIndex + offset + 2;
    const sample = soilNumber(cells[sampleCol]);
    const talhao = String(cells[talhaoCol] ?? '').trim(); const depth = String(cells[depthCol] ?? '').trim();
    if (sample == null || !Number.isSafeInteger(sample) || sample < 1 || !talhao || !/^\d+\s*-\s*\d+$/.test(depth)) throw new Error(`${file}, linha ${line}: amostra, talhão ou profundidade inválidos.`);
    const [a, b] = depth.split('-').map(Number); if (a >= b) throw new Error(`${file}, linha ${line}: intervalo de profundidade inválido.`);
    const values: SoilRow['values'] = {};
    headers.forEach((h, i) => { const field = soilColumn(h); if (field) values[field] = soilNumber(cells[i]); });
    if (values.PH_CA != null && values.PH_CA > 14) throw new Error(`${file}, linha ${line}: pH fora da faixa 0–14.`);
    result.push({ file, sheet, line, sample, talhao, depth: `${a}-${b}`, values, original: Object.fromEntries(headers.map((h,i)=>[String(h),cells[i]??null])) });
  });
  return result;
}
export function buildSoilPlan(rows: SoilRow[], files: SoilFile[], settings: SoilSettings): SoilPlan {
  const errors: string[] = [], conflicts: string[] = [], unmapped: string[] = [];
  const groups = new Map<string, SoilGroup>(); let duplicates = 0;
  if (!['original', 'sequential'].includes(settings.numbering)) errors.push('Selecione a numeração das amostras.');
  if (!['meh', 'res'].includes(settings.phosphorus) || !['cmol', 'mg'].includes(settings.potassium)) errors.push('Selecione os métodos de fósforo e a unidade de potássio.');
  for (const k of ['grupo', 'empresa', 'filial', 'safra'] as const) if (!Number.isSafeInteger(settings[k]) || settings[k] < 1) errors.push(`Informe ${k}.`);
  if (!Number.isSafeInteger(settings.method) || settings.method < 0) errors.push('Informe o código do método do sistema.');
  for (const f of files) if (!validSoilDate(f.date) || !f.dateSource?.trim()) errors.push(`${f.name}: informe data válida e sua origem.`);
  for (const row of rows) {
    const file = files.find(f => f.name === row.file); if (!file || !validSoilDate(file.date)) continue;
    const location = settings.locations[row.talhao];
    if (!location) { errors.push(`Associe o talhão ${row.talhao}.`); continue; }
    if (location.COD_SAFRA !== settings.safra) { errors.push(`Talhão ${row.talhao}: safra incompatível.`); continue; }
    const depth = settings.depths[row.depth];
    if (!Number.isFinite(depth) || depth <= 0) { errors.push(`Informe a profundidade numérica do sistema para ${row.depth} cm.`); continue; }
    const key = [settings.grupo, settings.empresa, settings.filial, settings.safra, location.COD_SAFRADETALHE, location.COD_FAZENDA, location.ZONA, location.COD_TALHAO, file.date].join('|');
    let group = groups.get(key); if (!group) { group = {key, date: file.date, location, items: []}; groups.set(key, group); }
    const old = group.items.find(i => i.row.sample === row.sample && i.row.depth === row.depth);
    if (old) {
      for (const [field, v] of Object.entries(row.values)) {
        const previous = old.row.values[field];
        if (v != null && previous != null && v !== previous) conflicts.push(`Amostra ${row.sample}, ${row.depth} cm, ${row.talhao}: ${field} difere entre ${old.row.file} e ${row.file}.`);
        else if (v != null && previous == null) old.row.values[field] = v;
      }
      old.sources.push(row); duplicates++; continue;
    }
    group.items.push({ row: {...row, values: {...row.values}}, number: row.sample, depth, values: {}, sources: [row] });
  }
  for (const g of groups.values()) {
    g.items.sort((a,b) => a.row.sample - b.row.sample || Number(a.row.depth.split('-')[0]) - Number(b.row.depth.split('-')[0]));
    const seen = new Set<number>();
    g.items.forEach((item, i) => {
      if (settings.numbering === 'sequential') item.number = i + 1;
      if (seen.has(item.number)) errors.push(`Amostra ${item.number} tem várias profundidades no mesmo talhão/data. Escolha numeração sequencial e conserve o mapa de origem.`);
      seen.add(item.number);
      const v = item.row.values; const mapped: Record<string, number | null> = {};
      for (const [k, value] of Object.entries(v)) if (!['K_CMOL','K_MG','P_MEH','P_RES','ARGILA','SILTE','AREIA'].includes(k)) mapped[k] = value;
      mapped.POTASSIO = v[settings.potassium === 'cmol' ? 'K_CMOL' : 'K_MG'] ?? null;
      mapped.FOSFORO = v[settings.phosphorus === 'meh' ? 'P_MEH' : 'P_RES'] ?? null;
      if (mapped.POTASSIO == null && (v.K_CMOL != null || v.K_MG != null)) errors.push(`${item.row.file}, linha ${item.row.line}: potássio indisponível na unidade escolhida.`);
      if (mapped.FOSFORO == null && (v.P_MEH != null || v.P_RES != null)) errors.push(`${item.row.file}, linha ${item.row.line}: fósforo indisponível no método escolhido.`);
      for (const k of ['ARGILA','SILTE','AREIA']) if (v[k] != null) {
        if (settings.texture !== 'percent') errors.push('Confirme com o laboratório a conversão da textura de g/dm³ para %.');
        else mapped['PERC_' + k] = Number(v[k]) / 10;
      }
      if (mapped.PERC_ARGILA != null) mapped.TEOR_ARGILA = mapped.PERC_ARGILA;
      item.values = mapped;
    });
  }
  unmapped.push('O método de fósforo não escolhido, a unidade alternativa de K e relações sem campo de destino permanecem no arquivo original e no mapa de origem.');
  const missingPh = [...groups.values()].flatMap(g=>g.items).filter(i=>i.values.PH_CA==null).length;
  const missingAl = [...groups.values()].flatMap(g=>g.items).filter(i=>i.values.ALUMINIO==null).length;
  if(missingPh||missingAl)unmapped.push(`Resultados ausentes no Excel: ${missingPh} itens sem pH em CaCl₂ e ${missingAl} sem alumínio. Permanecem nulos; se necessário, confira o PDF antes de enviar.`);
  return {groups: [...groups.values()], errors: [...new Set(errors)], conflicts: [...new Set(conflicts)], duplicates, unmapped};
}
