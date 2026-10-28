import type { Request, Response } from "express";
import {
  createAdminUser,
  listAdminUsers,
  readBearerToken,
  updateAdminUser,
  verifySessionToken,
  verifyStoredPassword,
} from "./auth.js";
import { canManageUsers, permissionCatalog } from "./permissions.js";
import { getUserPermissions, setUserPermissions } from "./user-permissions.js";
import { getAgroBiAccess, setAgroBiAccess } from "./agrobi-access.js";
import { withOracle } from "./oracle.js";

function requireAuthUser(req: Request, res: Response) {
  const user = verifySessionToken(readBearerToken(req.headers.authorization));
  if (!user) {
    res.status(401).json({ error: "Sessão expirada ou inválida." });
    return null;
  }
  return user;
}

function requireUsersAdmin(req: Request, res: Response) {
  const user = requireAuthUser(req, res);
  if (!user) return null;
  if (!canManageUsers(user.permissions)) {
    res.status(403).json({ error: "Sem permissão para gerenciar usuários." });
    return null;
  }
  return user;
}

export function registerUsersAdminRoutes(app: import("express").Express) {
  app.get("/api/admin/funcionarios", async (req, res) => {
    if (!requireUsersAdmin(req, res)) return;
    const busca = String(req.query.busca ?? "").trim();
    if (!busca || busca.length > 100) return res.status(400).json({ error: "Informe até 100 caracteres para pesquisar." });
    try {
      const funcionarios = await withOracle(async (connection) => {
        const result = await connection.execute(
          `SELECT codigo, nome FROM (
             SELECT DISTINCT cod_funcionario AS codigo, TRIM(nome) AS nome
             FROM rh.vw_pessoa_funcionario
             WHERE INSTR(TO_CHAR(cod_funcionario), :busca) > 0
                OR INSTR(
                  TRANSLATE(UPPER(nome), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'AAAAAEEEEIIIIOOOOOUUUUC'),
                  TRANSLATE(UPPER(:busca), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'AAAAAEEEEIIIIOOOOOUUUUC')) > 0
             ORDER BY nome, codigo
           ) WHERE ROWNUM <= 30`,
          { busca },
        );
        return (result.rows as { CODIGO: number; NOME: string }[] ?? [])
          .map((row) => ({ codigo: Number(row.CODIGO), nome: String(row.NOME ?? "").trim() }));
      });
      res.json(funcionarios);
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "Não foi possível pesquisar funcionários no Oracle." });
    }
  });

  app.get("/api/admin/funcionarios/:codigo", async (req, res) => {
    if (!requireUsersAdmin(req, res)) return;
    const codigo = Number(req.params.codigo);
    if (!Number.isSafeInteger(codigo) || codigo <= 0) return res.status(400).json({ error: "Código de funcionário inválido." });
    try {
      const funcionario = await withOracle(async (connection) => {
        const result = await connection.execute(
          `SELECT cod_funcionario, TRIM(nome) AS nome
             FROM rh.vw_pessoa_funcionario
            WHERE cod_funcionario = :codigo
              AND ROWNUM = 1`,
          { codigo },
        );
        const row = result.rows?.[0] as { COD_FUNCIONARIO?: unknown; NOME?: unknown } | undefined;
        if (!row || Number(row.COD_FUNCIONARIO) !== codigo || !String(row.NOME ?? "").trim()) return null;
        return { codigo: Number(row.COD_FUNCIONARIO), nome: String(row.NOME).trim() };
      });
      if (!funcionario) return res.status(404).json({ error: "Funcionário não encontrado no Oracle." });
      res.json(funcionario);
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "Não foi possível importar o funcionário." });
    }
  });

  app.get("/api/admin/agrobi-access/:idUsuario", async (req, res) => {
    if (!requireUsersAdmin(req, res)) return;
    try {
      res.json(await getAgroBiAccess(req.params.idUsuario));
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : "Não foi possível carregar os acessos do AgroBi." });
    }
  });

  app.put("/api/admin/agrobi-access/:idUsuario", async (req, res) => {
    if (!requireUsersAdmin(req, res)) return;
    try {
      const body = (req.body ?? {}) as { abas?: unknown };
      res.json(await setAgroBiAccess(req.params.idUsuario, body.abas));
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : "Não foi possível salvar os acessos do AgroBi." });
    }
  });

  app.get("/api/admin/permissions/catalog", (req, res) => {
    const user = requireAuthUser(req, res);
    if (!user) return;
    if (!canManageUsers(user.permissions)) {
      return res.status(403).json({ error: "Sem permissão para gerenciar usuários." });
    }
    res.json(permissionCatalog());
  });

  app.get("/api/admin/users", async (req, res) => {
    if (!requireUsersAdmin(req, res)) return;
    try {
      res.json(await listAdminUsers());
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "Falha ao listar usuários." });
    }
  });

  app.post("/api/admin/users", async (req, res) => {
    if (!requireUsersAdmin(req, res)) return;
    try {
      const body = (req.body ?? {}) as {
        codFuncionario?: number;
        nome?: string;
        email?: string;
        password?: string;
        ativo?: boolean;
        permissions?: string[];
      };
      const created = await createAdminUser({
        codFuncionario: Number(body.codFuncionario),
        nome: String(body.nome ?? ""),
        email: body.email == null ? undefined : String(body.email),
        password: String(body.password ?? ""),
        ativo: body.ativo !== false,
      });
      if (Array.isArray(body.permissions)) {
        setUserPermissions(created.id, body.permissions);
        created.permissions = body.permissions;
      }
      res.status(201).json(created);
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : "Não foi possível criar o usuário." });
    }
  });

  app.patch("/api/admin/users/:id", async (req, res) => {
    if (!requireUsersAdmin(req, res)) return;
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ error: "ID inválido." });
      const body = (req.body ?? {}) as {
        codFuncionario?: number;
        nome?: string;
        email?: string;
        password?: string;
        ativo?: boolean;
        permissions?: string[];
      };
      const updated = await updateAdminUser(id, {
        codFuncionario: body.codFuncionario,
        nome: body.nome,
        email: body.email,
        password: body.password,
        ativo: body.ativo,
      });
      const permissions = Array.isArray(body.permissions) ? body.permissions : getUserPermissions(id);
      setUserPermissions(updated.id, permissions);
      updated.permissions = permissions;
      res.json(updated);
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : "Não foi possível atualizar o usuário." });
    }
  });

  app.post("/api/admin/users/verify-password", async (req, res) => {
    if (!requireUsersAdmin(req, res)) return;
    try {
      const body = (req.body ?? {}) as { email?: string; password?: string };
      const email = String(body.email ?? "").trim();
      const password = String(body.password ?? "");
      if (!email || !password) {
        return res.status(400).json({ error: "Informe e-mail e senha." });
      }
      const result = await verifyStoredPassword(email, password);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "Falha ao verificar senha." });
    }
  });
}
