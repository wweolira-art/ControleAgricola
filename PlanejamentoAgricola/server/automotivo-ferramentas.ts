import type { Express, Request, Response, NextFunction } from "express";
import { db } from "./db.js";
import { readBearerToken, verifySessionToken } from "./auth.js";
import { canAccessPermission, canEditPermission, siteGroupPermissionKey } from "./permissions.js";
import { loadOracleToolRecords } from "./automotivo-ferramentas-oracle.js";

const BASE = "nativeTab:indicadores:controle-ferramentas";
const EDIT = `${BASE}:edit`;
const BOX_STATES = new Set(["available", "in_use", "inactive"]);
const TOOL_STATES = new Set(["available", "in_use", "borrowed", "lost", "maintenance", "written_off"]);
const INSPECTION_STATES = new Set(["present", "missing", "damaged", "maintenance"]);
const WRITEOFF_REASONS = new Set(["perda", "extravio", "quebra", "desgaste", "descarte"]);
const TOOL_CONDITIONS = new Set(["good", "regular", "damaged"]);

function ensureTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tool_boxes (
      id INTEGER PRIMARY KEY, box_number TEXT NOT NULL UNIQUE, description TEXT NOT NULL,
      responsible TEXT NOT NULL DEFAULT '', employee_number TEXT NOT NULL DEFAULT '', sector TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT '', delivery_date TEXT, status TEXT NOT NULL DEFAULT 'available'
        CHECK (status IN ('available','in_use','inactive')), observation TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, created_by INTEGER, updated_by INTEGER
    );
    CREATE TABLE IF NOT EXISTS tools (
      id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE, box_id INTEGER NOT NULL REFERENCES tool_boxes(id),
      description TEXT NOT NULL, brand TEXT NOT NULL DEFAULT '', model TEXT NOT NULL DEFAULT '', measure TEXT NOT NULL DEFAULT '',
      acquisition_value REAL NOT NULL DEFAULT 0 CHECK (acquisition_value >= 0), acquisition_date TEXT,
      condition TEXT NOT NULL DEFAULT 'good', status TEXT NOT NULL DEFAULT 'available'
        CHECK (status IN ('available','in_use','borrowed','lost','maintenance','written_off')),
      observation TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, created_by INTEGER, updated_by INTEGER
    );
    CREATE INDEX IF NOT EXISTS tools_box_status_idx ON tools(box_id,status);
    CREATE TABLE IF NOT EXISTS tool_movements (
      id INTEGER PRIMARY KEY, movement_type TEXT NOT NULL, tool_id INTEGER REFERENCES tools(id), box_id INTEGER REFERENCES tool_boxes(id),
      from_box_id INTEGER REFERENCES tool_boxes(id), to_box_id INTEGER REFERENCES tool_boxes(id),
      from_responsible TEXT NOT NULL DEFAULT '', to_responsible TEXT NOT NULL DEFAULT '', responsible TEXT NOT NULL DEFAULT '',
      occurred_at TEXT NOT NULL, observation TEXT NOT NULL DEFAULT '', replacement_tool_id INTEGER REFERENCES tools(id),
      performed_by INTEGER NOT NULL, performed_by_name TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS tool_movements_date_idx ON tool_movements(occurred_at DESC);
    CREATE TABLE IF NOT EXISTS tool_inspections (
      id INTEGER PRIMARY KEY, box_id INTEGER NOT NULL REFERENCES tool_boxes(id), checked_at TEXT NOT NULL,
      responsible TEXT NOT NULL DEFAULT '', compliance REAL NOT NULL DEFAULT 0, observation TEXT NOT NULL DEFAULT '',
      performed_by INTEGER NOT NULL, performed_by_name TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tool_inspection_items (
      id INTEGER PRIMARY KEY, inspection_id INTEGER NOT NULL REFERENCES tool_inspections(id),
      tool_id INTEGER NOT NULL REFERENCES tools(id), tool_code TEXT NOT NULL, tool_description TEXT NOT NULL,
      item_status TEXT NOT NULL CHECK (item_status IN ('present','missing','damaged','maintenance')),
      observation TEXT NOT NULL DEFAULT '', UNIQUE(inspection_id,tool_id)
    );
    CREATE TABLE IF NOT EXISTS tool_writeoffs (
      id INTEGER PRIMARY KEY, tool_id INTEGER NOT NULL UNIQUE REFERENCES tools(id), reason TEXT NOT NULL,
      value REAL NOT NULL CHECK (value >= 0), responsible TEXT NOT NULL DEFAULT '', sector TEXT NOT NULL DEFAULT '', occurred_at TEXT NOT NULL,
      observation TEXT NOT NULL DEFAULT '', created_by INTEGER NOT NULL, created_by_name TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tool_audit (
      id INTEGER PRIMARY KEY, entity TEXT NOT NULL, entity_id INTEGER NOT NULL, action TEXT NOT NULL,
      details TEXT NOT NULL DEFAULT '{}', occurred_at TEXT NOT NULL, user_id INTEGER NOT NULL, user_name TEXT NOT NULL
    );
  `);
  const writeoffColumns = db.prepare("PRAGMA table_info(tool_writeoffs)").all() as {name:string}[];
  if (!writeoffColumns.some((column)=>column.name==="sector")) db.exec("ALTER TABLE tool_writeoffs ADD COLUMN sector TEXT NOT NULL DEFAULT ''");
}

function stamp() { return new Date().toISOString(); }
function clean(value: unknown, label: string, required = false) {
  const text = String(value ?? "").trim();
  if (required && !text) throw new Error(`Informe ${label}.`);
  if (text.length > 1000) throw new Error(`${label} excede o limite permitido.`);
  return text;
}
function numeric(value: unknown, label: string, min = 0) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min) throw new Error(`Informe ${label} válido.`);
  return n;
}
function dateOrNull(value: unknown, label: string) {
  const text = clean(value, label);
  if (!text) return null;
  const parsed = new Date(`${text}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0,10) !== text) throw new Error(`Informe ${label} no formato AAAA-MM-DD.`);
  return text;
}
function audit(user: { id: number; nome: string }, entity: string, entityId: number, action: string, details: unknown) {
  db.prepare(`INSERT INTO tool_audit(entity,entity_id,action,details,occurred_at,user_id,user_name) VALUES(?,?,?,?,?,?,?)`)
    .run(entity, entityId, action, JSON.stringify(details ?? {}), stamp(), user.id, user.nome);
}
function nextCode(boxId: number) {
  const box = db.prepare("SELECT box_number FROM tool_boxes WHERE id=?").get(boxId) as { box_number: string } | undefined;
  if (!box) throw new Error("Caixa não encontrada.");
  const prefix = box.box_number.replace(/[^A-Za-z0-9]/g, "") || String(boxId).padStart(3, "0");
  const rows = db.prepare("SELECT code FROM tools WHERE code LIKE ?").all(`${prefix}-%`) as { code: string }[];
  const seq = rows.reduce((max, row) => {
    const m = row.code.match(/-(\d+)$/);
    return Math.max(max, m ? Number(m[1]) : 0);
  }, 0) + 1;
  return `${prefix}-${String(seq).padStart(3, "0")}`;
}
function localRecords() {
  ensureTables();
  const boxes = db.prepare(`SELECT b.*, COUNT(t.id) AS tool_count,
      SUM(CASE WHEN t.status IN ('lost','written_off') THEN 1 ELSE 0 END) AS pending_count
    FROM tool_boxes b LEFT JOIN tools t ON t.box_id=b.id GROUP BY b.id ORDER BY b.box_number COLLATE NOCASE`).all();
  const tools = db.prepare(`SELECT t.*, b.box_number, b.description AS box_description,
      b.responsible AS box_responsible,b.employee_number AS box_employee_number,b.sector AS box_sector FROM tools t
    JOIN tool_boxes b ON b.id=t.box_id ORDER BY b.box_number COLLATE NOCASE,t.code COLLATE NOCASE`).all();
  const movements = db.prepare(`SELECT m.*, t.code AS tool_code, t.description AS tool_description,
      b.box_number, fb.box_number AS from_box_number, tb.box_number AS to_box_number
    FROM tool_movements m LEFT JOIN tools t ON t.id=m.tool_id LEFT JOIN tool_boxes b ON b.id=m.box_id
      LEFT JOIN tool_boxes fb ON fb.id=m.from_box_id LEFT JOIN tool_boxes tb ON tb.id=m.to_box_id
    ORDER BY m.occurred_at DESC,m.id DESC LIMIT 500`).all();
  const inspections = db.prepare(`SELECT i.*,b.box_number,b.description AS box_description,
      (SELECT COUNT(*) FROM tool_inspection_items x WHERE x.inspection_id=i.id AND x.item_status='missing') AS missing_count
    FROM tool_inspections i JOIN tool_boxes b ON b.id=i.box_id ORDER BY i.checked_at DESC,i.id DESC LIMIT 500`).all();
  const inspectionItems = db.prepare(`SELECT x.*,i.box_id,i.checked_at,b.box_number FROM tool_inspection_items x
    JOIN tool_inspections i ON i.id=x.inspection_id JOIN tool_boxes b ON b.id=i.box_id ORDER BY x.id`).all();
  const writeoffs = db.prepare(`SELECT w.*,t.code AS tool_code,t.description AS tool_description,b.box_number
    FROM tool_writeoffs w JOIN tools t ON t.id=w.tool_id JOIN tool_boxes b ON b.id=t.box_id
    ORDER BY w.occurred_at DESC,w.id DESC`).all();
  const summary = db.prepare(`SELECT
      (SELECT COUNT(*) FROM tool_boxes) AS boxes,
      (SELECT COUNT(*) FROM tools) AS tools,
      (SELECT COUNT(*) FROM tools WHERE status='available') AS available,
      (SELECT COUNT(*) FROM tools WHERE status='in_use') AS in_use,
      (SELECT COUNT(*) FROM tools WHERE status='borrowed') AS borrowed,
      (SELECT COUNT(*) FROM tools WHERE status='lost') AS lost,
      (SELECT COUNT(*) FROM tools WHERE status='maintenance') AS maintenance,
      (SELECT COUNT(*) FROM tools WHERE status='written_off') AS written_off`).get() as Record<string, number>;
  const monthlyLosses = db.prepare(`SELECT substr(occurred_at,1,7) AS month,COUNT(*) AS count,COALESCE(SUM(value),0) AS value
    FROM tool_writeoffs GROUP BY substr(occurred_at,1,7) ORDER BY month`).all();
  const latestByBox = db.prepare(`SELECT i.box_id, MAX(i.id) AS inspection_id FROM tool_inspections i GROUP BY i.box_id`).all() as { box_id: number; inspection_id: number }[];
  const missingByBox = latestByBox.map(({ box_id, inspection_id }) => {
    const box = db.prepare("SELECT box_number,description FROM tool_boxes WHERE id=?").get(box_id) as { box_number: string; description: string };
    const missing = Number((db.prepare("SELECT COUNT(*) AS n FROM tool_inspection_items WHERE inspection_id=? AND item_status='missing'").get(inspection_id) as { n: number }).n);
    return { boxId: box_id, boxNumber: box.box_number, description: box.description, missing };
  }).filter((row) => row.missing > 0).sort((a, b) => b.missing - a.missing);
  return { boxes, tools, movements, inspections, inspectionItems, writeoffs, summary, monthlyLosses, missingByBox };
}

