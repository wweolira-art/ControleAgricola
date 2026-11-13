-- Executar com usuário autorizado a consultar e inserir nesta tabela.
-- O trigger TR_PROFUN_D_P_BIUD gera ID_PROFUN_D_P automaticamente.
-- Não executa a importação de análises e não altera o de-para geral.
DECLARE
  v_qt NUMBER;
  v_codigo NUMBER;
  PROCEDURE vincular(p_origem VARCHAR2, p_destino NUMBER) IS
  BEGIN
    SELECT COUNT(*), MIN(cod_profundidade_para)
      INTO v_qt, v_codigo
      FROM csintegracao.profundidade_de_para
     WHERE cod_profundidade_de = p_origem;
    IF v_qt = 0 THEN
      INSERT INTO csintegracao.profundidade_de_para
        (cod_profundidade_de, cod_profundidade_para)
      VALUES (p_origem, p_destino);
    ELSIF v_qt <> 1 OR v_codigo IS NULL OR v_codigo <> p_destino THEN
      raise_application_error(-20001, 'Vinculo existente conflitante: ' || p_origem);
    END IF;
  END;
BEGIN
  SAVEPOINT ajuste_profundidades;
  vincular('0-20', 1);
  vincular('20-40', 2);
  vincular('40-60', 3);
EXCEPTION WHEN OTHERS THEN
  ROLLBACK TO ajuste_profundidades;
  RAISE;
END;
/

SELECT cod_profundidade_de, cod_profundidade_para
  FROM csintegracao.profundidade_de_para
 WHERE cod_profundidade_de IN ('0-20', '20-40', '40-60')
 ORDER BY cod_profundidade_de;

-- Após conferir os três vínculos, confirmar a transação com COMMIT.
