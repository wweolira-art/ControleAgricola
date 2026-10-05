-- MODELO: substituir SUA_TABELA pelo nome real.
-- Executar as etapas separadamente no SQL Workshop/SQL Developer.
-- Este arquivo nao altera numeroip de NUMBER para VARCHAR2.

-- 1. Verificar duplicatas existentes. Nenhuma linha e excluida aqui.
SELECT UPPER(TRIM(servidor)) servidor, COUNT(*) quantidade
  FROM SUA_TABELA
 GROUP BY UPPER(TRIM(servidor))
HAVING COUNT(*) > 1;

-- 2. Depois de resolver as duplicatas existentes, criar a garantia de unicidade.
-- Se ja existir um indice equivalente, nao recriar.
CREATE UNIQUE INDEX ux_localip_servidor
    ON SUA_TABELA (UPPER(TRIM(servidor)));
