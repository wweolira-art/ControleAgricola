import { test } from "node:test";
import assert from "node:assert/strict";
import { contractNeedsAlert, contractToday } from "./contract-alert-status";

test("emissão passada gera alerta; hoje e datas futuras permanecem verificadas", () => {
  assert.equal(contractNeedsAlert("2026-10-27", "2026-10-28"), true);
  assert.equal(contractNeedsAlert("27/10/2026", "2026-10-28"), true);
  assert.equal(contractNeedsAlert("2026-10-28", "2026-10-28"), false);
  assert.equal(contractNeedsAlert("2026-11-27", "2026-10-28"), false);
  assert.equal(contractNeedsAlert(null, "2026-10-28"), false);
  assert.equal(contractNeedsAlert("", "2026-10-28"), false);
});

test("a mudança do dia acompanha Fortaleza, inclusive na virada do mês", () => {
  assert.equal(contractToday(new Date("2026-11-01T02:59:59Z")), "2026-10-31");
  assert.equal(contractToday(new Date("2026-11-01T03:00:00Z")), "2026-11-01");
  assert.equal(contractNeedsAlert("2026-10-31", contractToday(new Date("2026-11-01T03:00:00Z"))), true);
});
