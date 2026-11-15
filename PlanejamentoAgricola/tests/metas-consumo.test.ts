import assert from "node:assert/strict";
import { test } from "node:test";
import { lerMetasConsumo } from "../src/lib/metas-consumo.js";

test("metas do mapa leem o mesmo cadastro salvo do Indicador CTT e usam seus padroes", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  let saved: string | null = null;
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem(key: string) { return key === "indicador-ctt-metas" ? saved : null; },
  } });
  try {
    assert.deepEqual(lerMetasConsumo(), { colhedora: { ltHora: 35, ltTon: 1.1 }, trator: { ltHora: 8, ltTon: 0.6 } });
    saved = JSON.stringify({ colhedora: { dieselHr: 32, dieselTon: 1.05 }, trator: { dieselHr: 7.5 } });
    assert.deepEqual(lerMetasConsumo(), { colhedora: { ltHora: 32, ltTon: 1.05 }, trator: { ltHora: 7.5, ltTon: 0.6 } });
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});
