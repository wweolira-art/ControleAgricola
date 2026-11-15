"""Converte a coleta completa em linhas do modelo, sem criar dados ausentes."""
import json
import re
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
source = json.loads((ROOT/'tmp/inceres-api/analises-todas-safras.json').read_text(encoding='utf-8'))
if source.get('completa') is not True:
    raise SystemExit('A coleta ainda não está completa; geração final interrompida.')
features = json.loads((ROOT/'PlanejamentoAgricola/public/data/Fazendas.json').read_text(encoding='utf-8-sig'))['features']

def rings(geometry):
    return geometry['coordinates'] if geometry['type']=='Polygon' else [ring for polygon in geometry['coordinates'] for ring in polygon]

for feature in features:
    coordinates=[xy for ring in rings(feature['geometry']) for xy in ring]
    feature['bbox_calc']=(min(p[0] for p in coordinates), min(p[1] for p in coordinates), max(p[0] for p in coordinates), max(p[1] for p in coordinates))

def inside_ring(point, ring):
    x,y=point;inside=False
    for a,b in zip(ring,ring[1:]+ring[:1]):
        ax,ay=a[:2];bx,by=b[:2]
        cross=(x-ax)*(by-ay)-(y-ay)*(bx-ax)
        if abs(cross)<1e-12 and min(ax,bx)-1e-12<=x<=max(ax,bx)+1e-12 and min(ay,by)-1e-12<=y<=max(ay,by)+1e-12:
            return True
        if (ay>y)!=(by>y) and x<(bx-ax)*(y-ay)/(by-ay)+ax:
            inside=not inside
    return inside

def in_geometry(point, geometry):
    polygons=[geometry['coordinates']] if geometry['type']=='Polygon' else geometry['coordinates']
    return any(inside_ring(point,p[0]) and not any(inside_ring(point,hole) for hole in p[1:]) for p in polygons)

text=(ROOT/'PlanejamentoAgricola/server/analise-solo-associacoes.ts').read_text(encoding='utf-8')
m=re.search(r'export const SOIL_FARM_OPTIONS[^=]*=\s*(\[)',text)
catalog,_=json.JSONDecoder().raw_decode(text[m.start(1):])
zones={f['fazenda']:f['zonas'][0] for f in catalog if len(f.get('zonas',[]))==1}
def normalize_farm(name):
    name=''.join(c for c in unicodedata.normalize('NFKD',str(name).upper()) if not unicodedata.combining(c))
    return re.sub(r'^FAZENDA\s+','',re.sub(r'\s+',' ',name).strip())
