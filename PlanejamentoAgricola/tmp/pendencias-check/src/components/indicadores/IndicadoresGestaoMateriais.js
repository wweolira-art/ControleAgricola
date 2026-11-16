// src/components/indicadores/IndicadoresGestaoMateriais.tsx
import { Fragment, useCallback, useEffect as useEffect2, useMemo, useState } from "react";

// src/api.ts
var AUTH_STORAGE_KEY = "pa_auth_token";
function authHeaders(extra, token = authStorage.getToken()) {
  return {
    ...extra ?? {},
    ...token ? { Authorization: `Bearer ${token}` } : {}
  };
}
var fail = async (res) => {
  if (res.type === "opaqueredirect" || res.status >= 300 && res.status < 400) {
    throw new Error("A API tentou redirecionar esta consulta. Abra o sistema pelo endere\xE7o correto e tente novamente.");
  }
  if (res.status === 413) {
    throw new Error("O envio \xE9 grande demais para o servidor. Salve s\xF3 a redu\xE7\xE3o, sem montar outro c\xE1lculo.");
  }
  const text = await res.text();
  try {
    const parsed = JSON.parse(text);
    throw new Error(parsed.error || text);
  } catch (e) {
    if (e instanceof SyntaxError) {
      if (res.status >= 500) {
        throw new Error("O servidor estava reiniciando. Clique em Consultar novamente.");
      }
      throw new Error(text.trim() || `Falha na requisi\xE7\xE3o (${res.status})`);
    }
    throw e;
  }
};
var get = async (url) => {
  const token = authStorage.getToken();
  const res = await fetch(url, { headers: authHeaders(void 0, token), cache: "no-store", redirect: "manual" });
  if (!res.ok) await fail(res);
  return res.json();
};
var send = async (url, method, body) => {
  const token = authStorage.getToken();
  const res = await fetch(url, {
    method,
    cache: "no-store",
    redirect: "manual",
    headers: authHeaders({ "Content-Type": "application/json" }, token),
    body: body == null ? void 0 : JSON.stringify(body)
  });
  if (!res.ok) await fail(res);
  return res.json();
};
var authStorage = {
  getToken: () => localStorage.getItem(AUTH_STORAGE_KEY) ?? sessionStorage.getItem(AUTH_STORAGE_KEY),
  setToken: (token, persist = true) => {
    if (persist) {
      localStorage.setItem(AUTH_STORAGE_KEY, token);
      sessionStorage.removeItem(AUTH_STORAGE_KEY);
    } else {
      sessionStorage.setItem(AUTH_STORAGE_KEY, token);
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  },
  clear: () => {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    sessionStorage.removeItem(AUTH_STORAGE_KEY);
  }
};
var api = {
  getIrrigacaoParametrosEquipamentos: () => get("/api/indicadores/irrigacao/equipamentos-parametros"),
  salvarIrrigacaoParametrosEquipamento: (codigo, body) => send(`/api/indicadores/irrigacao/equipamentos-parametros/${codigo}`, "PUT", body),
  login: (login, password) => send("/api/auth/login", "POST", { login, password }),
  me: () => get("/api/auth/me"),
  logout: () => send("/api/auth/logout", "POST"),
  contracts: (busca, paymentScope = "all") => get(`/api/contracts?paymentScope=${paymentScope}${busca?.trim() ? `&busca=${encodeURIComponent(busca.trim())}` : ""}`),
  exportContracts: () => get("/api/contracts/export"),
  importContracts: (contracts) => send("/api/contracts/import", "POST", { contracts }),
  exportCostPlanning: () => get("/api/cost-planning/export"),
  importCostPlanning: (backup) => send("/api/cost-planning/import", "POST", backup),
  createContract: (body) => send("/api/contracts", "POST", body),
  updateContract: (id, body) => send(`/api/contracts/${id}`, "PUT", body),
  contractPendingPaymentsReport: (ids, paymentScope = "all") => get(`/api/contracts/pending-payments?ids=${ids.join(",")}&paymentScope=${paymentScope}`),
  contractPendingPayments: (id, paymentScope = "all") => get(`/api/contracts/${id}/pending-payments?paymentScope=${paymentScope}`),
  verifyContract: (id) => send(`/api/contracts/${id}/verified`, "POST"),
  deleteContract: (id) => send(`/api/contracts/${id}`, "DELETE"),
  adminPermissionCatalog: () => get("/api/admin/permissions/catalog"),
  adminUsers: () => get("/api/admin/users"),
  createAdminUser: (body) => send("/api/admin/users", "POST", body),
  updateAdminUser: (id, body) => send(`/api/admin/users/${id}`, "PATCH", body),
  verifyAdminPassword: (email, password) => send("/api/admin/users/verify-password", "POST", { email, password }),
  importarFuncionario: (codigo) => get(`/api/admin/funcionarios/${codigo}`),
  pesquisarFuncionarios: (busca) => get(`/api/admin/funcionarios?busca=${encodeURIComponent(busca)}`),
  agroBiAccess: (idUsuario) => get(`/api/admin/agrobi-access/${idUsuario}`),
  updateAgroBiAccess: (idUsuario, abas) => send(`/api/admin/agrobi-access/${idUsuario}`, "PUT", { abas }),
  externalSites: () => get("/api/external-sites"),
  externalSitesAdmin: () => get("/api/external-sites/admin"),
  externalSiteGroup: (id) => get(`/api/external-sites/groups/${id}`),
  registerExternalSite: (body) => send("/api/external-sites/register", "POST", body),
  deleteExternalSiteGroup: (id) => send(`/api/external-sites/groups/${id}`, "DELETE"),
  updateExternalSiteItem: (id, body) => send(`/api/external-sites/items/${id}`, "PATCH", body),
  deleteExternalSiteItem: (id) => send(`/api/external-sites/items/${id}`, "DELETE"),
  setNativeTabHidden: (body) => send(
    "/api/external-sites/native-tabs",
    "PATCH",
    body
  ),
  sheets: () => get("/api/sheets"),
  dashboard: () => get("/api/dashboard"),
  resumo: () => get("/api/resumo"),
  orcadoRealizado: (params) => {
    const q = params?.safraId ? `?safraId=${params.safraId}` : "";
    return get(`/api/orcado-realizado${q}`);
  },
  recursosHumanos: (params) => {
    const q = new URLSearchParams();
    if (params?.safraId) q.set("safraId", String(params.safraId));
    if (params?.anomesInicio) q.set("anomesInicio", params.anomesInicio);
    if (params?.anomesFim) q.set("anomesFim", params.anomesFim);
    const suffix = q.toString() ? `?${q}` : "";
    return get(`/api/recursos-humanos${suffix}`);
  },
  custoDashboard: (params) => {
    const q = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value == null || value === "") continue;
      q.set(key, String(value));
    }
    return get(`/api/custo/dashboard?${q}`);
  },
  custoMatrizSubprocesso: (params) => {
    const q = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value == null || value === "") continue;
      q.set(key, String(value));
    }
    return get(`/api/custo/rateio/matriz-subprocesso?${q}`);
  },
  custoDimensoes: (params) => {
    const q = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value == null || value === "") continue;
      q.set(key, String(value));
    }
    return get(`/api/custo/objetos-custo/dimensoes?${q}`);
  },
  custoObjetosCusto: (params) => {
    const q = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value == null || value === "") continue;
      q.set(key, String(value));
    }
    return get(`/api/custo/objetos-custo?${q}`);
  },
  custoRateioAtividades: (params) => {
    const q = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value == null || value === "") continue;
      q.set(key, String(value));
    }
    return get(`/api/custo/rateio/atividades?${q}`);
  },
  custoRateioOficinaReconciliacao: (params) => {
    const q = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value == null || value === "") continue;
      q.set(key, String(value));
    }
    return get(`/api/custo/rateio/oficina-reconciliacao?${q}`);
  },
  custoRateioTransporteReconciliacao: (params) => {
    const q = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value == null || value === "") continue;
      q.set(key, String(value));
    }
    return get(`/api/custo/rateio/transporte-reconciliacao?${q}`);
  },
  custoRateioMecanizacaoReconciliacao: (params) => {
    const q = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value == null || value === "") continue;
      q.set(key, String(value));
    }
    return get(`/api/custo/rateio/mecanizacao-reconciliacao?${q}`);
  },
  custoRateioDiagnostico: (params) => {
    const q = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value == null || value === "") continue;
      q.set(key, String(value));
    }
    return get(`/api/custo/rateio/diagnostico?${q}`);
  },
  custoAbastecimentos: (params) => {
    const q = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value == null || value === "") continue;
      q.set(key, String(value));
    }
    return get(`/api/custo/abastecimentos?${q}`);
  },
  custoMateriaisFluxo: (params) => {
    const q = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value == null || value === "") continue;
      q.set(key, String(value));
    }
    return get(`/api/custo/materiais/fluxo?${q}`);
  },
  custoMateriais: (params) => {
    const q = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value == null || value === "") continue;
      q.set(key, String(value));
    }
    return get(`/api/custo/materiais?${q}`);
  },
  custoInsumos: (params) => {
    const q = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value == null || value === "") continue;
      q.set(key, String(value));
    }
    return get(`/api/custo/insumos?${q}`);
  },
  custoServicosTerceiro: (params) => {
    const q = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value == null || value === "") continue;
      q.set(key, String(value));
    }
    return get(`/api/custo/servicos-terceiro?${q}`);
  },
  custoFuncionariosConsulta: (params) => {
    const q = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value == null || value === "") continue;
      q.set(key, String(value));
    }
    return get(`/api/custo/funcionarios?${q}`);
  },
  premissas: () => get("/api/premissas"),
  custoColheita: (filtro) => {
    const q = new URLSearchParams({
      anomesInicio: filtro.anomesInicio,
      anomesFim: filtro.anomesFim
    });
    if (filtro.safraId != null) q.set("safraId", String(filtro.safraId));
    if (filtro.preferirLocal) q.set("preferirLocal", "1");
    if (filtro.atualizarOracle) q.set("atualizarOracle", "1");
    return get(`/api/custo-colheita?${q}`);
  },
  salvarCustoColheita: (body) => send("/api/custo-colheita", "PUT", body),
  fichaEstagio: (filtro) => {
    const q = new URLSearchParams();
    if (filtro) {
      q.set("anomesInicio", filtro.anomesInicio);
      q.set("anomesFim", filtro.anomesFim);
      q.set("anoSafra", String(filtro.anoSafra));
    }
    const qs = q.toString();
    return get(`/api/ficha-estagio${qs ? `?${qs}` : ""}`);
  },
  sheet: (id) => get(`/api/sheets/${id}`),
  sheetActivityHeads: (id) => get(`/api/sheets/${id}/activity-heads`),
  groupCategoryByCenter: (categoryId) => send(`/api/categories/${categoryId}/group-by-center`, "POST"),
  copyCategoryItems: (categoryId, body) => send(`/api/categories/${categoryId}/copy-from`, "POST", body),
  setVisible: (id, visible) => send(`/api/sheets/${id}`, "PATCH", { visible }),
  setVerified: (id, verified) => send(`/api/sheets/${id}`, "PATCH", { verified }),
  removeSheet: (id) => send(`/api/sheets/${id}`, "DELETE"),
  addLine: (sheetId, body) => send(`/api/sheets/${sheetId}/lines`, "POST", body),
  distributeActivity: (sheetId, body) => send(`/api/sheets/${sheetId}/distribute-activity`, "POST", body),
  reconcileEquipmentObc: (sheetId) => send(`/api/sheets/${sheetId}/reconcile-equipment-obc`, "POST", {}),
  undoDistribution: (sheetId, id) => send(`/api/sheets/${sheetId}/distributions/${id}`, "DELETE"),
  distributions: () => get("/api/distributions"),
  undoAnyDistribution: (id) => send(`/api/distributions/${id}`, "DELETE"),
  updateLine: (id, body) => send(`/api/lines/${id}`, "PATCH", body),
  funcionarioSubprocessos: (externalSafraId) => get(`/api/funcionario-orcamento/subprocessos?safraId=${externalSafraId}`),
  funcionarioOrcamentoRefreshAll: (body) => send("/api/funcionario-orcamento/refresh-all", "POST", body),
  deleteLine: (id) => send(`/api/lines/${id}`, "DELETE"),
  setMonth: (id, month, body) => send(`/api/lines/${id}/months/${month}`, "PUT", body),
  setPremissa: (row, col, input) => send("/api/premissas/cell", "PUT", { row, col, input }),
  setPremissaMonth: (key, month, value) => send("/api/premissas/month", "PUT", { key, month, value }),
  copyPremissa: (body) => send("/api/premissas/copy", "PUT", body),
  deletePremissaCopy: (id) => send(`/api/premissas/copy/${id}`, "DELETE"),
  addPremissaItem: (body) => send("/api/premissas/items", "POST", body),
  savePremissaSubprocess: (key, body) => send("/api/premissas/subprocess", "PUT", { key, ...body }),
  savePremissaProduction: (key, body) => send("/api/premissas/production", "PUT", { key, ...body }),
  deletePremissaItem: (key) => send(`/api/premissas/items/${encodeURIComponent(key)}`, "DELETE"),
  reset: () => send("/api/reset", "POST"),
  activities: () => get("/api/activities"),
  activityLinks: (safraId) => get(safraId ? `/api/activity-links?safraId=${safraId}` : "/api/activity-links"),
  activitySourceOptions: (source, safraId, matchBy) => {
    const q = new URLSearchParams({ source });
    if (safraId) q.set("safraId", String(safraId));
    if (matchBy) q.set("matchBy", matchBy);
    return get(`/api/activity-links/sources?${q}`);
  },
  addActivityLink: (body) => send("/api/activity-links", "POST", body),
  deleteActivityLink: (id, safraId) => send(
    safraId ? `/api/activity-links/${id}?safraId=${safraId}` : `/api/activity-links/${id}`,
    "DELETE"
  ),
  unRealizadoSources: (safraId) => get(
    safraId ? `/api/un-realizado-sources?safraId=${safraId}` : "/api/un-realizado-sources"
  ),
  unRealizadoKinds: () => get("/api/un-realizado-sources/kinds"),
  unRealizadoOperations: () => get("/api/un-realizado-sources/operations"),
  saveUnRealizadoSource: (body) => send("/api/un-realizado-sources", "POST", body),
  deleteUnRealizadoSource: (id, safraId) => send(
    safraId ? `/api/un-realizado-sources/${id}?safraId=${safraId}` : `/api/un-realizado-sources/${id}`,
    "DELETE"
  ),
  oracleActivities: () => get("/api/activities/oracle"),
  importOracleActivities: (codes) => send("/api/activities/import-oracle", "POST", { codes }),
  empenhos: () => get("/api/empenhos"),
  addActivity: (body) => send("/api/activities", "POST", body),
  updateActivity: (id, body) => send(`/api/activities/${id}`, "PATCH", body),
  deleteActivity: (id) => send(`/api/activities/${id}`, "DELETE"),
  fazendas: () => get("/api/fazendas"),
  oracleFazendas: () => get("/api/fazendas/oracle"),
  importOracleFazendas: (codes) => send(
    "/api/fazendas/import-oracle",
    "POST",
    { codes }
  ),
  addFazenda: (body) => send("/api/fazendas", "POST", body),
  updateFazenda: (id, body) => send(`/api/fazendas/${id}`, "PATCH", body),
  deleteFazenda: (id) => send(`/api/fazendas/${id}`, "DELETE"),
  materials: () => get("/api/materials"),
  materialGroups: () => get("/api/materials/groups"),
  syncMaterialGroups: () => send("/api/materials/sync-groups", "POST"),
  materialsEntradaSaida: (params) => {
    const q = new URLSearchParams();
    if (params.dataInicio) q.set("dataInicio", params.dataInicio);
    if (params.dataFim) q.set("dataFim", params.dataFim);
    for (const tipo of params.tipos ?? []) {
      if (tipo.trim()) q.append("tipos", tipo.trim());
    }
    const qs = q.toString();
    return get(`/api/materials/relatorio-entrada-saida${qs ? `?${qs}` : ""}`);
  },
  oracleMaterials: (q) => {
    const query = q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
    return get(`/api/materials/oracle${query}`);
  },
  importOracleMaterials: (codes) => send("/api/materials/import-oracle", "POST", { codes }),
  materialPlanningPrices: (safraId) => get(`/api/materials/planning-prices?safraId=${safraId}`),
  syncPlanningMaterialPrices: (safraId) => send("/api/materials/sync-planning-prices", "POST", { safraId }),
  materialLastPrice: (id) => get(`/api/materials/${id}/last-price`),
  addMaterial: (body) => send("/api/materials", "POST", body),
  updateMaterial: (id, body) => send(`/api/materials/${id}`, "PATCH", body),
  deleteMaterial: (id) => send(`/api/materials/${id}`, "DELETE"),
  costObjects: () => get("/api/cost-objects"),
  costObjectHourCost: () => get("/api/cost-objects/hour-cost"),
  equipmentHourCost: (costObjectId) => get(`/api/cost-objects/${costObjectId}/equipment-hour-cost`),
  equipments: () => get("/api/equipments"),
  equipmentCostObjects: (codes) => get(
    `/api/equipments/cost-objects?codes=${encodeURIComponent(codes.join(","))}`
  ),
  activityApontamentoEquipment: (activityId) => get(`/api/activities/${activityId}/apontamento-equipment`),
  addCostObject: (body) => send("/api/cost-objects", "POST", body),
  updateCostObject: (id, body) => send(`/api/cost-objects/${id}`, "PATCH", body),
  deleteCostObject: (id) => send(`/api/cost-objects/${id}`, "DELETE"),
  catalogCategories: () => get("/api/category-catalog"),
  addCatalogCategory: (body) => send("/api/category-catalog", "POST", body),
  updateCatalogCategory: (id, body) => send(`/api/category-catalog/${id}`, "PATCH", body),
  deleteCatalogCategory: (id) => send(`/api/category-catalog/${id}`, "DELETE"),
  addCategory: (sheetId, body) => send(`/api/sheets/${sheetId}/categories`, "POST", body),
  deleteCategory: (id) => send(`/api/categories/${id}`, "DELETE"),
  calcRules: (safraId) => get(safraId ? `/api/calc-rules?safraId=${safraId}` : "/api/calc-rules"),
  addCalcRule: (body) => send("/api/calc-rules", "POST", body),
  copyCalcRulesFromPrevious: (safraId) => send("/api/calc-rules/copy-previous", "POST", { safraId }),
  updateCalcRule: (id, body) => send(`/api/calc-rules/${id}`, "PATCH", body),
  deleteCalcRule: (id) => send(`/api/calc-rules/${id}`, "DELETE"),
  seedRadius: (from, to) => {
    const q = new URLSearchParams();
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    const suffix = q.toString() ? `?${q}` : "";
    return get(`/api/seed-radius${suffix}`);
  },
  seedRadiusTrips: (farmCode, from, to) => {
    const q = new URLSearchParams();
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    const suffix = q.toString() ? `?${q}` : "";
    return get(`/api/seed-radius/${farmCode}/trips${suffix}`);
  },
  seedRadiusTariffs: (safraId) => get(safraId ? `/api/seed-radius-tariffs?safraId=${safraId}` : "/api/seed-radius-tariffs"),
  addSeedRadiusTariff: (body) => send("/api/seed-radius-tariffs", "POST", body),
  copySeedRadiusTariffsFromPrevious: (safraId) => send("/api/seed-radius-tariffs/copy-previous", "POST", { safraId }),
  updateSeedRadiusTariff: (id, body) => send(`/api/seed-radius-tariffs/${id}`, "PATCH", body),
  deleteSeedRadiusTariff: (id) => send(`/api/seed-radius-tariffs/${id}`, "DELETE"),
  estimativaDetalhadaEnergia: (safraId) => get(`/api/estimativa-detalhada/energia-eletrica?safraId=${safraId}`),
  salvarEstimativaDetalhadaEnergia: (safraId, linhas) => send("/api/estimativa-detalhada/energia-eletrica", "PUT", { safraId, linhas }),
  harvestAreas: (safraId) => get(safraId ? `/api/areas?safraId=${safraId}` : "/api/areas"),
  periodosParametrosTecnicos: () => get("/api/parametros-tecnicos/periodos"),
  parametrosTecnicos: (safraId, anomesInicio, anomesFim) => {
    const q = new URLSearchParams({ anomesInicio, anomesFim });
    if (safraId != null) q.set("safraId", String(safraId));
    return get(`/api/parametros-tecnicos?${q}`);
  },
  extrairParametrosTecnicos: (body) => send("/api/parametros-tecnicos/extrair", "POST", body),
  salvarParametrosTecnicos: (body) => send("/api/parametros-tecnicos", "PUT", body),
  addHarvestArea: (body) => send("/api/areas", "POST", body),
  copyHarvestAreasFromPrevious: (safraId) => send("/api/areas/copy-previous", "POST", { safraId }),
  updateHarvestArea: (id, body) => send(`/api/areas/${id}`, "PATCH", body),
  deleteHarvestArea: (id) => send(`/api/areas/${id}`, "DELETE"),
  arrendamentoPorSafra: () => get("/api/custo/arrendamento-por-safra"),
  safras: () => get("/api/safras"),
  addSafra: (code, label, copyFrom = true) => send("/api/safras", "POST", { code, label, copyFrom }),
  updateSafra: (id, body) => send(`/api/safras/${id}`, "PATCH", body),
  deleteSafra: (id) => send(`/api/safras/${id}`, "DELETE"),
  setSafra: (id) => send("/api/safras/current", "PUT", { id }),
  entradaCanaConfig: () => get("/api/entrada-cana/config"),
  entradaCanaImport: async (body, signal, onLog) => {
    const res = await fetch("/api/entrada-cana/import?stream=1", {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
      signal,
      redirect: "manual"
    });
    if (!res.ok) {
      if (res.status >= 500) throw new Error(`Falha na conex\xE3o com o servidor de importa\xE7\xE3o (HTTP ${res.status}). Confira os registros j\xE1 enviados antes de executar novamente.`);
      await fail(res);
    }
    if (!res.body) throw new Error("O servidor n\xE3o retornou o acompanhamento da importa\xE7\xE3o.");
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let pending = "";
    let result;
    try {
      while (true) {
        const { done, value } = await reader.read();
        pending += decoder.decode(value, { stream: !done });
        const lines = pending.split("\n");
        pending = lines.pop() ?? "";
        if (done && pending.trim()) lines.push(pending);
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line);
          if (event.type === "log") onLog?.(event.line);
          if (event.type === "error") throw new Error(event.error);
          if (event.type === "result") result = event.result;
        }
        if (done) break;
      }
    } finally {
      await reader.cancel().catch(() => {
      });
      reader.releaseLock();
    }
    if (!result) throw new Error("A conex\xE3o foi interrompida antes da confirma\xE7\xE3o final. Confira os registros j\xE1 enviados antes de executar novamente.");
    return result;
  },
  colheitaPenetrometroList: (limit = 200) => get(`/api/colheita/penetrometro?limit=${limit}`),
  colheitaPenetrometroPreview: (csv) => send("/api/colheita/penetrometro/preview", "POST", { csv }),
  colheitaPenetrometroImport: (csv) => send("/api/colheita/penetrometro/import", "POST", { csv }),
  colheitaPenetrometroUpdate: (idUnico, body) => send(`/api/colheita/penetrometro/${encodeURIComponent(String(idUnico))}`, "PATCH", body),
  colheitaEntradaCaminhao: (params) => {
    const q = new URLSearchParams();
    if (params.dataInicio) q.set("dataInicio", params.dataInicio);
    if (params.dataFim) q.set("dataFim", params.dataFim);
    if (params.busca) q.set("busca", params.busca);
    if (params.pesagem) q.set("pesagem", params.pesagem);
    if (params.guia) q.set("guia", params.guia);
    if (params.caminhao) q.set("caminhao", params.caminhao);
    return get(`/api/entrada-cana-caminhao?${q}`);
  },
  salvarColheitaEntradaCaminhaoOps: (body) => send("/api/entrada-cana-caminhao/ops", "PUT", body),
  producaoFechamento: (params) => {
    const q = new URLSearchParams(params);
    return get(`/api/producao-operador/fechamento?${q}`);
  },
  producaoFuncionarioEquipamento: () => get("/api/producao-operador/funcionario-equipamento"),
  salvarProducaoFuncionarioEquipamento: (body) => send("/api/producao-operador/funcionario-equipamento", "POST", body),
  excluirProducaoFuncionarioEquipamento: (id) => send(`/api/producao-operador/funcionario-equipamento/${id}`, "DELETE"),
  producaoFaixasPreco: () => get("/api/producao-operador/faixas-preco"),
  salvarProducaoFaixaPreco: (body) => send("/api/producao-operador/faixas-preco", "POST", body),
  excluirProducaoFaixaPreco: (id) => send(`/api/producao-operador/faixas-preco/${id}`, "DELETE"),
  colheitaEntradaMaquina: (params) => {
    const q = new URLSearchParams();
    if (params.dataInicio) q.set("dataInicio", params.dataInicio);
    if (params.dataFim) q.set("dataFim", params.dataFim);
    if (params.busca) q.set("busca", params.busca);
    if (params.maquina) q.set("maquina", params.maquina);
    if (params.somenteColhedeiras) q.set("somenteColhedeiras", "1");
    return get(`/api/entrada-cana-maquina?${q}`);
  },
  colheitaCaminhoesDistinct: (params) => {
    const q = new URLSearchParams();
    if (params.dataInicio) q.set("dataInicio", params.dataInicio);
    if (params.dataFim) q.set("dataFim", params.dataFim);
    return get(`/api/entrada-cana-caminhao/caminhoes?${q}`);
  },
  colheitaMaquinasDistinct: (params) => {
    const q = new URLSearchParams();
    if (params.dataInicio) q.set("dataInicio", params.dataInicio);
    if (params.dataFim) q.set("dataFim", params.dataFim);
    return get(`/api/entrada-cana-maquina/maquinas?${q}`);
  },
  colheitaAtualizarEquipamentoCaminhao: (body) => send("/api/entrada-cana-caminhao/atualizar-equipamento", "POST", body),
  colheitaAtualizarEquipamentoMaquina: (body) => send("/api/entrada-cana-maquina/atualizar-equipamento", "POST", body),
  colheitaHorasMaquina: (params) => {
    const q = new URLSearchParams();
    if (params.dataInicio) q.set("dataInicio", params.dataInicio);
    if (params.dataFim) q.set("dataFim", params.dataFim);
    if (params.busca) q.set("busca", params.busca);
    if (params.equipamento) q.set("equipamento", params.equipamento);
    if (params.codTipoEquipamento != null) q.set("codTipoEquipamento", String(params.codTipoEquipamento));
    return get(`/api/horas-maquina?${q}`);
  },
  colheitaExcluirHorasMaquina: (id) => send(`/api/horas-maquina/${id}`, "DELETE"),
  horasMotorUltimaAntes: (body) => send("/api/horas-maquina/ultima-antes", "POST", body),
  horasMotorEnviarCoa: (body) => send("/api/horas-maquina/enviar-coa", "POST", body),
  horasMotorTipos: () => get("/api/horas-maquina/tipos"),
  horasMotorConsultarCoa: (params) => {
    const q = new URLSearchParams();
    if (params.dataInicio) q.set("dataInicio", params.dataInicio);
    if (params.dataFim) q.set("dataFim", params.dataFim);
    if (params.turno) q.set("turno", params.turno);
    if (params.equipamento) q.set("equipamento", params.equipamento);
    if (params.codTipoEquipamento != null) q.set("codTipoEquipamento", String(params.codTipoEquipamento));
    return get(`/api/horas-maquina/coa?${q}`);
  },
  colheitaLiberacaoOpcoes: (params) => {
    const q = new URLSearchParams();
    if (params.safraCode) q.set("safraCode", params.safraCode);
    if (params.dataInicio) q.set("dataInicio", params.dataInicio);
    if (params.dataFim) q.set("dataFim", params.dataFim);
    return get(`/api/liberacao-colheita/opcoes?${q}`);
  },
  colheitaLiberacao: (params) => {
    const q = new URLSearchParams();
    if (params.safraCode) q.set("safraCode", params.safraCode);
    if (params.dataInicio) q.set("dataInicio", params.dataInicio);
    if (params.dataFim) q.set("dataFim", params.dataFim);
    if (params.busca) q.set("busca", params.busca);
    for (const cod of params.codFazendas ?? []) q.append("codFazenda", cod);
    for (const fazenda of params.fazendas ?? []) q.append("fazenda", fazenda);
    for (const talhao of params.talhoes ?? []) q.append("talhao", talhao);
    return get(`/api/liberacao-colheita?${q}`);
  },
  colheitaEncerrarOrdens: (body) => send("/api/colheita/encerrar-ordens", "POST", body),
  colheitaCaminhaoTerceiroList: (params) => {
    const q = new URLSearchParams();
    if (params.caminhao) q.set("caminhao", params.caminhao);
    if (params.dataInicio) q.set("dataInicio", params.dataInicio);
    if (params.dataFim) q.set("dataFim", params.dataFim);
    return get(`/api/colheita/caminhao-terceiro?${q}`);
  },
  colheitaCaminhaoTerceiroSave: (body) => send("/api/colheita/caminhao-terceiro", "POST", body),
  colheitaCaminhaoTerceiroRemove: (id) => send(`/api/colheita/caminhao-terceiro/${id}`, "DELETE"),
  colheitaEquipamentoTerceiroList: (params = {}) => {
    const q = new URLSearchParams();
    if (params.busca) q.set("busca", params.busca);
    return get(`/api/colheita/equipamento-terceiro?${q}`);
  },
  colheitaEquipamentoTerceiroSave: (body) => send("/api/colheita/equipamento-terceiro", "POST", body),
  colheitaEquipamentoTerceiroRemove: (codEquipamento) => send(`/api/colheita/equipamento-terceiro/${encodeURIComponent(codEquipamento)}`, "DELETE"),
  colheitaResumoTransporteOpcoes: (params) => {
    const q = new URLSearchParams();
    if (params.safraCode) q.set("safraCode", params.safraCode);
    if (params.dataInicio) q.set("dataInicio", params.dataInicio);
    if (params.dataFim) q.set("dataFim", params.dataFim);
    if (params.modo) q.set("modo", params.modo);
    return get(
      `/api/resumo-transporte-cana/opcoes?${q}`
    );
  },
  colheitaResumoTransporte: (params) => {
    const q = new URLSearchParams();
    if (params.safraCode) q.set("safraCode", params.safraCode);
    if (params.reportSafraCode) q.set("reportSafraCode", params.reportSafraCode);
    if (params.dataInicio) q.set("dataInicio", params.dataInicio);
    if (params.dataFim) q.set("dataFim", params.dataFim);
    if (params.refDate) q.set("refDate", params.refDate);
    if (params.modo) q.set("modo", params.modo);
    for (const cam of params.caminhoes ?? []) q.append("caminhao", cam);
    for (const ter of params.terceiros ?? []) q.append("terceiro", ter);
    return get(`/api/resumo-transporte-cana?${q}`);
  },
  colheitaResumoTransporteCombustivelSave: (body) => send(
    "/api/resumo-transporte-cana/combustivel",
    "POST",
    body
  ),
  colheitaResumoTransporteRateioProdutos: () => get("/api/resumo-transporte-cana/rateio-produtos"),
  colheitaResumoTransporteRateioProdutosSave: (produtos) => send("/api/resumo-transporte-cana/rateio-produtos", "PUT", { produtos }),
  indicadoresColheitaProducaoFrota: (params) => {
    const q = new URLSearchParams();
    if (params?.refDate) q.set("refDate", params.refDate);
    return get(`/api/indicadores/colheita-producao/frota?${q}`);
  },
  indicadoresColheitaProducao: (params) => {
    const q = new URLSearchParams();
    if (params.dataInicio) q.set("dataInicio", params.dataInicio);
    if (params.dataFim) q.set("dataFim", params.dataFim);
    if (params.refDate) q.set("refDate", params.refDate);
    if (params.modo) q.set("modo", params.modo);
    if (params.codTipoEquipamento != null) q.set("codTipoEquipamento", String(params.codTipoEquipamento));
    if (params.codEquipamentos?.length) q.set("codEquipamento", params.codEquipamentos.join(","));
    return get(`/api/indicadores/colheita-producao?${q}`);
  },
  indicadoresConsumoTalhoes: (params) => {
    const q = new URLSearchParams(params);
    return get(`/api/indicadores/colheita-producao/consumo-talhoes?${q}`);
  },
  indicadoresColheitaQualidade: (params) => {
    const q = new URLSearchParams({
      dataInicio: params.dataInicio,
      dataFim: params.dataFim
    });
    if (params.codTipoEquipamento != null) q.set("codTipoEquipamento", String(params.codTipoEquipamento));
    if (params.codEquipamentos?.length) q.set("codEquipamento", params.codEquipamentos.join(","));
    return get(`/api/indicadores/colheita-qualidade?${q}`);
  },
  indicadoresColheitaOleoHidraulico: (params) => {
    const q = new URLSearchParams({
      dataInicio: params.dataInicio,
      dataFim: params.dataFim
    });
    if (params.safraCode) q.set("safraCode", params.safraCode);
    return get(`/api/indicadores/colheita-oleo-hidraulico?${q}`);
  },
  indicadoresColheitaPerdasAnalitico: (params) => {
    const q = new URLSearchParams({
      dataInicio: params.dataInicio,
      dataFim: params.dataFim
    });
    if (params.agrupamento) q.set("agrupamento", params.agrupamento);
    if (params.codEquipamentos?.length) q.set("codEquipamento", params.codEquipamentos.join(","));
    if (params.codTiposEquipamento?.length) q.set("codTipoEquipamento", params.codTiposEquipamento.join(","));
    return get(`/api/indicadores/colheita-perdas-analitico?${q}`);
  },
  indicadoresColheitaDiaria: (params) => {
    const q = new URLSearchParams({ dataInicio: params.dataInicio, dataFim: params.dataFim });
    if (params.fonte) q.set("fonte", params.fonte);
    return get(
      `/api/indicadores/colheita-diaria?${q}`
    );
  },
  indicadoresRelatorioDiarioProducao: (params) => {
    const q = new URLSearchParams({ data: params.data });
    if (params.dataInicio) q.set("dataInicio", params.dataInicio);
    if (params.safraInicio) q.set("safraInicio", params.safraInicio);
    return get(`/api/indicadores/relatorio-diario-producao?${q}`);
  },
  indicadoresParadasColheita: (params) => {
    const q = new URLSearchParams({ dataInicio: params.dataInicio, dataFim: params.dataFim });
    return get(`/api/indicadores/paradas-colheita?${q}`);
  },
  criarParadaColheita: (body) => {
    return send(
      "/api/indicadores/paradas-colheita",
      "POST",
      body
    );
  },
  atualizarParadaColheita: (id, body) => {
    return send(
      `/api/indicadores/paradas-colheita/${id}`,
      "PATCH",
      body
    );
  },
  deletarParadaColheita: (id) => {
    return send(`/api/indicadores/paradas-colheita/${id}`, "DELETE");
  },
  indicadoresDisponibilidadeEquipamentos: (params) => {
    const q = new URLSearchParams();
    if (params?.safraCode) q.set("safraCode", params.safraCode);
    if (params?.dataInicio) q.set("dataInicio", params.dataInicio);
    if (params?.dataFim) q.set("dataFim", params.dataFim);
    for (const cod of params?.codTiposEquipamento ?? []) {
      q.append("codTipoEquipamento", String(cod));
    }
    const suffix = q.toString() ? `?${q}` : "";
    return get(`/api/indicadores/disponibilidade-equipamentos${suffix}`);
  },
  indicadoresDisponibilidadePorTipo: (params) => {
    const q = new URLSearchParams();
    if (params?.safraCode) q.set("safraCode", params.safraCode);
    if (params?.dataInicio) q.set("dataInicio", params.dataInicio);
    if (params?.dataFim) q.set("dataFim", params.dataFim);
    const suffix = q.toString() ? `?${q}` : "";
    return get(`/api/indicadores/disponibilidade-por-tipo${suffix}`);
  },
  indicadoresDisponibilidadeComparativoMensal: (params) => {
    const q = new URLSearchParams();
    if (params?.safraCode) q.set("safraCode", params.safraCode);
    if (params?.dataFim) q.set("dataFim", params.dataFim);
    const suffix = q.toString() ? `?${q}` : "";
    return get(`/api/indicadores/disponibilidade-comparativo-mensal${suffix}`);
  },
  indicadoresGestaoManutencao: (params) => {
    const q = new URLSearchParams();
    if (params?.ano != null) q.set("ano", String(params.ano));
    if (params?.dataInicio) q.set("dataInicio", params.dataInicio);
    if (params?.dataFim) q.set("dataFim", params.dataFim);
    if (params?.categoria) q.set("categoria", params.categoria);
    if (params?.codTipoEquipamento != null) q.set("codTipoEquipamento", String(params.codTipoEquipamento));
    if (params?.codEquipamento != null) q.set("codEquipamento", String(params.codEquipamento));
    if (params?.codEquipamentos?.length) q.set("codEquipamentos", params.codEquipamentos.join(","));
    if (params?.tipoMaterial) q.set("tipoMaterial", params.tipoMaterial);
    if (params?.codObjetoCusto != null) q.set("codObjetoCusto", String(params.codObjetoCusto));
    if (params?.modo) q.set("modo", params.modo);
    const suffix = q.toString() ? `?${q}` : "";
    return get(`/api/indicadores/gestao-manutencao${suffix}`);
  },
  indicadoresGestaoManutencaoFiltros: () => get("/api/indicadores/gestao-manutencao/filtros"),
  indicadoresGestaoManutencaoOs: (anoOs, numeroOs) => get(
    `/api/indicadores/gestao-manutencao/os?ano=${encodeURIComponent(String(anoOs))}&numero=${encodeURIComponent(String(numeroOs))}`
  ),
  indicadoresMonitoramentoOs: (params) => {
    const q = new URLSearchParams();
    if (params?.box != null) q.set("box", String(params.box));
    if (params?.codTipoEquipamento != null) q.set("codTipoEquipamento", String(params.codTipoEquipamento));
    if (params?.codEquipamento != null) q.set("codEquipamento", String(params.codEquipamento));
    const suffix = q.toString() ? `?${q}` : "";
    return get(`/api/indicadores/gestao-manutencao/monitoramento-os${suffix}`);
  },
  indicadoresGestaoManutencaoConfig: () => get(
    "/api/indicadores/gestao-manutencao/config"
  ),
  indicadoresGestaoManutencaoConfigSave: (body) => send(
    "/api/indicadores/gestao-manutencao/config",
    "PUT",
    body
  ),
  indicadoresCombustivel: (params) => {
    const q = new URLSearchParams();
    if (params?.dataInicio) q.set("dataInicio", params.dataInicio);
    if (params?.dataFim) q.set("dataFim", params.dataFim);
    const suffix = q.toString() ? `?${q}` : "";
    return get(`/api/indicadores/combustivel${suffix}`);
  },
  indicadoresMapaEditor: () => get("/api/indicadores/mapa-fazendas/editor"),
  indicadoresMapaCompactacao: (params) => {
    const q = new URLSearchParams({ dataInicio: params.dataInicio, dataFim: params.dataFim });
    if (params.profundidade) q.set("profundidade", params.profundidade);
    return get(`/api/indicadores/mapa-fazendas/compactacao?${q}`);
  },
  indicadoresMapaConfig: () => get("/api/indicadores/mapa-fazendas/config"),
  indicadoresMapaConfigSave: (enabledActivities) => send("/api/indicadores/mapa-fazendas/config", "PUT", { enabledActivities }),
  indicadoresMapaFeatureSave: (body) => send("/api/indicadores/mapa-fazendas/editor", "PUT", body),
  indicadoresMapaFazendas: (params) => {
    const q = new URLSearchParams();
    if (params.safraCode) q.set("safraCode", params.safraCode);
    if (params.dataInicio) q.set("dataInicio", params.dataInicio);
    if (params.dataFim) q.set("dataFim", params.dataFim);
    if (params.areasAplicadas) q.set("areasAplicadas", "1");
    if (params.entomologico) q.set("entomologico", "1");
    if (params.irrigacao) q.set("irrigacao", "1");
    if (params.entomologicoIndice) q.set("entomologicoIndice", params.entomologicoIndice);
    if (params.operacao) q.set("operacao", params.operacao);
    if (params.operacaoDescricao) q.set("operacaoDescricao", params.operacaoDescricao);
    q.set("_ts", String(Date.now()));
    return get(`/api/indicadores/mapa-fazendas?${q}`);
  },
  indicadoresControleEstoque: (params) => {
    const q = new URLSearchParams();
    if (params?.anomes) q.set("anomes", params.anomes);
    if (params?.busca) q.set("busca", params.busca);
    if (params?.almoxarifado != null && String(params.almoxarifado).trim() !== "") {
      q.set("almoxarifado", String(params.almoxarifado));
    }
    const suffix = q.toString() ? `?${q}` : "";
    return get(`/api/indicadores/controle-estoque${suffix}`);
  },
  indicadoresAnaliseBiometrica: (inicio, fim) => get(`/api/indicadores/analise-biometrica?${new URLSearchParams({ inicio, fim })}`),
  indicadoresAnaliseBiometricaPontoSave: (body) => send("/api/indicadores/analise-biometrica/ponto", "PUT", body),
  indicadoresAnaliseBiometricaPontoDelete: (body) => send("/api/indicadores/analise-biometrica/ponto", "DELETE", body),
  indicadoresIrrigacaoOpcoes: () => get("/api/indicadores/irrigacao/opcoes"),
  indicadoresIrrigacao: (params) => {
    const q = new URLSearchParams();
    if (params?.dataInicio) q.set("dataInicio", params.dataInicio);
    if (params?.dataFim) q.set("dataFim", params.dataFim);
    if (params?.codEquipamento) q.set("codEquipamento", params.codEquipamento);
    if (params?.codEquipamentos?.length) q.set("codEquipamentos", params.codEquipamentos.join(","));
    if (params?.codFazenda) q.set("codFazenda", params.codFazenda);
    if (params?.campo) q.set("campo", params.campo);
    if (params?.tipoEquipamento) q.set("tipoEquipamento", params.tipoEquipamento);
    const suffix = q.toString() ? `?${q}` : "";
    return get(`/api/indicadores/irrigacao${suffix}`);
  },
  indicadoresIrrigacaoDashboard: (params) => {
    const q = new URLSearchParams();
    if (params?.safraCode) q.set("safraCode", params.safraCode);
    if (params?.dataInicio) q.set("dataInicio", params.dataInicio);
    if (params?.dataFim) q.set("dataFim", params.dataFim);
    for (const sistema of params?.sistemas ?? []) {
      q.append("sistema", sistema);
    }
    const suffix = q.toString() ? `?${q}` : "";
    return get(`/api/indicadores/irrigacao/dashboard${suffix}`);
  },
  indicadoresDashboardMateriais: (params) => {
    const q = new URLSearchParams();
    if (params?.dataInicio) q.set("dataInicio", params.dataInicio);
    if (params?.dataFim) q.set("dataFim", params.dataFim);
    const append = (key, values) => {
      for (const value of values ?? []) {
        if (value.trim()) q.append(key, value.trim());
      }
    };
    append("solicitante", params?.solicitantes);
    append("situacao", params?.situacoes);
    append("grupoOperacional", params?.gruposOperacionais);
    append("grupoMaterial", params?.gruposMaterial);
    append("tipoSolicitacao", params?.tiposSolicitacao);
    append("fornecedor", params?.fornecedores);
    const suffix = q.toString() ? `?${q}` : "";
    return get(`/api/indicadores/gestao-materiais/dashboard${suffix}`);
  },
  indicadoresDashboardMateriaisGrupos: () => get("/api/indicadores/gestao-materiais/dashboard/grupos"),
  indicadoresDashboardMateriaisOpcoes: (params) => {
    const q = new URLSearchParams();
    if (params?.dataInicio) q.set("dataInicio", params.dataInicio);
    if (params?.dataFim) q.set("dataFim", params.dataFim);
    const suffix = q.toString() ? `?${q}` : "";
    return get(`/api/indicadores/gestao-materiais/dashboard/opcoes${suffix}`);
  },
  indicadoresAcompanhamentoPedido: (params) => {
    const q = new URLSearchParams();
    if (params?.dataInicio) q.set("dataInicio", params.dataInicio);
    if (params?.dataFim) q.set("dataFim", params.dataFim);
    if (params?.busca) q.set("busca", params.busca);
    if (params?.campoPesquisa) q.set("campoPesquisa", params.campoPesquisa);
    const append = (key, values) => {
      for (const value of values ?? []) if (value.trim()) q.append(key, value.trim());
    };
    append("solicitante", params?.solicitantes);
    append("situacao", params?.situacoes);
    append("grupoOperacional", params?.gruposOperacionais);
    append("grupoMaterial", params?.gruposMaterial);
    append("tipoSolicitacao", params?.tiposSolicitacao);
    append("fornecedor", params?.fornecedores);
    const suffix = q.toString() ? `?${q}` : "";
    return get(`/api/indicadores/gestao-materiais/acompanhamento-pedido${suffix}`);
  },
  indicadoresPendenciasMaterial: (codigo) => get(`/api/indicadores/gestao-materiais/pendencias/${codigo}`),
  indicadoresGestaoMateriais: (params) => {
    const q = new URLSearchParams();
    if (params?.dataInicio) q.set("dataInicio", params.dataInicio);
    if (params?.dataFim) q.set("dataFim", params.dataFim);
    for (const tipo of params?.tipos ?? []) {
      if (tipo.trim()) q.append("tipos", tipo.trim());
    }
    if (params?.almoxarifado) q.set("almoxarifado", params.almoxarifado);
    for (const codMaterial of params?.codMateriais ?? []) {
      if (Number.isInteger(codMaterial) && codMaterial > 0) q.append("codMaterial", String(codMaterial));
    }
    if (params?.codObjetoCusto) q.set("codObjetoCusto", params.codObjetoCusto);
    if (params?.mesesEstoque) q.set("mesesEstoque", params.mesesEstoque);
    if (params?.mesesSugerida) q.set("mesesSugerida", params.mesesSugerida);
    const suffix = q.toString() ? `?${q}` : "";
    return get(`/api/indicadores/gestao-materiais${suffix}`);
  },
  indicadoresGestaoMateriaisOpcoes: () => get("/api/indicadores/gestao-materiais/opcoes"),
  indicadoresManutencaoProgramada: () => get("/api/indicadores/manutencao-programada"),
  indicadoresManutencaoConfig: () => get("/api/indicadores/manutencao-programada/config"),
  salvarIndicadoresManutencaoConfig: (body) => send("/api/indicadores/manutencao-programada/config", "PUT", body),
  indicadoresManutencaoPlanos: () => get("/api/indicadores/manutencao-programada/planos"),
  indicadoresLubrificacao: (params) => {
    const q = new URLSearchParams();
    if (params?.ano != null && Number.isFinite(params.ano)) q.set("ano", String(params.ano));
    const suffix = q.toString() ? `?${q}` : "";
    return get(`/api/indicadores/lubrificacao${suffix}`);
  },
  salvarProgramacaoLubrificacao: (body) => send(
    "/api/indicadores/lubrificacao/programacao",
    "PUT",
    body
  ),
  indicadoresPneus: (params) => {
    const q = new URLSearchParams();
    if (params?.view) q.set("view", params.view);
    if (params?.from) q.set("from", params.from);
    if (params?.to) q.set("to", params.to);
    const suffix = q.toString() ? `?${q}` : "";
    return get(`/api/indicadores/pneus${suffix}`);
  },
  pneusPrecos: () => get("/api/indicadores/pneus/precos"),
  criarPneuPreco: (body) => send("/api/indicadores/pneus/precos", "POST", body),
  atualizarPneuPreco: (id, body) => send(`/api/indicadores/pneus/precos/${id}`, "PUT", body),
  excluirPneuPreco: (id) => send(`/api/indicadores/pneus/precos/${id}`, "DELETE"),
  indicadoresManutencaoComponentes: (params) => {
    const q = new URLSearchParams();
    if (params?.codEquipamento != null && String(params.codEquipamento).trim() !== "") {
      q.set("codEquipamento", String(params.codEquipamento));
    }
    const suffix = q.toString() ? `?${q}` : "";
    return get(`/api/indicadores/manutencao-programada/componentes${suffix}`);
  },
  colheitaFazendasEntrada: (params) => {
    const q = new URLSearchParams();
    if (params.dataInicio) q.set("dataInicio", params.dataInicio);
    if (params.dataFim) q.set("dataFim", params.dataFim);
    if (params.busca) q.set("busca", params.busca);
    return get(`/api/fazenda-usina/fazendas-entrada?${q}`);
  },
  colheitaFazendasSistema: (busca) => get(
    busca ? `/api/fazenda-usina/sistema?busca=${encodeURIComponent(busca)}` : "/api/fazenda-usina/sistema"
  ),
  colheitaFazendaUsina: (busca) => get(
    busca ? `/api/fazenda-usina?busca=${encodeURIComponent(busca)}` : "/api/fazenda-usina"
  ),
  colheitaPrecoRaio: (params) => {
    const q = new URLSearchParams();
    if (params?.dataInicio) q.set("dataInicio", params.dataInicio);
    if (params?.dataFim) q.set("dataFim", params.dataFim);
    if (params?.todos) q.set("todos", "true");
    return get(`/api/preco-raio${q.size ? `?${q}` : ""}`);
  },
  colheitaSalvarPrecoRaio: (body) => send("/api/preco-raio/salvar", "POST", body),
  colheitaMotoristasCanavieiros: (params) => {
    const q = new URLSearchParams({ dataInicio: params.dataInicio, dataFim: params.dataFim });
    return get(
      `/api/colheita/motoristas-canavieiros?${q}`
    );
  },
  colheitaMotoristasCanavieirosPeriodos: (ano) => get(
    `/api/colheita/motoristas-canavieiros/periodos?ano=${encodeURIComponent(ano)}`
  ),
  colheitaTabelasMotoristasOcultas: () => get("/api/colheita/motoristas-canavieiros/tabelas-ocultas"),
  colheitaOcultarTabelaMotoristas: (equipTag, ocultar) => send("/api/colheita/motoristas-canavieiros/tabelas-ocultas", "PUT", { equipTag, ocultar }),
  colheitaSalvarMotoristasCanavieiros: (body) => send(
    "/api/colheita/motoristas-canavieiros",
    "PUT",
    body
  ),
  colheitaSalvarFazendaUsina: (body) => send("/api/fazenda-usina/salvar", "POST", body)
};

