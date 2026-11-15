import json,base64,re,sys
from pathlib import Path
root=Path(__file__).resolve().parents[2]
features=json.loads((root/'PlanejamentoAgricola/public/data/Fazendas.json').read_text(encoding='utf-8-sig'))['features']
for e in json.loads((root/'tmp/inceres-soil-478767.har').read_text(encoding='utf-8-sig'))['log']['entries']:
    if e['request']['url'].endswith('/cars/478767') and e['response']['status']==200:
        c=e['response']['content'];grade=json.loads(base64.b64decode(c['text']) if c.get('encoding')=='base64' else c['text']);break
def ring_contains(pt,ring):
    x,y=pt;inside=False
    for a,b in zip(ring,ring[1:]+ring[:1]):
        ax,ay=a[:2];bx,by=b[:2]
        cross=(x-ax)*(by-ay)-(y-ay)*(bx-ax)
        if abs(cross)<1e-12 and min(ax,bx)-1e-12<=x<=max(ax,bx)+1e-12 and min(ay,by)-1e-12<=y<=max(ay,by)+1e-12:return 2
        if (ay>y)!=(by>y) and x<(bx-ax)*(y-ay)/(by-ay)+ax:inside=not inside
    return int(inside)
def contains(pt,geometry):
    if geometry['type']=='Polygon': polys=[geometry['coordinates']]
    elif geometry['type']=='MultiPolygon':polys=geometry['coordinates']
    else:return False
    return any(ring_contains(pt,p[0]) and not any(ring_contains(pt,h) for h in p[1:]) for p in polys)
rows=[]
grades=[grade]
if '--collected' in sys.argv:
    checkpoint=json.loads((root/'tmp/inceres-season/checkpoint-nativo-01.json').read_text(encoding='utf-8-sig'))
    completed_ids={int(re.search(r'/cars/(\d+)/',k).group(1)) for k in checkpoint['respostas'] if k.endswith('/pieces_values')}
    grades += [v for k,v in checkpoint['respostas'].items() if re.search(r'/cars/\d+$',k) and v['id'] in completed_ids and v['id']!=grade['id']]
catalog_text=(root/'PlanejamentoAgricola/server/analise-solo-associacoes.ts').read_text(encoding='utf-8')
match=re.search(r'export const SOIL_FARM_OPTIONS[^=]*=\s*(\[)',catalog_text)
catalog,_=json.JSONDecoder().raw_decode(catalog_text[match.start(1):])
zones={f['fazenda']:f['zonas'][0] for f in catalog if len(f.get('zonas',[]))==1}
for grade in grades:
 for point in grade['pieces']:
    m=re.fullmatch(r'POINT\s*\(\s*([-+\d.eE]+)\s+([-+\d.eE]+)\s*\)',point['wkt'])
    if not m:raise ValueError('WKT inválido')
    coords=tuple(map(float,m.groups()))
    matches=[f['properties'] for f in features if contains(coords,f['geometry'])]
    rows.append({'grade_id':grade['id'],'ponto':point['displayId'],'ponto_id':point['id'],'longitude':coords[0],'latitude':coords[1],'correspondencias':matches,
                 'zona':zones.get(matches[0]['Cod_fazend']) if len(matches)==1 else None,'data_cadastro_grade':grade.get('dateOfManufacture')})
out={'fonte_poligonos':'PlanejamentoAgricola/public/data/Fazendas.json','pontos':rows}
target='poligonos-coletados.json' if '--collected' in sys.argv else 'poligonos-identificados.json'
(root/'tmp/inceres-excel'/target).write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf-8')
if '--collected' in sys.argv:
    previous=json.loads((root/'output/inceres/analise_solo_safra_2026-2027.json').read_text(encoding='utf-8'))
    results=previous['resultados'][:]
    by_grade={g['id']:g for g in grades}
    for url,values in checkpoint['respostas'].items():
        if not url.endswith('/pieces_values'):continue
        gid,pid=map(int,re.search(r'/cars/(\d+)/pieces/(\d+)/pieces_values$',url).groups())
        g=by_grade[gid];point=next(p for p in g['pieces'] if p['id']==pid)
        for v in values:results.append({'grade_id':gid,'ponto_id':pid,'ponto':point['displayId'],'profundidade_cm':v['size'],'elemento':v['name'],'valor':v['value'],'safra':g['cropYear']})
    keys={(r['grade_id'],r['ponto_id'],r['profundidade_cm'],r['elemento']) for r in results}
    assert len(keys)==len(results)==460
    (root/'tmp/inceres-excel/resultados-coletados.json').write_text(json.dumps({'resumo':{'resultados':len(results),'grades':len(grades),'coleta_completa_da_conta':False},'resultados':results},ensure_ascii=False),encoding='utf-8')
print(json.dumps({'pontos':len(rows),'identificacoes':[{'ponto':r['ponto'],'fazenda':r['correspondencias'][0]['Cod_fazend'] if len(r['correspondencias'])==1 else None,'talhao':r['correspondencias'][0]['Lote'] if len(r['correspondencias'])==1 else None,'zona':r['zona'],'data':r['data_cadastro_grade']} for r in rows]},ensure_ascii=True))