catalog_by_name=defaultdict(list)
for farm in catalog:catalog_by_name[normalize_farm(farm['name'])].append(farm)
mapping={'I':'ph_cacl2','J':'mos','K':'p_mehl','L':'s','M':'ca','N':'mg','O':'na','P':'k','Q':'al','R':'h_al','S':'ce','T':'sb','U':'ctc_efetiva','V':'v','W':'c','X':'sat_ca','Y':'sat_mg','Z':'sat_na','AA':'sat_k','AB':'cu','AC':'fe','AD':'mn','AE':'zn','AF':'b'}
usable_elements=set(mapping.values())
prepared=[];pending=[];coverage=[];seen={};duplicates=[];unknown=set();count_values=0
for entry in source['grades']:
    grade=entry['grade'];grade_rows=0;grade_points_with_results=0
    for item in entry['pontos']:
        point=item['ponto'];by_depth=defaultdict(dict)
        for result in item['resultados']:
            value=result.get('value');element=result['name'];depth=result['size']
            if value is not None and (isinstance(value,bool) or not isinstance(value,(float,int))):
                raise ValueError('Valor químico não numérico')
            if element in by_depth[depth] and by_depth[depth][element]!=value:
                raise ValueError('Resultados conflitantes no mesmo ponto/profundidade/elemento')
            by_depth[depth][element]=value
            count_values+=value is not None
        if not any(v is not None for values in by_depth.values() for v in values.values()):
            continue
        grade_points_with_results+=1
        location=re.fullmatch(r'POINT\s*\(\s*([-+\d.eE]+)\s+([-+\d.eE]+)\s*\)',point['wkt'])
        if not location:
            pending.append({'grade':grade['id'],'ponto':point['id'],'motivo':'Geometria do ponto não reconhecida'});continue
        xy=tuple(map(float,location.groups()))
        matches={}
        for feature in features:
            xmin,ymin,xmax,ymax=feature['bbox_calc']
            if xmin<=xy[0]<=xmax and ymin<=xy[1]<=ymax and in_geometry(xy,feature['geometry']):
                p=feature['properties'];matches[(p['Cod_fazend'],p['Lote'])]=p
        if len(matches)!=1:
            pending.append({'grade':grade['id'],'grade_nome':grade['model'],'ponto':point['id'],'ponto_nome':point.get('displayId'),'coordenadas':xy,'motivo':'Sem polígono único','candidatos':list(matches.values())});continue
        polygon=next(iter(matches.values()));farm=polygon['Cod_fazend'];field=polygon['Lote']
        if farm is None:
            candidates=catalog_by_name[normalize_farm(polygon.get('Fazenda'))]
            if len(candidates)==1:farm=candidates[0]['fazenda']
        zone=zones.get(farm)
        if isinstance(farm,bool) or isinstance(field,bool) or not str(farm).isdigit() or not str(field).isdigit():
            pending.append({'grade':grade['id'],'ponto':point['id'],'fazenda':farm,'talhao':field,'motivo':'Código não numérico no polígono'});continue
        farm=int(farm);field=int(field)
        if zone is None:
            pending.append({'grade':grade['id'],'ponto':point['id'],'fazenda':farm,'talhao':field,'motivo':'Zona não confirmada no catálogo'});continue
        date=grade.get('dateOfManufacture')
        if not isinstance(date,str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}',date):
            pending.append({'grade':grade['id'],'ponto':point['id'],'motivo':'Data de referência ausente'});continue
        for depth,values in by_depth.items():
            if not any(values.get(element) is not None for element in usable_elements):
                continue
            provenance={'grade':grade['id'],'grade_nome':grade['model'],'safra':grade['cropYear'],'ponto_id':point['id'],'ponto':point.get('displayId'),'coordenadas':xy}
            row={'data':date,'fazenda':farm,'fazenda_nome':polygon.get('Fazenda'),'talhao':field,'zona':zone,'profundidade':depth,'values':values,'origens':[provenance]}
            # Consolidar só cópias exatas da mesma amostra/local/data/profundidade.
            identity=(grade['cropYear'],date,farm,field,zone,xy,depth)
            exported=tuple((key,values.get(key)) for key in sorted(usable_elements))
            key=(identity,exported)
            if key in seen:
                prepared[seen[key]]['origens'].append(provenance)
                duplicates.append(provenance)
                continue
            seen[key]=len(prepared);prepared.append(row);grade_rows+=1
    coverage.append({'grade':grade['id'],'nome':grade['model'],'safra':grade['cropYear'],'pontos_consultados':len(entry['pontos']),'pontos_com_valores':grade_points_with_results,'linhas_adicionadas':grade_rows})
prepared.sort(key=lambda r:(r['fazenda'],r['talhao'],r['data'],r['origens'][0]['ponto_id'],float(r['profundidade'].split('-')[0])))
result={'resumo':{'grades_consultadas':len(source['grades']),'pontos_consultados':sum(len(g['pontos']) for g in source['grades']),'valores_nao_nulos_na_origem':count_values,'linhas_exportaveis':len(prepared),'pontos_pendentes_identificacao':len(pending),'copias_exatas_consolidadas':len(duplicates)},'cobertura':coverage,'pendencias':pending,'linhas':prepared,'mapping':mapping}
(ROOT/'tmp/inceres-excel/api-preparado.json').write_text(json.dumps(result,ensure_ascii=False),encoding='utf-8')
print(json.dumps(result['resumo'],ensure_ascii=False))
