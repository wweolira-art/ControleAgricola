/* Leitura manual, após revisão, na sessão autenticada do dashboard InCeres.
 * Não lê cookies, senhas ou tokens; não modifica dados do InCeres.
 * Baixa os índices. A existência de uma safra no seletor não garante análises.
 */
(async () => {
  if (location.origin !== 'https://dashboard.inceres.com.br') throw new Error('Abra o dashboard autenticado do InCeres.');
  async function get(route) {
    const r = await fetch(route, {credentials:'same-origin', signal:AbortSignal.timeout(35000)});
    if (!r.ok || !r.headers.get('content-type')?.includes('json')) throw new Error(`Resposta inválida em ${route}: ${r.status}`);
    return r.json();
  }
  const safras = await get('/api/farmers/me/years');
  if (!Array.isArray(safras) || !safras.every(s=>/^\d{4}-\d{4}$/.test(s))) throw new Error('Formato inesperado das safras');
  const indices = [], erros = [];
  for (const safra of safras) {
    try {
      const grades = await get(`/api/farmers/me/dashboards/grids-status?cropYear=${encodeURIComponent(safra)}`);
      if (!Array.isArray(grades)) throw new Error('Índice não retornou lista');
      indices.push({safra,grades});
      console.log('Índice coletado',safra,grades.length);
    } catch(e) {erros.push({safra,mensagem:e.message});}
  }
  const data={formato:'inceres-indices-v1',consultado_em:new Date().toISOString(),safras,indices,erros};
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  const link=document.createElement('a'); link.href=url; link.download='inceres_indices_todas_safras.json'; link.click();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
  console.log('Índices encerrados',{safras:indices.length,erros:erros.length});
})();
