import assert from "node:assert/strict";
import { test } from "node:test";
import { producaoOperadorPrintHtml } from "../src/lib/producao-operador-print.js";

test("impressão dos dois resumos mantém distribuição, toneladas e totais", () => {
  for (const grupo of ["Colhedeiras", "Tratores"]) {
    const html = producaoOperadorPrintHtml({
      grupo, periodo: "01/10/2026 a 31/10/2026", filtros: "Caminhão: 8001", pesoLiquido: 39500,
      funcionarios: [
        { codigo: "3966", descricao: "José", viagens: 10, toneladas: 3500, distribuicao: 3500 / 39500, resultadoPercentual: 3500, apontamentos: 3 },
        { codigo: "001", descricao: "Maria", viagens: 90, toneladas: 36000, distribuicao: 36000 / 39500, resultadoPercentual: 36000, apontamentos: 7 },
      ],
    });
    assert.ok(html.includes(`Resumo de viagens — ${grupo}`));
    for (const label of ["Distribuição (%)", "Resultado percentual (t)", "8,86%", "100,00%", "39.500", "3966", "Caminhão: 8001"]) assert.ok(html.includes(label), label);
    assert.ok(!html.includes("Alterar funcionário"));
  }
});

test("impressão escapa conteúdo dos filtros e dos operadores", () => {
  const html = producaoOperadorPrintHtml({ grupo: "Tratores", periodo: "", filtros: '<img src=x onerror="alert(1)">', pesoLiquido: 0,
    funcionarios: [{ codigo: "1", descricao: "<script>teste</script>", viagens: 0, toneladas: 0, distribuicao: 0, resultadoPercentual: 0, apontamentos: 0 }],
  });
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("<img"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("0,00%"));
});
