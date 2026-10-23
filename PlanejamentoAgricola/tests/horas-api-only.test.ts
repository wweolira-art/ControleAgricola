import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { montarPayloadHoras } from "../server/colheita/horas-envio-payload.ts";

// Carrega o serviço real com transporte simulado; dependências locais são proibidas.
function service() {
  const calls: Array<{ action: string; payload?: any }> = [];
  const common = {
    toNumber: (value: unknown) => value == null || value === "" ? null : Number(value),
    diaUtcFromIso: (iso: string | null) => iso?.slice(0, 10) ?? null,
    parsePeriodoObrigatorio: (f: any) => {
      if (!f.dataInicio || !f.dataFim) throw new Error("Informe o período");
      return { dataInicio: f.dataInicio, dataFim: f.dataFim };
    },
    scanOrdsCollection: async () => ({ dados: [{ id: 1, codEquipamento: 5001, data: "2026-10-21", turno: "B", horaMotor: 100, horasElevador: 50 }] }),
    postOrdsItem: async (_url: string, payload: any) => { calls.push({ action: "post", payload }); return { ...payload, id: 2 }; },
    putOrdsItem: async (_url: string, payload: any) => { calls.push({ action: "put", payload }); return { ...payload, id: 2 }; },
  };
  const modules: Record<string, unknown> = {
    "./ords-common.js": common,
    "./horas-envio-payload.js": { montarPayloadHoras },
    "./horas-maquina.js": {
      horasMaquinaOrdsUrl: () => "https://example.invalid/horas/",
      mapHorasMaquinaItem: (row: any) => row,
      listarHorasMaquina: async (f: any) => { calls.push({ action: "list", payload: f }); return { dados: [] }; },
    },
  };
  const js = ts.transpileModule(readFileSync(new URL("../server/colheita/horas-maquina-entrada.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports: any = {};
  new Function("require", "exports", js)((name: string) => {
    assert.ok(name in modules, `Dependência inesperada: ${name}`);
    return modules[name];
  }, exports);
  return { api: exports, calls };
}

test("consulta exige período antes de acessar a API", async () => {
  const { api, calls } = service();
  await assert.rejects(api.listarHorasCoa({}), /período/);
  assert.equal(calls.length, 0);
});

test("consulta encaminha período, equipamento e tipo para a API", async () => {
  const { api, calls } = service();
  await api.listarHorasCoa({ dataInicio: "2026-10-01", dataFim: "2026-10-22", equipamento: "5001", turno: "A", codTipoEquipamento: 81 });
  assert.deepEqual(calls[0].payload, { dataInicio: "2026-10-01", dataFim: "2026-10-22", equipamento: "5001", codTipoEquipamento: 81 });
});

test("envio grava na API com horas rodadas, sem armazenamento local", async () => {
  const { api, calls } = service();
  const result = await api.enviarHorasCoa({ data: "2026-10-22", turno: "A", equipamentos: [{ codEquipamento: 5001, horaMotor: 112, horasElevador: 55 }] });
  assert.equal(result.ok, true);
  assert.equal(result.enviados[0].apiId, 2);
  const payload = calls.find((c) => c.action === "post")!.payload;
  assert.equal(payload.horas_motor_rodadas, 12);
  assert.equal(payload.horas_elevador_rodadas, 5);
  assert.equal("registro" in result, false);
});

test("edição atualiza o ID existente e recalcula horas, sem criar lançamento", async () => {
  const { api, calls } = service();
  const result = await api.enviarHorasCoa({ data: "2026-10-22", turno: "A", equipamentos: [{ apiId: 2, codEquipamento: 5001, horaMotor: 114, horasElevador: 57 }] });
  assert.equal(result.ok, true);
  assert.equal(calls.some((call) => call.action === "post"), false);
  const update = calls.find((call) => call.action === "put")!;
  assert.equal(update.payload.horas_motor_rodadas, 14);
  assert.equal(update.payload.horas_elevador_rodadas, 7);
});
