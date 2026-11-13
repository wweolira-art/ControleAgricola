import json
from pathlib import Path

root = Path('output/inceres')
index = json.loads(Path('tmp/inceres-season-index.json').read_text(encoding='utf-8-sig'))
areas = json.loads(Path('tmp/inceres-season/areas_safra.json').read_text(encoding='utf-8-sig'))
by_area = {area['id']: area for area in areas}
previous = json.loads((root / 'analise_solo_fazenda_nova_grade_478767.json').read_text(encoding='utf-8'))
records = previous['resultados']
complete_grades = {478767}
collection_file = Path.home() / 'Downloads/inceres_resultados_safra_2026-2027.json'
errors = []
if collection_file.exists():
    collection = json.loads(collection_file.read_text(encoding='utf-8-sig'))
    assert collection['safra'] == '2026-2027'
    records = []
    complete_grades = set()
    errors = collection['erros']
    aliases = {'h_al': 'h+Al', 'ctc': 't', 'p_mehl': 'p', 'p_res': 'p'}
    for grade in collection['grades']:
        specs = grade.get('especificacoes_originais') or {}
        if len(grade['pontos_consultados']) == grade['pontos_esperados']:
            complete_grades.add(grade['grade_id'])
        local_areas = grade['talhoes']
        local = local_areas[0] if len(local_areas) == 1 else None
        for point in grade['pontos_consultados']:
            for value in point['resultados']:
                records.append({'fazenda': local.get('farm') if local else None,
                    'talhao': local.get('field') if local else None,
                    'safra': grade['safra'], 'grade_id': grade['grade_id'], 'grade_nome': grade['grade_nome'],
                    'ponto_id': point['ponto_id'], 'ponto': point['ponto'],
                    'profundidade_cm': value['size'], 'elemento': value['name'], 'valor': value['value'],
                    'unidade': specs.get(aliases.get(value['name'], value['name']))})

coverage = []
for grade in index:
    linked = [by_area[area_id] for area_id in grade.get('areasIds', []) if area_id in by_area]
    found = [record for record in records if record['grade_id'] == grade['amostragemId']]
    coverage.append({'grade_id': grade['amostragemId'], 'grade_nome': grade['nome'],
        'fazenda': grade['nomeDaFazenda'], 'talhoes': [area['field'] for area in linked],
        'estado_inceres': grade.get('estado'), 'resultados_consultados': grade['amostragemId'] in complete_grades,
        'registros_coletados': len(found), 'profundidades_indicadas': grade.get('profundidades', [])})

assert len(coverage) == 21
assert len(by_area) == 19
assert len({(r['grade_id'], r['ponto_id'], r['profundidade_cm'], r['elemento']) for r in records}) == len(records)
summary = {'safra': '2026-2027', 'grades_identificadas': len(coverage), 'talhoes_identificados': len(by_area),
    'grades_consultadas': len(complete_grades), 'registros_coletados': len(records),
    'cobertura_completa': len(complete_grades) == len(coverage) and not errors}
payload = {'resumo': summary, 'cobertura': coverage, 'falhas': errors, 'resultados': records}
(root / 'analise_solo_safra_2026-2027.json').write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
lines = ['# Consulta da safra 2026/2027 — InCeres', '',
    f"Identificadas **{len(coverage)} grades** e **{len(by_area)} talhões** da Fazenda Nova.", '',
    f"Resultados coletados: **{len(complete_grades)} de {len(coverage)} grades**, com **{len(records)} registros**.", '',
    '**Coleta completa.**' if summary['cobertura_completa'] else '**Coleta parcial: as grades pendentes estão identificadas abaixo. Não interpretar ausência de coleta como ausência de análise.**', '',
    '## Cobertura da safra', '', '| Fazenda | Talhão | Grade | Nome da grade | Estado no InCeres | Consulta dos resultados | Registros |',
    '|---|---|---|---|---|---|---:|']
for grade in coverage:
    lines.append(f"| {grade['fazenda']} | {'; '.join(grade['talhoes']) or 'Não identificado'} | {grade['grade_id']} | {grade['grade_nome']} | {grade['estado_inceres']} | {'Concluída' if grade['resultados_consultados'] else 'Pendente'} | {grade['registros_coletados']} |")
lines += ['', '## Resultados consultados', '', '— indica campo sem valor ou unidade não explicitada na grade.', '',
    '| Fazenda | Talhão | Grade | Ponto | Profundidade (cm) | Elemento | Valor | Unidade cadastrada |',
    '|---|---|---|---|---|---|---:|---|']
for record in records:
    val = '—' if record['valor'] is None else str(record['valor']).replace('.', ',')
    lines.append(f"| {record['fazenda'] or '—'} | {record['talhao'] or '—'} | {record['grade_id']} | {record['ponto']} | {record['profundidade_cm']} | {record['elemento']} | {val} | {record['unidade'] or '—'} |")
(root / 'consulta_safra_2026-2027.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')
print(json.dumps(summary, ensure_ascii=False))
