import assert from "node:assert/strict";
import test from "node:test";
import { createHash, scryptSync } from "node:crypto";
import { verifyPasswordHash } from "../server/password-verification.ts";

test("mantém compatibilidade SHA-256 e rejeita senha incorreta", async () => {
  const hash = createHash("sha256").update("senha-ficticia").digest("hex");
  assert.equal(await verifyPasswordHash("senha-ficticia", hash), true);
  assert.equal(await verifyPasswordHash("outra", hash), false);
});

test("valida o formato scrypt com salt em texto e chave de 24 bytes", async () => {
  const salt = Buffer.alloc(16, 7).toString("base64url");
  const key = scryptSync("senha-ficticia", salt, 24).toString("base64url");
  const hash = `scrypt$${salt}$${key}`;
  assert.equal(hash.length, 62);
  assert.equal(await verifyPasswordHash("senha-ficticia", hash), true);
  assert.equal(await verifyPasswordHash("errada", hash), false);
});

test("valida scrypt com salt em bytes e rejeita estrutura inválida", async () => {
  const salt = Buffer.alloc(16, 9);
  const key = scryptSync("senha-ficticia", salt, 24).toString("base64url");
  assert.equal(await verifyPasswordHash("senha-ficticia", `scrypt$${salt.toString("base64url")}$${key}`), true);
  for (const hash of ["", "texto-sem-hash", "scrypt$a$b", "scrypt$" + "a".repeat(10000) + "$aaa"]) {
    assert.equal(await verifyPasswordHash("senha-ficticia", hash), false);
  }
});