// src/components/ConsultaProgressBar.tsx
import { jsx, jsxs } from "react/jsx-runtime";
function ConsultaProgressBar({ active, label = "Consultando dados\u2026", className }) {
  if (!active) return null;
  return /* @__PURE__ */ jsxs(
    "div",
    {
      className: `consulta-progress no-print${className ? ` ${className}` : ""}`,
      role: "status",
      "aria-live": "polite",
      children: [
        /* @__PURE__ */ jsx("i", { className: "consulta-progress-spinner", "aria-hidden": "true" }),
        /* @__PURE__ */ jsx("span", { children: label })
      ]
    }
  );
}

// src/components/PrintButton.tsx
import { jsx as jsx2 } from "react/jsx-runtime";
function PrintButton({ label = "Imprimir", className = "" }) {
  return /* @__PURE__ */ jsx2("button", { type: "button", className: `btn no-print ${className}`.trim(), onClick: () => window.print(), children: label });
}

// src/components/indicadores/useReportAutoRefresh.ts
import { createContext, useContext, useEffect, useRef } from "react";
var ReportExpandedContext = createContext(false);
var REPORT_REFRESH_INTERVAL_MS = 30 * 60 * 1e3;
function useReportAutoRefresh(refresh, expanded = false) {
  const parentExpanded = useContext(ReportExpandedContext);
  const enabled = expanded || parentExpanded;
  const callback = useRef(refresh);
  useEffect(() => {
    callback.current = refresh;
  }, [refresh]);
  useEffect(() => {
    if (!enabled) return;
    let pending = false;
    const refreshNow = async () => {
      if (pending) return;
      pending = true;
      try {
        await callback.current();
      } finally {
        pending = false;
      }
    };
    void refreshNow();
    const timer = window.setInterval(async () => {
      if (pending) return;
      pending = true;
      try {
        await callback.current();
      } finally {
        pending = false;
      }
    }, REPORT_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [enabled]);
}

// src/components/indicadores/IndicadoresGestaoMateriais.tsx
import { jsx as jsx3, jsxs as jsxs2 } from "react/jsx-runtime";
var TIPOS = [
  "Combust\xEDvel",
  "Lubrificante",
  "Pneu",
  "Servico",
  "Filtro",
  "Graxa",
  "Aditivo",
  "Pe\xE7as e Acess\xF3rios"
];
var PRIORIDADE_META = {
  critico: { label: "CR\xCDTICO", className: "gm-prio-critico" },
  alto: { label: "ALTO", className: "gm-prio-alto" },
  medio: { label: "M\xC9DIO", className: "gm-prio-medio" },
  ok: { label: "OK", className: "gm-prio-ok" }
};
var PRIORIDADE_ORDER = {
  critico: 1,
  alto: 2,
  medio: 3,
  ok: 4
};
function defaultRange() {
  const now = /* @__PURE__ */ new Date();
  const from = new Date(now.getFullYear() - 3, 0, 1);
  const pad = (n) => String(n).padStart(2, "0");
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return { from: iso(from), to: iso(now) };
}
function fmtDate(iso) {
  if (!iso) return "\u2014";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}
var quantityFormatter = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
var materialCollator = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });
function fmtQty(n) {
  if (n == null || !Number.isFinite(n)) return "\u2014";
  return quantityFormatter.format(n);
}
function fmtMoney(n) {
  if (n == null || !Number.isFinite(n)) return "\u2014";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}
