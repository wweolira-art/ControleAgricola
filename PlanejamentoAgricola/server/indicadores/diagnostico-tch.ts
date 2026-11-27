import { withOracle } from '../oracle.js';
import { resolveOracleCodSafra } from '../colheita/oracle-safra.js';
import type { AnaliseBiometricaRegistro } from './analise-biometrica.js';

export async function diagnosticoTch(registros: AnaliseBiometricaRegistro[], safra: string | null) {
  const latest = new Map<string, AnaliseBiometricaRegistro>();
  for (const r of registros) {
    if (r.tch == null || !Number.isFinite(r.tch)) continue;
    const key = `${Number(r.fazenda)}:${Number(r.talhao)}`;
    if (!latest.has(key) || latest.get(key)!.data < r.data) latest.set(key, r);
  }
  const fields = [...latest.values()].map(r => ({ fazenda: Number(r.fazenda), talhao: Number(r.talhao), data: r.data.slice(0, 10), tch: r.tch!, area: r.areaHa, canaPorMetro: r.canaPorMetro, pesoPorCana: r.pesoPorCana }));
  if (!fields.length || !safra) return { talhoes: [], avisos: ['Diagnóstico: selecione uma safra e consulte registros biométricos válidos.'] };
  return withOracle(async conn => {
    conn.callTimeout = 20000;
    const codSafra = await resolveOracleCodSafra(conn, safra);
    if (codSafra == null) throw new Error('Safra Oracle não identificada.');
    const base = `WITH b AS (SELECT j.* FROM JSON_TABLE(:dados, '$[*]' COLUMNS (fazenda NUMBER PATH '$.fazenda', talhao NUMBER PATH '$.talhao', avaliacao VARCHAR2(10) PATH '$.data')) j), c AS (
      SELECT b.*, t.zona, t.cod_safradetalhe, t.dataplantio, t.data_corte_safra_anterior, t.numerocorte, t.cod_variedade,
      COUNT(*) OVER (PARTITION BY b.fazenda,b.talhao) n,
      CASE WHEN t.data_corte_safra_anterior >= t.dataplantio OR (t.data_corte_safra_anterior IS NOT NULL AND t.dataplantio IS NULL) THEN t.data_corte_safra_anterior WHEN TRIM(t.numerocorte) IN ('1','12M','18M') THEN t.dataplantio ELSE NULL END inicio
      FROM b JOIN agricola.talhao t ON t.cod_fazenda=b.fazenda AND t.cod_talhao=b.talhao AND t.cod_safra=:safra)
      `;
    const binds = { dados: JSON.stringify(fields), safra: codSafra };
    const queries: Record<string,string> = {
      cadastro: `SELECT fazenda,talhao,n,MIN(numerocorte) corte,MIN(cod_variedade) variedade,TO_CHAR(MIN(dataplantio),'YYYY-MM-DD') plantio,TO_CHAR(MIN(inicio),'YYYY-MM-DD') inicio FROM c GROUP BY fazenda,talhao,n`,
      irrigacao: `SELECT c.fazenda,c.talhao,COUNT(DISTINCT TRUNC(v.data)) dias,TO_CHAR(MAX(v.data),'YYYY-MM-DD') ultima FROM c JOIN (SELECT a.cod_fazenda,a.cod_talhao,a.zona,a.cod_safra,a.cod_safradetalhe,a.area,p.data_apontamento data FROM agricola.apontamentoirrigarea a JOIN agricola.apontamentoirrigitem i ON i.id_aptirrigit=a.id_aptirrigit JOIN agricola.apontamento p ON p.idapontamento=i.id_apontamento UNION ALL SELECT i.cod_fazenda,i.cod_talhao,i.zona,i.cod_safra,i.cod_safradetalhe,i.area,p.data_apontamento FROM agricola.irrigacaoapontitem i JOIN agricola.apontamento p ON p.cod_grupoempresa=i.cod_grupoempresa AND p.cod_empresa=i.cod_empresa AND p.cod_filial=i.cod_filial AND p.ano_apontamento=i.ano_apontamento AND p.nr_apontamento=i.nr_apontamento WHERE NVL(i.apenas_paradas,'N')<>'S') v ON v.cod_fazenda=c.fazenda AND v.cod_talhao=c.talhao AND v.zona=c.zona  WHERE c.n=1 AND c.inicio>DATE '1900-01-01' AND v.data>=c.inicio AND v.data<TO_DATE(c.avaliacao,'YYYY-MM-DD')+1 AND v.area>0 GROUP BY c.fazenda,c.talhao`,
      insumos: `SELECT c.fazenda,c.talhao,COUNT(*) registros,COUNT(DISTINCT m.cod_material) produtos,TO_CHAR(MAX(ap.data_apontamento),'YYYY-MM-DD') ultima FROM c JOIN agricola.apontamentoitem i ON i.cod_fazenda=c.fazenda AND i.cod_talhao=c.talhao AND i.zona=c.zona  JOIN agricola.apontamento ap ON ap.cod_grupoempresa=i.cod_grupoempresa AND ap.cod_empresa=i.cod_empresa AND ap.cod_filial=i.cod_filial AND ap.ano_apontamento=i.ano_apontamento AND ap.nr_apontamento=i.nr_apontamento JOIN agricola.apontamentomaterial m ON m.cod_grupoempresa=i.cod_grupoempresa AND m.cod_empresa=i.cod_empresa AND m.cod_filial=i.cod_filial AND m.ano_apontamento=i.ano_apontamento AND m.nr_apontamento=i.nr_apontamento AND m.item_apontamento=i.item_apontamento WHERE c.n=1 AND c.inicio>DATE '1900-01-01' AND ap.data_apontamento>=c.inicio AND ap.data_apontamento<TO_DATE(c.avaliacao,'YYYY-MM-DD')+1 GROUP BY c.fazenda,c.talhao`,
      aplicacoes: `SELECT c.fazenda,c.talhao,TO_CHAR(ap.data_apontamento,'YYYY-MM-DD') data, i.cod_safra safra, i.area, m.cod_material produto, mat.descricao, g.descricao grupo, m.quantidade, m.cod_unidade unidade, CASE WHEN i.area>0 THEN m.quantidade/i.area ELSE NULL END dose, ap.cod_grupoempresa,ap.cod_empresa,ap.cod_filial,ap.ano_apontamento,ap.nr_apontamento,i.item_apontamento,m.nrrequisicao,m.item_requisicao FROM c JOIN agricola.apontamentoitem i ON i.cod_fazenda=c.fazenda AND i.cod_talhao=c.talhao AND i.zona=c.zona  JOIN agricola.apontamento ap ON ap.cod_grupoempresa=i.cod_grupoempresa AND ap.cod_empresa=i.cod_empresa AND ap.cod_filial=i.cod_filial AND ap.ano_apontamento=i.ano_apontamento AND ap.nr_apontamento=i.nr_apontamento JOIN agricola.apontamentomaterial m ON m.cod_grupoempresa=i.cod_grupoempresa AND m.cod_empresa=i.cod_empresa AND m.cod_filial=i.cod_filial AND m.ano_apontamento=i.ano_apontamento AND m.nr_apontamento=i.nr_apontamento AND m.item_apontamento=i.item_apontamento LEFT JOIN material.material mat ON mat.cod_material=m.cod_material LEFT JOIN material.grupomaterial g ON g.cod_familia=mat.cod_familia AND g.cod_grupomaterial=mat.cod_grupomaterial WHERE c.n=1 AND c.inicio>DATE '1900-01-01' AND ap.data_apontamento>=c.inicio AND ap.data_apontamento<TO_DATE(c.avaliacao,'YYYY-MM-DD')+1 ORDER BY c.fazenda,c.talhao,ap.data_apontamento`,
      solo: `SELECT c.fazenda,c.talhao,COUNT(*) analises,TO_CHAR(MAX(s.dt_analise),'YYYY-MM-DD') ultima FROM c JOIN agricola.analisesolo s ON s.cod_fazenda=c.fazenda AND s.cod_talhao=c.talhao AND s.zona=c.zona WHERE c.n=1 AND s.dt_analise<TO_DATE(c.avaliacao,'YYYY-MM-DD')+1 GROUP BY c.fazenda,c.talhao`,
    };
    queries.soloDetalhes = `SELECT c.fazenda,c.talhao,TO_CHAR(s.dt_analise,'YYYY-MM-DD') data,s.nr_analise, it.nr_amostra,it.profundidade,it.ph,it.fosforo,it.potassio,it.calcio,it.magnesio,it.aluminio,it.v,it.materia_organica,it.teor_argila
      FROM c JOIN agricola.analisesolo s ON s.cod_fazenda=c.fazenda AND s.cod_talhao=c.talhao AND s.zona=c.zona
      JOIN agricola.analisesolo_itens it ON it.nr_analise=s.nr_analise
      WHERE c.n=1 AND s.dt_analise=(SELECT MAX(s2.dt_analise) FROM agricola.analisesolo s2 WHERE s2.cod_fazenda=c.fazenda AND s2.cod_talhao=c.talhao AND s2.zona=c.zona AND s2.dt_analise<TO_DATE(c.avaliacao,'YYYY-MM-DD')+1)
      AND (SELECT COUNT(*) FROM agricola.analisesolo sx WHERE sx.nr_analise=s.nr_analise)=1`;
    queries.recomendacoes = `SELECT c.fazenda,c.talhao,TO_CHAR(s.dt_analise,'YYYY-MM-DD') data,r.cod_profundidade,r.nitrogenio,r.fosforo,r.potassio,r.calcario,r.gesso FROM c JOIN agricola.analisesolo s ON s.cod_fazenda=c.fazenda AND s.cod_talhao=c.talhao AND s.zona=c.zona JOIN agricola.recomendacaosolo r ON r.nr_analise=s.nr_analise WHERE c.n=1 AND s.dt_analise<TO_DATE(c.avaliacao,'YYYY-MM-DD')+1 AND r.data_criacao<TO_DATE(c.avaliacao,'YYYY-MM-DD')+1 AND (SELECT COUNT(*) FROM agricola.analisesolo sx WHERE sx.nr_analise=s.nr_analise)=1`;
    const results: Record<string,Record<string,unknown>[]> = {};
    const avisos: string[] = [];
    for (const [name, sql] of Object.entries(queries)) {
      try { results[name] = (await conn.execute(base+sql,binds)).rows as Record<string,unknown>[]; }
      catch (error) { console.warn(`[diagnostico-tch] ${name}`, error instanceof Error ? error.message : String(error)); avisos.push(`Diagnóstico: fonte ${name} indisponível.`); }
    }
    return { avisos, talhoes: fields.map(f => {
      const get = (source: string) => results[source]?.find(r=>Number(r.FAZENDA)===f.fazenda && Number(r.TALHAO)===f.talhao);
      const cadastro=get('cadastro');
      const seguro=Number(cadastro?.N)===1;
      const inicio=String(cadastro?.INICIO ?? '');
      const all = (source: string) => (results[source]??[]).filter(r=>Number(r.FAZENDA)===f.fazenda && Number(r.TALHAO)===f.talhao);
      const cicloValido=seguro && inicio>'1900-01-01' && inicio<=f.data;
      return { ...f, aplicacoes: cicloValido ? all('aplicacoes') : [], soloDetalhes: seguro ? all('soloDetalhes') : [], recomendacoes: seguro ? all('recomendacoes') : [], cicloValido, fontes: Object.fromEntries(Object.keys(queries).map(k=>[k, results[k] ? 'disponivel' : 'indisponivel'])), cadastro: cadastro ?? null, irrigacao: cicloValido ? get('irrigacao') ?? null : null, insumos: cicloValido ? get('insumos') ?? null : null, solo: seguro ? get('solo') ?? null : null,
        limitacoes: [!seguro ? 'Cadastro ausente ou ambíguo: não foi possível vincular com segurança a zona do talhão.' : '', !cicloValido ? 'Ciclo não confirmado: conferir o último corte anterior à biometria. Não inferir ausência de manejo.' : '', ...avisos].filter(Boolean) };
    }) };
  });
}
