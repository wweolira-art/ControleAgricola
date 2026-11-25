import { useEffect, useMemo, useState, type FormEvent } from "react";
import { api, type ToolBoxRecord, type ToolControlData, type ToolRecord } from "../../api";
import { useCanEditItems } from "../../lib/editAccess";
import { ConsultaProgressBar } from "../ConsultaProgressBar";

type View = "dashboard" | "boxes" | "tools" | "movements" | "inspections" | "writeoffs" | "reports" | "relatorio-ferramentas";
type MovementType = "deliver_box" | "return_box" | "withdraw_tool" | "return_tool" | "transfer_tool" | "transfer_responsibility" | "send_maintenance" | "return_maintenance" | "replace_tool";
const VIEWS: Array<{ id: View; label: string }> = [
  { id: "dashboard", label: "Dashboard" },
  { id: "relatorio-ferramentas", label: "Relatório de ferramentas" },
];
const STATUS: Record<string, string> = { available: "Disponível", in_use: "Em uso", borrowed: "Com responsável", lost: "Perdida", maintenance: "Em manutenção", written_off: "Baixada", inactive: "Inativa", present: "Presente", missing: "Faltante", damaged: "Danificada" };
STATUS.good = "Bom"; STATUS.regular = "Regular"; STATUS.not_informed = "Não informado no Oracle";
const MOVEMENTS: Array<{ id: MovementType; label: string }> = [
  { id: "deliver_box", label: "Entrega de caixa ao funcionário" }, { id: "return_box", label: "Devolução de caixa" },
  { id: "withdraw_tool", label: "Retirada de ferramenta" }, { id: "return_tool", label: "Devolução de ferramenta" },
  { id: "transfer_tool", label: "Transferência entre caixas" }, { id: "transfer_responsibility", label: "Transferência de responsabilidade" },
  { id: "send_maintenance", label: "Envio para manutenção" }, { id: "return_maintenance", label: "Retorno da manutenção" },
  { id: "replace_tool", label: "Substituição de ferramenta" },
];
const movementLabel = (type: string) => type === "oracle_delivery" ? "Entrega registrada no Oracle"
  : type === "oracle_return" ? "Devolução registrada no Oracle"
  : type === "oracle_maintenance" ? "Envio para manutenção no Oracle"
  : type === "oracle_maintenance_return" ? "Retorno da manutenção no Oracle"
  : MOVEMENTS.find((item) => item.id === type)?.label ?? type;
