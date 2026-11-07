# Gerar Excel de análise de solo para o Compusoft

Acesso no ControleAgricola: **Agrícola → Gerar Excel de análise de solo**.

A tela agora gera um arquivo `.xlsx` para importação pelo usuário na rotina do Compusoft. O envio direto ao Oracle foi removido da operação: a antiga rota `/enviar` retorna HTTP 410. Nenhum INSERT, UPDATE, DELETE, COMMIT ou bloqueio de tabelas é executado pelo módulo. As credenciais de gravação no `.env` não são usadas por esse fluxo.

## Layout confirmado pelo modelo Pasta2.xlsx

O modelo enviado pelo usuário fica copiado no projeto em `server/templates/analise-solo-compusoft.xlsx`. A geração carrega esse arquivo e preserva aba, estilos, ordem e posições, removendo apenas as duas linhas de exemplos.

- Uma única aba: **Exemplo Importação Excel**.
- 34 colunas, de A a AH. A, B e D ficam vazias, inclusive nas linhas de dados.
- Linha 1 vazia; cabeçalhos na linha 2; primeiro registro na linha 3.
- Data em C: texto **DD/MM/AAAA**, como no modelo (formato de célula `@`).
- Profundidade em H: texto com intervalo em centímetros, como **0-20**.
- Códigos de fazenda, talhão, zona, estágio e produção estimada: valores numéricos.
- Resultados químicos: texto com vírgula decimal, como nos exemplos do fornecedor. Não há arredondamento para apenas duas casas: resultados com maior precisão são conservados.
- Zinco fica na coluna AE, cabeçalho **ZN**, conforme o modelo. A descrição textual inicial enviada pelo usuário dizia FN; o arquivo de referência confirma ZN.
- AG: ESTAGIO_CULTURA; AH: PRODUCAO_ESTIMADA.

Nenhuma coluna de amostra, de número sequencial, de textura ou de conferência é acrescentada à planilha de importação. A identificação original e as origens das amostras ficam no relatório JSON separado. Amostras com o mesmo número em profundidades diferentes permanecem em linhas distintas; não são renumeradas.

## Como gerar

1. Selecione os Excel do laboratório. São reconhecidos os cabeçalhos Descrição, Id e identificação da amostra.
2. Escolha uma data por arquivo: conclusão, recebimento, emissão do PDF catalogado, ou entrada manual. É obrigatório informar data e origem. As sugestões são ligadas ao hash do Excel, não apenas ao nome.
3. Preencha os códigos de FAZENDA, TALHAO e ZONA de cada nome da origem. Opcionalmente consulte o Oracle usando grupo/empresa/filial/safra e selecione o talhão; a consulta só preenche os códigos, sem gravar dados.
4. Informe ESTAGIO_CULTURA e PRODUCAO_ESTIMADA por talhão, se disponíveis. Há campos para aplicar os mesmos valores ao lote inteiro. Esses valores não são inventados nem copiados dos exemplos do fornecedor. Quando ausentes, ficam vazios e geram aviso; complete-os se a rotina do Compusoft exigir.
5. Escolha o método de pH (CaCl₂ ou água), fósforo (Mehlich ou resina) e unidade de potássio. Confirme a compatibilidade com a rotina do sistema.
6. Valide e examine a prévia, erros e avisos. Datas ou códigos inválidos e resultados conflitantes impedem a geração.
7. Revise os campos vazios e marque a confirmação dos avisos. Clique em **Gerar Excel para o Compusoft**.
8. Importe o arquivo baixado pela rotina de análise de solo do Compusoft. O módulo não executa nem confirma essa etapa no ERP.

A geração e validação funcionam sem conexão de escrita e sem consulta ao banco, quando os códigos são informados manualmente. A consulta de códigos é uma conveniência opcional. A consulta automática não altera a safra ou as associações já preenchidas.

## Resultados ausentes e distinção de CTC

O campo T presente nos laudos é CTC potencial. A descrição fornecida do layout exige **CTC efetiva** em U. Portanto T não é transferido automaticamente para U. Somente uma coluna explicitamente identificada como CTC efetiva na origem preenche esse campo.

CE, SB, CTC efetiva, saturação de Na e outros resultados ausentes permanecem vazios, com contagem na conferência. Não são calculados nem substituídos por zero. Zero existente na origem é preservado como zero. O usuário deve revisar os avisos antes do download; o módulo não afirma que o ERP aceita campos vazios em todas as configurações.

Matéria orgânica, carbono e demais resultados conservam a unidade original: confirme a unidade esperada na rotina do Compusoft. Não há conversão automática de textura ou produção. Métodos alternativos não selecionados, texturas e relações fora do layout permanecem na origem e na conferência.

