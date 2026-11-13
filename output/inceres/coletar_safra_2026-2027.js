/*
 * Coleta de leitura para a sessão do usuário no InCeres Solo.
 * Executar manualmente, após revisão, numa página https://solo.inceres.com.br/.
 * Não lê nem exporta cookies/tokens. As requisições usam a sessão do navegador.
 * Usa somente os endpoints de leitura observados no site e os IDs do índice da safra.
 * Não altera cadastros, análises, permissões ou configurações do serviço.
 */
(async () => {
  if (location.origin !== 'https://solo.inceres.com.br') {
    throw new Error('Abra uma página do Solo InCeres na sua sessão autenticada antes de executar.');
  }
  const safra = '2026-2027';
  const gradeIds = [478767,433080,433079,432103,432102,432100,431867,431866,
    431378,431377,431374,431364,431362,431357,431354,431351,431349,431346,
    433078,432101,431353];
  const grades = [];
  const erros = [];
  const areas = new Map();
  let consultas = 0;
  async function get(path) {
    if (++consultas > 5000) throw new Error('Limite de segurança de consultas atingido.');
    const response = await fetch(path, {
      method: 'GET', credentials: 'same-origin', headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(35000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} em ${path}`);
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('json')) throw new Error('A sessão pode ter expirado: o servidor não retornou JSON.');
    return response.json();
  }
  for (const id of gradeIds) {
    try {
      const grade = await get(`/api/farmers/me/cars/${id}`);
      if (grade.id !== id || grade.cropYear !== safra || !Array.isArray(grade.pieces)) {
        throw new Error(`Grade ${id} não confirmou a safra solicitada.`);
      }
      const key = `${grade.clientId}/${grade.farmId}/${[...grade.areasIds].sort().join(',')}`;
      if (!areas.has(key)) {
        try {
          const query = encodeURIComponent(JSON.stringify(grade.areasIds));
          const data = await get(`/api/farmers/me/clients/${grade.clientId}/farms/${grade.farmId}/areas?areasId=${query}`);
          if (!Array.isArray(data)) throw new Error('A consulta de talhões não retornou uma lista.');
          areas.set(key, data);
        } catch (error) {
          erros.push({ grade_id: id, etapa: 'talhoes', mensagem: error.message });
          areas.set(key, []);
        }
      }
      const resultadosPorPonto = [];
      for (const ponto of grade.pieces) {
        try {
          const resultados = await get(`/api/farmers/me/cars/${id}/pieces/${ponto.id}/pieces_values`);
          if (!Array.isArray(resultados)) throw new Error('O resultado do ponto não é uma lista.');
          resultadosPorPonto.push({ ponto_id: ponto.id, ponto: ponto.displayId, resultados });
        } catch (error) {
          erros.push({ grade_id: id, ponto_id: ponto.id, etapa: 'resultados', mensagem: error.message });
        }
      }
      grades.push({ grade_id: grade.id, grade_nome: grade.model, safra: grade.cropYear,
        cliente_id: grade.clientId, fazenda_id: grade.farmId, talhoes: areas.get(key),
        especificacoes_originais: grade.specifications, pontos_esperados: grade.pieces.length,
        pontos_consultados: resultadosPorPonto });
      console.log(`InCeres: ${grades.length}/${gradeIds.length} grades consultadas.`,
        { grade: id, pontos: resultadosPorPonto.length, erros: erros.length });
    } catch (error) {
      erros.push({ grade_id: id, etapa: 'grade', mensagem: error.message });
    }
  }
  const resultado = {
    safra, consultado_em: new Date().toISOString(), grades_esperadas: gradeIds.length,
    grades_consultadas: grades.length, completo: erros.length === 0 && grades.length === gradeIds.length,
    consultas, erros, grades,
  };
  const link = document.createElement('a');
  const objectUrl = URL.createObjectURL(new Blob([JSON.stringify(resultado, null, 2)], { type: 'application/json' }));
  link.href = objectUrl;
  link.download = 'inceres_resultados_safra_2026-2027.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
  console.log('Consulta encerrada. O arquivo registra cobertura e eventuais falhas.',
    { grades: grades.length, erros: erros.length, completo: resultado.completo });
})();
