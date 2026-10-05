import assert from "node:assert/strict";
import test from "node:test";
import { weeksInRange } from "../server/indicadores/semanas-sexta.ts";

test("semana operacional vai de sexta a quinta e recorta o filtro", () => {
  const semanas = weeksInRange("2026-09-05", "2026-10-01");
  assert.deepEqual(
    semanas.map((semana) => semana.label),
    ["05/09 → 10/09", "11/09 → 17/09", "18/09 → 24/09", "25/09 → 01/10"],
  );
  assert.equal(semanas[0]?.from, "2026-09-05");
  assert.equal(semanas[0]?.to, "2026-09-10");
  assert.equal(semanas[3]?.from, "2026-09-25");
  assert.equal(semanas[3]?.to, "2026-10-01");
});