## Duplicidades

A chave de consolidação considera data, códigos de fazenda/zona/talhão, número original da amostra e intervalo de profundidade. Duas linhas com a mesma chave são consolidadas quando seus dados não conflitam. Campos preenchidos complementam campos vazios; valores diferentes bloqueiam o lote. Mesmo número em datas ou profundidades diferentes não é removido.

O lote dos oito arquivos fornecidos contém 2.353 linhas e 410 registros repetidos do laudo 23630/2024. Com códigos e datas correspondentes, o resultado esperado é de 1.943 linhas de dados. Os códigos reais devem ser informados pelo usuário; não são deduzidos de nomes como TH 08.

## Datas verificadas nos PDFs fornecidos

Os oito Excel não possuem uma data de análise nas células. Datas de criação/modificação dos arquivos são metadados e não representam necessariamente análise, coleta ou emissão.

| Laudo / arquivos | Recebimento | Conclusão | Emissão |
|---|---|---|---|
| 23630/2024 e SBA24.132642–133051 | 02/12/2024 | 05/12/2024 | 13/12/2024 |
| SBA24.133509–133821 | 11/12/2024 | 17/12/2024 | 18/12/2024 |
| SBA25.0259–0478 | 09/01/2025 | 15/01/2025 | 18/01/2025 |
| SBA25.0750–0923 | 24/01/2025 | 29/01/2025 | 31/01/2025 |
| SBA25.110942–111129 | 23/05/2025 | 29/05/2025 | 06/06/2025 |
| 391/2026 | 29/12/2025 | 31/12/2025 | 12/01/2026 |
| 4438/2026 | 23/03/2026 | 26/03/2026 | 30/03/2026 |

Nenhum dos PDFs informa data de coleta. “Data da análise” no destino deve seguir a convenção da empresa; a conclusão é uma referência disponível, mas não é automaticamente uma data de coleta. O usuário escolhe explicitamente a referência para cada arquivo. O laudo 391/2026 foi concluído em 2025; não usar o ano do nome do arquivo como data.

As sugestões atuais vêm de um catálogo revisado dos PDFs fornecidos, com hashes SHA-256 dos Excel e dos PDFs. Não há extração genérica de PDFs enviados futuramente. Arquivos novos ou modificados exigem data manual; não se identifica um laudo apenas pelo nome.

## Validação técnica

Os testes verificam os 34 cabeçalhos contra o modelo real, posições vazias A/B/D, início na linha 3, ausência dos exemplos e de abas extras, data textual, profundidade por intervalo, vírgula decimal, zeros e vazios, conservação de profundidades e bloqueio de conflitos. A saída é reaberta por ExcelJS para conferir as células. Os testes do módulo passaram (16 casos), assim como a checagem TypeScript do backend e o build de produção em diretório de validação. Na simulação dos oito Excel, foram geradas 1.943 linhas de dados (1.945 linhas no total, incluindo as duas linhas do layout), e os 46.632 resultados exportados foram comparados aos valores preparados, sem divergências. Os códigos usados nessa simulação eram fictícios; nenhum arquivo com esses códigos é entregue para importação. A aceitação na rotina do Compusoft ainda depende do teste do usuário com os códigos e parâmetros reais. A leitura dos Excel originais também possui teste para o `<si/>` vazio exportado pelo laboratório, que a biblioteca SheetJS antiga interpreta incorretamente sem normalização em memória.

A autenticação e a permissão da tela seguem `nativeTab:indicadores:analise-solo`, com `:edit` para preparar e gerar arquivos. O Excel de importação e a conferência são retornados ao usuário; não são gravados nas tabelas de integração. O SQLite de auditoria da versão anterior não é apagado.

## Fontes dos PDFs

Página 1 de cada documento, incluindo cabeçalho e data de emissão:

