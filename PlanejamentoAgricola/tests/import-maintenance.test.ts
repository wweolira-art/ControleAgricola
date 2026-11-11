import assert from "node:assert/strict";
import test from "node:test";
import { shouldAllocateMaintenance } from "../src/lib/import-maintenance.js";

test("rateia atividades genéricas de manutenção da colheita mecanizada", () => {
  for (const id of [9999, 9998, 9997, 9996, 9995]) {
    assert.equal(shouldAllocateMaintenance("DESPESAS COM MANUTENÇÃO", {
      ref_kind: "activity", item_type: null, activity_id: id,
    }, [{ id }]), true);
  }
});

test("preserva rateio de equipamento e não mistura materiais E e combustível", () => {
  const equipment = { ref_kind: "cost_object" as const, item_type: "E", activity_id: 1 };
  assert.equal(shouldAllocateMaintenance("Despesa c/ Manutenção", equipment, [{ id: 1 }]), true);
  assert.equal(shouldAllocateMaintenance("Despesas com manutenção", { ...equipment, ref_kind: "material" }, [{ id: 1 }]), false);
  assert.equal(shouldAllocateMaintenance("Despesas com combustível e lubrificantes", equipment, [{ id: 1 }]), false);
  assert.equal(shouldAllocateMaintenance("Despesas com manutenção", equipment, []), false);
});
