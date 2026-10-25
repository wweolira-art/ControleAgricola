# Conferência de Broca comum: relatório 9138

Fonte: PDF `1 (2).pdf`, gerado em 25/10/2026 às 12:37:25.

- Grupo/empresa/filial: 1/1/1.
- Safra: 2025/2026, código Oracle 12.
- Período: 01/09/2025 a 31/08/2026, incluindo todo o último dia.
- Coluna de referência: **% Qtde. Brocas**, não o índice de entre-nós brocados.

## Cálculo e dados

`% Qtde. Brocas = SUM(quantidade de brocas comuns) / SUM(canas analisadas) * 100`.

A quantidade vem de `agricola.analise_entomologico.brocas_comuns`; as canas analisadas vêm de `canas_analisadas`. Na ausência dos valores do cabeçalho, a consulta utiliza `agricola.itens_entomologico`, com `tipo_infestacao = 1`, agrupado pela chave completa da análise antes do relacionamento.

A consulta combina a safra selecionada, grupo/empresa/filial e o período. O final usa `< dataFim + 1`, incluindo análises com horário no último dia. Foram identificadas duas análises da safra Oracle 11 dentro do intervalo civil do PDF; elas não pertencem à safra 2025/2026 e causavam diferenças em Escuro 1 e Pitomba.

Os totais por fazenda são agregados no servidor diretamente das análises, sem depender de todos os talhões estarem desenhados no JSON. A soma somente dos polígonos omitia análises de Nova, São Sebastião, Nossa Senhora das Graças e São Marcos.

A tabela mostra o percentual com três casas decimais. As faixas da Broca comum usam esse percentual; o índice de entre-nós permanece separado nos detalhes. As cores da Broca gigante continuam baseadas em tocos danificados.

## Resultado

A consulta corrigida foi executada no Oracle com os filtros acima: **39 de 39 fazendas conferiram**, sem diferenças nas quantidades de brocas, nas canas analisadas ou no percentual arredondado para três casas.

Totais: **1.339 brocas** e **159.412 canas analisadas**. A comparação por fazenda está em `conferencia-broca-comum-2025-2026.csv`. Esses valores documentam a conferência; não são constantes utilizadas pelo sistema.

O rodapé do PDF mostra 36,211 na coluna de percentuais, somando os percentuais não arredondados das fazendas. Essa soma é diferente da proporção geral `1.339 / 159.412 * 100`.
