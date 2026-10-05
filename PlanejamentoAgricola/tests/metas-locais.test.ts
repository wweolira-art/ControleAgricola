import assert from "node:assert/strict";
import { test } from "node:test";

const mem = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem(key: string) {
      return mem.has(key) ? mem.get(key)! : null;
    },
    setItem(key: string, value: string) {
      mem.set(key, String(value));
    },
  },
  configurable: true,
});

const {
  readMetaCtt,
  readMetaDisponibilidade,
  readMetaMtbf,
  readMetaMttr,
  writeMetaCtt,
  writeMetaDisponibilidade,
  writeMetaMtbf,
  writeMetaMttr,
} = await import("../src/lib/metas-locais.js");

test("disponibilidade do CTT fica gravada e é reaproveitada", () => {
  writeMetaCtt("colhedora", "disponibilidade", 88);
  assert.equal(readMetaDisponibilidade(85), 88);
  assert.equal(readMetaCtt("trator", "disponibilidade", 85), 88);
  assert.equal(readMetaCtt("caminhao", "disponibilidade", 85), 88);
});

test("salvar a meta geral atualiza o indicador CTT", () => {
  writeMetaDisponibilidade(91.5);
  assert.equal(readMetaDisponibilidade(85), 91.5);
  assert.equal(readMetaCtt("colhedora", "disponibilidade", 85), 91.5);
});

test("MTTR e MTBF ficam gravados no navegador", () => {
  writeMetaMttr(null, 12.5);
  writeMetaMtbf(null, 40);
  assert.equal(readMetaMttr(null, 15), 12.5);
  assert.equal(readMetaMtbf(null, 15), 40);
  writeMetaMttr(81, 8);
  assert.equal(readMetaMttr(81, 15), 8);
  assert.equal(readMetaMttr(null, 15), 12.5);
});
