import { test } from "node:test";
import assert from "node:assert/strict";
import { canConfigureFarmMap, canManageUsers, PERMISSION_MAPA_CONFIG } from "./permissions.js";

test("configurações do mapa exigem administrador ou autorização explícita", () => {
  assert.equal(canConfigureFarmMap(["admin"]), true);
  assert.equal(canConfigureFarmMap([PERMISSION_MAPA_CONFIG]), true);
  assert.equal(canConfigureFarmMap([]), false);
  assert.equal(canConfigureFarmMap(), false);
  assert.equal(canConfigureFarmMap(["nativeTab:indicadores:mapa-fazendas", "nativeTab:indicadores:mapa-fazendas:edit"]), false);
  assert.equal(canConfigureFarmMap(["admin:users"]), false);
});

test("autorização para configurar o mapa não permite conceder permissões a usuários", () => {
  assert.equal(canManageUsers([PERMISSION_MAPA_CONFIG]), false);
  assert.equal(canManageUsers(["admin"]), true);
});