async function records() {
  const oracle = await loadOracleToolRecords();
  const local = localRecords();
  const boxes = [...oracle.boxes, ...local.boxes.map((row) => ({ ...row, source: "local" }))];
  const tools = [...oracle.tools, ...local.tools.map((row) => ({ ...row, source: "local" }))];
  const monthMap = new Map<string, { month: string; count: number; value: number }>();
  for (const row of [...oracle.monthlyLosses, ...local.monthlyLosses as Array<{month:string;count:number;value:number}>]) {
    const current = monthMap.get(row.month) ?? { month: row.month, count: 0, value: 0 };
    current.count += Number(row.count); current.value += Number(row.value); monthMap.set(row.month, current);
  }
  const summary = {
    boxes: boxes.length, tools: tools.length,
    available: tools.filter((row) => row.status === "available").length,
    in_use: tools.filter((row) => row.status === "in_use").length,
    borrowed: tools.filter((row) => row.status === "borrowed").length,
    lost: tools.filter((row) => row.status === "lost").length,
    maintenance: tools.filter((row) => row.status === "maintenance").length,
    written_off: tools.filter((row) => row.status === "written_off").length,
  };
  return {
    boxes, tools,
    movements: [...oracle.movements, ...local.movements].sort((a,b) => String(b.occurred_at).localeCompare(String(a.occurred_at))).slice(0,500),
    inspections: local.inspections, inspectionItems: [...oracle.inspectionItems, ...local.inspectionItems],
    writeoffs: [...oracle.writeoffs, ...local.writeoffs], summary,
    monthlyLosses: [...monthMap.values()].sort((a,b)=>a.month.localeCompare(b.month)),
    missingByBox: local.missingByBox, dataSource: oracle.dataSource,
  };
}

