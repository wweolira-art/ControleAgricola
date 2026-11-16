import assert from "node:assert/strict";
import test from "node:test";
import { resolverPrecoPneu, type PneuPreco } from "../server/indicadores/pneus-precos.js";

const precos: PneuPreco[] = [
  { id: 1, codMedida: 10, dataInicial: "2026-01-01", dataFinal: "2026-08-31", preco: 5000 },
  { id: 2, codMedida: 10, dataInicial: "2026-09-01", dataFinal: "2027-08-31", preco: 5500 },
  { id: 3, codMedida: 20, dataInicial: "2026-09-01", dataFinal: "2027-08-31", preco: 7000 },
];

test("preco do pneu respeita medida e vigencia inclusive nas datas limite", () => {
  assert.equal(resolverPrecoPneu(precos, 10, "2026-08-31"), 5000);
  assert.equal(resolverPrecoPneu(precos, 10, "2026-09-01"), 5500);
  assert.equal(resolverPrecoPneu(precos, 20, "2026-11-10"), 7000);
});

test("sem preco cadastrado no periodo permite manter o fallback do Oracle", () => {
  assert.equal(resolverPrecoPneu(precos, 10, "2025-12-31"), null);
  assert.equal(resolverPrecoPneu(precos, 30, "2026-11-10"), null);
  assert.equal(resolverPrecoPneu(precos, null, "2026-11-10"), null);
});