function materialLabel(item) {
  return `${item.codMaterial}-${item.descricao}`;
}
function extractLeadingCode(value) {
  const match = value.trim().match(/^\d+/);
  return match?.[0] ?? "";
}
function sortValue(item, key) {
  if (key === "descricao") return materialLabel(item);
  if (key === "prioridade") return PRIORIDADE_ORDER[item.prioridade];
  if (key === "ultimaEntrada") return item.ultimaEntrada ?? "";
  return item[key] ?? Number.NEGATIVE_INFINITY;
}
function compareItems(a, b, sort) {
  const av = sortValue(a, sort.key);
  const bv = sortValue(b, sort.key);
  const dir = sort.dir === "asc" ? 1 : -1;
  if (typeof av === "string" || typeof bv === "string") {
    const result = materialCollator.compare(String(av), String(bv));
    return result * dir;
  }
  if (av === bv) return materialCollator.compare(materialLabel(a), materialLabel(b));
  return (av < bv ? -1 : 1) * dir;
}
function DetalheMaterial({
  item,
  onClose
}) {
  const [pendencias, setPendencias] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [erroPendencias, setErroPendencias] = useState("");
  const [tentativa, setTentativa] = useState(0);
  useEffect2(() => {
    let ativo = true;
    setPendencias([]);
    setErroPendencias("");
    setCarregando(item.quantidadePendenteEntrega > 0);
    if (item.quantidadePendenteEntrega > 0) {
      api.indicadoresPendenciasMaterial(item.codMaterial).then((result) => {
        if (ativo) setPendencias(result);
      }).catch((e) => {
        if (ativo) setErroPendencias(e instanceof Error ? e.message : "Falha ao consultar solicita\xE7\xF5es.");
      }).finally(() => {
        if (ativo) setCarregando(false);
      });
    }
    return () => {
      ativo = false;
    };
  }, [item.codMaterial, item.quantidadePendenteEntrega, tentativa]);
  const prio = PRIORIDADE_META[item.prioridade];
  return /* @__PURE__ */ jsxs2("aside", { className: "indicadores-mapa-float indicadores-mapa-overlay gm-overlay", children: [
    /* @__PURE__ */ jsxs2("header", { className: "gm-overlay-head", children: [
      /* @__PURE__ */ jsxs2("div", { children: [
        /* @__PURE__ */ jsx3("h3", { children: materialLabel(item) }),
        /* @__PURE__ */ jsxs2("p", { children: [
          "C\xF3d. ",
          item.codMaterial,
          " \xB7 ",
          item.tipo
        ] })
      ] }),
      /* @__PURE__ */ jsx3("button", { type: "button", className: "indicadores-mapa-close", onClick: onClose, "aria-label": "Fechar detalhes", children: "\xD7" })
    ] }),
    /* @__PURE__ */ jsxs2("div", { className: "gm-overlay-body", children: [
      /* @__PURE__ */ jsxs2("dl", { className: "indicadores-mapa-dl indicadores-mapa-dl-grid", children: [
        /* @__PURE__ */ jsx3("dt", { children: "Grupo" }),
        /* @__PURE__ */ jsx3("dd", { children: item.grupo }),
        /* @__PURE__ */ jsx3("dt", { children: "Sa\xEDda (per\xEDodo)" }),
        /* @__PURE__ */ jsx3("dd", { children: fmtQty(item.saida) }),
        /* @__PURE__ */ jsx3("dt", { children: "M\xE9dia m\xEAs" }),
        /* @__PURE__ */ jsx3("dd", { children: fmtQty(item.mediaMes) }),
        /* @__PURE__ */ jsx3("dt", { children: "Estoque atual" }),
        /* @__PURE__ */ jsx3("dd", { children: fmtQty(item.estoqueAtual) }),
        /* @__PURE__ */ jsx3("dt", { children: "Cobertura (meses)" }),
        /* @__PURE__ */ jsx3("dd", { children: item.coberturaMeses != null ? fmtQty(item.coberturaMeses) : "\u2014" }),
        /* @__PURE__ */ jsx3("dt", { children: "\xDAltima entrada" }),
        /* @__PURE__ */ jsx3("dd", { children: fmtDate(item.ultimaEntrada) }),
        /* @__PURE__ */ jsx3("dt", { children: "Quantidade sugerida" }),
        /* @__PURE__ */ jsx3("dd", { children: fmtQty(item.qtdSugerida) }),
        /* @__PURE__ */ jsx3("dt", { children: "Prioridade" }),
        /* @__PURE__ */ jsx3("dd", { children: /* @__PURE__ */ jsx3("span", { className: `gm-prioridade ${prio.className}`, children: prio.label }) }),
        /* @__PURE__ */ jsx3("dt", { children: "Pre\xE7o m\xE9dio" }),
        /* @__PURE__ */ jsx3("dd", { children: fmtMoney(item.precoMedio) }),
        /* @__PURE__ */ jsx3("dt", { children: "Quantidade pendente de entrega" }),
        /* @__PURE__ */ jsx3("dd", { children: fmtQty(item.quantidadePendenteEntrega) })
      ] }),
      /* @__PURE__ */ jsx3("h4", { children: "Solicita\xE7\xF5es pendentes de entrega" }),
      carregando ? /* @__PURE__ */ jsx3("p", { role: "status", children: "Consultando solicita\xE7\xF5es e acompanhamento de pedido\u2026" }) : erroPendencias ? /* @__PURE__ */ jsxs2("p", { role: "alert", children: [
        erroPendencias,
        " ",
        /* @__PURE__ */ jsx3("button", { type: "button", className: "btn", onClick: () => setTentativa((n) => n + 1), children: "Tentar novamente" })
      ] }) : pendencias.length ? /* @__PURE__ */ jsx3("div", { className: "table-wrap", children: /* @__PURE__ */ jsxs2("table", { className: "data", children: [
        /* @__PURE__ */ jsx3("thead", { children: /* @__PURE__ */ jsxs2("tr", { children: [
          /* @__PURE__ */ jsx3("th", { children: "Solicita\xE7\xE3o" }),
          /* @__PURE__ */ jsx3("th", { children: "OC" }),
          /* @__PURE__ */ jsx3("th", { children: "Data" }),
          /* @__PURE__ */ jsx3("th", { children: "Qtd. pendente" }),
          /* @__PURE__ */ jsx3("th", { children: "Situa\xE7\xE3o no acompanhamento" })
        ] }) }),
        /* @__PURE__ */ jsx3("tbody", { children: pendencias.map((p, i) => /* @__PURE__ */ jsxs2("tr", { children: [
          /* @__PURE__ */ jsx3("td", { children: p.solicitacao }),
          /* @__PURE__ */ jsx3("td", { children: p.ordemCompra }),
          /* @__PURE__ */ jsx3("td", { children: fmtDate(p.data) }),
          /* @__PURE__ */ jsx3("td", { children: fmtQty(p.quantidade) }),
          /* @__PURE__ */ jsx3("td", { children: p.situacao })
        ] }, `${p.solicitacao}-${p.ordemCompra}-${i}`)) })
      ] }) }) : /* @__PURE__ */ jsx3("p", { children: "Nenhuma solicita\xE7\xE3o pendente encontrada." })
    ] })
  ] });
}
function IndicadoresGestaoMateriais() {
  const defaults = useMemo(() => defaultRange(), []);
  const [dataInicio, setDataInicio] = useState(defaults.from);
  const [dataFim, setDataFim] = useState(defaults.to);
  const [tipos, setTipos] = useState([]);
  const [almoxarifado, setAlmoxarifado] = useState("");
  const [materiaisSelecionados, setMateriaisSelecionados] = useState(() => /* @__PURE__ */ new Set());
  const [buscaMaterial, setBuscaMaterial] = useState("");
  const [mesesEstoque, setMesesEstoque] = useState("12");
  const [data, setData] = useState(null);
  const [opcoes, setOpcoes] = useState(null);
  const [opcoesLoading, setOpcoesLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [consultado, setConsultado] = useState(false);
  const [collapsed, setCollapsed] = useState(/* @__PURE__ */ new Set());
  const [paginas, setPaginas] = useState({});
  const [selected, setSelected] = useState(null);
  const [detailOpen, setDetailOpen] = useState(true);
  const [sort, setSort] = useState({ key: "descricao", dir: "asc" });
  useEffect2(() => {
    let active = true;
    api.indicadoresGestaoMateriaisOpcoes().then(
      (result) => {
        if (active) setOpcoes(result);
      },
      () => void 0
    ).finally(() => {
      if (active) setOpcoesLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);
  const load = useCallback(async () => {
    try {
      setLoading(true);
      setErr(null);
      const result = await api.indicadoresGestaoMateriais({
        dataInicio,
        dataFim,
        tipos: tipos.length ? tipos : void 0,
        almoxarifado: extractLeadingCode(almoxarifado) || void 0,
        codMateriais: [...materiaisSelecionados],
        mesesEstoque: mesesEstoque || void 0
      });
      setData(result);
      setConsultado(true);
      setCollapsed(new Set(result.grupos.map((grupo) => grupo.tipo)));
      setPaginas({});
      setSelected(null);
    } catch (e) {
      setData(null);
      setConsultado(true);
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [dataInicio, dataFim, tipos, almoxarifado, materiaisSelecionados, mesesEstoque]);
  useReportAutoRefresh(() => {
    if (consultado && !loading) void load();
  });
  const tiposLabel = tipos.length ? `${tipos.length} selecionado(s)` : "Todos";
  const materiaisFiltro = data?.materiais ?? opcoes?.materiais ?? [];
  const materiaisEncontrados = useMemo(
    () => materiaisFiltro.filter((row) => !buscaMaterial.trim() || `${row.codigo} ${row.descricao}`.toLocaleLowerCase("pt-BR").includes(buscaMaterial.trim().toLocaleLowerCase("pt-BR"))).slice(0, 150),
    [buscaMaterial, materiaisFiltro]
  );
  function alternarMaterial(codigo) {
    setMateriaisSelecionados((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(codigo)) proximo.delete(codigo);
      else proximo.add(codigo);
      return proximo;
    });
  }
  const gruposOrdenados = useMemo(
    () => (data?.grupos ?? []).map((grupo) => ({
      ...grupo,
      itens: [...grupo.itens].sort((a, b) => compareItems(a, b, sort))
    })),
    [data, sort]
  );
  function toggleTipo(name) {
    setTipos((current) => current.includes(name) ? current.filter((item) => item !== name) : [...current, name]);
  }
  function toggleGroup(key) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  function sortBy(key) {
    setPaginas({});
    setSort((current) => current.key === key ? { key, dir: current.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" });
  }
  function SortHeader({ label, sortKey, className }) {
    const active = sort.key === sortKey;
    return /* @__PURE__ */ jsx3("th", { className, "aria-sort": active ? sort.dir === "asc" ? "ascending" : "descending" : "none", children: /* @__PURE__ */ jsxs2("button", { type: "button", className: "gm-sort-btn", onClick: () => sortBy(sortKey), children: [
      /* @__PURE__ */ jsx3("span", { children: label }),
      /* @__PURE__ */ jsx3("span", { className: "gm-sort-indicator", children: active ? sort.dir === "asc" ? "\u25B2" : "\u25BC" : "\u2195" })
    ] }) });
  }
  return /* @__PURE__ */ jsxs2("section", { className: "panel gm-report print-report-intro", children: [
    /* @__PURE__ */ jsxs2("h3", { className: "no-print", children: [
      "Gest\xE3o de materiais",
      data?.grupos.length ? /* @__PURE__ */ jsx3("span", { className: "panel-h3-actions", children: /* @__PURE__ */ jsx3(PrintButton, {}) }) : null
    ] }),
    /* @__PURE__ */ jsxs2("div", { className: "gm-filters no-print", children: [
      /* @__PURE__ */ jsxs2("label", { children: [
        /* @__PURE__ */ jsx3("span", { children: "Per\xEDodo entrada" }),
        /* @__PURE__ */ jsxs2("div", { className: "gm-date-range", children: [
          /* @__PURE__ */ jsx3("input", { type: "date", value: dataInicio, onChange: (e) => setDataInicio(e.target.value) }),
          /* @__PURE__ */ jsx3("input", { type: "date", value: dataFim, onChange: (e) => setDataFim(e.target.value) })
        ] })
      ] }),
      /* @__PURE__ */ jsxs2("label", { children: [
        /* @__PURE__ */ jsx3("span", { children: "Tipo material" }),
        /* @__PURE__ */ jsx3(
          "input",
          {
            list: "gm-tipo-material-options",
            value: tipos.length === 1 ? tipos[0] : tipos.length ? tiposLabel : "",
            onChange: (e) => setTipos(e.target.value.trim() ? [e.target.value] : []),
            placeholder: "Todos"
          }
        ),
        /* @__PURE__ */ jsx3("datalist", { id: "gm-tipo-material-options", children: TIPOS.map((t) => /* @__PURE__ */ jsx3("option", { value: t }, t)) })
      ] }),
      /* @__PURE__ */ jsxs2("label", { children: [
        /* @__PURE__ */ jsx3("span", { children: "Almoxarifado" }),
        /* @__PURE__ */ jsx3(
          "input",
          {
            list: "gm-almoxarifado-options",
            value: almoxarifado,
            onChange: (e) => setAlmoxarifado(e.target.value),
            placeholder: "Todos"
          }
        ),
        /* @__PURE__ */ jsx3("datalist", { id: "gm-almoxarifado-options", children: (data?.almoxarifados ?? opcoes?.almoxarifados ?? []).map((row) => /* @__PURE__ */ jsx3("option", { value: `${row.codigo} \u2014 ${row.descricao}` }, row.codigo)) })
      ] }),
      /* @__PURE__ */ jsxs2("label", { className: "gm-material-filter", children: [
        /* @__PURE__ */ jsx3("span", { children: "Material" }),
        /* @__PURE__ */ jsxs2("details", { className: "gm-material-picker", children: [
          /* @__PURE__ */ jsx3("summary", { children: materiaisSelecionados.size ? `${materiaisSelecionados.size} selecionado(s)` : "Todos os materiais" }),
          /* @__PURE__ */ jsxs2("div", { className: "gm-material-picker-popover", children: [
            /* @__PURE__ */ jsx3(
              "input",
              {
                type: "search",
                value: buscaMaterial,
                onChange: (e) => setBuscaMaterial(e.target.value),
                placeholder: opcoesLoading ? "Carregando materiais\u2026" : "Buscar c\xF3digo ou descri\xE7\xE3o"
              }
            ),
            /* @__PURE__ */ jsxs2("div", { className: "gm-material-picker-actions", children: [
              /* @__PURE__ */ jsx3("button", { type: "button", onClick: () => setMateriaisSelecionados(/* @__PURE__ */ new Set()), children: "Limpar sele\xE7\xE3o" }),
              /* @__PURE__ */ jsxs2("span", { children: [
                materiaisSelecionados.size,
                " selecionado(s)"
              ] })
            ] }),
            /* @__PURE__ */ jsxs2("div", { className: "gm-material-picker-list", role: "listbox", "aria-label": "Materiais dispon\xEDveis", children: [
              materiaisEncontrados.map((row) => /* @__PURE__ */ jsxs2("label", { children: [
                /* @__PURE__ */ jsx3("input", { type: "checkbox", checked: materiaisSelecionados.has(row.codigo), onChange: () => alternarMaterial(row.codigo) }),
                /* @__PURE__ */ jsx3("strong", { children: row.codigo }),
                " \u2014 ",
                row.descricao
              ] }, row.codigo)),
              !opcoesLoading && !materiaisEncontrados.length ? /* @__PURE__ */ jsx3("span", { children: "Nenhum material encontrado." }) : null
            ] })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxs2("label", { children: [
        /* @__PURE__ */ jsx3("span", { children: "Meses de estoque" }),
        /* @__PURE__ */ jsx3(
          "input",
          {
            type: "number",
            min: 1,
            max: 60,
            value: mesesEstoque,
            onChange: (e) => setMesesEstoque(e.target.value)
          }
        )
      ] }),
      /* @__PURE__ */ jsx3("div", { className: "gm-filter-actions", children: /* @__PURE__ */ jsx3("button", { type: "button", className: "btn primary", disabled: loading, onClick: () => void load(), children: loading ? "Consultando\u2026" : "Consultar" }) })
    ] }),
    /* @__PURE__ */ jsx3(ConsultaProgressBar, { active: loading, label: "Consultando gest\xE3o de materiais\u2026", className: "consulta-progress--compact" }),
    /* @__PURE__ */ jsxs2("div", { className: "kind-toggle no-print gm-tipos-toggle", children: [
      TIPOS.map((name) => /* @__PURE__ */ jsx3(
        "button",
        {
          type: "button",
          className: `btn${tipos.includes(name) ? " primary" : ""}`,
          onClick: () => toggleTipo(name),
          children: name
        },
        name
      )),
      /* @__PURE__ */ jsx3("button", { type: "button", className: `btn${!tipos.length ? " primary" : ""}`, onClick: () => setTipos([]), children: "Todos" })
    ] }),
    /* @__PURE__ */ jsxs2("div", { className: "gm-legend no-print", children: [
      /* @__PURE__ */ jsx3("strong", { children: "Legenda:" }),
      /* @__PURE__ */ jsxs2("span", { children: [
        /* @__PURE__ */ jsx3("i", { className: "gm-dot gm-prio-critico" }),
        " CR\xCDTICO = estoque zero ou < 1 m\xEAs"
      ] }),
      /* @__PURE__ */ jsxs2("span", { children: [
        /* @__PURE__ */ jsx3("i", { className: "gm-dot gm-prio-alto" }),
        " ALTO = 1\u20132 meses"
      ] }),
      /* @__PURE__ */ jsxs2("span", { children: [
        /* @__PURE__ */ jsx3("i", { className: "gm-dot gm-prio-medio" }),
        " M\xC9DIO = 2\u20133 meses"
      ] }),
      /* @__PURE__ */ jsxs2("span", { children: [
        /* @__PURE__ */ jsx3("i", { className: "gm-dot gm-prio-ok" }),
        " OK = > 3 meses"
      ] }),
      /* @__PURE__ */ jsx3("span", { children: "Estoque atual = \xFAltimo saldo em material.estoque por material/almoxarifado (quantidade > 0)" }),
      /* @__PURE__ */ jsx3("span", { children: "Qtde sugerida = max(0, 4 \xD7 m\xE9dia m\xEAs \u2212 estoque atual)" })
    ] }),
    err ? /* @__PURE__ */ jsx3("p", { className: "lead no-print", style: { color: "var(--danger)" }, children: err }) : null,
    /* @__PURE__ */ jsxs2("div", { className: "gm-stage", children: [
      detailOpen && selected ? /* @__PURE__ */ jsx3(DetalheMaterial, { item: selected, onClose: () => setDetailOpen(false) }) : null,
      !consultado && !loading ? /* @__PURE__ */ jsx3("p", { className: "lead", children: "Defina os filtros e clique em Consultar para exibir a gest\xE3o de materiais." }) : null,
      consultado || loading ? /* @__PURE__ */ jsx3("div", { className: "table-wrap gm-table-wrap", children: /* @__PURE__ */ jsxs2("table", { className: "data gm-table", children: [
        /* @__PURE__ */ jsx3("thead", { children: /* @__PURE__ */ jsxs2("tr", { children: [
          /* @__PURE__ */ jsx3(SortHeader, { label: "Descri\xE7\xE3o", sortKey: "descricao" }),
          /* @__PURE__ */ jsx3(SortHeader, { label: "Sa\xEDda", sortKey: "saida", className: "num" }),
          /* @__PURE__ */ jsx3(SortHeader, { label: "M\xE9dia m\xEAs", sortKey: "mediaMes", className: "num" }),
          /* @__PURE__ */ jsx3(SortHeader, { label: "Estoque atual", sortKey: "estoqueAtual", className: "num" }),
          /* @__PURE__ */ jsx3(SortHeader, { label: "Cobertura (meses)", sortKey: "coberturaMeses", className: "num" }),
          /* @__PURE__ */ jsx3(SortHeader, { label: "Qtd. sugerida", sortKey: "qtdSugerida", className: "num" }),
          /* @__PURE__ */ jsx3(SortHeader, { label: "Prioridade", sortKey: "prioridade" }),
          /* @__PURE__ */ jsx3("th", { className: "num", children: "Qtd. pendente de entrega" })
        ] }) }),
        /* @__PURE__ */ jsxs2("tbody", { children: [
          gruposOrdenados.map((grupo) => {
            const open = !collapsed.has(grupo.tipo);
            const totalPaginas = Math.max(1, Math.ceil(grupo.itens.length / 100));
            const pagina = Math.min(paginas[grupo.tipo] ?? 0, totalPaginas - 1);
            return /* @__PURE__ */ jsxs2(Fragment, { children: [
              /* @__PURE__ */ jsx3("tr", { className: "gm-group-row", onClick: () => toggleGroup(grupo.tipo), children: /* @__PURE__ */ jsxs2("td", { colSpan: 8, children: [
                /* @__PURE__ */ jsxs2("strong", { children: [
                  open ? "[\u2212]" : "[+]",
                  " ",
                  grupo.label,
                  " \xB7 ",
                  grupo.itens.length,
                  " materiais"
                ] }),
                /* @__PURE__ */ jsxs2("span", { className: "gm-group-totals", children: [
                  fmtQty(grupo.totais.saida),
                  " \xB7 ",
                  fmtQty(grupo.totais.estoqueAtual),
                  " est."
                ] })
              ] }) }),
              open ? grupo.itens.slice(pagina * 100, (pagina + 1) * 100).map((item) => {
                const prio = PRIORIDADE_META[item.prioridade];
                const isSelected = selected?.codMaterial === item.codMaterial;
                return /* @__PURE__ */ jsxs2(
                  "tr",
                  {
                    className: `gm-item-row${isSelected ? " is-selected" : ""}`,
                    onClick: () => {
                      setSelected(item);
                      setDetailOpen(true);
                    },
                    children: [
                      /* @__PURE__ */ jsx3("td", { children: materialLabel(item) }),
                      /* @__PURE__ */ jsx3("td", { className: "num", children: fmtQty(item.saida) }),
                      /* @__PURE__ */ jsx3("td", { className: "num", children: fmtQty(item.mediaMes) }),
                      /* @__PURE__ */ jsx3("td", { className: "num", children: fmtQty(item.estoqueAtual) }),
                      /* @__PURE__ */ jsx3("td", { className: "num", children: item.coberturaMeses != null ? fmtQty(item.coberturaMeses) : "\u2014" }),
                      /* @__PURE__ */ jsx3("td", { className: "num", children: fmtQty(item.qtdSugerida) }),
                      /* @__PURE__ */ jsx3("td", { children: /* @__PURE__ */ jsx3("span", { className: `gm-prioridade ${prio.className}`, children: prio.label }) }),
                      /* @__PURE__ */ jsx3("td", { className: `num${item.quantidadePendenteEntrega > 0 ? " gm-pendente-entrega" : ""}`, children: item.quantidadePendenteEntrega > 0 ? /* @__PURE__ */ jsx3("button", { type: "button", className: "btn", title: "Ver solicita\xE7\xF5es pendentes e situa\xE7\xE3o no acompanhamento", onClick: (event) => {
                        event.stopPropagation();
                        setSelected(item);
                        setDetailOpen(true);
                      }, children: fmtQty(item.quantidadePendenteEntrega) }) : fmtQty(item.quantidadePendenteEntrega) })
                    ]
                  },
                  item.codMaterial
                );
              }) : null,
              open && totalPaginas > 1 ? /* @__PURE__ */ jsx3("tr", { className: "no-print", children: /* @__PURE__ */ jsxs2("td", { colSpan: 8, children: [
                /* @__PURE__ */ jsx3("button", { type: "button", className: "btn", disabled: pagina === 0, onClick: () => setPaginas((atual) => ({ ...atual, [grupo.tipo]: pagina - 1 })), children: "Anterior" }),
                " ",
                "P\xE1gina ",
                pagina + 1,
                " de ",
                totalPaginas,
                " \xB7 ",
                grupo.itens.length,
                " materiais",
                " ",
                /* @__PURE__ */ jsx3("button", { type: "button", className: "btn", disabled: pagina + 1 >= totalPaginas, onClick: () => setPaginas((atual) => ({ ...atual, [grupo.tipo]: pagina + 1 })), children: "Pr\xF3xima" })
              ] }) }) : null
            ] }, grupo.tipo);
          }),
          data?.totais ? /* @__PURE__ */ jsxs2("tr", { className: "gm-total-row", children: [
            /* @__PURE__ */ jsx3("td", { children: /* @__PURE__ */ jsx3("strong", { children: "Total" }) }),
            /* @__PURE__ */ jsx3("td", { className: "num", children: /* @__PURE__ */ jsx3("strong", { children: fmtQty(data.totais.saida) }) }),
            /* @__PURE__ */ jsx3("td", { className: "num", children: /* @__PURE__ */ jsx3("strong", { children: fmtQty(data.totais.mediaMes) }) }),
            /* @__PURE__ */ jsx3("td", { className: "num", children: /* @__PURE__ */ jsx3("strong", { children: fmtQty(data.totais.estoqueAtual) }) }),
            /* @__PURE__ */ jsx3("td", {}),
            /* @__PURE__ */ jsx3("td", { className: "num", children: /* @__PURE__ */ jsx3("strong", { children: fmtQty(data.totais.qtdSugerida) }) }),
            /* @__PURE__ */ jsx3("td", {}),
            /* @__PURE__ */ jsx3("td", {})
          ] }) : null
        ] })
      ] }) }) : null
    ] })
  ] });
}
export {
  IndicadoresGestaoMateriais
};
