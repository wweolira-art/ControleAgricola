import json,base64,re
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
for point in grade['pieces']:
    m=re.fullmatch(r'POINT\s*\(\s*([-+\d.eE]+)\s+([-+\d.eE]+)\s*\)',point['wkt'])
    if not m:raise ValueError('WKT inválido')
    coords=tuple(map(float,m.groups()))
    matches=[f['properties'] for f in features if contains(coords,f['geometry'])]
    rows.append({'ponto':point['displayId'],'ponto_id':point['id'],'longitude':coords[0],'latitude':coords[1],'correspondencias':matches})
out={'fonte_poligonos':'PlanejamentoAgricola/public/data/Fazendas.json','grade':grade['id'],'pontos':rows,'data_cadastro_grade':grade.get('dateOfManufacture')}
(root/'tmp/inceres-excel/poligonos-identificados.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(out,ensure_ascii=True,indent=2))