function createBox(body: Record<string, unknown>, user: { id: number; nome: string }) {
  ensureTables();
  const number = clean(body.boxNumber, "o número da caixa", true);
  const description = clean(body.description, "a descrição", true);
  const status = String(body.status ?? "available");
  if (!BOX_STATES.has(status)) throw new Error("Situação de caixa inválida.");
  const now = stamp();
  const result = db.prepare(`INSERT INTO tool_boxes(box_number,description,responsible,employee_number,sector,location,delivery_date,status,observation,created_at,updated_at,created_by,updated_by)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(number, description, clean(body.responsible,"o responsável"), clean(body.employeeNumber,"a matrícula"), clean(body.sector,"o setor"), clean(body.location,"a localização"), dateOrNull(body.deliveryDate,"a data de entrega"), status, clean(body.observation,"a observação"), now, now, user.id, user.id);
  const id = Number(result.lastInsertRowid);
  audit(user,"box",id,"create",body);
  return id;
}

function updateBox(id: number, body: Record<string, unknown>, user: { id: number; nome: string }) {
  ensureTables();
  const current = db.prepare("SELECT * FROM tool_boxes WHERE id=?").get(id) as Record<string, unknown> | undefined;
  if (!current) throw new Error("Caixa não encontrada.");
  const status = String(body.status ?? current.status);
  if (!BOX_STATES.has(status)) throw new Error("Situação de caixa inválida.");
  if (status !== String(current.status) && status !== "inactive" && !(String(current.status) === "inactive" && status === "available")) throw new Error("Use as movimentações de entrega/devolução para alterar a situação da caixa.");
  if (clean(body.responsible ?? current.responsible,"o responsável") !== String(current.responsible) || clean(body.employeeNumber ?? current.employee_number,"a matrícula") !== String(current.employee_number)) {
    throw new Error("Use Transferência de responsabilidade para alterar o responsável pela caixa.");
  }
  if (status === "inactive") {
    const activeTools = db.prepare("SELECT COUNT(*) AS n FROM tools WHERE box_id=? AND status NOT IN ('written_off','lost')").get(id) as { n: number };
    if (Number(activeTools.n) > 0) throw new Error("Transfira ou baixe as ferramentas antes de inativar esta caixa.");
    if (clean(body.responsible ?? current.responsible,"o responsável")) throw new Error("Remova o responsável antes de inativar a caixa.");
  }
  const next = {
    boxNumber: clean(body.boxNumber ?? current.box_number,"o número da caixa",true),
    description: clean(body.description ?? current.description,"a descrição",true),
    responsible: clean(body.responsible ?? current.responsible,"o responsável"),
    employeeNumber: clean(body.employeeNumber ?? current.employee_number,"a matrícula"),
    sector: clean(body.sector ?? current.sector,"o setor"), location: clean(body.location ?? current.location,"a localização"),
    deliveryDate: dateOrNull(body.deliveryDate ?? current.delivery_date,"a data de entrega"), status,
    observation: clean(body.observation ?? current.observation,"a observação"),
  };
  db.prepare(`UPDATE tool_boxes SET box_number=@boxNumber,description=@description,responsible=@responsible,employee_number=@employeeNumber,
    sector=@sector,location=@location,delivery_date=@deliveryDate,status=@status,observation=@observation,updated_at=@updatedAt,updated_by=@updatedBy WHERE id=@id`)
    .run({ ...next, updatedAt: stamp(), updatedBy: user.id, id });
  audit(user,"box",id,"update",next);
}

function createTool(body: Record<string, unknown>, user: { id: number; nome: string }) {
  ensureTables();
  const boxId = numeric(body.boxId,"a caixa",1);
  const box = db.prepare("SELECT status FROM tool_boxes WHERE id=?").get(boxId) as { status: string } | undefined;
  if (!box || box.status === "inactive") throw new Error("Selecione uma caixa ativa.");
  const description = clean(body.description,"a descrição",true);
  const value = numeric(body.acquisitionValue ?? 0,"o valor de aquisição");
  const condition = clean(body.condition ?? "good","o estado de conservação",true);
  if (!TOOL_CONDITIONS.has(condition)) throw new Error("Estado de conservação inválido.");
  const now = stamp(); const code = nextCode(boxId);
  const result = db.prepare(`INSERT INTO tools(code,box_id,description,brand,model,measure,acquisition_value,acquisition_date,condition,status,observation,created_at,updated_at,created_by,updated_by)
    VALUES(?,?,?,?,?,?,?,?,?, ?,?,?,?,?,?)`).run(code,boxId,description,clean(body.brand,"a marca"),clean(body.model,"o modelo"),clean(body.measure,"a medida"),value,dateOrNull(body.acquisitionDate,"a data de aquisição"),condition,box.status === "in_use" ? "in_use" : "available",clean(body.observation,"a observação"),now,now,user.id,user.id);
  const id = Number(result.lastInsertRowid); audit(user,"tool",id,"create",{...body,code}); return id;
}

function updateTool(id: number, body: Record<string, unknown>, user: { id: number; nome: string }) {
  ensureTables();
  const current = db.prepare("SELECT * FROM tools WHERE id=?").get(id) as Record<string, unknown> | undefined;
  if (!current) throw new Error("Ferramenta não encontrada.");
  if (["lost","written_off"].includes(String(current.status))) throw new Error("Uma ferramenta perdida ou baixada não pode ser editada.");
  const boxId = numeric(body.boxId ?? current.box_id,"a caixa",1);
  if (boxId !== Number(current.box_id)) throw new Error("Use Transferência entre caixas para mover uma ferramenta, preservando o histórico do código.");
  const box = db.prepare("SELECT status FROM tool_boxes WHERE id=?").get(boxId) as { status: string } | undefined;
  if (!box || box.status === "inactive") throw new Error("Selecione uma caixa ativa.");
  const fields = {
    boxId, description: clean(body.description ?? current.description,"a descrição",true),
    brand: clean(body.brand ?? current.brand,"a marca"), model: clean(body.model ?? current.model,"o modelo"),
    measure: clean(body.measure ?? current.measure,"a medida"),
    acquisitionValue: numeric(body.acquisitionValue ?? current.acquisition_value,"o valor de aquisição"),
    acquisitionDate: dateOrNull(body.acquisitionDate ?? current.acquisition_date,"a data de aquisição"),
    condition: clean(body.condition ?? current.condition,"o estado de conservação",true),
    observation: clean(body.observation ?? current.observation,"a observação"),
  };
  if (!TOOL_CONDITIONS.has(fields.condition)) throw new Error("Estado de conservação inválido.");
  db.prepare(`UPDATE tools SET box_id=@boxId,description=@description,brand=@brand,model=@model,measure=@measure,
    acquisition_value=@acquisitionValue,acquisition_date=@acquisitionDate,condition=@condition,observation=@observation,updated_at=@updatedAt,updated_by=@updatedBy WHERE id=@id`)
    .run({ ...fields, updatedAt: stamp(), updatedBy: user.id, id });
  audit(user,"tool",id,"update",fields);
}

function addMovement(body: Record<string, unknown>, user: { id: number; nome: string }) {
  ensureTables();
  const type = clean(body.type,"o tipo de movimentação",true);
  const occurredAt = clean(body.occurredAt,"a data e hora",true);
  if (Number.isNaN(Date.parse(occurredAt))) throw new Error("Data/hora inválida.");
  const responsible = clean(body.responsible,"o responsável",true);
  const observation = clean(body.observation,"a observação");
  let toolId: number | null = null, boxId: number | null = null, fromBox: number | null = null, toBox: number | null = null;
  let fromResponsible = "", toResponsible = responsible, replacementToolId: number | null = null;
  const tx = db.transaction(() => {
    if (type === "deliver_box" || type === "return_box" || type === "transfer_responsibility") {
      boxId = numeric(body.boxId,"a caixa",1);
      const box = db.prepare("SELECT * FROM tool_boxes WHERE id=?").get(boxId) as { status: string; responsible: string; employee_number: string } | undefined;
      if (!box || box.status === "inactive") throw new Error("Caixa ativa não encontrada.");
      fromResponsible = box.responsible;
      if (type === "deliver_box") {
        if (box.status === "in_use") throw new Error("Esta caixa já está entregue.");
        if (!responsible) throw new Error("Informe o funcionário que receberá a caixa.");
        db.prepare("UPDATE tool_boxes SET status='in_use',responsible=?,employee_number=?,delivery_date=?,updated_at=?,updated_by=? WHERE id=?")
          .run(responsible,clean(body.employeeNumber,"a matrícula"),occurredAt.slice(0,10),stamp(),user.id,boxId);
        db.prepare("UPDATE tools SET status='in_use',updated_at=?,updated_by=? WHERE box_id=? AND status='available'").run(stamp(),user.id,boxId);
      } else if (type === "return_box") {
        if (box.status !== "in_use") throw new Error("A caixa não está entregue a um funcionário.");
        const borrowed = db.prepare("SELECT COUNT(*) AS n FROM tools WHERE box_id=? AND status='borrowed'").get(boxId) as {n:number};
        if (borrowed.n) throw new Error("Registre a devolução das ferramentas emprestadas antes de devolver a caixa.");
        toResponsible = "";
        db.prepare("UPDATE tool_boxes SET status='available',responsible='',employee_number='',updated_at=?,updated_by=? WHERE id=?").run(stamp(),user.id,boxId);
        db.prepare("UPDATE tools SET status='available',updated_at=?,updated_by=? WHERE box_id=? AND status='in_use'").run(stamp(),user.id,boxId);
      } else {
        if (box.status !== "in_use") throw new Error("Entregue a caixa antes de transferir a responsabilidade.");
        if (!responsible || responsible === box.responsible) throw new Error("Informe um novo responsável.");
        db.prepare("UPDATE tool_boxes SET responsible=?,employee_number=?,updated_at=?,updated_by=? WHERE id=?")
          .run(responsible,clean(body.employeeNumber,"a matrícula"),stamp(),user.id,boxId);
      }
    } else {
      toolId = numeric(body.toolId,"a ferramenta",1);
      const tool = db.prepare(`SELECT t.*,b.status AS box_status,b.responsible AS box_responsible,b.sector AS box_sector
        FROM tools t JOIN tool_boxes b ON b.id=t.box_id WHERE t.id=?`).get(toolId) as { code: string; description: string; status: string; box_id: number; condition: string; acquisition_value: number; box_status:string; box_responsible:string; box_sector:string } | undefined;
      if (!tool) throw new Error("Ferramenta não encontrada.");
      fromBox = tool.box_id;
      fromResponsible = tool.box_responsible || "Na caixa";
      toResponsible = tool.box_responsible;
      if (tool.status === "lost" || tool.status === "written_off") throw new Error("A ferramenta está perdida ou baixada e não pode ser movimentada.");
      if (type === "withdraw_tool") {
        if (tool.status !== "available" && tool.status !== "in_use") throw new Error("Somente ferramentas disponíveis ou em utilização na caixa podem ser retiradas.");
        if (!responsible) throw new Error("Informe o responsável que retirou a ferramenta.");
        toResponsible = responsible;
        db.prepare("UPDATE tools SET status='borrowed',updated_at=?,updated_by=? WHERE id=?").run(stamp(),user.id,toolId);
      } else if (type === "return_tool") {
        if (tool.status !== "in_use" && tool.status !== "borrowed") throw new Error("A ferramenta não está em uso ou emprestada.");
        fromResponsible = responsible;
        const boxState = db.prepare("SELECT status FROM tool_boxes WHERE id=?").get(tool.box_id) as {status:string};
        const boxOwner = db.prepare("SELECT responsible FROM tool_boxes WHERE id=?").get(tool.box_id) as {responsible:string};
        toResponsible = boxOwner.responsible || "Na caixa";
        db.prepare("UPDATE tools SET status=?,updated_at=?,updated_by=? WHERE id=?").run(boxState.status === "in_use" ? "in_use" : "available",stamp(),user.id,toolId);
      } else if (type === "transfer_tool") {
        if (tool.status !== "available" && tool.status !== "in_use") throw new Error("Somente ferramenta disponível ou em utilização na caixa pode ser transferida.");
        toBox = numeric(body.destinationBoxId,"a caixa de destino",1);
        const dest = db.prepare("SELECT status,responsible FROM tool_boxes WHERE id=?").get(toBox) as { status: string; responsible:string } | undefined;
        if (!dest || dest.status === "inactive") throw new Error("A caixa de destino não está ativa.");
        if (toBox === fromBox) throw new Error("A ferramenta já pertence a essa caixa.");
        toResponsible = dest.responsible || "Na caixa";
        db.prepare("UPDATE tools SET box_id=?,status=?,updated_at=?,updated_by=? WHERE id=?").run(toBox,dest.status === "in_use" ? "in_use" : "available",stamp(),user.id,toolId);
      } else if (type === "send_maintenance") {
        if (tool.status !== "available" && tool.status !== "in_use") throw new Error("Somente ferramentas disponíveis ou em utilização na caixa podem ir para manutenção.");
        toResponsible = "Manutenção";
        db.prepare("UPDATE tools SET status='maintenance',updated_at=?,updated_by=? WHERE id=?").run(stamp(),user.id,toolId);
      } else if (type === "return_maintenance") {
        if (tool.status !== "maintenance") throw new Error("A ferramenta não está em manutenção.");
        fromResponsible = "Manutenção";
        toResponsible = tool.box_responsible || "Na caixa";
        const boxState = db.prepare("SELECT status FROM tool_boxes WHERE id=?").get(tool.box_id) as {status:string};
        db.prepare("UPDATE tools SET status=?,condition='good',updated_at=?,updated_by=? WHERE id=?").run(boxState.status === "in_use" ? "in_use" : "available",stamp(),user.id,toolId);
      } else if (type === "replace_tool") {
        const replacement = body.replacement as Record<string, unknown> | undefined;
        if (!replacement) throw new Error("Informe os dados da ferramenta substituta.");
        const newCode = nextCode(tool.box_id);
        const now = stamp();
        const boxState = db.prepare("SELECT status FROM tool_boxes WHERE id=?").get(tool.box_id) as {status:string};
        const newId = Number(db.prepare(`INSERT INTO tools(code,box_id,description,brand,model,measure,acquisition_value,acquisition_date,condition,status,observation,created_at,updated_at,created_by,updated_by)
          VALUES(?,?,?,?,?,?,?,?,?, ?,?,?,?,?,?)`).run(newCode,tool.box_id,clean(replacement.description,"a descrição da substituta",true),clean(replacement.brand,"a marca"),clean(replacement.model,"o modelo"),clean(replacement.measure,"a medida"),numeric(replacement.acquisitionValue??0,"o valor de aquisição"),dateOrNull(replacement.acquisitionDate,"a data de aquisição"),clean(replacement.condition??"good","o estado de conservação",true),boxState.status === "in_use" ? "in_use" : "available",clean(replacement.observation,"a observação"),now,now,user.id,user.id).lastInsertRowid);
        db.prepare("UPDATE tools SET status='written_off',updated_at=?,updated_by=? WHERE id=?").run(now,user.id,toolId);
        db.prepare(`INSERT INTO tool_writeoffs(tool_id,reason,value,responsible,sector,occurred_at,observation,created_by,created_by_name) VALUES(?,'descarte',?,?,?,?,?,?,?)`)
          .run(toolId,tool.acquisition_value,responsible,tool.box_sector,occurredAt,`${observation}${observation ? " · " : ""}Substituída por ${newCode}`,user.id,user.nome);
        replacementToolId = newId;
        toResponsible = `Substituição ${newCode}`;
        audit(user,"tool",newId,"create_replacement",{replaces:toolId,code:newCode});
      } else {
        throw new Error("Tipo de movimentação desconhecido.");
      }
    }
    const result = db.prepare(`INSERT INTO tool_movements(movement_type,tool_id,box_id,from_box_id,to_box_id,from_responsible,to_responsible,responsible,occurred_at,observation,replacement_tool_id,performed_by,performed_by_name)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(type,toolId,boxId,fromBox,toBox,fromResponsible,toResponsible,responsible,occurredAt,observation,replacementToolId,user.id,user.nome);
    const movementId = Number(result.lastInsertRowid);
    audit(user,"movement",movementId,type,{toolId,boxId,fromBox,toBox,responsible,replacementToolId,observation});
    return movementId;
  });
  return tx();
}

