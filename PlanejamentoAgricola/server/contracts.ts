import { db } from "./db.js";
import { oracleText, withOracle } from "./oracle.js";

export type ContractPriority = "alta" | "media" | "normal";

export type ContractRecord = {
  id: number;
  contratoJatoba: string;
  grupo: string;
  classificacao: string;
  gef: string;
  codigoContratada: string;
  prioridade: ContractPriority;
  codigoUnico: string;
  uc: string;
  ultimaCompetencia: string;
  emissao: string | null;
  fazendaLocal: string;
  cpfCnpj: string;
  nascimentoEmail: string;
  createdAt: string;
  updatedAt: string;
};

export type ContractInput = Omit<ContractRecord, "id" | "createdAt" | "updatedAt">;

function now() {
  return new Date().toISOString();
}

function clean(value: unknown, max = 240) {
  return String(value ?? "").trim().slice(0, max);
}

function priority(value: unknown): ContractPriority {
  return value === "alta" || value === "media" ? value : "normal";
}

function validate(input: Partial<ContractInput>): ContractInput {
  const contratoJatoba = clean(input.contratoJatoba, 80);
  if (!contratoJatoba) throw new Error("Informe o contrato Jatobá.");
  const emissao = clean(input.emissao, 20);
  return {
    contratoJatoba,
    grupo: clean(input.grupo, 80),
    classificacao: clean(input.classificacao, 160),
    gef: clean(input.gef, 50),
    codigoContratada: clean(input.codigoContratada, 80),
    prioridade: priority(input.prioridade),
    codigoUnico: clean(input.codigoUnico, 80),
    uc: clean(input.uc, 80),
    ultimaCompetencia: clean(input.ultimaCompetencia, 20),
    emissao: emissao || null,
    fazendaLocal: clean(input.fazendaLocal, 240),
    cpfCnpj: clean(input.cpfCnpj, 40),
    nascimentoEmail: clean(input.nascimentoEmail, 240),
  };
}

