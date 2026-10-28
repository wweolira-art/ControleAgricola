import { Fragment, type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { api, type ContractInput, type ContractRecord } from "../api";
import { ReadOnlyFieldset, useCanEditItems } from "../lib/editAccess";
import { contractNeedsAlert, contractToday } from "../lib/contract-alert-status";

const empty = (): ContractInput => ({
  contratoJatoba: "", grupo: "", classificacao: "", gef: "", codigoContratada: "", prioridade: "normal", codigoUnico: "", uc: "", ultimaCompetencia: "",
  emissao: null, fazendaLocal: "", cpfCnpj: "", nascimentoEmail: "",
});

const fields: Array<{ key: keyof ContractInput; label: string; type?: "month" | "date" | "select" }> = [
  { key: "contratoJatoba", label: "Contrato Jatobá" },
  { key: "prioridade", label: "Prioridade", type: "select" },
  { key: "gef", label: "G.E.F." },
  { key: "cpfCnpj", label: "CPF/CNPJ" },
  { key: "nascimentoEmail", label: "Nascimento/E-mail" },
  { key: "codigoUnico", label: "Contrato Equatorial" },
  { key: "uc", label: "UC" },
  { key: "ultimaCompetencia", label: "Última competência", type: "month" },
  { key: "emissao", label: "Data de emissão", type: "date" },
  { key: "fazendaLocal", label: "Fazenda/Local" },
  { key: "classificacao", label: "Classificação" },
  { key: "grupo", label: "Grupo" },
  { key: "codigoContratada", label: "Cód. contratada" },
];
const editableFields = fields.filter((field) => field.key !== "ultimaCompetencia");

function asInput(row: ContractRecord): ContractInput {
  const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...input } = row;
  return input;
}

