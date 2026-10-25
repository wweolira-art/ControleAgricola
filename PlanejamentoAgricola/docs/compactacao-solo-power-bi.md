# Compactação do solo: origem e regras do Power BI

Inspeção de `Compactação do solo.pbix`, fornecido em 25/10/2026. A nova camada usa a fonte original online; o PBIX não é necessário em produção.

## Fonte

A função Power Query `GetPage` consulta uma API Oracle Cloud ORDS:

`https://g58645a2c384a96-bd1.adb.sa-saopaulo-1.oraclecloudapps.com/ords/admin/compactacaopenetrometro/`

Parâmetros: `offset` e `limit=100`. Os registros estão em `items`; `hasMore` indica páginas adicionais. A API retorna identificação da medição, equipamento, campo, fazenda, lote, data/hora, latitude/longitude, altitude, unidade e 60 leituras de resistência (0-1cm até 59-60cm), em kPa.

O sistema consulta essa API pelo servidor, com timeout de 30 segundos por página, cache de cinco minutos e deduplicação por `idunico`. A variável opcional `COMPACTACAO_API_URL` permite substituir a origem na configuração do servidor. Falhas de conexão são exibidas na tela, sem substituir os dados por valores fictícios ou cópias antigas do PBIX.

## Transformações e medidas

O Power Query calcula a média aritmética das leituras de cada uma destas faixas: 0-3, 3-6, 6-9, 9-12, 12-15, 15-18, 18-21, 21-24, 24-28, 27-32, 32-36, 36-40, 40-44, 44-48, 48-52 e 52-60cm. **O rótulo 27-32cm foi preservado, embora a fórmula original utilize 28-29, 29-30, 30-31 e 31-32cm.**

As faixas são transformadas em linhas (`Atributo`, `Valor`), e `Ordem` é a parte numérica anterior ao hífen. Leituras ausentes propagam null na soma do Power Query; a faixa sem média é descartada no unpivot. A implementação mantém essa regra.

```dax
media Kpa = AVERAGEX(f_Compactacao, f_Compactacao[Valor])

descompactar =
CALCULATE(
    COUNT(f_Compactacao[Atributo]),
    f_Compactacao[Ordem] <= 40 && f_Compactacao[Valor] > 2000
) + 0
```

A média agregada é feita sobre todas as médias de faixa disponíveis no contexto filtrado, sem ponderar pela espessura da faixa. Não é a média de médias de pontos quando há quantidades diferentes de faixas válidas.

## Cores e filtros

- Verde `#049D06`: medida `descompactar = 0`.
- Vermelho `#D20000`: medida `descompactar >= 1`.
- `Ordem <= 40` inclui a faixa 40-44cm; profundidades de 44-48cm em diante não tornam o ponto vermelho.
- O limiar é estrito: 2.000 kPa exatos não tornam o ponto vermelho; valores acima de 2.000 tornam.
- O filtro de profundidade afeta o contexto da medida, como no Power BI. Uma seleção somente abaixo de 44cm não contém faixas elegíveis para excedência.
- Filtros de data usam o dia indicado na data/hora da origem, preservando o recorte local do relatório.

O mapa mostra os pontos medidos e enquadra os pontos dos filtros selecionados, sem incluir polígonos de fazendas sem medições. O clique em um ponto abre suas médias por profundidade. A tabela lateral agrupa por fazenda e mostra número de pontos, kPa médio e percentual de pontos com excedência.

Os contornos são lidos do mesmo `Fazendas.json` das demais camadas, respeitando `FAZENDAS_GEOJSON_PATH`. A camada desenha os talhões das fazendas com medição, embaixo dos pontos, e o filtro de talhão também restringe os contornos. Nomes são comparados sem diferenças de acento/espaçamento; fazendas renomeadas no JSON podem ser associadas pela posição dos pontos. O enquadramento considera contornos e pontos, e os rótulos dos talhões aparecem a partir do zoom 14 quando habilitados.

Ao passar o mouse ou focar uma medição pelo teclado, um gráfico flutuante mostra as médias de cada profundidade, fazenda, lote e coordenadas. As barras usam a escala do visual de tooltip do PBIX: 0 kPa = `#00B333`, 1.250 kPa = `#01A70A`, 2.500 kPa = `#B50101`, com interpolação linear e saturação nos extremos. Esta escala contínua das barras é diferente da classificação binária dos pontos.

## Conferência realizada

O PBIX contém 8.416 linhas, mas somente 6.816 combinações únicas de ponto/profundidade: 426 pontos e 16 faixas. A primeira página de 100 pontos aparece duas vezes, acrescentando 1.600 linhas duplicadas. A API original retornou os mesmos 426 pontos únicos, sem duplicatas.

Foram comparadas as 6.816 médias entre API/implementação e PBIX: zero diferenças acima de 0,000001 kPa e zero diferenças na classificação dos pontos. Dos 426 pontos, 380 possuem alguma faixa elegível acima de 2.000 kPa. O intervalo observado na fonte foi de 16/01/2025 a 08/10/2026. Estes totais são da conferência, não constantes do sistema.

Os totais e médias globais podem diferir dos cartões do PBIX porque a implementação não replica a duplicação da primeira página.

Testes automatizados cobrem médias das faixas, valores ausentes, médias agregadas, limite de 2.000 kPa, faixa 40-44cm, profundidades maiores, paginação, deduplicação, cache e filtros.