const pdfRows: Array<Omit<ContractInput, "contratoJatoba"> & { contratoJatoba: string }> = [
  ["2898", "", "", "1.1.1", "3571", "", "", "", "", ""],
  ["921", "B2", "AGROPECUÁRIA", "1.1.1", "30", "3855694 / 340500008-47", "30/02/2026", "FZ Nova - Oficina", "002.873.504-87", "14/12/1938"],
  ["928", "B2", "AGROPECUÁRIA", "1.1.2", "30", "3003056847 / 336651008-46", "17/01/2026", "Bebedouro II", "48.752.057/0001-73", "financeiro-agricola@grupoluizjatoba.com.br"],
  ["340", "", "", "1.2.2", "30", "3002921730 / 336753008-08", "24/01/2026", "Bebedouro", "48.752.057/0001-73", "financeiro-agricola@grupoluizjatoba.com.br"],
  ["929", "", "", "1.1.2", "30", "3002915340 / 340657008-62", "17/01/2026", "Camarão", "48.752.057/0001-73", "financeiro-agricola@grupoluizjatoba.com.br"],
  ["983", "", "", "1.1.1", "30", "3001835202 / 336697008-16", "06/02/2026", "Fz Graças", "48.752.057/0001-73", "financeiro-agricola@grupoluizjatoba.com.br"],
  ["432", "A4", "AQUICULTURA", "1.1.1", "30", "7080646 / 603887008-66", "30/02/2026", "Graças Captação", "002.873.504-87", "14/12/1938"],
  ["920", "", "", "1.1.2", "30", "3002915374 / 610656008-46", "17/01/2026", "Imbiribeira Morador", "48.752.057/0001-73", "financeiro-agricola@grupoluizjatoba.com.br"],
  ["430", "A4", "AQUICULTURA", "1.1.1", "30", "7748221 / 658794008-90", "30/02/2026", "Graças", "002.873.504-87", "14/12/1938"],
  ["458", "A4", "AQUICULTURA", "1.2.1", "30", "9320890 / 763127008-30", "30/02/2026", "Escuro", "48.752.057/0001-73", "01/10/1964"],
  ["431", "A4", "AQUICULTURA", "1.1.1", "30", "9333991 / 758848008-69", "30/02/2026", "Graças Mucuin", "002.873.504-87", "14/12/1938"],
  ["433", "A4", "AQUICULTURA", "1.1.1", "30", "9334068 / 759314008-55", "30/02/2026", "Graças Sede", "002.873.504-87", "14/12/1938"],
  ["459", "A4", "AQUICULTURA", "1.2.1", "30", "12828300 / 1079190008-26", "30/02/2026", "Pitomba I", "363.577.314-04", "01/10/1964"],
  ["460", "A4", "AQUICULTURA", "1.2.1", "30", "12838438 / 1074892008-04", "30/02/2026", "Pitomba II", "363.577.314-04", "01/10/1964"],
  ["466", "A4", "AQUICULTURA", "1.1.1", "30", "14322692 / 1207152008-69", "30/02/2026", "Carobas", "002.873.504-87", "14/12/1938"],
  ["457", "A4", "AQUICULTURA", "1.2.1", "30", "14489856 / 1219631008-50", "30/02/2026", "Marcação", "363.577.314-04", "01/10/1964"],
  ["900", "A4", "AQUICULTURA", "1.1.1", "30", "15383776 / 1313414008-87", "30/02/2026", "Pau Paraíba M1", "002.873.504-87", "14/12/1938"],
  ["899", "A4", "AQUICULTURA", "1.1.1", "30", "15383865 / 1300271008-00", "30/02/2026", "Pau Paraíba M2", "002.873.504-87", "14/12/1938"],
  ["901", "A4", "AQUICULTURA", "1.1.1", "30", "15383962 / 1301144008-28", "30/02/2026", "Pau Paraíba M3", "002.873.504-87", "14/12/1938"],
  ["932", "B2", "AGROPECUÁRIA", "1.1.2", "30", "15424430 / 1312662008-97", "18/02/2026", "Imbiribeira", "002.873.504-87", "14/12/1938"],
  ["2653", "", "", "1.2.3", "30", "3001820167", "", "RD MACEIO FACILITIES", "48.752.057/0001-73", "financeiro-agricola@grupoluizjatoba.com.br"],
  ["2416", "A4", "AQUICULTURA", "1.3.1", "30", "16738314 / 1423152008-07", "30/02/2026", "Bom Sucesso", "063.970.284-88", "14/05/1988"],
  ["2922", "", "", "1.1.1", "1181", "", "", "", "", ""],
  ["2126", "", "", "1.2.1", "1066", "", "", "", "", ""],
  ["1067", "", "", "1.2.1", "705", "", "", "", "", ""],
  ["2656", "", "", "1.1.1", "30", "3001820183 / 1386337008-19", "25/01/2026", "Fz Nova, SN", "48.752.057/0001-73", "financeiro-agricola@grupoluizjatoba.com.br"],
  ["2655", "", "", "1.2.3", "30", "3001820426 / 339696008-14", "30/01/2026", "Faz pau paraiba Norte Grandes", "48.752.057/0001-73", "financeiro-agricola@grupoluizjatoba.com.br"],
  ["2654", "", "", "1.1.3", "30", "3001820507 / 389918008-30", "26/12/2025", "Barra de São Miguel", "48.752.057/0001-73", "financeiro-agricola@grupoluizjatoba.com.br"],
  ["2635", "", "", "1.1.3", "30", "3001842551 / 93642008-50", "23/01/2026", "Maceió", "48.752.057/0001-73", "cobranca@grupoluizjatoba.com.br"],
  ["922", "", "", "1.1.1", "30", "3002915307 / 403158008-04", "30/01/2026", "Fz Nova", "48.752.057/0001-73", "cobranca@grupoluizjatoba.com.br"],
  ["2870", "A4", "", "1.1.1", "30", "1000003155 / 1597794008-36", "30/02/2026", "Graças", "48.752.057/0001-73", "cobranca@grupoluizjatoba.com.br"],
  ["2712", "", "", "1.1.1", "1585", "", "", "", "", ""],
  ["3238", "B2", "RURAL B-OPTANTE", "1.1.1", "30", "1000005581 / 1671230008-70", "31/02/2026", "Fz Nova - Microgeo", "002.873.504-87", "14/12/1938"],
  ["Sem contrato", "", "", "", "30", "3001820140 / 1131235008-88", "26/12/2025", "Casa Replublica Lucas", "48.752.057/0001-73", ""],
  ["Esthefani", "", "", "", "30", "3002933003 / 559465008-33", "", "LT RUI PALMEIRA BR 101SUL, S/N, CEP: 57240-000 - RUI PALMEIRA - SÃO MIGUEL DOS CAMPOS", "48.752.057/0001-73", ""],
  ["Ricardo", "", "", "", "30", "3002933100 / 796799008-80", "30/01/2026", "POSTO CINEMA", "48.752.057/0001-73", ""],
  ["Sem contrato", "", "", "", "30", "3002972254 / 136652008-47", "", "POSTO VIA SUL NORTE", "48.752.057/0001-73", ""],
  ["Sem contrato", "", "", "", "30", "3003009326 / 1003942008-10", "", "AV MUNIZ FALCAO, S/N, LETRA B, CEP: 57602-490 - JOSE MAIA COSTA - PALMEIRA DOS INDIOS - AL", "48.752.057/0001-73", ""],
  ["Sem contrato", "", "", "", "30", "3003051268 / 240318008-69", "", "ARAVEL - ARAPIRACA", "48.752.057/0001-73", ""],
  ["Sem contrato", "", "", "", "30", "3003212857", "", "R. BARAO DE JEQUIA, 86, CONDOMINIO, CEP: 57240-052 - CENTRO - SÃO MIGUEL DOS CAMPOS - AL", "48.752.057/0001-73", ""],
  ["Sem contrato", "", "", "", "30", "3003212997", "", "RD BR 101, SN - BOMBA DAGUA - MESSIAS - AL", "48.752.057/0001-73", ""],
].map(([contratoJatoba, grupo, classificacao, gef, codigoContratada, codigoUnico, emissao, fazendaLocal, cpfCnpj, nascimentoEmail]) => {
  const [contratoEquatorial, uc = ""] = codigoUnico.split(" / ");
  return { contratoJatoba, grupo, classificacao, gef, codigoContratada, prioridade: "normal", codigoUnico: contratoEquatorial, uc, ultimaCompetencia: "", emissao: emissao || null, fazendaLocal, cpfCnpj, nascimentoEmail };
});