function addInspection(body: Record<string, unknown>, user: { id: number; nome: string }) {
  ensureTables();
  const boxId = numeric(body.boxId,"a caixa",1);
  const checkedAt = clean(body.checkedAt ?? stamp(),"a data da conferência",true);
  if (Number.isNaN(Date.parse(checkedAt))) throw new Error("Data da conferência inválida.");
  const responsible = clean(body.responsible,"o responsável",true);
  const observation = clean(body.observation,"a observação");
  const items = Array.isArray(body.items) ? body.items as Array<Record<string, unknown>> : [];
  const tx = db.transaction(() => {
    const box = db.prepare("SELECT status FROM tool_boxes WHERE id=?").get(boxId) as { status: string } | undefined;
    if (!box || box.status === "inactive") throw new Error("Caixa ativa não encontrada.");
    const current = db.prepare("SELECT id,code,description FROM tools WHERE box_id=? AND status!='written_off' ORDER BY code").all(boxId) as {id:number;code:string;description:string}[];
    if (!current.length) throw new Error("A caixa não possui ferramentas para conferir.");
    if (items.length !== current.length) throw new Error("A conferência deve conter todas as ferramentas atuais da caixa.");
    const byId = new Map(items.map((item) => [Number(item.toolId), item]));
    if (current.some((tool) => !byId.has(tool.id))) throw new Error("A lista da conferência não corresponde às ferramentas atuais da caixa.");
    let present = 0;
    for (const tool of current) {
      const item = byId.get(tool.id)!;
      const status = String(item.status ?? "");
      if (!INSPECTION_STATES.has(status)) throw new Error("Situação de conferência inválida.");
      if (status === "present") present++;
    }
    const compliance = Math.round((present / current.length) * 10000) / 100;
    const result = db.prepare(`INSERT INTO tool_inspections(box_id,checked_at,responsible,compliance,observation,performed_by,performed_by_name) VALUES(?,?,?,?,?,?,?)`)
      .run(boxId,checkedAt,responsible,compliance,observation,user.id,user.nome);
    const inspectionId = Number(result.lastInsertRowid);
    const insert = db.prepare(`INSERT INTO tool_inspection_items(inspection_id,tool_id,tool_code,tool_description,item_status,observation) VALUES(?,?,?,?,?,?)`);
    for (const tool of current) {
      const item = byId.get(tool.id)!; const status = String(item.status);
      const note = clean(item.observation,"a observação do item");
      insert.run(inspectionId,tool.id,tool.code,tool.description,status,note);
      if (status === "damaged") db.prepare("UPDATE tools SET condition='damaged',updated_at=?,updated_by=? WHERE id=?").run(stamp(),user.id,tool.id);
      if (status === "maintenance") db.prepare("UPDATE tools SET status='maintenance',updated_at=?,updated_by=? WHERE id=?").run(stamp(),user.id,tool.id);
    }
    audit(user,"inspection",inspectionId,"create",{boxId,compliance,items});
    return inspectionId;
  });
  return tx();
}

