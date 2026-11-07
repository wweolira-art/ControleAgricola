import ExcelJS from 'exceljs';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {COMPUSOFT_HEADERS,compusoftRow,type CompusoftPlan} from '../src/lib/analise-solo-compusoft.js';

export const COMPUSOFT_TEMPLATE=fileURLToPath(new URL('./templates/analise-solo-compusoft.xlsx',import.meta.url));
export async function exportCompusoftWorkbook(plan:CompusoftPlan):Promise<Buffer>{
  if(plan.errors.length||plan.conflicts.length||!plan.items.length)throw new Error('Resolva as pendências antes de gerar o Excel.');
  const template=new ExcelJS.Workbook();await template.xlsx.load(await readFile(COMPUSOFT_TEMPLATE) as any);
  if(template.worksheets.length!==1)throw new Error('O modelo deve conter apenas uma aba de importação.');
  const reference=template.worksheets[0];
  for(let i=0;i<34;i++)if((reference.getCell(2,i+1).value??null)!==COMPUSOFT_HEADERS[i])throw new Error(`Modelo incompatível na coluna ${i+1}.`);
  const exampleStyle=Array.from({length:34},(_,i)=>structuredClone(reference.getCell(3,i+1).style));
  // Reconstrói somente as duas linhas de layout; spliceRows no ExcelJS pode
  // manter linhas estilizadas e deslocar o primeiro addRow para depois da linha 3.
  const workbook=new ExcelJS.Workbook();
  const sheet=workbook.addWorksheet(reference.name,{properties:structuredClone(reference.properties),views:structuredClone(reference.views),pageSetup:structuredClone(reference.pageSetup)});
  for(let i=1;i<=34;i++){
    const source=reference.getColumn(i),target=sheet.getColumn(i);target.width=source.width;target.hidden=source.hidden;target.style=structuredClone(source.style);
    for(const r of[1,2]){const cell=sheet.getCell(r,i);cell.value=r===2?COMPUSOFT_HEADERS[i-1]:null;cell.style=structuredClone(reference.getCell(r,i).style);}
  }
  for(const r of[1,2])sheet.getRow(r).height=reference.getRow(r).height;
  for(const item of plan.items){
    const values=compusoftRow(item);const r=sheet.addRow(values);
    values.forEach((v,i)=>{const cell=r.getCell(i+1);cell.style={...exampleStyle[i]};cell.value=v;});
    r.getCell(3).numFmt='@';r.getCell(8).numFmt='@';
  }
  // Não insere capa, linhas auxiliares, fórmulas ou abas de conferência no arquivo de importação.
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