function migrateSeparateUc() {
  const rows = db.prepare("SELECT id, codigo_unico FROM contract_controls WHERE (uc IS NULL OR uc = '') AND instr(codigo_unico, ' / ') > 0").all() as { id: number; codigo_unico: string }[];
  const update = db.prepare("UPDATE contract_controls SET codigo_unico = ?, uc = ?, updated_at = ? WHERE id = ?");
  for (const item of rows) {
    const [contratoEquatorial, uc = ""] = item.codigo_unico.split(" / ");
    update.run(contratoEquatorial, uc, now(), item.id);
  }
}

function contractNumber(value: string) {
  return /^\d+$/.test(value.trim()) ? Number(value.trim()) : null;
}

/**
 * A competência é a última parcela registrada no ERP para o mesmo número de
 * contrato Jatobá. Mantemos uma cópia no SQLite para a tela continuar útil
 * quando o Oracle estiver indisponível, mas ela nunca é digitada pelo usuário.
 */
async function refreshLatestCompetences(contracts: ContractRecord[]) {
  const numbers = [...new Set(contracts.map((contract) => contractNumber(contract.contratoJatoba)).filter((value): value is number => value != null))];
  if (!numbers.length) return;

  const binds: Record<string, number> = {};
  const names = numbers.map((number, index) => {
    const key = `contract${index}`;
    binds[key] = number;
    return `:${key}`;
  });

  try {
    const competences = await withOracle(async (conn) => {
      const result = await conn.execute(
        `SELECT a.numerocontrato,
                TO_CHAR(MAX(a.datainicio), 'YYYY-MM') AS ultima_competencia
           FROM financeiro.parcelascontrato a
          WHERE a.numerocontrato IN (${names.join(", ")})
            AND a.datainicio IS NOT NULL
          GROUP BY a.numerocontrato`,
        binds,
      );
      return (result.rows ?? []) as Record<string, unknown>[];
    });

    const byContract = new Map(
      competences.map((item) => [String(oracleText(item, "numerocontrato")), oracleText(item, "ultima_competencia")]),
    );
    const update = db.prepare("UPDATE contract_controls SET ultima_competencia = ?, updated_at = ? WHERE id = ?");
    const timestamp = now();
    const transaction = db.transaction(() => {
      for (const contract of contracts) {
        const competence = byContract.get(contract.contratoJatoba);
        if (competence != null && competence !== contract.ultimaCompetencia) {
          update.run(competence, timestamp, contract.id);
          contract.ultimaCompetencia = competence;
        }
      }
    });
    transaction();
  } catch (error) {
    // A listagem continua disponível com o último valor salvo localmente.
    console.warn("Não foi possível atualizar as competências dos contratos:", error instanceof Error ? error.message : error);
  }
}

