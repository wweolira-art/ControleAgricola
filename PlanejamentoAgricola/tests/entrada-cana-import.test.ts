import assert from "node:assert/strict";
import { test } from "node:test";
import { compactPayload, normalizeSafraForEntradaCaminhao, parseNumberToApi, runEntradaCanaImport } from "../server/entrada-cana.js";

test("payload de caminhao remove rowid nulo e normaliza data/numeros para ORDS", () => {
  const payload = compactPayload({
    rowid: null,
    pesagem: parseNumberToApi("001825"),
    guia: parseNumberToApi("053736"),
    caminhao: parseNumberToApi("131300"),
    talhao: parseNumberToApi("001"),
    etapa: parseNumberToApi("001"),
    data: "2026-09-02T00:00:00Z",
    intqueima: parseNumberToApi("124.83"),
    pesobruto: parseNumberToApi("43.46"),
    pesotara: parseNumberToApi("22.26"),
    pesoliquido: parseNumberToApi("21.2"),
    fazenda: "02.000678 - BOM SUCESSO 2",
    safra: normalizeSafraForEntradaCaminhao("Safra 26/27"),
    tipocolheita: "MANUAL",
  });

  assert.deepEqual(payload, {
    pesagem: 1825,
    guia: 53736,
    caminhao: 131300,
    talhao: 1,
    etapa: 1,
    data: "2026-09-02T00:00:00Z",
    intqueima: 124.83,
    pesobruto: 43.46,
    pesotara: 22.26,
    pesoliquido: 21.2,
    fazenda: "02.000678 - BOM SUCESSO 2",
    safra: "2026/2027",
    tipocolheita: "MANUAL",
  });
});


test("importação cancelada não inicia o processamento dos arquivos", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(runEntradaCanaImport(
    [{ name: "teste.xlsx", grid: [] }],
    { importType: "maquina", operationMode: "insert", tipoColheitaMode: "planilha", dryRun: true, autoHeader: true },
    { signal: controller.signal, onLog: () => {} },
  ), { name: "AbortError" });
});

test("acompanhamento entrega logs antes da conclusão da importação", async () => {
  const lines: string[] = [];
  const result = await runEntradaCanaImport(
    [{ name: "vazia.xlsx", grid: [] }],
    { importType: "maquina", operationMode: "insert", tipoColheitaMode: "planilha", dryRun: true, autoHeader: true },
    { signal: new AbortController().signal, onLog: (line) => lines.push(line) },
  );
  assert.ok(lines.length > 0);
  assert.deepEqual(lines, result.logLines);
});

const machineOptions = { importType: "maquina", operationMode: "insert", tipoColheitaMode: "planilha", dryRun: true, autoHeader: false, headerRow: 1 } as const;
const machineHeader = ["maquina", "fazenda", "talhao", "datacolheita", "tipocolheita", "tipocana", "peso", "impmineral"];

test("simulação consolida os arquivos da máquina no mesmo dia sem gravar", async () => {
  const result = await runEntradaCanaImport([
    { name: "a.xlsx", grid: [machineHeader, [5001, "Fazenda", 1, "01/11/2026", "MECANIZADA", "CANA", 100, 1]] },
    { name: "b.xlsx", grid: [machineHeader, [5001, "Fazenda", 2, "01/11/2026", "MECANIZADA", "CANA", 80, 2]] },
  ], machineOptions);
  assert.equal(result.stats.ok, 2);
  assert.equal(result.stats.err, 0);
  assert.deepEqual(result.okLog.map(line => JSON.parse(line).payload.peso), [100, 80]);
  assert.ok(result.okLog.every(line => JSON.parse(line).operation === "dry-run"));
});

test("arquivo inválido impede a confirmação de todo o lote da máquina", async () => {
  const result = await runEntradaCanaImport([
    { name: "a.xlsx", grid: [machineHeader, [5001, "Fazenda", 1, "01/11/2026", "MECANIZADA", "CANA", 100, 1]] },
    { name: "b.xlsx", grid: [machineHeader, [5001, "Fazenda", 2, "31/02/2026", "MECANIZADA", "CANA", 80, 2]] },
  ], machineOptions);
  assert.equal(result.stats.ok, 0);
  assert.equal(result.stats.err, 1);
  assert.equal(result.okLog.length, 0);
  assert.equal(result.errLog.length, 1);
  assert.ok(result.logLines.some(line => line.includes("Nenhuma alteração gravada")));
});

test("cancelamento durante a leitura interrompe o lote antes da confirmação", async () => {
  const controller = new AbortController();
  const grid = [machineHeader, ...Array.from({length: 50}, (_,i) => [5001,"Fazenda",i+1,"01/11/2026","MECANIZADA","CANA",100,1])];
  await assert.rejects(runEntradaCanaImport([{name:"a.xlsx",grid}],machineOptions,{
    signal:controller.signal,
    onLog:line=>{if(line.startsWith("Progresso:"))controller.abort();},
  }),{name:"AbortError"});
});
