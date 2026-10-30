import { test } from "node:test";
import assert from "node:assert/strict";
import { nextContractEmission, loadContractEmissions } from "./contract-emissions";

test("soma exatamente 30 dias à emissão, sem usar o mês seguinte ou a data atual", () => {
  assert.equal(nextContractEmission("2026-10-15"), "2026-11-14");
  assert.equal(nextContractEmission("2026-08-31"), "2026-09-30");
  assert.equal(nextContractEmission("2026-01-31"), "2026-03-02");
  assert.equal(nextContractEmission("2024-02-01"), "2024-03-02");
  assert.equal(nextContractEmission("2026-12-15"), "2027-01-14");
});

test("sem emissão válida não inventa uma data", async () => {
  for (const value of [null, "", "2026-02-30", "31/02/2026"]) assert.equal(nextContractEmission(value), null);
  assert.equal((await loadContractEmissions(["Sem contrato", ""])).size, 0);
});
