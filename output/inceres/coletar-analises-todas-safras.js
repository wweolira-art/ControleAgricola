/* Executar manualmente, após revisão, em https://solo.inceres.com.br/.
 * Selecione o JSON gerado por coletar-indices-todas-safras.js.
 * O arquivo é lido localmente; não é enviado ao InCeres.
 * Somente GET nos endpoints observados; não lê nem exporta credenciais.
 * Mantém os metadados completos, pontos, polígonos, unidades e valores nulos.
 */
(async () => {
  if(location.origin!=='https://solo.inceres.com.br') throw new Error('Abra o Solo InCeres autenticado.');
  const input=document.createElement('input'); input.type='file';input.accept='.json,application/json';
  const file=await new Promise(resolve=>{input.onchange=()=>resolve(input.files[0]);input.oncancel=()=>resolve(null);input.click();});
  if(!file) throw new Error('Seleção cancelada');
  const indices=JSON.parse(await file.text());
  if(indices.formato!=='inceres-indices-v1'||!Array.isArray(indices.indices)) throw new Error('Arquivo de índices inválido');
  const exportacao={formato:'inceres-conta-v1',consultado_em:new Date().toISOString(),indices,grades:[],erros:[]};
  const ids=new Map();
  for(const index of indices.indices) for(const g of index.grades) {
    if(!Number.isSafeInteger(g.amostragemId)) {exportacao.erros.push({etapa:'indice',mensagem:'ID de grade inválido'});continue;}
    ids.set(g.amostragemId,g);
  }
  const areas=new Map(); let consultas=0;
  function download() {
    const url=URL.createObjectURL(new Blob([JSON.stringify(exportacao,null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download='inceres_analises_todas_safras.json';link.click();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  async function get(route) {
    consultas++;
    const r=await fetch(route,{credentials:'same-origin',signal:AbortSignal.timeout(35000)});
    if(!r.ok||!r.headers.get('content-type')?.includes('json')) throw new Error(`HTTP ${r.status} em ${route}`);
    return r.json();
  }
  try {
    for(const [id] of ids) {
      try {
        const grade=await get(`/api/farmers/me/cars/${id}`);
        if(grade.id!==id||!Array.isArray(grade.pieces)||!Array.isArray(grade.areasIds)) throw new Error('Grade inválida');
        const row={grade,talhoes:[],pontos:[],completa:false};
        exportacao.grades.push(row);
        const key=JSON.stringify([grade.clientId,grade.farmId,[...grade.areasIds].sort()]);
        if(!areas.has(key)) {
          try {
            if(![grade.clientId,grade.farmId,...grade.areasIds].every(Number.isSafeInteger)) throw new Error('IDs inválidos de talhão');
            const data=await get(`/api/farmers/me/clients/${grade.clientId}/farms/${grade.farmId}/areas?areasId=${encodeURIComponent(JSON.stringify(grade.areasIds))}`);
            if(!Array.isArray(data)) throw new Error('Talhões inválidos');
            areas.set(key,data);
          } catch(e) {exportacao.erros.push({grade_id:id,etapa:'talhoes',mensagem:e.message});}
        }
        row.talhoes=areas.get(key)||[];
        for(const point of grade.pieces) {
          try {
            if(!Number.isSafeInteger(point.id)) throw new Error('ID de ponto inválido');
            const resultados=await get(`/api/farmers/me/cars/${id}/pieces/${point.id}/pieces_values`);
            if(!Array.isArray(resultados)) throw new Error('Resultados inválidos');
            row.pontos.push({ponto:point,resultados});
          } catch(e) {exportacao.erros.push({grade_id:id,ponto_id:point.id,etapa:'resultados',mensagem:e.message});}
        }
        row.completa=row.pontos.length===grade.pieces.length&&grade.areasIds.every(a=>row.talhoes.some(t=>t.id===a));
        console.log('InCeres',{grade:id,grades:exportacao.grades.length,esperadas:ids.size,pontos:row.pontos.length,erros:exportacao.erros.length});
      } catch(e) {exportacao.erros.push({grade_id:id,etapa:'grade',mensagem:e.message});}
    }
  } finally {
    exportacao.consultas=consultas;exportacao.grades_esperadas=ids.size;
    exportacao.completa=!indices.erros.length&&!exportacao.erros.length&&exportacao.grades.length===ids.size&&exportacao.grades.every(g=>g.completa);
    download();
    console.log('Coleta encerrada',{completa:exportacao.completa,grades:exportacao.grades.length,erros:exportacao.erros.length});
  }
})();
