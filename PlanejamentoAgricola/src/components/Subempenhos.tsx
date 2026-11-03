import { useEffect, useMemo, useState } from "react";
import { api, type Activity, type Empenho } from "../api";
import { ReadOnlyFieldset } from "../lib/editAccess";

function fold(text: string) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function Subempenhos() {
  const [rows, setRows] = useState<Activity[]>([]);
  const [empenhos, setEmpenhos] = useState<Empenho[]>([]);
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [empenho, setEmpenho] = useState("");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [activities, commitments] = await Promise.all([api.activities(), api.empenhos()]);
    setRows(activities);
    setEmpenhos(commitments);
  };

  useEffect(() => {
    void load().catch((error) => setMessage(error instanceof Error ? error.message : "Não foi possível carregar os subempenhos."))
      .finally(() => setLoading(false));
  }, []);

  const suggestions = useMemo(() => {
    const known = new Map(empenhos.map((item) => [item.code, item]));
    for (const row of rows) {
      if (row.empenho && !known.has(row.empenho)) known.set(row.empenho, { id: 0, code: row.empenho, description: "" });
    }
    return [...known.values()].sort((a, b) => a.code.localeCompare(b.code, "pt-BR", { numeric: true }));
  }, [empenhos, rows]);

  const filtered = useMemo(() => {
    const terms = fold(query).trim().split(/\s+/).filter(Boolean);
    if (!terms.length) return rows;
    return rows.filter((row) => {
      const text = fold(`${row.code} ${row.description} ${row.empenho ?? ""}`);
      return terms.every((term) => text.includes(term));
    });
  }, [query, rows]);

  const update = async (row: Activity, field: "code" | "description" | "empenho", value: string) => {
    const next = value.trim();
    const current = field === "empenho" ? row.empenho ?? "" : row[field];
    if (next === current) return;
    if ((field === "code" || field === "description") && !next) {
      setMessage("Código e descrição não podem ficar em branco.");
      return;
    }
    try {
      setMessage("");
      await api.updateActivity(row.id, { [field]: field === "empenho" ? next || null : next });
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível atualizar o subempenho.");
      await load();
    }
  };

  const importFromOracle = async () => {
    setSaving(true);
    setMessage("");
    try {
      const result = await api.oracleActivities();
      const codes = result.items.filter((item) => !item.imported).map((item) => item.code);
      if (!codes.length) {
        setMessage("Todos os subempenhos do Oracle já estão cadastrados.");
        return;
      }
      if (!window.confirm(`Importar ${codes.length} subempenho(s) do Oracle?`)) return;
      const imported = await api.importOracleActivities(codes);
      await load();
      setMessage(`${imported.imported} subempenho(s) importado(s).`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível importar os subempenhos.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="subempenhos-panel">
      <p className="lead">Cadastre, ajuste ou importe os subempenhos usados no planejamento.</p>
      <ReadOnlyFieldset>
        <section className="panel">
          <h3>Novo subempenho</h3>
          <div className="form-grid">
            <label>Código<input value={code} onChange={(event) => setCode(event.target.value)} placeholder="Ex.: G28" /></label>
            <label>Descrição<input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Descrição do subempenho" /></label>
            <label>Empenho<input list="subempenho-empenhos" value={empenho} onChange={(event) => setEmpenho(event.target.value)} placeholder="Ex.: 241" /></label>
          </div>
          <div className="modal-actions" style={{ padding: "0 16px 16px" }}>
            <button type="button" className="btn primary" disabled={saving} onClick={async () => {
              if (!code.trim() || !description.trim()) { setMessage("Informe o código e a descrição."); return; }
              setSaving(true); setMessage("");
              try { await api.addActivity({ code, description, empenho }); setCode(""); setDescription(""); setEmpenho(""); await load(); }
              catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível cadastrar o subempenho."); }
              finally { setSaving(false); }
            }}>{saving ? "Salvando…" : "Cadastrar subempenho"}</button>
            <button type="button" className="btn" disabled={saving} onClick={() => void importFromOracle()}>Importar do Oracle</button>
          </div>
        </section>

        <section className="panel">
          <h3>Subempenhos cadastrados <small>{query.trim() ? `${filtered.length} de ${rows.length}` : rows.length}</small></h3>
          <div className="form-grid" style={{ gridTemplateColumns: "1fr", paddingBottom: 8 }}><label>Pesquisar<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Código, descrição ou empenho" /></label></div>
          {message ? <p className="lead subempenhos-message">{message}</p> : null}
          {loading ? <p className="lead">Carregando subempenhos…</p> : <table className="data"><thead><tr><th>Código</th><th>Descrição</th><th>Empenho</th><th /></tr></thead><tbody>
            {filtered.map((row) => <tr key={row.id}>
              <td><input className="cell" defaultValue={row.code} key={`${row.id}-code-${row.code}`} onBlur={(event) => void update(row, "code", event.target.value)} /></td>
              <td><input className="cell" defaultValue={row.description} key={`${row.id}-description-${row.description}`} onBlur={(event) => void update(row, "description", event.target.value)} /></td>
              <td><input className="cell" list="subempenho-empenhos" defaultValue={row.empenho ?? ""} key={`${row.id}-empenho-${row.empenho ?? ""}`} placeholder="—" onBlur={(event) => void update(row, "empenho", event.target.value)} /></td>
              <td><button type="button" className="icon-btn" title="Excluir subempenho" onClick={async () => { if (!window.confirm(`Excluir o subempenho ${row.code}?`)) return; try { await api.deleteActivity(row.id); await load(); } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível excluir."); } }}>✕</button></td>
            </tr>)}
            {!filtered.length ? <tr><td colSpan={4} className="left">Nenhum subempenho encontrado.</td></tr> : null}
          </tbody></table>}
        </section>
      </ReadOnlyFieldset>
      <datalist id="subempenho-empenhos">{suggestions.map((item) => <option key={item.code} value={item.code}>{item.description}</option>)}</datalist>
    </div>
  );
}
