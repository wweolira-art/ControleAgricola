import { useMemo, useState } from "react";
import { api, type PenetrometroImportResult, type PenetrometroTableData } from "../../api";

function cell(value: unknown) {
  if (value == null || value === "") return "—";
  return String(value);
}

function valueByColumn(row: Record<string, unknown>, col: string) {
  if (row[col] != null) return row[col];
  const found = Object.keys(row).find((key) => key.toLowerCase() === col.toLowerCase());
  return found ? row[found] : undefined;
}

function pick(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = valueByColumn(row, key);
    if (value != null && value !== "") return value;
  }
  return "";
}

function visibleColumns(cols: string[]) {
  const priority = [
    "DataeHoraUTC",
    "dataehora(utc)",
    "Fazenda",
    "fazenda",
    "Talhao",
    "talhao",
    "Lote",
    "lote",
    "Campo",
    "campo",
    "Produtor",
    "produtor",
    "Latitude",
    "latitude",
    "Longitude",
    "longitude",
    "Altitude",
    "altitude",
    "Equipamento",
    "equipamento",
    "IDUnico",
    "idunico",
    "IDExibido",
    "idexibido",
    "Unidade",
    "unidade",
  ];
  const used = new Set<string>();
  const prioritized: string[] = [];
  for (const wanted of priority) {
    const found = cols.find((existing) => existing.toLowerCase() === wanted.toLowerCase());
    if (!found || used.has(found.toLowerCase())) continue;
    used.add(found.toLowerCase());
    prioritized.push(found);
  }
  const ordered = [
    ...prioritized,
    ...cols.filter((col) => !used.has(col.toLowerCase())),
  ];
  return ordered.slice(0, 16);
}

export function ColheitaPenetrometroImport() {
  const [csvText, setCsvText] = useState("");
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<PenetrometroTableData | null>(null);
  const [banco, setBanco] = useState<PenetrometroTableData | null>(null);
  const [result, setResult] = useState<PenetrometroImportResult | null>(null);
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null);
  const [campo, setCampo] = useState("");
  const [fazenda, setFazenda] = useState("");
  const [lote, setLote] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const previewCols = useMemo(() => visibleColumns(preview?.colunas ?? []), [preview]);
  const bancoCols = useMemo(() => visibleColumns(banco?.colunas ?? []), [banco]);

  const readFile = async (file: File | null) => {
    if (!file) return;
    setFileName(file.name);
    setCsvText(await file.text());
    setPreview(null);
    setResult(null);
  };

  const runPreview = async () => {
    if (!csvText.trim()) {
      setErr("Selecione um CSV do penetrômetro.");
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      setPreview(await api.colheitaPenetrometroPreview(csvText));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const importar = async () => {
    if (!csvText.trim()) {
      setErr("Selecione um CSV do penetrômetro.");
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const res = await api.colheitaPenetrometroImport(csvText);
      setResult(res);
      setBanco(await api.colheitaPenetrometroList());
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const carregarBanco = async () => {
    setLoading(true);
    setErr(null);
    try {
      setBanco(await api.colheitaPenetrometroList());
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const selecionar = (row: Record<string, unknown>) => {
    setSelected(row);
    setCampo(String(pick(row, "CAMPO", "Campo") ?? ""));
    setFazenda(String(pick(row, "FAZENDA", "Fazenda") ?? ""));
    setLote(String(pick(row, "TALHAO", "Talhao", "LOTE", "Lote") ?? ""));
  };

  const atualizar = async () => {
    const id = selected ? pick(selected, "IDUNICO", "IDUnico") : "";
    if (!id) {
      setErr("Selecione uma linha do banco para atualizar.");
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      await api.colheitaPenetrometroUpdate(String(id), { campo, fazenda, lote });
      await carregarBanco();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <p className="lead">
        Importe o CSV do penetrômetro, faça o cruzamento por longitude/latitude com o mapa de áreas e envie para a tabela
        COMPACTACAOPENETROMETRO. Duplicidades pelo ID exibido são atualizadas.
      </p>

      <section className="panel">
        <h3>Importação penetrômetro</h3>
        <div className="form-grid">
          <label>
            Arquivo CSV
            <input type="file" accept=".csv,text/csv" onChange={(e) => void readFile(e.target.files?.[0] ?? null)} />
          </label>
          <label>
            Arquivo selecionado
            <input readOnly value={fileName || "Nenhum arquivo selecionado"} />
          </label>
        </div>
        {err ? (
          <p className="lead" style={{ padding: "0 16px", color: "var(--danger)" }}>
            {err}
          </p>
        ) : null}
        <div className="modal-actions" style={{ padding: "0 16px 16px" }}>
          <button className="btn" type="button" disabled={loading || !csvText} onClick={() => void runPreview()}>
            Pré-visualizar
          </button>
          <button className="btn primary" type="button" disabled={loading || !csvText} onClick={() => void importar()}>
            {loading ? "Processando…" : "Enviar"}
          </button>
          <button className="btn" type="button" disabled={loading} onClick={() => void carregarBanco()}>
            Atualizar banco
          </button>
          <button className="btn" type="button" disabled={loading} onClick={() => setPreview(null)}>
            Cancelar
          </button>
        </div>
        {result ? (
          <div className="kpis" style={{ padding: "0 16px 16px" }}>
            <div className="kpi">
              <span>Inseridos</span>
              <strong>{result.inseridos}</strong>
            </div>
            <div className="kpi">
              <span>Atualizados</span>
              <strong>{result.atualizados}</strong>
            </div>
            <div className="kpi">
              <span>Erros</span>
              <strong>{result.erros.length}</strong>
            </div>
          </div>
        ) : null}
      </section>

      {preview ? (
        <section className="panel">
          <h3>Prévia da importação ({preview.total})</h3>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>{previewCols.map((col) => <th key={col}>{col}</th>)}</tr>
              </thead>
              <tbody>
                {preview.dados.slice(0, 80).map((row, idx) => (
                  <tr key={idx}>{previewCols.map((col) => <td key={col}>{cell(valueByColumn(row, col))}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="panel">
        <h3>Banco de dados</h3>
        <div className="form-grid">
          <label>
            ID
            <input readOnly value={selected ? String(pick(selected, "IDUNICO", "IDUnico")) : ""} />
          </label>
          <label>
            Campo
            <input value={campo} onChange={(e) => setCampo(e.target.value)} />
          </label>
          <label>
            Fazenda
            <input value={fazenda} onChange={(e) => setFazenda(e.target.value)} />
          </label>
          <label>
            Talhão
            <input value={lote} onChange={(e) => setLote(e.target.value)} />
          </label>
        </div>
        <div className="modal-actions" style={{ padding: "0 16px 16px" }}>
          <button className="btn primary" type="button" disabled={loading || !selected} onClick={() => void atualizar()}>
            Atualizar registro
          </button>
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>{bancoCols.map((col) => <th key={col}>{col}</th>)}</tr>
            </thead>
            <tbody>
              {(banco?.dados ?? []).map((row, idx) => (
                <tr key={idx} onDoubleClick={() => selecionar(row)} style={{ cursor: "pointer" }}>
                  {bancoCols.map((col) => <td key={col}>{cell(valueByColumn(row, col))}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          {banco && !banco.dados.length ? <p className="lead">Nenhum registro encontrado.</p> : null}
        </div>
      </section>
    </>
  );
}
