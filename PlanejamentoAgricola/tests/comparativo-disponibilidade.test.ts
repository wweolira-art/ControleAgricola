import assert from "node:assert/strict";
import { test } from "node:test";
import {
  comparativoMesWindow,
  comparativoMesesSafra,
  filtrarMesesComparativo,
  montarSeriesComparativo,
  recortarMesesComparativo,
  safraCodigoFromStartYear,
  safraStartYearFromCode,
  serieComparativoLabel,
} from "../src/lib/comparativo-disponibilidade.js";

test("safra code and months start in september and keep the full harvest year", () => {
  assert.equal(safraStartYearFromCode("23/24"), 2023);
  assert.equal(safraCodigoFromStartYear(2023), "23/24");
  assert.equal(comparativoMesesSafra(2023).length, 12);
  assert.deepEqual(
    comparativoMesesSafra(2023, "2024-04-15").map((m) => m.label),
    ["SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO", "JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL"],
  );
});

test("keeps later months when a previous safra has values", () => {
  const meses = comparativoMesesSafra(2026).map((m) => ({ key: m.key, label: m.label }));
  const recorte = recortarMesesComparativo(meses, [
    { porTipo: { "81": [90, 88, 85, 80, 77, 70, 68, 65, 60, null, null, null] } },
    { porTipo: { "81": [91, null, null, null, null, null, null, null, null, null, null, null] } },
  ]);
  assert.equal(recorte.meses.at(-1)?.label, "MAIO");
  assert.equal(recorte.safras[0].porTipo["81"].length, 9);
});

test("month windows align the same harvest month across safras", () => {
  assert.deepEqual(comparativoMesWindow(2021, 9), { from: "2021-09-01", to: "2021-09-30" });
  assert.deepEqual(comparativoMesWindow(2022, 4), { from: "2023-04-01", to: "2023-04-30" });
  assert.deepEqual(comparativoMesWindow(2023, 4, "2024-04-15"), { from: "2024-04-01", to: "2024-04-15" });
  assert.equal(comparativoMesWindow(2023, 5, "2024-04-15"), null);
});

test("series label uses the short equipment name and safra", () => {
  assert.equal(serieComparativoLabel("Colhedoras - CCT", "21/22"), "Colhedoras (21/22)");
});

test("builds one series per selected equipment type and safra", () => {
  const series = montarSeriesComparativo({
    meses: [{ key: "09", label: "SETEMBRO" }],
    tipos: [
      { codTipo: 81, label: "Colhedoras - CCT" },
      { codTipo: 93, label: "Trator Transbordo - CCT" },
    ],
    safras: [
      { codigo: "24/25", porTipo: { "81": [90], "93": [80] } },
      { codigo: "25/26", porTipo: { "81": [91], "93": [82] } },
    ],
  }, [81, 93]);
  assert.equal(series.length, 4);
  assert.equal(series[0].label, "Colhedoras (24/25)");
  assert.deepEqual(series[0].values, [90]);
  assert.equal(series[3].label, "Trator Transbordo (25/26)");
});

test("filters the chart to the selected harvest months", () => {
  const recorte = filtrarMesesComparativo({
    meses: [
      { key: "09", label: "SETEMBRO" },
      { key: "10", label: "OUTUBRO" },
      { key: "11", label: "NOVEMBRO" },
    ],
    safras: [{ codigo: "24/25", porTipo: { "81": [90, 80, 70] } }],
  }, ["09", "11"]);
  assert.deepEqual(recorte.meses.map((m) => m.label), ["SETEMBRO", "NOVEMBRO"]);
  assert.deepEqual(recorte.safras[0].porTipo["81"], [90, 70]);
});
