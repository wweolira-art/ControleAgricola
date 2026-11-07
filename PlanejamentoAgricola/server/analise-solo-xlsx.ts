import type { WorkBook } from 'xlsx';
import { createRequire } from 'node:module';
const XLSX = createRequire(import.meta.url)('xlsx') as typeof import('xlsx') & {CFB: any};

/** O exportador do laboratório produz <si/>. A versão de SheetJS do projeto
 * desloca os índices seguintes nesse caso. Expande somente esses elementos
 * vazios em uma cópia em memória, mantendo arquivo original e hash intactos. */
export function readSoilWorkbook(data: Buffer): WorkBook {
  const cfb = (XLSX as any).CFB;
  const archive = cfb.read(data, {type:'buffer'});
  const entry = cfb.find(archive, '/xl/sharedStrings.xml');
  if (entry) {
    const xml = Buffer.from(entry.content).toString('utf8');
    const normalized = xml.replace(/<si\s*\/>/g, '<si><t xml:space="preserve"> </t></si>');
    if (normalized !== xml) {
      cfb.utils.cfb_add(archive, '/xl/sharedStrings.xml', Buffer.from(normalized, 'utf8'));
      data = cfb.write(archive, {type:'buffer',fileType:'zip',compression:true});
    }
  }
  return XLSX.read(data, {type:'buffer',cellDates:false});
}
