import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import {createRequire} from 'node:module';
import {readSoilWorkbook} from '../server/analise-solo-xlsx.ts';

test('mantém índices de strings quando o laboratório exporta si vazio autocontido',()=>{
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Talhão','Descrição','Profundidade','S'],['MUZI',832,'0-20',''],['SÃO MARCOS',834,'20-40','']]),'Worksheet');
  const raw=XLSX.write(wb,{type:'buffer',bookType:'xlsx',bookSST:true});
  const cfb=createRequire(import.meta.url)('xlsx').CFB;
  const archive=cfb.read(raw,{type:'buffer'});const entry=cfb.find(archive,'/xl/sharedStrings.xml');
  const xml=Buffer.from(entry.content).toString('utf8');
  const modified=xml.replace(/<si><t><\/t><\/si>/g,'<si/>');
  assert.notEqual(modified,xml,'O fixture precisa conter uma string vazia.');
  cfb.utils.cfb_add(archive,'/xl/sharedStrings.xml',Buffer.from(modified));
  const bytes=cfb.write(archive,{type:'buffer',fileType:'zip'});
  const output=readSoilWorkbook(bytes);
  assert.equal(output.Sheets.Worksheet.C3.v,'20-40');
  assert.equal(output.Sheets.Worksheet.A3.v,'SÃO MARCOS');
  assert.equal(String(output.Sheets.Worksheet.D2.v).trim(),'');
});