function addWriteoff(body: Record<string, unknown>, user: { id: number; nome: string }) {
  ensureTables();
  const toolId = numeric(body.toolId,"a ferramenta",1);
  const reason = clean(body.reason,"o motivo",true).toLowerCase();
  if (!WRITEOFF_REASONS.has(reason)) throw new Error("Motivo de baixa inválido.");
  const occurredAt = clean(body.occurredAt ?? stamp(),"a data da baixa",true);
  if (Number.isNaN(Date.parse(occurredAt))) throw new Error("Data da baixa inválida.");
  const responsible = clean(body.responsible,"o responsável",true);
  const observation = clean(body.observation,"a observação");
  const tx = db.transaction(() => {
    const tool = db.prepare(`SELECT t.*,b.sector AS box_sector FROM tools t JOIN tool_boxes b ON b.id=t.box_id WHERE t.id=?`).get(toolId) as {code:string;description:string;status:string;box_id:number;acquisition_value:number;box_sector:string}|undefined;
    if (!tool) throw new Error("Ferramenta não encontrada.");
    if (tool.status === "written_off" || tool.status === "lost") throw new Error("A ferramenta já está perdida ou baixada.");
    const result = db.prepare(`INSERT INTO tool_writeoffs(tool_id,reason,value,responsible,sector,occurred_at,observation,created_by,created_by_name) VALUES(?,?,?,?,?,?,?,?,?)`)
      .run(toolId,reason,tool.acquisition_value,responsible,tool.box_sector,occurredAt,observation,user.id,user.nome);
    const status = reason === "perda" || reason === "extravio" ? "lost" : "written_off";
    db.prepare("UPDATE tools SET status=?,updated_at=?,updated_by=? WHERE id=?").run(status,stamp(),user.id,toolId);
    const movement = Number(db.prepare(`INSERT INTO tool_movements(movement_type,tool_id,from_box_id,responsible,occurred_at,observation,performed_by,performed_by_name)
      VALUES('writeoff',?,?,?,?,?,?,?)`).run(toolId,tool.box_id,responsible,occurredAt,`${reason}${observation ? ` · ${observation}` : ""}`,user.id,user.nome).lastInsertRowid);
    audit(user,"writeoff",Number(result.lastInsertRowid),"create",{toolId,reason,value:tool.acquisition_value,responsible,occurredAt,observation});
    audit(user,"movement",movement,"writeoff",{toolId,reason});
    return Number(result.lastInsertRowid);
  });
  return tx();
}

