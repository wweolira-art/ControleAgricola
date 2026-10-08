import { useEffect, useMemo, useState, type FormEvent } from "react";
import { api, type ParadaColheitaEvento, type ParadaColheitaLocalInput, type ParadasColheitaData } from "../../api";

function fmt2(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function fmt0(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(n);
}

function fmtHorasClock(h: number | null | undefined) {
  if (h == null || !Number.isFinite(h) || h <= 0) return "0:00";
  const totalMin = Math.round(h * 60);
  const hh = Math.floor(totalMin / 60);
  const mm = String(Math.abs(totalMin % 60)).padStart(2, "0");
  return `${hh}:${mm}`;
}

function fmtDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toDateTimeLocal(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 16);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function inicioPadrao(dataInicio: string) {
  return `${dataInicio}T07:00`;
}

function fimPadrao(dataInicio: string) {
  return `${dataInicio}T08:00`;
}

function IconEdit() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v5" />
      <path d="M14 11v5" />
    </svg>
  );
}

type Props = {
  dataInicio: string;
  dataFim: string;
  consultarToken: number;
  onLoadingChange?: (loading: boolean) => void;
};

type FormState = {
  id: number | null;
  apiId: string | null;
  apiHref: string | null;
  motivo: string;
  observacao: string;
  inicio: string;
  fim: string;
  maquina: string;
  codEquipamento: string;
};

function formInicial(dataInicio: string): FormState {
  return {
    id: null,
    apiId: null,
    apiHref: null,
    motivo: "",
    observacao: "",
    inicio: inicioPadrao(dataInicio),
    fim: fimPadrao(dataInicio),
    maquina: "",
    codEquipamento: "",
  };
}

