import assert from "node:assert/strict";
import { test } from "node:test";
import { empenhoDaImportacao } from "../src/lib/import-empenho.js";
import type { Activity, Material } from "../src/api.js";

const activities = [{ id: 1, code: "411", empenho: "999" }] as Activity[];
const materials: Material[] = [{ id: 8, code: "260", description: "Diesel", tipo: "E", empenho: "241", valor: 6 }];
const line = { activity_id: 1, item_type: "E", product_code: "260", ref_kind: "material" as const, material_id: 8 };

test("tipo E exporta o empenho cadastrado no material em vez do empenho da atividade", () => {
  assert.equal(empenhoDaImportacao(activities, line, materials), "241");
  assert.equal(empenhoDaImportacao(activities, { ...line, material_id: null, product_code: "E00260" }, materials), "241");
});

test("respeita empenho manual e mantém o empenho dos itens G e equipamentos", () => {
  assert.equal(empenhoDaImportacao(activities, { ...line, empenho_override: " 123 " }, materials), "123");
  assert.equal(empenhoDaImportacao(activities, { ...line, item_type: "G", product_code: "411" }, materials), "999");
  assert.equal(empenhoDaImportacao(activities, { ...line, ref_kind: "cost_object" }, materials), "999");
});

test("material sem empenho não recebe indevidamente o empenho da atividade", () => {
  assert.equal(empenhoDaImportacao(activities, line, [{ ...materials[0], empenho: null }]), "");
});
