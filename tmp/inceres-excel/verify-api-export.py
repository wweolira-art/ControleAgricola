import json
from pathlib import Path
import xml.etree.ElementTree as E
import zipfile
import sys
from collections import Counter

root=Path(__file__).resolve().parents[2]
prepared=json.loads((root/'tmp/inceres-excel/api-preparado.json').read_text(encoding='utf-8'))
year=sys.argv[1]
prepared['linhas']=[r for r in prepared['linhas'] if any(o['safra']==year for o in r['origens'])]
file=root/f'outputs/inceres-todas-consultadas-20261113/Importacao_Analise_Solo_InCeres_{year}.xlsx'
n={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
def read_cells(archive):
    shared=[''.join(x.itertext()) for x in E.fromstring(archive.read('xl/sharedStrings.xml')).findall('s:si',n)] if 'xl/sharedStrings.xml' in archive.namelist() else []
    sheet=E.fromstring(archive.read('xl/worksheets/sheet1.xml'))
    cells={}
    for c in sheet.findall('.//s:sheetData/s:row/s:c',n):
        v=c.find('s:v',n);inline=c.find('s:is',n)
        value=v.text if v is not None else ''.join(inline.itertext()) if inline is not None else None
        if c.get('t')=='s' and value is not None:value=shared[int(value)]
        cells[c.get('r')]=value
    return sheet,cells

with zipfile.ZipFile(root/'PlanejamentoAgricola/server/templates/analise-solo-compusoft.xlsx') as template:
    _,reference=read_cells(template)
with zipfile.ZipFile(file) as archive:
    sheet,cells=read_cells(archive)
    headers={k:v for k,v in cells.items() if k.rstrip('0123456789')+'2'==k}
    for cell,value in headers.items():assert value==reference.get(cell),(cell,value)
    assert len(E.fromstring(archive.read('xl/workbook.xml')).findall('s:sheets/s:sheet',n))==1
    assert not sheet.findall('.//s:f',n)
    checked=0
    for i,row in enumerate(prepared['linhas'],start=3):
        assert cells['C'+str(i)]=='/'.join(reversed(row['data'].split('-')))
        for col,key in [('E','fazenda'),('F','talhao'),('G','zona')]:assert float(cells[col+str(i)])==row[key]
        assert cells['H'+str(i)]==row['profundidade']
        for col in ['A','B','D','AG','AH']:assert cells.get(col+str(i)) in [None,'']
        for col,element in prepared['mapping'].items():
            expected=row['values'].get(element);actual=cells.get(col+str(i))
            if expected is None:assert actual in [None,''],(col,i,actual)
            else:assert float(actual.replace(',','.'))==expected,(col,i,actual,expected);checked+=1
    data_rows={int(k.lstrip('ABCDEFGHIJKLMNOPQRSTUVWXYZ')) for k,v in cells.items() if k.startswith('H') and k[1:].isdigit() and int(k[1:])>=3 and v is not None}
    assert len(data_rows)==len(prepared['linhas'])
    print(json.dumps({'verificado':True,'linhas':len(data_rows),'valores_conferidos':checked,'fazendas':dict(Counter(r['fazenda_nome'] for r in prepared['linhas']))},ensure_ascii=False))