function seedPdfRows() {
  const seeded = db.prepare("SELECT value FROM meta WHERE key = 'contract_controls_pdf_seed_v1'").get() as { value?: string } | undefined;
  if (seeded?.value) return;
  const timestamp = now();
  const insert = db.prepare(`INSERT INTO contract_controls
    (contrato_jatoba, grupo, classificacao, gef, codigo_contratada, prioridade, codigo_unico, uc, ultima_competencia, emissao, fazenda_local, cpf_cnpj, nascimento_email, created_at, updated_at)
    VALUES (@contratoJatoba, @grupo, @classificacao, @gef, @codigoContratada, @prioridade, @codigoUnico, @uc, @ultimaCompetencia, @emissao, @fazendaLocal, @cpfCnpj, @nascimentoEmail, @timestamp, @timestamp)`);
  db.transaction(() => {
    for (const item of pdfRows) insert.run({ ...item, timestamp });
    db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('contract_controls_pdf_seed_v1', ?)").run(timestamp);
  })();
}

function row(value: Record<string, unknown>): ContractRecord {
  return {
    id: Number(value.id),
    contratoJatoba: String(value.contrato_jatoba ?? ""),
    grupo: String(value.grupo ?? ""),
    classificacao: String(value.classificacao ?? ""),
    gef: String(value.gef ?? ""),
    codigoContratada: String(value.codigo_contratada ?? ""),
    prioridade: priority(value.prioridade),
    codigoUnico: String(value.codigo_unico ?? ""),
    uc: String(value.uc ?? ""),
    ultimaCompetencia: String(value.ultima_competencia ?? ""),
    emissao: value.emissao == null ? null : String(value.emissao),
    fazendaLocal: String(value.fazenda_local ?? ""),
    cpfCnpj: String(value.cpf_cnpj ?? ""),
    nascimentoEmail: String(value.nascimento_email ?? ""),
    createdAt: String(value.created_at),
    updatedAt: String(value.updated_at),
  };
}

