import type { Express, Request, Response, NextFunction } from "express";
import { db } from "./db.js";
import { readBearerToken, verifySessionToken } from "./auth.js";
import {
  canEditPermission,
  canEditBiometria,
  canInsertAutorgas,
  canConfigureFarmMap,
  PERMISSION_BIOMETRIA_EDIT,
  PERMISSION_MAPA_CONFIG,
  PERMISSION_ADMIN,
  PERMISSION_AUTORGAS_INSERT,
  sheetPermissionKey,
  siteGroupPermissionKey,
} from "./permissions.js";

const PUBLIC_MUTATION_PREFIXES = ["/api/auth/login", "/api/auth/logout"];

const SAFRA_NAV_PREFIXES = ["/api/safras/current"];

const SCOPED_COST_PLANNING_GLOBAL_PATHS = [
  "/api/dashboard",
  "/api/resumo",
  "/api/premissas",
  "/api/activity-links",
  "/api/calc-rules",
  "/api/un-realizado-sources",
  "/api/funcionario-orcamento",
  "/api/activities",
  "/api/materials",
  "/api/externo/orcamento",
];

function isScopedCostPlanningGlobalPath(path: string) {
  return SCOPED_COST_PLANNING_GLOBAL_PATHS.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

function sheetIdFromLine(lineId: number): number | null {
  const row = db.prepare("SELECT sheet_id FROM lines WHERE id = ?").get(lineId) as { sheet_id?: number } | undefined;
  return row?.sheet_id ?? null;
}

function sheetIdFromCategory(categoryId: number): number | null {
  const row = db.prepare("SELECT sheet_id FROM categories WHERE id = ?").get(categoryId) as { sheet_id?: number } | undefined;
  return row?.sheet_id ?? null;
}

export function scopedCostCenterIds(req: Request): number[] | null {
  const user = verifySessionToken(readBearerToken(req.headers.authorization));
  const permissions = user?.permissions ?? [];
  if (!user || !permissions.length || permissions.includes(PERMISSION_ADMIN)) return null;
  const sheetIds = permissions
    .map((key) => /^sheet:(\d+)$/.exec(key)?.[1])
    .filter((value): value is string => Boolean(value))
    .map(Number);
  return sheetIds.length ? [...new Set(sheetIds)] : null;
}

function gestaoColheitaImportPermissions() {
  const keys = ["nativeTab:gestao-colheita:import"];
  const group = db
    .prepare("SELECT id FROM external_site_groups WHERE native_key = ? LIMIT 1")
    .get("gestao-colheita") as { id?: number } | undefined;
  if (group?.id != null) keys.push(siteGroupPermissionKey(group.id));
  return keys;
}

function gestaoColheitaLubrificacaoPermissions() {
  const keys = ["nativeTab:gestao-colheita:lubrificacao"];
  const group = db
    .prepare("SELECT id FROM external_site_groups WHERE native_key = ? LIMIT 1")
    .get("gestao-colheita") as { id?: number } | undefined;
  if (group?.id != null) keys.push(siteGroupPermissionKey(group.id));
  return keys;
}

function gestaoColheitaProducaoOperadorPermissions() {
  const keys = ["nativeTab:gestao-colheita:entrada-caminhao-completa"];
  const group = db
    .prepare("SELECT id FROM external_site_groups WHERE native_key = ? LIMIT 1")
    .get("gestao-colheita") as { id?: number } | undefined;
  if (group?.id != null) keys.push(siteGroupPermissionKey(group.id));
  return keys;
}

function gestaoColheitaResumoTransportePermissions() {
  const keys = ["nativeTab:gestao-colheita:resumo-transporte"];
  const group = db
    .prepare("SELECT id FROM external_site_groups WHERE native_key = ? LIMIT 1")
    .get("gestao-colheita") as { id?: number } | undefined;
  if (group?.id != null) keys.push(siteGroupPermissionKey(group.id));
  return keys;
}

function canEditAnyPermission(permissions: string[], baseKeys: string | string[]) {
  const keys = Array.isArray(baseKeys) ? baseKeys : [baseKeys];
  return keys.some((key) => canEditPermission(permissions, key));
}

function penetrometroEditPermissions() {
  const keys = ["nativeTab:indicadores:compactacao-solo", "nativeTab:gestao-colheita:import-penetrometro"];
  const groups = db.prepare("SELECT id FROM external_site_groups WHERE native_key IN (?, ?)").all("indicadores", "gestao-colheita") as { id: number }[];
  return [...keys, ...groups.map((group) => siteGroupPermissionKey(group.id))];
}

function resolveEditPermission(req: Request): string | string[] | null | undefined {
  const path = req.path;
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD") return null;

  if (PUBLIC_MUTATION_PREFIXES.some((prefix) => path.startsWith(prefix))) return null;
  if (SAFRA_NAV_PREFIXES.some((prefix) => path.startsWith(prefix))) return null;
  // Configuração do quadro de manutenção: só administrador (ou usuário sem restrição).
  if (path === "/api/indicadores/manutencao-programada/config") return PERMISSION_ADMIN;
  if (path.startsWith("/api/analise-solo")) return "nativeTab:indicadores:analise-solo";
  if (path === "/api/autorgas") return PERMISSION_AUTORGAS_INSERT;
  if (path.startsWith("/api/indicadores/mapa-fazendas/editor") || path === "/api/indicadores/mapa-fazendas/config") return PERMISSION_MAPA_CONFIG;
  if (path === "/api/indicadores/lubrificacao/programacao") return gestaoColheitaLubrificacaoPermissions();
  if (path === "/api/entrada-cana-caminhao/ops") return gestaoColheitaProducaoOperadorPermissions();
  if (path === "/api/resumo-transporte-cana/rateio-produtos") return gestaoColheitaResumoTransportePermissions();
  if (path.startsWith("/api/colheita/penetrometro")) return penetrometroEditPermissions();
  if (path === "/api/indicadores/analise-biometrica/ponto") return PERMISSION_BIOMETRIA_EDIT;
  if (path === "/api/colheita/motoristas-canavieiros/tabelas-ocultas") {
    const groups = db.prepare("SELECT id FROM external_site_groups WHERE native_key IN (?, ?)").all("gestao-colheita", "indicadores") as { id: number }[];
    return ["nativeTab:gestao-colheita:motoristas-canavieiros", "nativeTab:indicadores:colheita-producao", ...groups.map((group) => siteGroupPermissionKey(group.id))];
  }

  if (path.startsWith("/api/admin/users")) return PERMISSION_ADMIN;
  if (path.startsWith("/api/admin/agrobi-access")) return PERMISSION_ADMIN;
  if (path.startsWith("/api/premissas")) return "tab:premissas";
  if (path.startsWith("/api/calc-rules") || path.startsWith("/api/un-realizado-sources")) return "tab:autoCalc";
  if (path.startsWith("/api/activity-links")) return "tab:activityLinks";
  if (path.startsWith("/api/funcionario-orcamento")) return "tab:autoCalc";
  if (path === "/api/entrada-cana/import") return gestaoColheitaImportPermissions();

  if (path.startsWith("/api/activities")) return "tab:subempenhos";
  if (path.startsWith("/api/materials")) return "tab:materials";
  if (path.startsWith("/api/fazendas")) return "page:fazendas";
  if (path.startsWith("/api/cost-objects")) return "page:costObjects";
  if (path.startsWith("/api/category-catalog")) return "page:categories";
  if (path.startsWith("/api/areas")) return "page:harvestAreas";
  if (path.startsWith("/api/seed-radius-tariffs")) return "page:seedRadiusTariffs";
  if (path.startsWith("/api/safras")) return "page:safras";
  if (path.startsWith("/api/external-sites")) return "page:externalSites";
  if (path.startsWith("/api/contracts")) return "page:contracts";

  const sheetMatch = path.match(/^\/api\/sheets\/(\d+)/);
  if (sheetMatch) return sheetPermissionKey(Number(sheetMatch[1]));

  const lineMatch = path.match(/^\/api\/lines\/(\d+)/);
  if (lineMatch) {
    const sheetId = sheetIdFromLine(Number(lineMatch[1]));
    if (sheetId != null) return sheetPermissionKey(sheetId);
  }

  const categoryMatch = path.match(/^\/api\/categories\/(\d+)/);
  if (categoryMatch) {
    const sheetId = sheetIdFromCategory(Number(categoryMatch[1]));
    if (sheetId != null) return sheetPermissionKey(sheetId);
  }

  if (path.startsWith("/api/distributions/") || path.startsWith("/api/reset")) return PERMISSION_ADMIN;

  return undefined;
}

export function registerAccessControl(app: Express) {
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method === "GET" || req.method === "HEAD") {
      const user = verifySessionToken(readBearerToken(req.headers.authorization));
      const permissions = user?.permissions ?? [];
      if (!user || !permissions.length || permissions.includes(PERMISSION_ADMIN)) return next();

      const scopedToCenters = permissions.some((key) => key.startsWith("sheet:"));
      if (!scopedToCenters) return next();

      const path = req.path;
      if (path === "/api/orcado-realizado" && !permissions.includes("tab:orcadoRealizado")) {
        return res.status(403).json({ error: "Sem acesso à aba Orçado x realizado." });
      }
      if (isScopedCostPlanningGlobalPath(path)) {
        return res.status(403).json({
          error: "Esta informação reúne dados de vários centros de custo e não está disponível para usuários limitados a centros específicos.",
        });
      }

      const sheetMatch = path.match(/^\/api\/sheets\/(\d+)/);
      const lineMatch = path.match(/^\/api\/lines\/(\d+)/);
      const categoryMatch = path.match(/^\/api\/categories\/(\d+)/);
      const sheetId = sheetMatch
        ? Number(sheetMatch[1])
        : lineMatch
          ? sheetIdFromLine(Number(lineMatch[1]))
          : categoryMatch
            ? sheetIdFromCategory(Number(categoryMatch[1]))
            : null;
      if (sheetId != null && !permissions.includes(sheetPermissionKey(sheetId))) {
        return res.status(403).json({ error: "Sem acesso a este centro de custo." });
      }
      return next();
    }

    const baseKey = resolveEditPermission(req);
    if (baseKey === null) return next();

    const user = verifySessionToken(readBearerToken(req.headers.authorization));
    if (!user) {
      return res.status(401).json({ error: "Sessão expirada ou inválida." });
    }

    const permissions = user.permissions ?? [];
    if (
      permissions.some((key) => key.startsWith("sheet:")) &&
      isScopedCostPlanningGlobalPath(req.path)
    ) {
      return res.status(403).json({
        error: "Esta operação reúne dados de vários centros de custo e não está disponível para usuários limitados a centros específicos.",
      });
    }
    if (baseKey === PERMISSION_MAPA_CONFIG) {
      if (!canConfigureFarmMap(permissions)) return res.status(403).json({ error: "Somente o administrador ou usuários autorizados podem configurar o mapa." });
      return next();
    }
    if (baseKey === PERMISSION_AUTORGAS_INSERT) {
      if (!canInsertAutorgas(permissions)) return res.status(403).json({ error: "Somente usuários liberados pelo administrador podem inserir acompanhamentos Autorgas." });
      return next();
    }
    if (!permissions.length || permissions.includes(PERMISSION_ADMIN)) return next();

    if (baseKey === PERMISSION_BIOMETRIA_EDIT) {
      const permissionsAtuais = db
        .prepare("SELECT permission_key FROM user_permissions WHERE user_id = ?")
        .all(user.id)
        .map((row) => String((row as { permission_key: string }).permission_key));
      if (!canEditBiometria([...new Set([...permissions, ...permissionsAtuais])])) {
        return res.status(403).json({ error: "Sem permissão para editar a Análise biométrica." });
      }
      return next();
    }

    if (baseKey === undefined) {
      return res.status(403).json({ error: "Sem permissão para esta operação." });
    }

    if (!canEditAnyPermission(permissions, baseKey)) {
      return res.status(403).json({ error: "Sem permissão para editar nesta aba." });
    }

    next();
  });
}
