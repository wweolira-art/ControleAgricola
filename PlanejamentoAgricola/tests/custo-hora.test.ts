import assert from "node:assert/strict";
import test from "node:test";
import { custoHoraEquipamentos } from "../server/indicadores/custo-hora.ts";

const segmentos = [{ codEquipamento: 1, codTipo: 81, categoria: "COLHEDORA", segIni: "2026-09-01", segFim: "2026-09-15" }];
test("soma custos e horas apenas na vigência do tipo selecionado", () => {
  const rows = custoHoraEquipamentos([{ codEquipamento: 1, valor: 100 }, { codEquipamento: 1, valor: 200 }], [
    { codEquipamento: 1, dia: "2026-09-01", horas: 10 },
    { codEquipamento: 1, dia: "2026-09-15", horas: 5 },
    { codEquipamento: 1, dia: "2026-09-16", horas: 100 },
  ], segmentos, { codTipoEquipamento: 81 });
  assert.equal(rows[0].horas, 15);
  assert.equal(rows[0].valor, 20);
});
test("sem horas não produz custo por hora zero ou infinito e não limita a vinte frotas", () => {
  const rows = custoHoraEquipamentos(Array.from({ length: 25 }, (_, i) => ({ codEquipamento: i + 1, valor: 100 })), [], segmentos, {});
  assert.equal(rows.length, 25);
  assert.ok(rows.every((row) => row.valor === null));
});
