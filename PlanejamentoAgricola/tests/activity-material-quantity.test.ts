import assert from "node:assert/strict";
import { test } from "node:test";
import { activityMaterialQuantity } from "../src/lib/activity-material-quantity.js";

const material = { ref_kind: "material", material_id: 260, calc_kind: "liters", calc_direct: 0 };

test("atividade mostra a soma das parcelas do diesel distribuído", () => {
  const rows = [2.6, 7.9, 5.2].map((calc_dose) => ({ ...material, calc_dose }));
  assert.ok(Math.abs(activityMaterialQuantity(rows)! - 15.7) < 1e-10);
  assert.equal(activityMaterialQuantity([{ ...material, calc_dose: 12 }]), 12);
});

test("não soma produtos ou unidades diferentes nem quantidades ausentes", () => {
  const row = { ...material, calc_dose: 10 };
  assert.equal(activityMaterialQuantity([]), null);
  assert.equal(activityMaterialQuantity([row, { ...row, material_id: 261 }]), null);
  assert.equal(activityMaterialQuantity([row, { ...row, calc_kind: "hours" }]), null);
  assert.equal(activityMaterialQuantity([row, { ...row, calc_dose: null }]), null);
  assert.equal(activityMaterialQuantity([{ ...row, calc_direct: 1 }]), null);
});
