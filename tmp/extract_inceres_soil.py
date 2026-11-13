import base64
import json
import re
from collections import Counter
from pathlib import Path

source = Path('tmp/inceres-soil-478767.har')
entries = json.loads(source.read_text(encoding='utf-8-sig'))['log']['entries']
points = {}
grade = None
area = None

def response(entry):
    content = entry['response']['content']
    text = content.get('text', '')
    if content.get('encoding') == 'base64':
        text = base64.b64decode(text).decode('utf-8')
    return json.loads(text)

for entry in entries:
    url = entry['request']['url']
    if entry['response']['status'] != 200:
        continue
    match = re.search(r'/cars/478767/pieces/(\d+)/pieces_values$', url)
    if match:
        points[int(match[1])] = response(entry)
    elif re.search(r'/cars/478767$', url):
        grade = response(entry)
    elif '/areas?' in url:
        for candidate in response(entry):
            if candidate['id'] == 1472724:
                area = candidate

assert grade and area
identifiers = {point['id']: point['displayId'] for point in grade['pieces']}
assert set(identifiers) == set(points), 'Nem todos os pontos possuem resposta capturada'
specifications = {key: value.replace('\\u00b3', '³') for key, value in grade['specifications'].items()}
aliases = {'h_al': 'h+Al', 'ctc': 't', 'p_mehl': 'p', 'p_res': 'p'}
records = []
for point_id in identifiers:
    for item in points[point_id]:
        element = item['name']
        records.append({
            'fazenda': area['farm'], 'lote': area['field'], 'talhao': area['field'], 'safra': grade['cropYear'],
            'grade_id': grade['id'], 'grade_nome': grade['model'],
            'ponto_id': point_id, 'ponto': identifiers[point_id],
            'profundidade_cm': item['size'], 'elemento': element, 'valor': item['value'],
            'unidade': specifications.get(aliases.get(element, element)),
        })

assert len(records) == 318
assert len({(r['ponto_id'], r['profundidade_cm'], r['elemento']) for r in records}) == len(records)
summary = {'fazenda': area['farm'], 'lote': area['field'], 'safra': grade['cropYear'],
           'grade_id': grade['id'], 'grade_nome': grade['model'], 'area_ha': area['totalArea'],
           'pontos_consultados': len(points), 'registros': len(records),
           'valores_nulos': sum(r['valor'] is None for r in records),
           'profundidades_cm': sorted({r['profundidade_cm'] for r in records}),
           'registros_por_profundidade': dict(Counter(r['profundidade_cm'] for r in records))}
out = Path('output/inceres')
out.mkdir(parents=True, exist_ok=True)
payload = {'resumo': summary,
           'escopo': 'Todos os pontos da grade 478767. Não inclui as demais grades ou lotes da fazenda.',
           'fonte': 'Respostas autenticadas do InCeres Solo observadas no navegador.',
           'unidades': 'Unidades preservadas da grade. Null indica unidade não explicitada no cadastro; não foi inferida.',
           'especificacoes_originais': specifications, 'resultados': records}
(out / 'analise_solo_fazenda_nova_grade_478767.json').write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
lines = ['# Consulta de análise de solo — InCeres', '',
         f"Fazenda: {area['farm']} · Lote: {area['field']} · Safra: {grade['cropYear']}", '',
         f"Grade {grade['id']}: {grade['model']}. Área: {area['totalArea']} ha.", '',
         f"{len(points)} pontos, {len(records)} registros e {summary['valores_nulos']} valores nulos.", '',
         'Esta consulta cobre todos os pontos desta grade; as demais grades e lotes não estão incluídos.', '',
         '— indica valor ausente ou unidade não explicitada na grade. Unidades não foram inferidas.', '',
         '| Fazenda | Talhão | Grade | Ponto | Profundidade (cm) | Elemento | Valor | Unidade cadastrada |',
         '|---|---|---|---|---|---|---:|---|']
for r in records:
    value = '—' if r['valor'] is None else str(r['valor']).replace('.', ',')
    lines.append(f"| {r['fazenda']} | {r['talhao']} | {r['grade_id']} | {r['ponto']} | {r['profundidade_cm']} | {r['elemento']} | {value} | {r['unidade'] or '—'} |")
(out / 'consulta_analise_solo_grade_478767.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')
print(json.dumps(summary, ensure_ascii=False))