- [relatorio_2024_23630_V0_Final.pdf](<C:/Users/rayhi/Desktop/Analise de solo/relatorio_2024_23630_V0_Final.pdf>)
- [Relatorio_SBA24.132642_a_SBA24.133051_EXPRESSAOSERVIOSAGRICOLAS_LUIZJATOBAFILHO-SAOMIGUELDOSCAMPOSAL-ELEJOTAEMPREENDIMENTOS_.pdf](<C:/Users/rayhi/Desktop/Analise de solo/Relatorio_SBA24.132642_a_SBA24.133051_EXPRESSAOSERVIOSAGRICOLAS_LUIZJATOBAFILHO-SAOMIGUELDOSCAMPOSAL-ELEJOTAEMPREENDIMENTOS_.pdf>)
- [Relatorio_SBA24.133509_a_SBA24.133821_EXPRESSAOSERVIOSAGRICOLAS_LUIZJATOBAFILHO-SAOMIGUELDOSCAMPOSAL-ELEJOTAEMPREENDIMENTOS_.pdf](<C:/Users/rayhi/Desktop/Analise de solo/Relatorio_SBA24.133509_a_SBA24.133821_EXPRESSAOSERVIOSAGRICOLAS_LUIZJATOBAFILHO-SAOMIGUELDOSCAMPOSAL-ELEJOTAEMPREENDIMENTOS_.pdf>)
- [Relatorio_SBA25.0259_a_SBA25.0478_EXPRESSAOSERVIOSAGRICOLAS_LUIZJATOBAFILHO-SAOMIGUELDOSCAMPOSAL-ELEJOTAEMPREENDIMENTOS_.pdf](<C:/Users/rayhi/Desktop/Analise de solo/Relatorio_SBA25.0259_a_SBA25.0478_EXPRESSAOSERVIOSAGRICOLAS_LUIZJATOBAFILHO-SAOMIGUELDOSCAMPOSAL-ELEJOTAEMPREENDIMENTOS_.pdf>)
- [Relatorio_SBA25.0750_a_SBA25.0923_EXPRESSAOSERVIOSAGRICOLAS_LUIZJATOBAFILHO-SAOMIGUELDOSCAMPOSAL-ELEJOTAEMPREENDIMENTOS_.pdf](<C:/Users/rayhi/Desktop/Analise de solo/Relatorio_SBA25.0750_a_SBA25.0923_EXPRESSAOSERVIOSAGRICOLAS_LUIZJATOBAFILHO-SAOMIGUELDOSCAMPOSAL-ELEJOTAEMPREENDIMENTOS_.pdf>)
- [Relatorio_SBA25.110942_a_SBA25.111129_EXPRESSAOSERVIOSAGRICOLAS_LUIZJATOBAFILHO-SAOMIGUELDOSCAMPOSAL-ELEJOTAEMPREENDIMENTOS_.pdf](<C:/Users/rayhi/Desktop/Analise de solo/Relatorio_SBA25.110942_a_SBA25.111129_EXPRESSAOSERVIOSAGRICOLAS_LUIZJATOBAFILHO-SAOMIGUELDOSCAMPOSAL-ELEJOTAEMPREENDIMENTOS_.pdf>)
- [relatorio_2026_391_V0_Final.pdf](<C:/Users/rayhi/Desktop/Analise de solo/relatorio_2026_391_V0_Final.pdf>)
- [relatorio_2026_4438_V0_Final.pdf](<C:/Users/rayhi/Desktop/Analise de solo/relatorio_2026_4438_V0_Final.pdf>)

## Associações das fazendas dos oito arquivos

O catálogo cobre as 59 identificações. Fazenda e zona estão resolvidas para 44; as 15 restantes precisam de correspondência adicional. No modo manual por grupo, 14 vínculos também têm talhão; no modo padrão o talhão é obtido de cada linha. Santa Adelia foi vinculada a 41800/zona 2 pelo mapa do projeto, dois grupos de Escuro a 40300/zona 1 pela compatibilidade dos talhões citados, e COLTÉ 5/7 a COITE 5/7. PITOMBA usa 40800/zona 1 por confirmação do usuário.

Para grupos com várias fazendas, a seção **Grupos que precisam de associação por amostra** permite definir fazenda por número ou por intervalo informado. As opções incluem todos os 47 cadastros reais consultados. Não há divisão automática por quantidades iguais, duplicação entre fazendas ou associação à primeira candidata. A escolha individual vale para todas as profundidades do mesmo número no mesmo arquivo e tem prioridade sobre a associação geral. Arquivos diferentes são tratados separadamente. As escolhas gerais e individuais podem ser salvas no navegador; estágio e produção continuam específicos da preparação.

A consulta de talhões inclui fazendas com empresa/filial nulas, que são os cadastros compartilhados dessa base. Identificadores históricos ou IDs geométricos sem relação confirmada com a amostra não são usados como prova de associação.

## Origem do talhão por linha

A tela passou a oferecer explicitamente a opção de usar o número da coluna Descrição/Id/identificação da amostra como TALHAO, mantendo fazenda e zona associadas pelo grupo de origem. Essa opção é o padrão da tela para o fluxo solicitado. Também estão disponíveis código da coluna Talhão (TH 08) e preenchimento manual por grupo. A opção escolhida consta da conferência e precisa ser revisada antes de gerar o Excel; não há validação de existência desses números no cadastro Oracle. A mesma numeração pode se repetir em fazendas diferentes.