export function ParadasColheitaSection({ dataInicio, dataFim, consultarToken, onLoadingChange }: Props) {
  const [data, setData] = useState<ParadasColheitaData | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [consultado, setConsultado] = useState(false);
  const [motivoFiltro, setMotivoFiltro] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(() => formInicial(dataInicio));

  const carregar = async () => {
    setLoading(true);
    onLoadingChange?.(true);
    setErr(null);
    try {
      const result = await api.indicadoresParadasColheita({ dataInicio, dataFim });
      setData(result);
      setConsultado(true);
      setMotivoFiltro("");
    } catch (e) {
      setData(null);
      setErr(e instanceof Error ? e.message : String(e));
      setConsultado(true);
    } finally {
      setLoading(false);
      onLoadingChange?.(false);
    }
  };

  useEffect(() => {
    if (!consultarToken) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        onLoadingChange?.(true);
        setErr(null);
        const result = await api.indicadoresParadasColheita({ dataInicio, dataFim });
        if (cancelled) return;
        setData(result);
        setConsultado(true);
        setMotivoFiltro("");
      } catch (e) {
        if (cancelled) return;
        setData(null);
        setErr(e instanceof Error ? e.message : String(e));
        setConsultado(true);
      } finally {
        if (!cancelled) {
          setLoading(false);
          onLoadingChange?.(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // Consulta só ao clicar em Consultar (token).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dataInicio/dataFim deliberadamente fora
  }, [consultarToken, onLoadingChange]);

  function novaParada() {
    setForm(formInicial(dataInicio));
    setShowForm(true);
    setErr(null);
  }

  function editarParada(row: ParadaColheitaEvento) {
    setForm({
      id: row.localId ?? null,
      apiId: row.apiId ?? (row.origem === "api" && row.id != null ? String(row.id) : null),
      apiHref: row.apiHref ?? null,
      motivo: row.motivo ?? "",
      observacao: row.observacao ?? "",
      inicio: toDateTimeLocal(row.inicio),
      fim: toDateTimeLocal(row.fim),
      maquina: row.maquina == null ? "" : String(row.maquina),
      codEquipamento: row.codEquipamento == null ? "" : String(row.codEquipamento),
    });
    setShowForm(true);
    setErr(null);
  }

  async function salvarParada(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const payload: ParadaColheitaLocalInput = {
      apiId: form.apiId,
      apiHref: form.apiHref,
      motivo: form.motivo,
      observacao: form.observacao.trim() || null,
      inicio: form.inicio,
      fim: form.fim,
      maquina: form.maquina.trim() || null,
      codEquipamento: form.codEquipamento.trim() || null,
    };
    try {
      setSaving(true);
      setErr(null);
      if (form.id) await api.atualizarParadaColheita(form.id, payload);
      else await api.criarParadaColheita(payload);
      setShowForm(false);
      setForm(formInicial(dataInicio));
      await carregar();
    } catch (error) {
      setErr(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  async function deletarParada(row: ParadaColheitaEvento) {
    if (row.origem !== "local" || row.localId == null) return;
    const ok = window.confirm(`Excluir o lançamento "${row.motivo}"?`);
    if (!ok) return;
    try {
      setSaving(true);
      setErr(null);
      await api.deletarParadaColheita(row.localId);
      if (form.id === row.localId) {
        setShowForm(false);
        setForm(formInicial(dataInicio));
      }
      await carregar();
    } catch (error) {
      setErr(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  const eventos = useMemo(() => {
    const rows = data?.eventos ?? [];
    if (!motivoFiltro) return rows;
    return rows.filter((row) => row.motivo === motivoFiltro);
  }, [data, motivoFiltro]);

  const horasFiltradas = useMemo(() => eventos.reduce((acc, row) => acc + row.horas, 0), [eventos]);
  const maxHoras = Math.max(...(data?.motivos.map((row) => row.horas) ?? [0]), 0.01);
  const horasTotal = data?.resumo.horasTotal ?? 0;

  if (!consultado && !loading) {
    return <p className="lead">Consulte o período para ver as paradas da colheita.</p>;
  }

  return (
    <>
      {err ? (
        <p className="lead" style={{ color: "var(--danger)" }}>
          {err}
        </p>
      ) : null}

      <div className="kpis">
        <div className="kpi">
          <span>Paradas</span>
          <strong>{fmt0(motivoFiltro ? eventos.length : data?.resumo.qtd)}</strong>
        </div>
        <div className="kpi">
          <span>Motivos</span>
          <strong>{fmt0(data?.resumo.qtdMotivos)}</strong>
        </div>
        <div className="kpi">
          <span>Horas paradas</span>
          <strong>{fmtHorasClock(motivoFiltro ? horasFiltradas : horasTotal)}</strong>
        </div>
      </div>

      <section className="panel indicadores-tabela-panel no-print">
        <div className="panel-h3-actions">
          <h3 className="indicadores-tabela-title">LANÇAMENTO DE PARADA</h3>
          <button type="button" className="btn primary" onClick={novaParada}>
            Nova parada
          </button>
        </div>
        <p className="lead" style={{ padding: "0 12px 12px" }}>
          Cadastre paradas manualmente para complementar os dados da API no período consultado.
        </p>
      </section>

      {showForm ? (
        <div className="modal-back" onClick={() => (!saving ? setShowForm(false) : undefined)}>
          <div className="modal wide" onClick={(e) => e.stopPropagation()}>
            <h3>{form.id || form.apiId ? "Editar parada" : "Nova parada"}</h3>
            <form className="form-grid" onSubmit={salvarParada}>
              <label>
                Motivo
                <input
                  value={form.motivo}
                  onChange={(e) => setForm((prev) => ({ ...prev, motivo: e.target.value }))}
                  placeholder="Ex.: Manutenção corretiva"
                  required
                />
              </label>
              <label>
                Observação
                <textarea
                  value={form.observacao}
                  onChange={(e) => setForm((prev) => ({ ...prev, observacao: e.target.value }))}
                  placeholder="Detalhes da parada"
                  rows={3}
                />
              </label>
              <label>
                Início
                <input
                  type="datetime-local"
                  value={form.inicio}
                  onChange={(e) => setForm((prev) => ({ ...prev, inicio: e.target.value }))}
                  required
                />
              </label>
              <label>
                Fim
                <input
                  type="datetime-local"
                  value={form.fim}
                  onChange={(e) => setForm((prev) => ({ ...prev, fim: e.target.value }))}
                  required
                />
              </label>
              <label>
                Máquina
                <input
                  value={form.maquina}
                  onChange={(e) => setForm((prev) => ({ ...prev, maquina: e.target.value }))}
                  placeholder="Opcional"
                />
              </label>
              <label>
                Cód. equipamento
                <input
                  value={form.codEquipamento}
                  onChange={(e) => setForm((prev) => ({ ...prev, codEquipamento: e.target.value }))}
                  placeholder="Opcional"
                />
              </label>
              <div className="modal-actions">
                <button type="button" className="btn" onClick={() => setShowForm(false)} disabled={saving}>
                  Cancelar
                </button>
                <button type="submit" className="btn primary" disabled={saving}>
                  {saving ? "Salvando..." : form.id || form.apiId ? "Salvar edição" : "Salvar parada"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <section className="panel indicadores-tabela-panel relatorio-diario-parada-panel">
        <h3 className="indicadores-tabela-title">MOTIVOS DE PARADAS</h3>
        {data?.motivos.length ? (
          <div className="relatorio-diario-parada-bars">
            {data.motivos.map((row) => (
              <div
                key={row.motivo}
                className="relatorio-diario-parada-row"
                title={`${row.motivo}: ${fmtHorasClock(row.horas)} · ${row.qtd} paradas`}
              >
                <span>{row.motivo}</span>
                <div>
                  <i style={{ width: `${(row.horas / maxHoras) * 100}%` }} />
                  <b>
                    {fmtHorasClock(row.horas)}
                    <small>{horasTotal > 0 ? ` ${fmt2((row.horas / horasTotal) * 100)}%` : ""}</small>
                  </b>
                </div>
              </div>
            ))}
            <p className="relatorio-diario-parada-total">Horas totais: {fmtHorasClock(horasTotal)}</p>
          </div>
        ) : (
          <p className="lead">Sem paradas no período.</p>
        )}
      </section>

      <section className="panel indicadores-tabela-panel">
        <h3 className="indicadores-tabela-title">REGISTROS</h3>
        <div className="horas-motor-filter no-print" style={{ padding: "10px 12px 0" }}>
          <label>
            Motivo
            <select value={motivoFiltro} disabled={loading || !data?.motivos.length} onChange={(e) => setMotivoFiltro(e.target.value)}>
              <option value="">Todos</option>
              {(data?.motivos ?? []).map((row) => (
                <option key={row.motivo} value={row.motivo}>
                  {row.motivo}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="table-wrap">
          {eventos.length ? (
            <table className="data indicadores-producao-table">
              <thead>
                <tr>
                  <th>Motivo</th>
                  <th>Observação</th>
                  <th>Início</th>
                  <th>Fim</th>
                  <th className="num">Horas</th>
                  <th>Origem</th>
                  <th className="no-print">Ações</th>
                </tr>
              </thead>
              <tbody>
                {eventos.map((row, index) => (
                  <tr key={`${row.id ?? row.inicio}-${index}`}>
                    <td>{row.motivo}</td>
                    <td>{row.observacao || "—"}</td>
                    <td>{fmtDateTime(row.inicio)}</td>
                    <td>{fmtDateTime(row.fim)}</td>
                    <td className="num">{fmtHorasClock(row.horas)}</td>
                    <td>{row.origem === "local" ? "Local" : "API"}</td>
                    <td className="no-print">
                      {row.origem === "local" || row.origem === "api" ? (
                        <div className="modal-actions" style={{ justifyContent: "center", margin: 0 }}>
                          <button
                            type="button"
                            className="btn small"
                            title="Editar parada"
                            aria-label="Editar parada"
                            onClick={() => editarParada(row)}
                            disabled={saving}
                          >
                            <IconEdit />
                          </button>
                          {row.origem === "local" && row.localId != null ? (
                            <button
                              type="button"
                              className="btn small danger"
                              title="Excluir parada"
                              aria-label="Excluir parada"
                              onClick={() => deletarParada(row)}
                              disabled={saving}
                            >
                              <IconTrash />
                            </button>
                          ) : null}
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="lead">Nenhum registro no período.</p>
          )}
        </div>
      </section>
    </>
  );
}