const today = () => new Date().toISOString().slice(0, 10);
const localDateTime = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}T${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`; };
const brl = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(n)||0);
const dateBR = (value?: string | null) => value ? new Date(value.length === 10 ? `${value}T12:00:00` : value).toLocaleString("pt-BR") : "—";
const errorText = (e: unknown) => e instanceof Error ? e.message : String(e);

function emptyBox() { return { boxNumber:"",description:"",responsible:"",employeeNumber:"",sector:"",location:"",deliveryDate:"",status:"available",observation:"" }; }
function emptyTool() { return { boxId:"",description:"",brand:"",model:"",measure:"",acquisitionValue:"",acquisitionDate:"",condition:"good",observation:"" }; }
function emptyMovement() { return { type:"withdraw_tool" as MovementType,toolId:"",boxId:"",destinationBoxId:"",responsible:"",employeeNumber:"",occurredAt:localDateTime(),observation:"",replacementDescription:"",replacementBrand:"",replacementModel:"",replacementMeasure:"",replacementValue:"",replacementDate:today(),replacementCondition:"good",replacementObservation:"" }; }
function FormField({ label, children }: { label: string; children: React.ReactNode }) { return <label className="tool-field"><span>{label}</span>{children}</label>; }
function PageTitle({ title, note }: { title: string; note?: string }) { return <div className="tool-page-title"><div><h2>{title}</h2>{note && <p>{note}</p>}</div></div>; }
function StatusPill({ value }: { value: string }) { return <span className={`tool-status tool-status--${value}`}>{STATUS[value] ?? value}</span>; }
function Empty({ children = "Nenhum registro encontrado." }: { children?: string }) { return <div className="tool-empty">{children}</div>; }

export function IndicadoresControleFerramentas() {
  const canEdit = useCanEditItems();
  const [data, setData] = useState<ToolControlData | null>(null);
  const [view, setView] = useState<View>("dashboard");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [boxForm, setBoxForm] = useState(emptyBox());
  const [editingBox, setEditingBox] = useState<number | null>(null);
  const [toolForm, setToolForm] = useState(emptyTool());
  const [editingTool, setEditingTool] = useState<number | null>(null);
  const [movement, setMovement] = useState(emptyMovement());
  const [inspectionBox, setInspectionBox] = useState("");
  const [inspectionResponsible, setInspectionResponsible] = useState("");
  const [inspectionItems, setInspectionItems] = useState<Record<number,{status:string;observation:string}>>({});
  const [writeoff, setWriteoff] = useState({ toolId:"",reason:"perda",responsible:"",occurredAt:localDateTime(),observation:"" });
  const [reportType, setReportType] = useState("boxes");
  const [reportFilter, setReportFilter] = useState("");
  const [funcionarioFiltro, setFuncionarioFiltro] = useState("");
  const [baixaFiltro, setBaixaFiltro] = useState("");
  const [pageSize] = useState(10);

  const load = async () => {
    setLoading(true); setError("");
    try { setData(await api.ferramentasData()); } catch (e) { setError(errorText(e)); } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  const boxes = data?.boxes ?? [];
  const tools = data?.tools ?? [];
  const localBoxes = boxes.filter((box) => box.source !== "oracle");
  const localTools = tools.filter((tool) => tool.source !== "oracle");

  const runSave = async (action: () => Promise<unknown>, message: string) => {
    setSaving(true); setError(""); setNotice("");
    try { await action(); setNotice(message); await load(); }
    catch (e) { setError(errorText(e)); }
    finally { setSaving(false); }
  };
  const submitBox = (event: FormEvent) => {
    event.preventDefault();
    void runSave(() => editingBox ? api.ferramentasEditarCaixa(editingBox,boxForm) : api.ferramentasCriarCaixa(boxForm), editingBox ? "Caixa atualizada." : "Caixa cadastrada.");
    setBoxForm(emptyBox()); setEditingBox(null);
  };
  const editBox = (box: ToolBoxRecord) => {
    setEditingBox(box.id); setBoxForm({ boxNumber:box.box_number,description:box.description,responsible:box.responsible,employeeNumber:box.employee_number,sector:box.sector,location:box.location,deliveryDate:box.delivery_date ?? "",status:box.status,observation:box.observation });
    document.getElementById("tool-box-form")?.scrollIntoView({ behavior:"smooth",block:"start" });
  };
  const submitTool = (event: FormEvent) => {
    event.preventDefault();
    void runSave(() => editingTool ? api.ferramentasEditarFerramenta(editingTool,toolForm) : api.ferramentasCriarFerramenta(toolForm), editingTool ? "Ferramenta atualizada." : "Ferramenta cadastrada.");
    setToolForm(emptyTool()); setEditingTool(null);
  };
  const editTool = (tool: ToolRecord) => {
    setEditingTool(tool.id); setToolForm({boxId:String(tool.box_id),description:tool.description,brand:tool.brand,model:tool.model,measure:tool.measure,acquisitionValue:String(tool.acquisition_value),acquisitionDate:tool.acquisition_date ?? "",condition:tool.condition,observation:tool.observation});
    document.getElementById("tool-tool-form")?.scrollIntoView({behavior:"smooth",block:"start"});
  };

  const selectedInspectionTools = useMemo(() => tools.filter((tool) => tool.source !== "oracle" && tool.box_id === Number(inspectionBox) && tool.status !== "written_off"), [tools,inspectionBox]);
  useEffect(() => {
    setInspectionItems(Object.fromEntries(selectedInspectionTools.map((tool) => [tool.id,{status:"present",observation:""}])));
  }, [inspectionBox, data?.tools.length]);

  const summary = data?.summary;
  const statusData = [
    { label: "Perdidas", value: summary?.lost ?? 0, color: "#d92332" },
    { label: "Em uso", value: (summary?.in_use ?? 0) + (summary?.borrowed ?? 0), color: "#1769d2" },
    { label: "Disponíveis", value: summary?.available ?? 0, color: "#168653" },
  ];
  const totalSituacoes = statusData.reduce((sum, item) => sum + item.value, 0);
  const totalTools = summary?.tools ?? 0;
  let donutPosition = 0;
  const donutStops = statusData.map((item) => {
    const start = donutPosition; donutPosition += totalSituacoes ? item.value / totalSituacoes * 100 : 0;
    return `${item.color} ${start}% ${donutPosition}%`;
  }).join(", ");
  const boxesTop = [...boxes].sort((a,b) => b.tool_count-a.tool_count).slice(0,8);
  const monthLosses = data?.monthlyLosses.slice(-12) ?? [];
  const maxLoss = Math.max(1,...monthLosses.map((row)=>row.count));
  const latestMissing = data?.missingByBox ?? [];

  const filteredBoxes = boxes.filter((box) => [box.box_number,box.description,box.responsible,box.sector,box.location].join(" ").toLowerCase().includes(search.toLowerCase()));
  const filteredTools = tools.filter((tool) => [tool.code,tool.description,tool.brand,tool.model,tool.box_number,tool.status].join(" ").toLowerCase().includes(search.toLowerCase()));
  const ferramentasRelatorio = tools.filter((tool) => {
    const nome = tool.holder_name || (tool.source === "local" ? tool.box_responsible : "");
    const normalizar = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    return normalizar(nome || "").includes(normalizar(funcionarioFiltro.trim())) && (!baixaFiltro || String(tool.baixa_code ?? "") === baixaFiltro);
  });
  const filteredMovements = (data?.movements ?? []).filter((row) => [row.movement_type,row.tool_code,row.tool_description,row.box_number,row.performed_by_name,row.responsible].join(" ").toLowerCase().includes(search.toLowerCase()));
  const pagination = (count:number,label:string) => <div className="tool-pagination"><span>{count} {label}</span><div><button className="btn" disabled={page<=1} onClick={()=>setPage((p)=>p-1)}>Anterior</button><span>{page} / {Math.max(1,Math.ceil(count/pageSize))}</span><button className="btn" disabled={page*pageSize>=count} onClick={()=>setPage((p)=>p+1)}>Próxima</button></div></div>;
  const pageRows = <T,>(rows: T[]) => rows.slice((page-1)*pageSize,page*pageSize);

  const reportRows = useMemo(() => {
    const q = reportFilter.trim().toLowerCase();
    const src = data;
    if (!src) return [] as Array<Record<string,unknown>>;
    let rows: Array<Record<string,unknown>>;
    if (reportType === "boxes") rows = src.tools.map((tool)=>({caixa:tool.box_number,descricao_caixa:tool.box_description,codigo:tool.code,ferramenta:tool.description,situacao:STATUS[tool.status],valor:tool.acquisition_value}));
    else if (reportType === "tools" || reportType === "asset") rows = src.tools.map((tool)=>({codigo:tool.code,caixa:tool.box_number,ferramenta:tool.description,marca:tool.brand,modelo:tool.model,valor_aquisicao:tool.acquisition_value,situacao:STATUS[tool.status]}));
    else if (reportType === "employee") rows = src.tools.filter((tool)=>tool.box_responsible).map((tool)=>({funcionario:tool.box_responsible,matricula:tool.box_employee_number,setor:tool.box_sector,caixa:tool.box_number,codigo:tool.code,ferramenta:tool.description,situacao:STATUS[tool.status]}));
    else if (reportType === "missing") rows = src.inspectionItems.filter((item)=>item.item_status==="missing").map((item)=>({data:dateBR(item.checked_at),caixa:item.box_number,codigo:item.tool_code,ferramenta:item.tool_description,situacao:STATUS[item.item_status],observacao:item.observation}));
    else if (reportType === "movements") rows = src.movements.map((row)=>({data:dateBR(row.occurred_at),movimentacao:MOVEMENTS.find((x)=>x.id===row.movement_type)?.label??row.movement_type,codigo:row.tool_code,caixa:row.box_number,responsavel:row.responsible,usuario:row.performed_by_name,observacao:row.observation}));
    else if (reportType === "inspections") rows = src.inspections.map((row)=>({data:dateBR(row.checked_at),caixa:row.box_number,responsavel:row.responsible,conformidade:row.compliance,faltantes:row.missing_count,conferido_por:row.performed_by_name}));
    else if (reportType === "loss_employee" || reportType === "loss_sector") {
      const grouped = new Map<string,{registros:number;valor:number}>();
      for (const writeoff of src.writeoffs) {
        const key = reportType === "loss_employee" ? writeoff.responsible || "Sem responsável" : writeoff.sector || "Sem setor";
        const row = grouped.get(key) ?? {registros:0,valor:0}; row.registros++; row.valor += writeoff.value; grouped.set(key,row);
      }
      rows = [...grouped].map(([nome,value])=>({[reportType === "loss_employee" ? "responsavel" : "setor"]:nome,...value}));
    } else rows = src.writeoffs.map((row)=>({data:dateBR(row.occurred_at),codigo:row.tool_code,ferramenta:row.tool_description,caixa:row.box_number,motivo:row.reason,valor:row.value,responsavel:row.responsible,usuario:row.created_by_name}));
    if (q) rows = rows.filter((row)=>Object.values(row).join(" ").toLowerCase().includes(q));
    return rows;
  },[data,reportFilter,reportType]);

  const exportExcel = async () => {
    if (!reportRows.length) return;
    const { default: ExcelJS } = await import("exceljs");
    const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet("Relatório");
    sheet.columns = Object.keys(reportRows[0]).map((key)=>({header:key,width:Math.min(32,Math.max(14,key.length+4))}));
    for (const row of reportRows) sheet.addRow(Object.values(row));
    sheet.getRow(1).font={bold:true,color:{argb:"FFFFFFFF"}}; sheet.getRow(1).fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF123A67"}};
    const buffer=await workbook.xlsx.writeBuffer(); const url=URL.createObjectURL(new Blob([buffer])); const a=document.createElement("a"); a.href=url; a.download=`controle-ferramentas-${reportType}.xlsx`; a.click(); URL.revokeObjectURL(url);
  };

  const submitMovement = (event: FormEvent) => {
    event.preventDefault(); const b: Record<string,unknown> = {...movement, occurredAt:new Date(movement.occurredAt).toISOString()};
    if (movement.toolId) b.toolId=Number(movement.toolId); if(movement.boxId)b.boxId=Number(movement.boxId); if(movement.destinationBoxId)b.destinationBoxId=Number(movement.destinationBoxId);
    if(movement.type==="replace_tool") b.replacement={description:movement.replacementDescription,brand:movement.replacementBrand,model:movement.replacementModel,measure:movement.replacementMeasure,acquisitionValue:Number(movement.replacementValue||0),acquisitionDate:movement.replacementDate,condition:movement.replacementCondition,observation:movement.replacementObservation};
    void runSave(()=>api.ferramentasMovimentar(b),"Movimentação registrada no histórico."); setMovement(emptyMovement());
  };
  const submitInspection = (event: FormEvent) => {
    event.preventDefault(); const items=selectedInspectionTools.map((tool)=>({toolId:tool.id,...inspectionItems[tool.id]}));
    void runSave(()=>api.ferramentasConferir({boxId:Number(inspectionBox),checkedAt:new Date().toISOString(),responsible:inspectionResponsible,items}),"Conferência salva com histórico e percentual de conformidade.");
    setInspectionResponsible("");
  };
  const submitWriteoff = (event: FormEvent) => {
    event.preventDefault(); void runSave(()=>api.ferramentasBaixar({...writeoff,toolId:Number(writeoff.toolId),occurredAt:new Date(writeoff.occurredAt).toISOString()}),"Baixa registrada. A ferramenta permanece no histórico."); setWriteoff({toolId:"",reason:"perda",responsible:"",occurredAt:localDateTime(),observation:""});
  };

  return <div className="tool-control-page">
    <header className="tool-control-header"><div><span className="tool-eyebrow">AUTOMOTIVO · PATRIMÔNIO</span><h1>Controle de Ferramentas</h1><p>Cadastro, entrega, conferência física e histórico de ferramentas por caixa.</p></div><div className="tool-header-meta"><span className="tool-online"><i/>Sistema operacional</span><button className="btn" onClick={()=>void load()} disabled={loading}>Atualizar dados</button></div></header>
    <nav className="tool-tabs" aria-label="Controle de Ferramentas">{VIEWS.map((item)=><button key={item.id} className={view===item.id?"active":""} onClick={()=>{setView(item.id);setPage(1);setSearch("");setError("");setNotice("");}}>{item.label}</button>)}</nav>
    {error && <div className="tool-message tool-message--error" role="alert">{error}</div>}{notice && <div className="tool-message tool-message--ok" role="status">{notice}</div>}
    {data?.dataSource && <div className="tool-message tool-message--source" role="note"><b>Fonte: Oracle</b> · {data.dataSource.oracleBoxCount} caixas e {data.dataSource.oracleToolCount} ferramentas. {data.dataSource.warning}</div>}
    {loading && !data ? <ConsultaProgressBar active label="Carregando caixas e ferramentas do banco…" className="consulta-progress--compact"/> : null}
    {!loading && !data ? <Empty>{`Não foi possível carregar os registros. ${error}`}</Empty> : null}

    {view==="dashboard" && data && <>
      {boxes.length === 0 && tools.length === 0 && <section className="tool-panel tool-empty-state">
        <h2>O controle ainda não tem caixas ou ferramentas cadastradas</h2>
        <p>Os indicadores vêm do cadastro persistido deste módulo. Cadastre a primeira caixa e depois inclua as ferramentas para começar a acompanhar o inventário.</p>
      </section>}
      <div className="tool-kpi-grid">
        <article className="tool-kpi tool-kpi--blue"><span>Total de caixas</span><strong>{summary?.boxes ?? 0}</strong><small>cadastros históricos</small></article>
        <article className="tool-kpi tool-kpi--green"><span>Total de ferramentas</span><strong>{totalTools}</strong><small>inclui itens baixados</small></article>
        <article className="tool-kpi"><span>Disponíveis</span><strong>{summary?.available ?? 0}</strong><small>prontas para uso</small></article>
        <article className="tool-kpi"><span>Em uso</span><strong>{(summary?.in_use ?? 0) + (summary?.borrowed ?? 0)}</strong><small>atribuídas à operação</small></article>
        <article className="tool-kpi tool-kpi--red"><span>Perdidas</span><strong>{summary?.lost ?? 0}</strong><small>tipo de baixa Perdida</small></article>
        <article className="tool-kpi tool-kpi--orange"><span>Em manutenção</span><strong>{summary?.maintenance ?? 0}</strong><small>em reparo</small></article>
        <article className="tool-kpi tool-kpi--yellow"><span>Caixas pendentes</span><strong>{latestMissing.length}</strong><small>com ferramenta faltante na última conferência</small></article>
      </div>
      <div className="tool-dashboard-grid">
        <section className="tool-panel"><h3>Ferramentas perdidas, em uso e disponíveis</h3><div className="tool-donut-layout"><div className="tool-donut" style={{background:totalSituacoes?`conic-gradient(${donutStops})`:"#dbe5f1"}}><div><strong>{totalSituacoes}</strong><small>Total</small></div></div><ul className="tool-legend">{statusData.map((item)=><li key={item.label}><i style={{background:item.color}}/><span>{item.label}</span><b>{item.value}</b><small>{totalSituacoes?((item.value/totalSituacoes)*100).toFixed(1):"0.0"}%</small></li>)}</ul></div></section>
        <section className="tool-panel"><h3>Quantidade por caixa</h3><div className="tool-bars">{boxesTop.map((box)=><div className="tool-bar-column" key={box.id} title={`${box.box_number}: ${box.tool_count} ferramentas`}><b>{box.tool_count}</b><div style={{height:`${Math.max(4,box.tool_count/Math.max(1,...boxesTop.map((x)=>x.tool_count))*150)}px`}}/><small>{box.box_number}</small></div>)}{!boxesTop.length&&<Empty/>}</div></section>
        <section className="tool-panel"><h3>Perdas e baixas por mês</h3><div className="tool-bars tool-bars--monthly">{monthLosses.map((row)=><div className="tool-bar-column" key={row.month} title={`${row.count} baixas · ${brl(row.value)}`}><b>{row.count}</b><div className="tool-bar-column__red" style={{height:`${Math.max(4,row.count/maxLoss*130)}px`}}/><small>{row.month.slice(5)}/{row.month.slice(2,4)}</small></div>)}{!monthLosses.length&&<Empty>Sem perdas ou baixas registradas.</Empty>}</div></section>
        <section className="tool-panel"><h3>Caixas com mais pendências</h3>{latestMissing.length?<ol className="tool-ranking">{latestMissing.slice(0,8).map((row)=><li key={row.boxId}><span><b>{row.boxNumber}</b> · {row.description}</span><strong>{row.missing} faltante(s)</strong></li>)}</ol>:<Empty>Nenhuma pendência na última conferência.</Empty>}</section>
        <section className="tool-panel tool-panel--wide"><h3>Caixas e ferramentas</h3><div className="tool-table-wrap"><table className="tool-table"><thead><tr><th>Caixa</th><th>Descrição</th><th>Quantidade</th><th>Valor estimado das ferramentas</th><th>Setor</th><th>Situação</th></tr></thead><tbody>{boxes.map((box)=>{ const itens = tools.filter((tool)=>tool.box_id===box.id); return <tr key={box.id}><td>{box.box_number}</td><td>{box.description}</td><td>{itens.length}</td><td>{brl(itens.reduce((sum,tool)=>sum+tool.acquisition_value,0))}</td><td>{box.sector||"—"}</td><td><StatusPill value={box.status}/></td></tr>})}</tbody></table>{!boxes.length&&<Empty>Não há caixas cadastradas.</Empty>}</div><p className="tool-hint">O valor das ferramentas Oracle é estimado pela última entrada do material.</p></section>
      </div>
      <div className="tool-bottom-kpis"><span>Baixadas <b>{summary?.written_off??0}</b></span><span>Valor patrimonial <b>{brl(tools.reduce((a,t)=>a+t.acquisition_value,0))}</b></span><span>Valor das baixas <b>{brl(data.writeoffs.reduce((a,w)=>a+w.value,0))}</b></span></div>
    </>}

    {view==="relatorio-ferramentas" && data && <section className="tool-panel">
      <div className="tool-table-head"><h3>Relatório de ferramentas</h3><div className="tool-report-tools">
        <label>Funcionário <input type="search" value={funcionarioFiltro} placeholder="Nome do funcionário" onChange={(e)=>{setFuncionarioFiltro(e.target.value);setPage(1)}} /></label>
        <label>Tipo de baixa <select value={baixaFiltro} onChange={(e)=>{setBaixaFiltro(e.target.value);setPage(1)}}><option value="">Todos</option><option value="1">Devolução</option><option value="21">Rotina</option><option value="41">Demitido</option><option value="61">Perdida</option></select></label>
      </div></div>
      <div className="tool-table-wrap"><table className="tool-table"><thead><tr><th>Identificação</th><th>Descrição</th><th>Responsável</th><th>Caixa</th><th>Valor estimado</th><th>Data inicial</th><th>Tipo de baixa</th></tr></thead><tbody>{pageRows(ferramentasRelatorio).map((tool)=><tr key={tool.id}><td>{tool.code}</td><td>{tool.description}</td><td>{tool.holder_name || (tool.source === "local" ? tool.box_responsible : "") || "—"}</td><td><span style={tool.box_number === "Sem caixa vinculada" ? {color:"#c41e2b",fontWeight:700} : undefined}>{tool.box_number || "—"}</span></td><td>{brl(tool.acquisition_value)}</td><td>{dateBR(tool.acquisition_date)}</td><td>{tool.baixa_reason || "—"}</td></tr>)}</tbody></table>{!ferramentasRelatorio.length&&<Empty/>}</div>
      <p className="tool-hint">Responsáveis com entrega aberta; valor Oracle estimado pela última entrada do material.</p>{pagination(ferramentasRelatorio.length,"ferramentas")}
    </section>}
    {view==="boxes" && data && <>
      {canEdit&&<form id="tool-box-form" className="tool-panel tool-form" onSubmit={submitBox}><h3>{editingBox?"Editar caixa":"Cadastrar caixa"}</h3><div className="tool-form-grid">
        <FormField label="Número da caixa"><input required value={boxForm.boxNumber} onChange={(e)=>setBoxForm({...boxForm,boxNumber:e.target.value})}/></FormField>
        <FormField label="Descrição"><input required value={boxForm.description} onChange={(e)=>setBoxForm({...boxForm,description:e.target.value})}/></FormField>
        <FormField label="Responsável"><input disabled={!!editingBox} value={boxForm.responsible} onChange={(e)=>setBoxForm({...boxForm,responsible:e.target.value})}/></FormField>
        <FormField label="Matrícula"><input disabled={!!editingBox} value={boxForm.employeeNumber} onChange={(e)=>setBoxForm({...boxForm,employeeNumber:e.target.value})}/></FormField>
        <FormField label="Setor"><input value={boxForm.sector} onChange={(e)=>setBoxForm({...boxForm,sector:e.target.value})}/></FormField>
        <FormField label="Localização"><input value={boxForm.location} onChange={(e)=>setBoxForm({...boxForm,location:e.target.value})}/></FormField>
        <FormField label="Data de entrega"><input type="date" value={boxForm.deliveryDate} onChange={(e)=>setBoxForm({...boxForm,deliveryDate:e.target.value})}/></FormField>
        <FormField label="Situação"><select disabled={!!editingBox} value={boxForm.status} onChange={(e)=>setBoxForm({...boxForm,status:e.target.value})}><option value="available">Disponível</option><option value="inactive">Inativa</option></select></FormField>
        <FormField label="Observação"><input className="tool-span-2" value={boxForm.observation} onChange={(e)=>setBoxForm({...boxForm,observation:e.target.value})}/></FormField>
      </div><div className="tool-form-actions"><button className="btn primary" disabled={saving}>{saving?"Salvando…":editingBox?"Salvar alterações":"Cadastrar caixa"}</button>{editingBox&&<button className="btn" type="button" onClick={()=>{setEditingBox(null);setBoxForm(emptyBox())}}>Cancelar</button>}</div></form>}
      <section className="tool-panel"><div className="tool-table-head"><h3>Caixas cadastradas</h3><input placeholder="Buscar caixas…" value={search} onChange={(e)=>{setSearch(e.target.value);setPage(1)}}/></div><div className="tool-table-wrap"><table className="tool-table"><thead><tr><th>Número</th><th>Descrição</th><th>Responsável</th><th>Matrícula</th><th>Setor</th><th>Localização</th><th>Ferramentas</th><th>Situação</th><th>Origem</th>{canEdit&&<th>Ações</th>}</tr></thead><tbody>{pageRows(filteredBoxes).map((box)=><tr key={box.id}><td>{box.box_number}</td><td>{box.description}</td><td>{box.responsible||"—"}</td><td>{box.employee_number||"—"}</td><td>{box.sector||"—"}</td><td>{box.location||"—"}</td><td>{box.tool_count}</td><td><StatusPill value={box.status}/></td><td>{box.source==="oracle"?"Oracle":"Local"}</td>{canEdit&&<td><button className="btn btn-small" disabled={box.source==="oracle"} onClick={()=>editBox(box)}>Editar</button>{box.status!=="inactive"?<button className="btn btn-small" disabled={box.source==="oracle"} onClick={()=>void runSave(()=>api.ferramentasEditarCaixa(box.id,{status:"inactive",responsible:box.responsible,employeeNumber:box.employee_number,boxNumber:box.box_number,description:box.description,sector:box.sector,location:box.location,deliveryDate:box.delivery_date,observation:box.observation}),"Caixa inativada.")}>Inativar</button>:<button className="btn btn-small" disabled={box.source==="oracle"} onClick={()=>void runSave(()=>api.ferramentasEditarCaixa(box.id,{status:"available",responsible:box.responsible,employeeNumber:box.employee_number,boxNumber:box.box_number,description:box.description,sector:box.sector,location:box.location,deliveryDate:box.delivery_date,observation:box.observation}),"Caixa reativada.")}>Reativar</button>}</td>}</tr>)}</tbody></table>{!filteredBoxes.length&&<Empty/>}</div>{pagination(filteredBoxes.length,"caixas cadastradas")}</section>
    </>}

    {view==="tools" && data && <>
      {canEdit&&<form id="tool-tool-form" className="tool-panel tool-form" onSubmit={submitTool}><h3>{editingTool?"Editar ferramenta":"Cadastrar ferramenta"}</h3><p className="tool-hint">O código é gerado automaticamente pela caixa e nunca é reutilizado, inclusive após baixa.</p><div className="tool-form-grid">
        <FormField label="Caixa"><select required disabled={!!editingTool} value={toolForm.boxId} onChange={(e)=>setToolForm({...toolForm,boxId:e.target.value})}><option value="">Selecione…</option>{localBoxes.filter((b)=>b.status!=="inactive").map((b)=><option key={b.id} value={b.id}>{b.box_number} · {b.description}</option>)}</select></FormField>
        <FormField label="Descrição"><input required value={toolForm.description} onChange={(e)=>setToolForm({...toolForm,description:e.target.value})}/></FormField>
        <FormField label="Marca"><input value={toolForm.brand} onChange={(e)=>setToolForm({...toolForm,brand:e.target.value})}/></FormField><FormField label="Modelo"><input value={toolForm.model} onChange={(e)=>setToolForm({...toolForm,model:e.target.value})}/></FormField>
        <FormField label="Medida"><input value={toolForm.measure} onChange={(e)=>setToolForm({...toolForm,measure:e.target.value})}/></FormField><FormField label="Valor de aquisição"><input type="number" min="0" step="0.01" value={toolForm.acquisitionValue} onChange={(e)=>setToolForm({...toolForm,acquisitionValue:e.target.value})}/></FormField>
        <FormField label="Data de aquisição"><input type="date" value={toolForm.acquisitionDate} onChange={(e)=>setToolForm({...toolForm,acquisitionDate:e.target.value})}/></FormField><FormField label="Estado de conservação"><select value={toolForm.condition} onChange={(e)=>setToolForm({...toolForm,condition:e.target.value})}><option value="good">Bom</option><option value="regular">Regular</option><option value="damaged">Danificado</option></select></FormField>
        <FormField label="Observação"><input className="tool-span-2" value={toolForm.observation} onChange={(e)=>setToolForm({...toolForm,observation:e.target.value})}/></FormField>
      </div><div className="tool-form-actions"><button className="btn primary" disabled={saving}>{saving?"Salvando…":editingTool?"Salvar alterações":"Cadastrar ferramenta"}</button>{editingTool&&<button className="btn" type="button" onClick={()=>{setEditingTool(null);setToolForm(emptyTool())}}>Cancelar</button>}</div></form>}
      <section className="tool-panel"><div className="tool-table-head"><h3>Ferramentas cadastradas</h3><input placeholder="Buscar por código, descrição ou caixa…" value={search} onChange={(e)=>{setSearch(e.target.value);setPage(1)}}/></div><div className="tool-table-wrap"><table className="tool-table"><thead><tr><th>Código</th><th>Caixa</th><th>Descrição</th><th>Marca / modelo</th><th>Medida</th><th>Valor</th><th>Conservação</th><th>Situação</th><th>Origem</th>{canEdit&&<th>Ações</th>}</tr></thead><tbody>{pageRows(filteredTools).map((tool)=><tr key={tool.id}><td>{tool.code}</td><td>{tool.box_number}</td><td>{tool.description}</td><td>{[tool.brand,tool.model].filter(Boolean).join(" / ")||"—"}</td><td>{tool.measure||"—"}</td><td>{brl(tool.acquisition_value)}</td><td><StatusPill value={tool.condition}/></td><td><StatusPill value={tool.status}/></td><td>{tool.source==="oracle"?"Oracle":"Local"}</td>{canEdit&&<td>{!['lost','written_off'].includes(tool.status)&&<button className="btn btn-small" disabled={tool.source==="oracle"} onClick={()=>editTool(tool)}>Editar</button>}</td>}</tr>)}</tbody></table>{!filteredTools.length&&<Empty/>}</div>{pagination(filteredTools.length,"ferramentas")}</section>
    </>}

    {view==="movements" && data && <>
      {canEdit&&<form className="tool-panel tool-form" onSubmit={submitMovement}><h3>Registrar movimentação</h3><div className="tool-form-grid"><FormField label="Tipo"><select value={movement.type} onChange={(e)=>setMovement({...emptyMovement(),type:e.target.value as MovementType})}>{MOVEMENTS.map((x)=><option key={x.id} value={x.id}>{x.label}</option>)}</select></FormField>
        {movement.type.includes("box")||movement.type==="transfer_responsibility"?<FormField label="Caixa"><select required value={movement.boxId} onChange={(e)=>setMovement({...movement,boxId:e.target.value})}><option value="">Selecione…</option>{localBoxes.filter((b)=>b.status!=="inactive").map((b)=><option key={b.id} value={b.id}>{b.box_number} · {b.description}</option>)}</select></FormField>:null}
        {!movement.type.includes("box")&&movement.type!=="transfer_responsibility"?<FormField label="Ferramenta"><select required value={movement.toolId} onChange={(e)=>setMovement({...movement,toolId:e.target.value})}><option value="">Selecione…</option>{localTools.filter((t)=>!['lost','written_off'].includes(t.status)).map((t)=><option key={t.id} value={t.id}>{t.code} · {t.description} ({STATUS[t.status]})</option>)}</select></FormField>:null}
        {movement.type==="transfer_tool"&&<FormField label="Caixa de destino"><select required value={movement.destinationBoxId} onChange={(e)=>setMovement({...movement,destinationBoxId:e.target.value})}><option value="">Selecione…</option>{localBoxes.filter((b)=>b.status!=="inactive").map((b)=><option key={b.id} value={b.id}>{b.box_number} · {b.description}</option>)}</select></FormField>}
        <FormField label="Responsável pela movimentação"><input required value={movement.responsible} onChange={(e)=>setMovement({...movement,responsible:e.target.value})}/></FormField>
        {(movement.type==="deliver_box"||movement.type==="transfer_responsibility")&&<FormField label="Matrícula do destino"><input value={movement.employeeNumber} onChange={(e)=>setMovement({...movement,employeeNumber:e.target.value})}/></FormField>}
        <FormField label="Data e hora"><input type="datetime-local" required value={movement.occurredAt} onChange={(e)=>setMovement({...movement,occurredAt:e.target.value})}/></FormField>
        {movement.type==="replace_tool"&&<><FormField label="Descrição da substituta"><input required value={movement.replacementDescription} onChange={(e)=>setMovement({...movement,replacementDescription:e.target.value})}/></FormField><FormField label="Marca"><input value={movement.replacementBrand} onChange={(e)=>setMovement({...movement,replacementBrand:e.target.value})}/></FormField><FormField label="Modelo"><input value={movement.replacementModel} onChange={(e)=>setMovement({...movement,replacementModel:e.target.value})}/></FormField><FormField label="Medida"><input value={movement.replacementMeasure} onChange={(e)=>setMovement({...movement,replacementMeasure:e.target.value})}/></FormField><FormField label="Valor de aquisição"><input type="number" min="0" step="0.01" value={movement.replacementValue} onChange={(e)=>setMovement({...movement,replacementValue:e.target.value})}/></FormField><FormField label="Data de aquisição"><input type="date" value={movement.replacementDate} onChange={(e)=>setMovement({...movement,replacementDate:e.target.value})}/></FormField></>}
        <FormField label="Observação"><input className="tool-span-2" value={movement.observation} onChange={(e)=>setMovement({...movement,observation:e.target.value})}/></FormField>
      </div><div className="tool-form-actions"><button className="btn primary" disabled={saving}>{saving?"Registrando…":"Registrar movimentação"}</button></div></form>}
      <section className="tool-panel"><div className="tool-table-head"><h3>Histórico de movimentações</h3><input placeholder="Pesquisar no histórico…" value={search} onChange={(e)=>{setSearch(e.target.value);setPage(1)}}/></div><div className="tool-table-wrap"><table className="tool-table"><thead><tr><th>Data e hora</th><th>Movimentação</th><th>Ferramenta / caixa</th><th>Origem</th><th>Destino</th><th>Responsável</th><th>Lançado por</th><th>Observação</th></tr></thead><tbody>{pageRows(filteredMovements).map((m)=><tr key={m.id}><td>{dateBR(m.occurred_at)}</td><td>{MOVEMENTS.find((x)=>x.id===m.movement_type)?.label??m.movement_type}</td><td>{m.tool_code?`${m.tool_code} · ${m.tool_description}`:`Caixa ${m.box_number??"—"}`}</td><td>{m.from_box_number ?? (m.from_responsible || "—")}</td><td>{m.to_box_number ?? (m.to_responsible || "—")}</td><td>{m.responsible||"—"}</td><td>{m.performed_by_name}</td><td>{m.observation||"—"}</td></tr>)}</tbody></table>{!filteredMovements.length&&<Empty/>}</div>{pagination(filteredMovements.length,"movimentações")}</section>
    </>}

    {view==="inspections" && data && <>
      {canEdit&&<form className="tool-panel tool-form" onSubmit={submitInspection}><h3>Conferência física</h3><div className="tool-form-grid"><FormField label="Caixa"><select required value={inspectionBox} onChange={(e)=>setInspectionBox(e.target.value)}><option value="">Selecione…</option>{localBoxes.filter((b)=>b.status!=="inactive").map((b)=><option key={b.id} value={b.id}>{b.box_number} · {b.description}</option>)}</select></FormField><FormField label="Responsável pela conferência"><input required value={inspectionResponsible} onChange={(e)=>setInspectionResponsible(e.target.value)}/></FormField></div>
        {inspectionBox&&<><p className="tool-hint">Marque a situação observada para cada ferramenta. O percentual considera como conforme somente os itens presentes.</p><div className="tool-table-wrap"><table className="tool-table"><thead><tr><th>Código</th><th>Ferramenta</th><th>Conferência</th><th>Observação</th></tr></thead><tbody>{selectedInspectionTools.map((tool)=><tr key={tool.id}><td>{tool.code}</td><td>{tool.description}</td><td><select value={inspectionItems[tool.id]?.status??"present"} onChange={(e)=>setInspectionItems((current)=>({...current,[tool.id]:{...current[tool.id],status:e.target.value}}))}>{["present","missing","damaged","maintenance"].map((s)=><option key={s} value={s}>{STATUS[s]}</option>)}</select></td><td><input value={inspectionItems[tool.id]?.observation??""} onChange={(e)=>setInspectionItems((current)=>({...current,[tool.id]:{...current[tool.id],observation:e.target.value}}))}/></td></tr>)}</tbody></table></div><p className="tool-compliance-preview">Conformidade prevista: <b>{selectedInspectionTools.length?((selectedInspectionTools.filter((t)=>inspectionItems[t.id]?.status==="present").length/selectedInspectionTools.length)*100).toFixed(1):"0.0"}%</b></p><button className="btn primary" disabled={saving||!selectedInspectionTools.length}>Salvar conferência</button></>}</form>}
      <section className="tool-panel"><h3>Histórico de conferências</h3><div className="tool-table-wrap"><table className="tool-table"><thead><tr><th>Data</th><th>Caixa</th><th>Responsável</th><th>Conformidade</th><th>Faltantes</th><th>Conferido por</th></tr></thead><tbody>{pageRows(data.inspections).map((i)=><tr key={i.id}><td>{dateBR(i.checked_at)}</td><td>{i.box_number} · {i.box_description}</td><td>{i.responsible}</td><td>{i.compliance.toLocaleString("pt-BR")} %</td><td>{i.missing_count}</td><td>{i.performed_by_name}</td></tr>)}</tbody></table>{!data.inspections.length&&<Empty>Sem conferências registradas.</Empty>}</div>{pagination(data.inspections.length,"conferências")}</section>
    </>}

    {view==="writeoffs"&&data&&<>
      {canEdit&&<form className="tool-panel tool-form" onSubmit={submitWriteoff}><h3>Registrar baixa de ferramenta</h3><div className="tool-form-grid"><FormField label="Ferramenta"><select required value={writeoff.toolId} onChange={(e)=>setWriteoff({...writeoff,toolId:e.target.value})}><option value="">Selecione…</option>{localTools.filter((t)=>!['lost','written_off'].includes(t.status)).map((t)=><option key={t.id} value={t.id}>{t.code} · {t.description} · {brl(t.acquisition_value)}</option>)}</select></FormField><FormField label="Motivo"><select value={writeoff.reason} onChange={(e)=>setWriteoff({...writeoff,reason:e.target.value})}>{["perda","extravio","quebra","desgaste","descarte"].map((s)=><option key={s} value={s}>{s[0].toUpperCase()+s.slice(1)}</option>)}</select></FormField><FormField label="Responsável"><input required value={writeoff.responsible} onChange={(e)=>setWriteoff({...writeoff,responsible:e.target.value})}/></FormField><FormField label="Data e hora"><input type="datetime-local" required value={writeoff.occurredAt} onChange={(e)=>setWriteoff({...writeoff,occurredAt:e.target.value})}/></FormField><FormField label="Observação"><input className="tool-span-2" value={writeoff.observation} onChange={(e)=>setWriteoff({...writeoff,observation:e.target.value})}/></FormField></div><p className="tool-hint">O valor patrimonial é copiado do cadastro da ferramenta. Baixas são permanentes no histórico e não liberam o código para reutilização.</p><button className="btn primary" disabled={saving}>Registrar baixa</button></form>}
      <section className="tool-panel"><h3>Histórico de perdas e baixas</h3><div className="tool-table-wrap"><table className="tool-table"><thead><tr><th>Data</th><th>Código</th><th>Ferramenta</th><th>Caixa</th><th>Motivo</th><th>Valor</th><th>Responsável</th><th>Lançado por</th><th>Observação</th></tr></thead><tbody>{pageRows(data.writeoffs).map((w)=><tr key={w.id}><td>{dateBR(w.occurred_at)}</td><td>{w.tool_code}</td><td>{w.tool_description}</td><td>{w.box_number}</td><td>{w.reason}</td><td>{brl(w.value)}</td><td>{w.responsible}</td><td>{w.created_by_name}</td><td>{w.observation||"—"}</td></tr>)}</tbody></table>{!data.writeoffs.length&&<Empty>Sem perdas ou baixas registradas.</Empty>}</div>{pagination(data.writeoffs.length,"baixas")}</section>
    </>}

    {view==="reports"&&data&&<section className="tool-panel"><div className="tool-table-head"><div><h3>Relatórios</h3><p className="tool-hint">Filtre os registros e exporte a tabela para Excel ou imprima em PDF.</p></div><div className="tool-report-tools"><select value={reportType} onChange={(e)=>{setReportType(e.target.value);setPage(1)}}><option value="boxes">Ferramentas por caixa</option><option value="tools">Cadastro de ferramentas</option><option value="employee">Ferramentas por funcionário</option><option value="missing">Ferramentas faltantes</option><option value="movements">Histórico de movimentações</option><option value="inspections">Histórico de conferências</option><option value="loss_employee">Perdas por funcionário</option><option value="loss_sector">Perdas por setor</option><option value="asset">Valor patrimonial</option><option value="prejudice">Prejuízo financeiro</option></select><input placeholder="Filtrar relatório…" value={reportFilter} onChange={(e)=>{setReportFilter(e.target.value);setPage(1)}}/><button className="btn" onClick={()=>void exportExcel()} disabled={!reportRows.length}>Exportar Excel</button><button className="btn" onClick={()=>window.print()}>Imprimir / PDF</button></div></div><div className="tool-table-wrap"><table className="tool-table"><thead><tr>{reportRows[0]&&Object.keys(reportRows[0]).map((key)=><th key={key}>{key}</th>)}</tr></thead><tbody>{pageRows(reportRows).map((row,index)=><tr key={index}>{Object.values(row).map((v,i)=><td key={i}>{v==null?"—":String(v)}</td>)}</tr>)}</tbody></table>{!reportRows.length&&<Empty/>}</div>{pagination(reportRows.length,"registros")}</section>}
  </div>;
}
