import assert from "node:assert/strict";
import { test } from "node:test";
import {
  chavePeriodoMotoristas,
  normalizarGruposPeriodo,
  PERIODO_MOTORISTAS_REGISTRADO,
  registrarLegadoNoPeriodo,
} from "../src/lib/motoristas-canavieiros-periodos.ts";

test("o cadastro já feito fica no período de setembro e outro período não o substitui", () => {
  const legado = [
    {
      id: "grp-1",
      equipamentos: [
        {
          id: "eq-1",
          equipTag: "3014",
          percentual: 42,
          motoristas: [
            { id: "mot-1", matricula: "3808", nome: "JOSEZITO DA SILVA FILHO" },
            { id: "mot-2", matricula: "3758", nome: "RICARDO DOS SANTOS SILVA" },
          ],
        },
      ],
      folguistas: [{ id: "mot-3", matricula: "3816", nome: "ROBERIO DA SILVA BARROS" }],
      folguistaPercentual: 16,
    },
  ];

  const store = registrarLegadoNoPeriodo({}, legado);
  const setembro = chavePeriodoMotoristas(PERIODO_MOTORISTAS_REGISTRADO.dataInicio, PERIODO_MOTORISTAS_REGISTRADO.dataFim);
  assert.equal(store[setembro]?.[0]?.equipamentos[0]?.percentual, 42);
  assert.equal(store[setembro]?.[0]?.folguistaPercentual, 16);
  assert.equal(store[setembro]?.[0]?.equipamentos[0]?.motoristas[0]?.nome, "JOSEZITO DA SILVA FILHO");

  const outro = chavePeriodoMotoristas("2026-10-01", "2026-10-31");
  const comOutubro = {
    ...store,
    [outro]: normalizarGruposPeriodo([
      {
        id: "grp-2",
        equipamentos: [{ id: "eq-2", equipTag: "3014", percentual: 30, motoristas: [{ id: "mot-9", matricula: "1", nome: "OUTRO" }] }],
        folguistas: [],
        folguistaPercentual: 10,
      },
    ]),
  };
  assert.equal(comOutubro[setembro]?.[0]?.equipamentos[0]?.percentual, 42);
  assert.equal(comOutubro[outro]?.[0]?.equipamentos[0]?.percentual, 30);
  assert.equal(registrarLegadoNoPeriodo(comOutubro, [{ id: "novo" }])[setembro]?.[0]?.id, "grp-1");
});