function gate(req: Request, res: Response, next: NextFunction) {
  const user = verifySessionToken(readBearerToken(req.headers.authorization));
  if (!user) return res.status(401).json({ error: "Sessão expirada ou inválida." });
  const permissions = user.permissions ?? [];
  if (!permissions.length || permissions.includes("admin")) { res.locals.toolUser = user; return next(); }
  const group = db.prepare("SELECT id FROM external_site_groups WHERE native_key='indicadores' LIMIT 1").get() as {id:number}|undefined;
  const groupKey = group ? siteGroupPermissionKey(group.id) : "";
  const nativeKeys = db.prepare("SELECT permission_key FROM user_permissions WHERE user_id=? AND permission_key LIKE 'nativeTab:indicadores:%'").all(user.id)
    .map((row) => String((row as {permission_key:string}).permission_key));
  const scopedNativeKeys = nativeKeys.filter((key) => !key.endsWith(":edit"));
  const hasInnerControls = scopedNativeKeys.length > 0;
  const canView = canAccessPermission(permissions, BASE) || (groupKey ? canAccessPermission(permissions, groupKey) && !hasInnerControls : false);
  if (!canView) return res.status(403).json({ error: "Sem acesso ao Controle de Ferramentas." });
  const canEdit = canEditPermission(permissions, BASE) || Boolean(groupKey && !hasInnerControls && canEditPermission(permissions, groupKey));
  if (!canEdit && req.method !== "GET" && req.method !== "HEAD") {
    return res.status(403).json({ error: "Você tem acesso somente para consulta ao Controle de Ferramentas." });
  }
  res.locals.toolUser = user;
  return next();
}

export function registerAutomotivoFerramentasRoutes(app: Express) {
  ensureTables();
  app.use("/api/indicadores/controle-ferramentas", gate);
  app.get("/api/indicadores/controle-ferramentas", async (_req, res) => {
    try { res.json(await records()); } catch (e) { res.status(503).json({ error: e instanceof Error ? e.message : "Não foi possível consultar o Oracle e as ferramentas." }); }
  });
}
