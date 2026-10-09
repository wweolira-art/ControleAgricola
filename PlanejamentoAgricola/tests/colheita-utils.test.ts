import assert from "node:assert/strict";
import { test } from "node:test";
import { formatOrdsDate } from "../src/components/colheita/colheita-utils.ts";

test("formatOrdsDate preserva o dia recebido da ORDS sem deslocar por fuso", () => {
  assert.equal(formatOrdsDate("2026-10-08T00:00:00Z"), "08/10/2026");
  assert.equal(formatOrdsDate("2026-10-08"), "08/10/2026");
});

test("formatOrdsDate normaliza datas brasileiras", () => {
  assert.equal(formatOrdsDate("8/10/2026"), "08/10/2026");
});
