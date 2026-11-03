import { buildCombustivelIntervalosSql } from "./indicadores/combustivel.js";

/** Os argumentos contêm somente nomes de binds gerados pelo servidor. */
export function activityFuelSql(equipamentosSql: string, operacoesSql: string) {
  return `${buildCombustivelIntervalosSql(equipamentosSql)},
  operacao_abastecimento AS (
    SELECT i.origem, i.id_abastecimento, b.cod_operacaoagricola,
           ROW_NUMBER() OVER (
             PARTITION BY i.origem, i.id_abastecimento
             ORDER BY b.dt_apontamento DESC NULLS LAST,
                      NVL(b.area, 0) DESC,
                      NVL(b.tothoras_trabalhadas, 0) DESC
           ) AS rn
      FROM intervalo i
      JOIN automotivo.itens_apontamento b
        ON b.cod_equipamento = i.cod_equipamento
       AND b.dt_apontamento <= i.data_abastecimento
       AND (i.data_abastecimento_ant IS NULL OR b.dt_apontamento > i.data_abastecimento_ant)
  )
  SELECT i.cod_equipamento,
         SUM(i.qtde_litros) AS litros,
         SUM(i.valor_total) AS valor
    FROM intervalo i
    JOIN operacao_abastecimento op
      ON op.origem = i.origem AND op.id_abastecimento = i.id_abastecimento AND op.rn = 1
   WHERE op.cod_operacaoagricola IN (${operacoesSql})
   GROUP BY i.cod_equipamento`;
}