export async function listContracts(search = "") {
  seedPdfRows();
  migrateSeparateUc();
  const term = clean(search, 120);
  const rows = term
    ? db.prepare(`SELECT * FROM contract_controls
        WHERE contrato_jatoba LIKE ? OR grupo LIKE ? OR classificacao LIKE ? OR gef LIKE ?
          OR codigo_contratada LIKE ? OR codigo_unico LIKE ? OR uc LIKE ? OR ultima_competencia LIKE ? OR fazenda_local LIKE ?
          OR cpf_cnpj LIKE ? OR nascimento_email LIKE ?
        ORDER BY CASE prioridade WHEN 'alta' THEN 2 WHEN 'media' THEN 1 ELSE 0 END DESC, contrato_jatoba COLLATE NOCASE, id DESC`).all(...Array(11).fill(`%${term}%`))
    : db.prepare("SELECT * FROM contract_controls ORDER BY CASE prioridade WHEN 'alta' THEN 2 WHEN 'media' THEN 1 ELSE 0 END DESC, contrato_jatoba COLLATE NOCASE, id DESC").all();
  const contracts = (rows as Record<string, unknown>[]).map(row);
  await refreshLatestCompetences(contracts);
  return contracts;
}

export function createContract(input: Partial<ContractInput>) {
  const item = { ...validate(input), ultimaCompetencia: "" };
  const timestamp = now();
  const result = db.prepare(`INSERT INTO contract_controls
    (contrato_jatoba, grupo, classificacao, gef, codigo_contratada, prioridade, codigo_unico, uc, ultima_competencia, emissao, fazenda_local, cpf_cnpj, nascimento_email, created_at, updated_at)
    VALUES (@contratoJatoba, @grupo, @classificacao, @gef, @codigoContratada, @prioridade, @codigoUnico, @uc, @ultimaCompetencia, @emissao, @fazendaLocal, @cpfCnpj, @nascimentoEmail, @timestamp, @timestamp)`).run({ ...item, timestamp });
  return getContract(Number(result.lastInsertRowid));
}

export function updateContract(id: number, input: Partial<ContractInput>) {
  const current = getContract(id);
  if (!current) throw new Error("Contrato não encontrado.");
  const item = { ...validate({ ...current, ...input }), ultimaCompetencia: current.ultimaCompetencia };
  db.prepare(`UPDATE contract_controls SET
    contrato_jatoba = @contratoJatoba, grupo = @grupo, classificacao = @classificacao, gef = @gef,
    codigo_contratada = @codigoContratada, prioridade = @prioridade, codigo_unico = @codigoUnico, uc = @uc, ultima_competencia = @ultimaCompetencia, emissao = @emissao,
    fazenda_local = @fazendaLocal, cpf_cnpj = @cpfCnpj, nascimento_email = @nascimentoEmail,
    updated_at = @updatedAt WHERE id = @id`).run({ ...item, id, updatedAt: now() });
  return getContract(id)!;
}

function nextVerificationDate(currentValue: string | null) {
  const source = String(currentValue ?? "").trim();
  const brazilian = source.match(/^(\d{1,2})\/\d{1,2}\/\d{4}$/);
  const iso = source.match(/^\d{4}-\d{2}-(\d{2})$/);
  const requestedDay = Number(iso?.[1] ?? brazilian?.[1] ?? 0);
  if (!Number.isInteger(requestedDay) || requestedDay < 1 || requestedDay > 31) {
    throw new Error("Defina uma data de emissão válida antes de marcar a conta como verificada.");
  }
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const next = new Date(year, month, Math.min(requestedDay, lastDay));
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
}

/** O usuário confirmou a verificação; agenda o mesmo dia para o mês seguinte. */
export function markContractVerified(id: number) {
  const current = getContract(id);
  if (!current) throw new Error("Contrato não encontrado.");
  const emissao = nextVerificationDate(current.emissao);
  db.prepare("UPDATE contract_controls SET emissao = ?, updated_at = ? WHERE id = ?").run(emissao, now(), id);
  return getContract(id)!;
}

export function deleteContract(id: number) {
  if (!db.prepare("DELETE FROM contract_controls WHERE id = ?").run(id).changes) throw new Error("Contrato não encontrado.");
}

function getContract(id: number) {
  const value = db.prepare("SELECT * FROM contract_controls WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return value ? row(value) : null;
}
