import { useCallback, useEffect, useState } from "react";
import {
  api,
  type HorasMotorLinha,
  type HorasMotorLote,
  type HorasMotorLoteResumo,
  type HorasMotorUltima,
} from "../../api";

const TIPOS = ["COLHEDEIRA", "TRATOR", "TRANSBORDO", "OUTRO"] as const;

function hojeIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function emptyLinha(): HorasMotorLinha {
  return { tipoEquipamento: "COLHEDEIRA", codEquipamento: null, horaMotor: null, horasElevador: null, apiId: null };
}

function num(value: string) {
  if (value.trim() === "") return null;
  const n = Number(value.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function fmtNum(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return String(value);
}

function fmtData(iso: string | null | undefined) {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

function chaveEquip(cod: number | null | undefined) {
  if (cod == null) return "";
  return String(Math.trunc(cod));
}

export function ColheitaHorasMotorElevador() {
  const [data, setData] = useState(hojeIso);
  const [turno, setTurno] = useState("A");
  const [linhas, setLinhas] = useState<HorasMotorLinha[]>([emptyLinha(), emptyLinha(), emptyLinha()]);
  const [ultimas, setUltimas] = useState<Record<string, HorasMotorUltima>>({});
  const [lotes, setLotes] = useState<HorasMotorLoteResumo[]>([]);
  const [toast, setToast] = useState<{ msg: string; tipo: "ok" | "erro" | "info" } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [painel, setPainel] = useState<"entrada" | "coa">("entrada");
  const [coaInicio, setCoaInicio] = useState(hojeIso);
  const [coaFim, setCoaFim] = useState(hojeIso);
  const [coaTurno, setCoaTurno] = useState("TODOS");
  const [coaItems, setCoaItems] = useState<
    Array<{
      id: number | null;
      data: string | null;
      turno: string | null;
      codEquipamento: number | null;
      tipoEquipamento: string | null;
      horaMotor: number | null;
      horasElevador: number | null;
    }>
  >([]);
  const [coaStatus, setCoaStatus] = useState("Selecione o período/turno e consulte o que já foi enviado.");

  const showToast = (msg: string, tipo: "ok" | "erro" | "info" = "info") => {
    setToast({ msg, tipo });
    window.setTimeout(() => setToast(null), 5000);
  };

  const aplicarRegistro = (registro: HorasMotorLote | null | undefined) => {
    if (!registro) return;
    setData(registro.data);
    setTurno((registro.turno || "A").toUpperCase());
    setLinhas(registro.equipamentos?.length ? registro.equipamentos : [emptyLinha()]);
  };

  const payload = (): HorasMotorLote => ({
    data,
    turno,
    equipamentos: linhas.map((row) => ({
      tipoEquipamento: row.tipoEquipamento || "COLHEDEIRA",
      codEquipamento: row.codEquipamento,
      horaMotor: row.horaMotor,
      horasElevador: row.horasElevador,
      apiId: row.apiId ?? null,
    })),
  });

  const carregarHistorico = useCallback(async () => {
    const json = await api.horasMotorLotes();
    setLotes(json.lotes ?? []);
  }, []);

  const carregarLote = useCallback(async (dia: string, t: string) => {
    const json = await api.horasMotorLote(dia, t);
    if (json.registro) {
      aplicarRegistro(json.registro);
      showToast(`Lote ${dia} turno ${t} carregado.`, "info");
    } else {
      setLinhas([emptyLinha(), emptyLinha(), emptyLinha()]);
    }
  }, []);

  useEffect(() => {
    void carregarHistorico().catch((e) => showToast(e instanceof Error ? e.message : String(e), "erro"));
  }, [carregarHistorico]);

  const atualizarLinha = (index: number, patch: Partial<HorasMotorLinha>) => {
    setLinhas((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const buscarUltimas = async (codigos: number[]) => {
    const json = await api.horasMotorUltimaAntes({ data, turno, equipamentos: codigos });
    setUltimas(json.ultimas ?? {});
    return json.ultimas ?? {};
  };

  const onCodBlur = async (index: number, cod: number | null) => {
    if (cod == null) return;
    try {
      const found = await buscarUltimas([cod]);
      setUltimas((prev) => ({ ...prev, ...found }));
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), "erro");
    }
  };

  const verificarUltimas = async () => {
    const cods = linhas.map((r) => r.codEquipamento).filter((c): c is number => c != null);
    if (!cods.length) {
      showToast("Informe o código do equipamento.", "erro");
      return;
    }
    setBusy("ultima");
    try {
      const found = await buscarUltimas(cods);
      const n = Object.keys(found).length;
      showToast(n ? `Última hora encontrada em ${n} equipamento(s).` : "Nenhum apontamento anterior encontrado.", n ? "ok" : "info");
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), "erro");
    } finally {
      setBusy(null);
    }
  };

  const salvarLocal = async () => {
    setBusy("salvar");
    try {
      const json = await api.horasMotorSalvarLocal(payload());
      aplicarRegistro(json.registro);
      showToast("Salvo no banco local.", "ok");
      await carregarHistorico();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), "erro");
    } finally {
      setBusy(null);
    }
  };

  const enviarCoa = async () => {
    const semCod = linhas.filter((r) => r.codEquipamento == null);
    if (semCod.length) {
      showToast("Informe o código de todos os equipamentos.", "erro");
      return;
    }
    setBusy("enviar");
    try {
      const json = await api.horasMotorEnviarCoa(payload());
      if (json.registro) aplicarRegistro(json.registro);
      if (!json.ok) {
        const det = (json.erros ?? []).map((e) => `${e.codEquipamento ?? "?"}: ${e.erro}`).join(" | ");
        throw new Error(det || json.error || "Falha no COA");
      }
      showToast(`${json.enviados.length} equipamento(s) enviados ao COA.`, "ok");
      await carregarHistorico();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), "erro");
    } finally {
      setBusy(null);
    }
  };

  const consultarCoa = async () => {
    setBusy("coa");
    setCoaStatus("Buscando registros no COA…");
    try {
      let inicio = coaInicio;
      let fim = coaFim;
      if (inicio && fim && inicio > fim) {
        [inicio, fim] = [fim, inicio];
        setCoaInicio(inicio);
        setCoaFim(fim);
      }
      const json = await api.horasMotorConsultarCoa({ dataInicio: inicio, dataFim: fim, turno: coaTurno });
      setCoaItems(json.items ?? []);
      const periodo = inicio === fim ? fmtData(inicio) : `${fmtData(inicio)} a ${fmtData(fim)}`;
      setCoaStatus(
        json.items?.length ? `${json.items.length} registro(s) no COA (${periodo}).` : `Nenhum registro encontrado (${periodo}).`,
      );
    } catch (e) {
      setCoaStatus("Erro na consulta.");
      showToast(e instanceof Error ? e.message : String(e), "erro");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="horas-entrada">
      {toast ? <p className={`horas-entrada-toast is-${toast.tipo}`}>{toast.msg}</p> : null}
      <header className="horas-entrada-toolbar">
        <strong>Horas motor / elevador</strong>
        <div className="horas-entrada-actions">
          {painel === "entrada" ? (
            <>
              <button type="button" className="btn" disabled={busy != null} onClick={() => { setPainel("coa"); setCoaInicio(data); setCoaFim(data); setCoaTurno(turno); void consultarCoa(); }}>
                Verificar COA
              </button>
              <button type="button" className="btn" disabled={busy != null} onClick={() => void verificarUltimas()}>
                {busy === "ultima" ? "Consultando…" : "Última hora"}
              </button>
              <button type="button" className="btn" disabled={busy != null} onClick={() => void salvarLocal()}>
                {busy === "salvar" ? "Salvando…" : "Salvar local"}
              </button>
              <button type="button" className="btn primary" disabled={busy != null} onClick={() => void enviarCoa()}>
                {busy === "enviar" ? "Enviando…" : "Enviar ao COA"}
              </button>
            </>
          ) : (
            <button type="button" className="btn" onClick={() => setPainel("entrada")}>
              ← Voltar à entrada
            </button>
          )}
        </div>
      </header>

      {painel === "coa" ? (
        <div className="panel horas-entrada-panel">
          <div className="horas-entrada-header">
            <label>
              De
              <input type="date" value={coaInicio} onChange={(e) => setCoaInicio(e.target.value)} />
            </label>
            <label>
              Até
              <input type="date" value={coaFim} onChange={(e) => setCoaFim(e.target.value)} />
            </label>
            <label>
              Turno
              <select value={coaTurno} onChange={(e) => setCoaTurno(e.target.value)}>
                <option value="TODOS">Todos</option>
                <option value="A">A</option>
                <option value="B">B</option>
              </select>
            </label>
            <button type="button" className="btn primary" disabled={busy != null} onClick={() => void consultarCoa()}>
              {busy === "coa" ? "Consultando…" : "Consultar COA"}
            </button>
          </div>
          <p className="lead">{coaStatus}</p>
          <div className="table-wrap">
            <table className="data horas-entrada-table">
              <thead>
                <tr>
                  <th>ID COA</th>
                  <th>Data</th>
                  <th>Turno</th>
                  <th>Cód. equipamento</th>
                  <th>Tipo</th>
                  <th>Hora motor</th>
                  <th>Horas elevador</th>
                </tr>
              </thead>
              <tbody>
                {coaItems.map((it, i) => (
                  <tr key={`${it.id ?? i}`}>
                    <td>{it.id ?? "—"}</td>
                    <td>{fmtData(it.data)}</td>
                    <td>{it.turno ?? "—"}</td>
                    <td>{it.codEquipamento ?? "—"}</td>
                    <td>{it.tipoEquipamento ?? "—"}</td>
                    <td>{fmtNum(it.horaMotor)}</td>
                    <td>{fmtNum(it.horasElevador)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <>
          <div className="panel horas-entrada-panel">
            <div className="horas-entrada-header">
              <label>
                Data
                <input
                  type="date"
                  value={data}
                  onChange={(e) => {
                    setData(e.target.value);
                    void carregarLote(e.target.value, turno).catch(() => undefined);
                  }}
                />
              </label>
              <label>
                Turno
                <select
                  value={turno}
                  onChange={(e) => {
                    setTurno(e.target.value);
                    void carregarLote(data, e.target.value).catch(() => undefined);
                  }}
                >
                  <option value="A">A</option>
                  <option value="B">B</option>
                </select>
              </label>
            </div>
            <div className="table-wrap">
              <table className="data horas-entrada-table">
                <thead>
                  <tr>
                    <th>Cód. equipamento</th>
                    <th>Tipo</th>
                    <th>Últ. hora motor</th>
                    <th>Últ. hora elevador</th>
                    <th>Hora motor</th>
                    <th>Horas elevador</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((row, index) => {
                    const ult = ultimas[chaveEquip(row.codEquipamento)];
                    const alertaMotor = row.horaMotor != null && ult?.horaMotor != null && row.horaMotor < ult.horaMotor;
                    const alertaElev = row.horasElevador != null && ult?.horasElevador != null && row.horasElevador < ult.horasElevador;
                    return (
                      <tr key={index}>
                        <td>
                          <input
                            type="number"
                            step="1"
                            value={row.codEquipamento ?? ""}
                            placeholder="ex.: 5002"
                            onChange={(e) => atualizarLinha(index, { codEquipamento: num(e.target.value) })}
                            onBlur={() => void onCodBlur(index, row.codEquipamento)}
                          />
                        </td>
                        <td>
                          <select
                            value={row.tipoEquipamento || "COLHEDEIRA"}
                            onChange={(e) => atualizarLinha(index, { tipoEquipamento: e.target.value })}
                          >
                            {TIPOS.map((tipo) => (
                              <option key={tipo} value={tipo}>
                                {tipo === "COLHEDEIRA" ? "Colhedeira" : tipo === "TRATOR" ? "Trator" : tipo === "TRANSBORDO" ? "Transbordo" : "Outro"}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className={alertaMotor ? "horas-entrada-alerta" : undefined}>
                          <strong>{fmtNum(ult?.horaMotor)}</strong>
                          {ult ? <small>{fmtData(ult.data)} · {ult.turno || "?"}</small> : null}
                        </td>
                        <td className={alertaElev ? "horas-entrada-alerta" : undefined}>
                          <strong>{fmtNum(ult?.horasElevador)}</strong>
                          {ult ? <small>{fmtData(ult.data)} · {ult.turno || "?"}</small> : null}
                        </td>
                        <td>
                          <input
                            type="number"
                            step="1"
                            value={row.horaMotor ?? ""}
                            onChange={(e) => atualizarLinha(index, { horaMotor: num(e.target.value) })}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            step="1"
                            value={row.horasElevador ?? ""}
                            placeholder="opcional"
                            onChange={(e) => atualizarLinha(index, { horasElevador: num(e.target.value) })}
                          />
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn"
                            title="Remover"
                            onClick={() => {
                              if (linhas.length <= 1) {
                                showToast("Mantenha ao menos uma linha.", "erro");
                                return;
                              }
                              setLinhas((prev) => prev.filter((_, i) => i !== index));
                            }}
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <button type="button" className="btn" onClick={() => setLinhas((prev) => [...prev, emptyLinha()])}>
              + Equipamento
            </button>
            <p className="lead">Última hora = apontamento anterior do mesmo equipamento (turno/data anteriores).</p>
          </div>

          <section className="panel horas-entrada-panel">
            <h3>Histórico local</h3>
            {lotes.length ? (
              <ul className="horas-entrada-hist">
                {lotes.map((lote) => (
                  <li key={`${lote.data}-${lote.turno}`}>
                    <div>
                      <strong>{fmtData(lote.data)}</strong> · Turno {lote.turno} · {lote.qtdEquip} equip.{" "}
                      <span className={lote.apiSincronizado ? "horas-entrada-badge ok" : "horas-entrada-badge"}>{lote.apiSincronizado ? "COA ok" : "Só local"}</span>
                    </div>
                    <div className="horas-entrada-hist-actions">
                      <button type="button" className="btn" onClick={() => void carregarLote(lote.data, lote.turno)}>
                        Abrir
                      </button>
                      <button
                        type="button"
                        className="btn"
                        onClick={async () => {
                          const dataNova = window.prompt("Nova data do lote (AAAA-MM-DD):", lote.data);
                          if (dataNova == null) return;
                          const turnoNovo = (window.prompt("Novo turno (A ou B):", lote.turno === "A" ? "B" : "A") || "").trim().toUpperCase();
                          if (!/^\d{4}-\d{2}-\d{2}$/.test(dataNova) || !["A", "B"].includes(turnoNovo)) {
                            showToast("Informe data no formato AAAA-MM-DD e turno A ou B.", "erro");
                            return;
                          }
                          if (!window.confirm(`Alterar lote ${lote.data} turno ${lote.turno} para ${dataNova} turno ${turnoNovo}?`)) return;
                          try {
                            const json = await api.horasMotorAlterarLote(lote.data, lote.turno, { dataNova, turnoNovo });
                            showToast(`Lote alterado para ${dataNova} turno ${turnoNovo}.`, "ok");
                            if (data === lote.data && turno === lote.turno && json.registro) aplicarRegistro(json.registro);
                            await carregarHistorico();
                          } catch (e) {
                            showToast(e instanceof Error ? e.message : String(e), "erro");
                          }
                        }}
                      >
                        Alterar data/turno
                      </button>
                      <button
                        type="button"
                        className="btn"
                        onClick={async () => {
                          if (!window.confirm(`Excluir lote ${lote.data} turno ${lote.turno} (local e COA se houver)?`)) return;
                          try {
                            await api.horasMotorExcluirLote(lote.data, lote.turno);
                            showToast("Lote excluído.", "ok");
                            if (data === lote.data && turno === lote.turno) setLinhas([emptyLinha()]);
                            await carregarHistorico();
                          } catch (e) {
                            showToast(e instanceof Error ? e.message : String(e), "erro");
                          }
                        }}
                      >
                        Excluir
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="lead">Nenhum lote salvo ainda.</p>
            )}
          </section>
        </>
      )}
    </section>
  );
}