export function ContractControl() {
  const [rows, setRows] = useState<ContractRecord[]>([]);
  const [today, setToday] = useState(contractToday);
  useEffect(() => {
    const timer = window.setInterval(() => setToday(contractToday()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const [search, setSearch] = useState("");
  const [columnFilters, setColumnFilters] = useState<Partial<Record<keyof ContractInput, string>>>({});
  const [activeFilter, setActiveFilter] = useState<keyof ContractInput | null>(null);
  const [draft, setDraft] = useState<ContractInput>(empty);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const canEdit = useCanEditItems();
  const importInputRef = useRef<HTMLInputElement>(null);

  const load = async (term = search) => {
    setLoading(true); setError(null);
    try { setRows(await api.contracts(term)); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível carregar os contratos."); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(""); }, []);

  const visible = useMemo(() => rows.filter((row) => fields.every((field) => {
    const filter = columnFilters[field.key]?.trim().toLocaleLowerCase("pt-BR");
    return !filter || String(row[field.key] ?? "").toLocaleLowerCase("pt-BR").includes(filter);
  })), [columnFilters, rows]);
  const patch = (key: keyof ContractInput, value: string) => setDraft((current) => ({ ...current, [key]: key === "emissao" ? value || null : value }));
  const clear = () => { setCreating(false); setEditingId(null); setDraft(empty()); setMessage(""); };

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true); setError(null); setMessage("");
    try {
      const wasEditing = editingId !== null;
      if (editingId) await api.updateContract(editingId, draft);
      else await api.createContract(draft);
      setCreating(false); setEditingId(null); setDraft(empty());
      setMessage(wasEditing ? "Contrato atualizado." : "Contrato cadastrado.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível salvar o contrato."); }
    finally { setSaving(false); }
  }

  async function remove(row: ContractRecord) {
    if (!window.confirm(`Excluir o contrato ${row.contratoJatoba}?`)) return;
    setError(null);
    try { await api.deleteContract(row.id); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível excluir o contrato."); }
  }

  async function verify(row: ContractRecord) {
    if (!window.confirm(`Confirmar a verificação da conta do contrato ${row.contratoJatoba}?\n\nA data será movida para o mesmo dia do próximo mês.`)) return;
    setError(null); setMessage("");
    try {
      await api.verifyContract(row.id);
      setMessage("Conta verificada. A próxima data de emissão foi agendada.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível confirmar a verificação."); }
  }

  async function exportData() {
    setError(null); setMessage("");
    try {
      const backup = await api.exportContracts();
      const href = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = href;
      link.download = `contratos-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(href);
      setMessage(`${backup.contracts.length} contratos exportados.`);
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível exportar os contratos."); }
  }

  async function importData(file: File) {
    try {
      const backup = JSON.parse(await file.text()) as { contracts?: ContractInput[] };
      if (!Array.isArray(backup.contracts) || !backup.contracts.length) throw new Error("Selecione um arquivo de contratos válido.");
      if (!window.confirm(`Substituir todos os ${rows.length} contratos deste computador pelos ${backup.contracts.length} contratos do arquivo?`)) return;
      setSaving(true); setError(null); setMessage("");
      const result = await api.importContracts(backup.contracts);
      setMessage(`${result.imported} contratos importados. Os contratos locais anteriores foram substituídos.`);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível importar os contratos."); }
    finally { setSaving(false); if (importInputRef.current) importInputRef.current.value = ""; }
  }

  const form = (editing: boolean) => <ReadOnlyFieldset>
    <form className="form-grid contract-form" onSubmit={(event) => void submit(event)}>
      <div className="contract-form-head">
        <h3>{editing ? "Editar contrato" : "Novo contrato"}</h3>
      </div>
      {editableFields.map((field) => <label key={field.key}>
        {field.label}
        {field.type === "select" ? <select value={draft.prioridade} onChange={(event) => setDraft((current) => ({ ...current, prioridade: event.target.value as ContractInput["prioridade"] }))}>
          <option value="alta">Alta</option>
          <option value="media">Média</option>
          <option value="normal">Normal</option>
        </select> : <input type={field.type ?? "text"} required={field.key === "contratoJatoba"}
          placeholder={field.key === "emissao" ? "Data da próxima verificação" : undefined}
          value={String(draft[field.key] ?? "")}
          onChange={(event) => patch(field.key, event.target.value)} />}
      </label>)}
      <div className="contract-form-actions">
        {editing ? <button type="button" className="btn" onClick={clear}>Cancelar</button> : null}
        <button type="submit" className="btn primary" disabled={saving}>{saving ? "Salvando…" : editing ? "Salvar alterações" : "Cadastrar contrato"}</button>
        {!editing && message ? <span className="lead">{message}</span> : null}
      </div>
    </form>
  </ReadOnlyFieldset>;

  return <div className="page contract-control">
    <section className="panel contract-list-panel">
      <div className="modal-actions contract-actions" style={{ justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>Contratos cadastrados</h3>
        <div className="contract-list-actions">
          <button type="button" className="btn" onClick={() => void exportData()}>Exportar contratos</button>
          <button type="button" className="btn" disabled={!canEdit || saving} onClick={() => importInputRef.current?.click()}>Importar contratos</button>
          <input ref={importInputRef} className="contract-import-input" type="file" accept="application/json,.json" onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importData(file);
          }} />
          <button type="button" className="btn primary" disabled={!canEdit} onClick={() => { setDraft(empty()); setEditingId(null); setCreating(true); setMessage(""); }}>Cadastrar nova UC</button>
          <form className="contract-search" onSubmit={(event) => { event.preventDefault(); void load(); }}>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar contrato, local ou CPF/CNPJ" />
            <button type="submit" className="btn" disabled={loading}>Buscar</button>
          </form>
        </div>
      </div>
      {error ? <p className="lead" style={{ color: "var(--danger)" }}>{error}</p> : null}
      {activeFilter ? <div className="contract-filter-panel">
        <strong>Filtrar: {fields.find((field) => field.key === activeFilter)?.label}</strong>
        <input autoFocus value={columnFilters[activeFilter] ?? ""} placeholder="Digite para filtrar"
          onChange={(event) => setColumnFilters((current) => ({ ...current, [activeFilter]: event.target.value }))} />
        <button type="button" className="btn" onClick={() => setColumnFilters((current) => ({ ...current, [activeFilter]: "" }))}>Limpar</button>
        <button type="button" className="btn" onClick={() => setActiveFilter(null)}>Fechar</button>
      </div> : null}
      {loading ? <p>Carregando…</p> : null}
      {!loading && !visible.length ? <p>Nenhum contrato cadastrado.</p> : null}
      {visible.length ? <div className="table-wrap"><table>
        <thead><tr>{fields.map((field) => <Fragment key={field.key}><th><span>{field.label}</span><button type="button"
          className={`contract-filter-btn${columnFilters[field.key] ? " is-active" : ""}`}
          title={`Filtrar ${field.label}`} aria-label={`Filtrar ${field.label}`}
          onClick={() => setActiveFilter((current) => current === field.key ? null : field.key)}>⌄</button></th>
          {field.key === "emissao" ? <th>Verificação</th> : null}</Fragment>)}<th /></tr></thead>
        <tbody>{visible.map((row) => <tr key={row.id}>
          {fields.map((field) => <Fragment key={field.key}><td>{field.key === "prioridade"
            ? <span className={`contract-priority-badge ${row.prioridade}`}>{row.prioridade === "alta" ? "● Alta" : row.prioridade === "media" ? "● Média" : "● Normal"}</span>
            : field.key === "ultimaCompetencia" && row[field.key]
            ? String(row[field.key]).replace(/^(\d{4})-(\d{2})$/, "$2/$1")
            : row[field.key] || "—"}</td>
            {field.key === "emissao" ? <td><button type="button" className={`btn ${contractNeedsAlert(row.emissao, today) ? "contract-alert" : "primary"}`} disabled={!canEdit} onClick={() => void verify(row)}>{contractNeedsAlert(row.emissao, today) ? "Alerta" : "Verificado"}</button></td> : null}</Fragment>)}
          <td><div className="contract-row-actions"><button type="button" className="btn" onClick={() => { setEditingId(row.id); setDraft(asInput(row)); setMessage(""); }}>Editar</button><button type="button" className="btn danger" onClick={() => void remove(row)}>Excluir</button></div></td>
        </tr>)}</tbody>
      </table></div> : null}
    </section>
    {creating || editingId ? <div className="modal-back" onClick={clear}>
      <div className="modal contract-modal" onClick={(event) => event.stopPropagation()}>{form(Boolean(editingId))}</div>
    </div> : null}
  </div>;
}
