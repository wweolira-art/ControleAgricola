-- MODELO: substituir SUA_TABELA pelo nome real antes de instalar no ORDS.
-- Requer numeroip VARCHAR2(15), servidor textual, porta numerica e ativo textual.
-- Requer o indice unico de preparar-tabela.sql antes de ativar o handler.
-- Corpo PL/SQL do handler POST; parametros JSON :servidor, :numeroip, :porta, :ativo.
-- Se houver outras colunas obrigatorias sem default, completar o INSERT.
DECLARE
    v_servidor VARCHAR2(255) := UPPER(TRIM(:servidor));
    v_numeroip VARCHAR2(15) := :numeroip;
    v_porta NUMBER := :porta;
    v_ativo VARCHAR2(1) := NVL(NULLIF(UPPER(TRIM(:ativo)), ''), 'S');
BEGIN
    IF v_servidor IS NULL OR v_numeroip IS NULL THEN
        RAISE_APPLICATION_ERROR(-20001, 'servidor e numeroip sao obrigatorios');
    END IF;

    MERGE INTO SUA_TABELA t
    USING (SELECT v_servidor servidor, v_numeroip numeroip, v_porta porta, v_ativo ativo FROM dual) s
    ON (UPPER(TRIM(t.servidor)) = s.servidor)
    WHEN MATCHED THEN
        UPDATE SET t.numeroip = s.numeroip,
                   t.porta = s.porta,
                   t.ativo = s.ativo
    WHEN NOT MATCHED THEN
        INSERT (servidor, numeroip, porta, ativo)
        VALUES (s.servidor, s.numeroip, s.porta, s.ativo);
EXCEPTION
    WHEN DUP_VAL_ON_INDEX THEN
        -- Duas requisicoes podem tentar cadastrar o mesmo servidor juntas.
        -- O indice unico impede a duplicata; a segunda atualiza a linha criada.
        UPDATE SUA_TABELA
           SET numeroip = v_numeroip,
               porta = v_porta,
               ativo = v_ativo
         WHERE UPPER(TRIM(servidor)) = v_servidor;
        IF SQL%ROWCOUNT = 0 THEN
            RAISE;
        END IF;
END;
/
