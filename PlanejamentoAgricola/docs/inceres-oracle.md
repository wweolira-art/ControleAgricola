# Importação InCeres no Oracle Compusoft

Destino autorizado: novas tabelas no schema da conexão `ORACLE_SOLO_WRITE_*`.
Não grava nas tabelas operacionais `AGRICOLA` do Compusoft.

## Estrutura criada

- `INCERES_DOCUMENTO`: JSON original em CLOB, tipo, identificador de origem, safra, hash SHA256 e data de atualização. Guarda índices, talhões (incluindo polígonos), fazenda, grades, pontos e cobertura. Os espaços de IDs do Dashboard/R+ e Solo podem ser diferentes; os documentos mantêm seus identificadores originais. Não associar IDs diretamente aos códigos de fazenda/talhão do Compusoft.
- `INCERES_RESULTADO`: grade, ponto, profundidade, elemento, safra, fazenda, talhão, valor e unidade. Chave composta impede duplicação na reimportação. Nulos continuam nulos. Unidades desconhecidas não são inferidas.

Para uma grade com múltiplos talhões, não atribuir cada ponto a um talhão sem evidência espacial. A coleta completa guarda o vínculo grade/talhões e a geometria original para posterior associação.

## Comandos

No diretório `PlanejamentoAgricola`:

```powershell
# Valida os arquivos disponíveis; não acessa o banco.
node scripts/import-inceres-oracle.mjs
# Importa os arquivos disponíveis, atualmente uma coleta parcial.
node scripts/import-inceres-oracle.mjs --apply
# Valida e depois importa uma exportação completa da conta.
node scripts/import-inceres-oracle.mjs --input "C:\caminho\inceres_analises_todas_safras.json"
node scripts/import-inceres-oracle.mjs --input "C:\caminho\inceres_analises_todas_safras.json" --apply
```

O importador usa MERGE e commit somente após conferir a contagem; falhas nos dados causam rollback da carga. A criação das tabelas é DDL Oracle e possui commit implícito. A ausência de registro numa coleta parcial nunca provoca exclusão no banco. O modo de coleta disponível depende dos arquivos em `tmp/inceres*` e `output/inceres`; não representa integração automática permanente.

## Coleta autenticada de todas as safras

Os arquivos estão em `output/inceres`, na raiz do repositório:

1. Revisar e executar manualmente `coletar-indices-todas-safras.js` no contexto autenticado `https://dashboard.inceres.com.br/`. Baixa `inceres_indices_todas_safras.json`.
2. Revisar e executar manualmente `coletar-analises-todas-safras.js` no contexto autenticado `https://solo.inceres.com.br/`. Selecionar o arquivo de índices no seletor aberto pelo código. A leitura do arquivo é local. Ao terminar, baixa `inceres_analises_todas_safras.json`.
3. Validar a exportação com o importador antes de aplicar. O JSON registra falhas e cobertura; não assumir coleta completa apenas porque o download terminou.

Os coletores fazem apenas GET, utilizam a sessão existente e não leem nem exportam cookies/tokens. Não alterar proteções do navegador automaticamente. Se a execução manual não estiver disponível, obter acesso oficial à API ou uma exportação completa pelo fornecedor.

## Situação inicial verificada

Safra 2026–2027: 21 grades indexadas, 19 talhões, resultados de 1 grade: 318 registros, 306 valores e 12 nulos. A carga é parcial. O endpoint de safras retornou 16 opções, de 2012–2013 a 2027–2028; isso não comprova existência de análises em todas elas.

```sql
SELECT SAFRA, COUNT(*) REGISTROS, COUNT(VALOR) COM_VALOR,
       COUNT(DISTINCT GRADE_ID) GRADES
FROM INCERES_RESULTADO GROUP BY SAFRA ORDER BY SAFRA;

SELECT TIPO, COUNT(*) DOCUMENTOS FROM INCERES_DOCUMENTO GROUP BY TIPO;

SELECT CONTEUDO FROM INCERES_DOCUMENTO WHERE TIPO = 'COBERTURA';
```

As credenciais ficam somente no `.env`; não incluir credenciais ou HAR em commits.
