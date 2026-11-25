import { oracleDate, oracleNumber, oracleText, oracleValue, withOracle } from "./oracle.js";

type OracleRow = Record<string, unknown>;
const TIPOS_BAIXA: Record<number, string> = { 1: "Devolução", 21: "Rotina", 41: "Demitido", 61: "Perdida" };
function descricaoBaixa(codigo: number | null, descricao: string) {
  return (codigo == null ? undefined : TIPOS_BAIXA[codigo]) ?? descricao;
}
function nullableNumber(row: OracleRow, ...names: string[]) {
  const value = oracleValue(row, ...names);
  return value == null || value === "" ? null : oracleNumber(row, ...names);
}

export async function loadOracleToolRecords() {
  return withOracle(async (conn) => {
    const assets = await conn.execute(`
      WITH controles_abertos AS (
        SELECT id_ferramenta,
               MAX(cod_funcionario) AS cod_funcionario,
               LISTAGG(DISTINCT rh.fn_nomefuncionario(cod_grupoempresa, cod_funcionario), ', ') WITHIN GROUP (ORDER BY rh.fn_nomefuncionario(cod_grupoempresa, cod_funcionario)) AS nomes_responsaveis,
               MAX(id_os_ferrame) AS id_os_ferrame,
               MAX(ano_os_ind) AS ano_os_ind,
               MAX(observacao) AS observacao
          FROM material.ferramenta_controle
         WHERE data_devolucao IS NULL
         GROUP BY id_ferramenta
      ),
      manutencoes_abertas AS (
        SELECT id_ferramenta, COUNT(*) AS quantidade
          FROM industria.ordem_servico_ferramenta
         WHERE data_devolucao IS NULL
         GROUP BY id_ferramenta
      ),
      caixa_itens AS (
        SELECT id_ferramenta, MAX(id_caixa) AS id_caixa, COUNT(*) AS quantidade
          FROM material.ferramentas_caixa
         GROUP BY id_ferramenta
      ),
      caixas_cadastradas AS (
        SELECT DISTINCT id_caixa FROM material.ferramentas_caixa
      ),
      ultima_entrada AS (
        SELECT cod_material,
               MAX(valorunitario) KEEP (DENSE_RANK LAST ORDER BY dataentrada_seq NULLS FIRST, sequencia_nf, item) AS valorunitario
          FROM material.itensentrada
         WHERE valorunitario > 0
         GROUP BY cod_material
      )
      SELECT f.sequencia, f.cod_ferramenta, f.cod_material,
             NVL(m.descricao, t.descricao_tipo) AS descricao,
             NVL(mr.descricao_marca, '') AS marca,
             NVL(mo.descricao_modelo, '') AS modelo,
             f.numero_serie, f.datainicio, f.datatermino, f.cod_tipobaixa,
             NVL(tb.descricao, '') AS descricao_baixa, f.cod_almoxarifado,
             t.descricao_tipo, f.caixa_ferramenta, ci.id_caixa AS caixa_vinculada,
             cc.id_caixa AS caixa_com_itens,
             NVL(ci.quantidade, 0) AS quantidade_na_caixa,
             NVL(ma.quantidade, 0) AS manutencoes_abertas,
             ca.cod_funcionario, ca.nomes_responsaveis, ca.id_os_ferrame, ca.ano_os_ind,
             NVL(ca.observacao, '') AS observacao_controle,
             NVL(ue.valorunitario, 0) AS ultimo_valor_unitario
        FROM material.ferramenta f
        JOIN material.ferramenta_tipo t ON t.id_tipo = f.id_tipo
        LEFT JOIN material.material m ON m.cod_material = f.cod_material
        LEFT JOIN material.ferramenta_marca mr ON mr.id_marca = f.id_marca
        LEFT JOIN material.ferramenta_modelo mo ON mo.id_ferramenta_modelo = f.id_ferramenta_modelo
        LEFT JOIN material.tipobaixaferramenta tb ON tb.cod_tipobaixa = f.cod_tipobaixa
        LEFT JOIN controles_abertos ca ON ca.id_ferramenta = f.sequencia
        LEFT JOIN manutencoes_abertas ma ON ma.id_ferramenta = f.sequencia
        LEFT JOIN caixa_itens ci ON ci.id_ferramenta = f.sequencia
        LEFT JOIN caixas_cadastradas cc ON cc.id_caixa = f.sequencia
        LEFT JOIN ultima_entrada ue ON ue.cod_material = f.cod_material
       ORDER BY f.cod_ferramenta, f.sequencia`);
    const movementsResult = await conn.execute(`
      SELECT c.id_ferramencont, c.id_ferramenta, c.data_entrega, c.data_devolucao,
             c.cod_funcionario, c.observacao, c.usuario_realizou_entrega,
             c.usuario_recebeu_devolucao, f.cod_ferramenta, NVL(m.descricao,t.descricao_tipo) AS descricao
        FROM material.ferramenta_controle c
        JOIN material.ferramenta f ON f.sequencia = c.id_ferramenta
        JOIN material.ferramenta_tipo t ON t.id_tipo = f.id_tipo
        LEFT JOIN material.material m ON m.cod_material = f.cod_material
       ORDER BY c.data_entrega DESC NULLS LAST, c.id_ferramencont DESC
       FETCH FIRST 500 ROWS ONLY`);
    const maintenanceResult = await conn.execute(`
      SELECT o.id_os_ferrame, o.id_ferramenta, o.data, o.data_devolucao, o.cod_funcionario,
             o.observacoes, o.usuario_realizou_entrega, o.usuario_recebeu_devolucao,
             f.cod_ferramenta, NVL(m.descricao,t.descricao_tipo) AS descricao
        FROM industria.ordem_servico_ferramenta o
        JOIN material.ferramenta f ON f.sequencia=o.id_ferramenta
        JOIN material.ferramenta_tipo t ON t.id_tipo=f.id_tipo
        LEFT JOIN material.material m ON m.cod_material=f.cod_material
       ORDER BY o.data DESC NULLS LAST, o.id_os_ferrame DESC
       FETCH FIRST 500 ROWS ONLY`);
    const writeoffsResult = await conn.execute(`
      SELECT f.sequencia, f.cod_ferramenta, NVL(m.descricao,t.descricao_tipo) AS descricao,
             f.datatermino, f.cod_tipobaixa, tb.descricao AS motivo,
             NVL(ue.valorunitario,0) AS valor
        FROM material.ferramenta f
        JOIN material.ferramenta_tipo t ON t.id_tipo=f.id_tipo
        LEFT JOIN material.material m ON m.cod_material=f.cod_material
        LEFT JOIN material.tipobaixaferramenta tb ON tb.cod_tipobaixa=f.cod_tipobaixa
        LEFT JOIN (SELECT cod_material, MAX(valorunitario) KEEP (DENSE_RANK LAST ORDER BY dataentrada_seq NULLS FIRST, sequencia_nf, item) AS valorunitario
                     FROM material.itensentrada WHERE valorunitario>0 GROUP BY cod_material) ue ON ue.cod_material=f.cod_material
       WHERE f.cod_tipobaixa IS NOT NULL OR f.datatermino IS NOT NULL
       ORDER BY f.datatermino DESC NULLS LAST, f.sequencia`);

    const rows = (assets.rows ?? []) as OracleRow[];
    const isBox = (row: OracleRow) => oracleText(row, "caixa_ferramenta").trim().toUpperCase() === "S";
    const boxRows = rows.filter(isBox);
    const boxesByOracleSequence = new Map<number, Record<string, unknown>>();
    const boxes = boxRows.map((row) => {
      const seq = nullableNumber(row, "sequencia") ?? 0;
      const id = -seq;
      // For boxes, DATA_TERMINO can be filled by ERP lifecycle routines and
      // is not itself a write-off. Only an explicit write-off reason closes it.
      const closed = nullableNumber(row, "cod_tipobaixa") != null;
      const holderCode = nullableNumber(row, "cod_funcionario");
      const result = {
        id, source: "oracle", oracle_sequence: seq,
        box_number: oracleText(row, "cod_ferramenta") || String(seq),
        description: oracleText(row, "descricao"), responsible: holderCode == null ? "" : `Matrícula ${holderCode}`, employee_number: holderCode == null ? "" : String(holderCode), sector: "",
        location: nullableNumber(row, "cod_almoxarifado") == null ? "" : `Almoxarifado ${nullableNumber(row, "cod_almoxarifado")}`,
        delivery_date: oracleDate(row, "datainicio"), status: closed ? "inactive" : holderCode != null ? "in_use" : "available",
        observation: "", tool_count: 0, pending_count: 0,
      };
      boxesByOracleSequence.set(seq, result);
      return result;
    });
    for (const row of rows) {
      const boxSeq = nullableNumber(row, "caixa_vinculada");
      if (boxSeq != null) {
        const box = boxesByOracleSequence.get(boxSeq);
        if (box) box.tool_count = Number(box.tool_count) + 1;
      }
    }

    const toolRows = rows.filter((row) => !isBox(row));
    const tools = toolRows.map((row) => {
      const seq = nullableNumber(row, "sequencia") ?? 0;
      const boxSeq = nullableNumber(row, "caixa_vinculada");
      const closedDate = oracleDate(row, "datatermino");
      const bajaCode = nullableNumber(row, "cod_tipobaixa");
      const bajaLabel = descricaoBaixa(bajaCode, oracleText(row, "descricao_baixa"));
      const maintenance = (nullableNumber(row, "manutencoes_abertas") ?? 0) > 0 || nullableNumber(row, "id_os_ferrame") != null || nullableNumber(row, "ano_os_ind") != null;
      const status = bajaCode === 61 || (bajaCode == null && bajaLabel.toUpperCase().includes("PERDID")) ? "lost"
        : (closedDate || bajaCode != null) ? "written_off"
        : maintenance ? "maintenance"
        : nullableNumber(row, "cod_funcionario") != null ? "borrowed" : "available";
      const linkedBox = boxSeq == null ? undefined : boxesByOracleSequence.get(boxSeq);
      return {
        id: -seq, source: "oracle", oracle_sequence: seq,
        code: oracleText(row, "cod_ferramenta") || String(seq),
        box_id: linkedBox ? linkedBox.id : -2147483647,
        box_number: linkedBox?.box_number ?? "Sem caixa vinculada",
        box_description: linkedBox?.description ?? "A associação da ferramenta à caixa não está cadastrada no Oracle.",
        box_responsible: nullableNumber(row, "cod_funcionario") == null ? "" : `Matrícula ${nullableNumber(row, "cod_funcionario")}`, box_employee_number: nullableNumber(row, "cod_funcionario") == null ? "" : String(nullableNumber(row, "cod_funcionario")), box_sector: "",
        description: oracleText(row, "descricao"), brand: oracleText(row, "descricao_marca"),
        model: oracleText(row, "descricao_modelo"), measure: "",
        acquisition_value: nullableNumber(row, "ultimo_valor_unitario") ?? 0,
        acquisition_date: oracleDate(row, "datainicio"), condition: "not_informed", status,
        observation: oracleText(row, "observacao_controle") || "Valor estimado pela última entrada do material; o Oracle não registra conservação nem custo individual por ferramenta.",
        baixa_reason: bajaLabel, baixa_code: bajaCode, baixa_date: closedDate,
        holder_name: oracleText(row, "nomes_responsaveis"),
        holder_code: nullableNumber(row, "cod_funcionario"), material_code: nullableNumber(row, "cod_material"),
      };
    });

    const movements: Array<Record<string, unknown>> = [];
    for (const row of (movementsResult.rows ?? []) as OracleRow[]) {
      const id = nullableNumber(row, "id_ferramencont") ?? 0;
      const toolId = -(nullableNumber(row, "id_ferramenta") ?? 0);
      const common = {
        tool_id: toolId, box_id: null, from_box_id: null, to_box_id: null,
        responsible: nullableNumber(row, "cod_funcionario") == null ? "" : `Matrícula ${nullableNumber(row, "cod_funcionario")}`,
        observation: oracleText(row, "observacao"), replacement_tool_id: null,
        performed_by: 0, tool_code: oracleText(row, "cod_ferramenta"),
        tool_description: oracleText(row, "descricao"), box_number: null, from_box_number: null, to_box_number: null,
      };
      const deliveredAt = oracleDate(row, "data_entrega");
      const returnedAt = oracleDate(row, "data_devolucao");
      if (deliveredAt) movements.push({ ...common, id: -(id * 2), movement_type: "oracle_delivery", occurred_at: deliveredAt,
        from_responsible: "Almoxarifado", to_responsible: common.responsible,
        performed_by_name: oracleText(row, "usuario_realizou_entrega") || "ERP Oracle" });
      if (returnedAt) movements.push({ ...common, id: -(id * 2 + 1), movement_type: "oracle_return", occurred_at: returnedAt,
        from_responsible: common.responsible, to_responsible: "Almoxarifado",
        performed_by_name: oracleText(row, "usuario_recebeu_devolucao") || "ERP Oracle" });
    }
    for (const row of (maintenanceResult.rows ?? []) as OracleRow[]) {
      const id = nullableNumber(row, "id_os_ferrame") ?? 0;
      const toolId = -(nullableNumber(row, "id_ferramenta") ?? 0);
      const responsible = nullableNumber(row, "cod_funcionario") == null ? "" : `Matrícula ${nullableNumber(row, "cod_funcionario")}`;
      const common = { tool_id: toolId, box_id: null, from_box_id: null, to_box_id: null, responsible,
        observation: oracleText(row, "observacoes"), replacement_tool_id: null, performed_by: 0,
        tool_code: oracleText(row, "cod_ferramenta"), tool_description: oracleText(row, "descricao"),
        box_number: null, from_box_number: null, to_box_number: null };
      const sentAt = oracleDate(row, "data");
      const returnedAt = oracleDate(row, "data_devolucao");
      if (sentAt) movements.push({ ...common, id: -(id * 2 + 100000000), movement_type: "oracle_maintenance", occurred_at: sentAt,
        from_responsible: "Almoxarifado", to_responsible: "Manutenção",
        performed_by_name: oracleText(row, "usuario_realizou_entrega") || "ERP Oracle" });
      if (returnedAt) movements.push({ ...common, id: -(id * 2 + 100000001), movement_type: "oracle_maintenance_return", occurred_at: returnedAt,
        from_responsible: "Manutenção", to_responsible: "Almoxarifado",
        performed_by_name: oracleText(row, "usuario_recebeu_devolucao") || "ERP Oracle" });
    }

    const writeoffs = ((writeoffsResult.rows ?? []) as OracleRow[]).map((row, index) => ({
      id: -(index + 1), tool_id: -(nullableNumber(row, "sequencia") ?? 0), reason: descricaoBaixa(nullableNumber(row, "cod_tipobaixa"), oracleText(row, "motivo")) || "Baixa no Oracle",
      value: nullableNumber(row, "valor") ?? 0, responsible: "", sector: "",
      occurred_at: oracleDate(row, "datatermino") || "", observation: "", created_by_name: "ERP Oracle",
      tool_code: oracleText(row, "cod_ferramenta"), tool_description: oracleText(row, "descricao"),
      box_number: "", source: "oracle",
    }));
    const monthMap = new Map<string, { month: string; count: number; value: number }>();
    for (const item of writeoffs) {
      if (!item.occurred_at) continue;
      const month = String(item.occurred_at).slice(0, 7);
      const current = monthMap.get(month) ?? { month, count: 0, value: 0 };
      current.count += 1;
      current.value += Number(item.value);
      monthMap.set(month, current);
    }
    const summary = {
      boxes: boxes.length, tools: tools.length,
      available: tools.filter((item) => item.status === "available").length,
      in_use: tools.filter((item) => item.status === "in_use").length,
      borrowed: tools.filter((item) => item.status === "borrowed").length,
      lost: tools.filter((item) => item.status === "lost").length,
      maintenance: tools.filter((item) => item.status === "maintenance").length,
      written_off: tools.filter((item) => item.status === "written_off").length,
    };
    return {
      boxes, tools, movements: movements.sort((a, b) => String(b.occurred_at).localeCompare(String(a.occurred_at))).slice(0, 500),
      writeoffs, monthlyLosses: [...monthMap.values()].sort((a, b) => a.month.localeCompare(b.month)), summary,
      missingByBox: [], inspectionItems: [], inspections: [],
      dataSource: { oracle: "online", oracleToolCount: tools.length, oracleBoxCount: boxes.length,
        boxLinks: rows.filter((row) => nullableNumber(row, "caixa_vinculada") != null).length,
        warning: "Conferências históricas continuam no banco do módulo." },
    };
  });
}
