import { useState } from "react";
import {
  api,
  type HorasMotorLinha,
  type HorasMotorLote,
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
  const [toast, setToast] = useState<{ msg: string; tipo: "ok" | "erro" | "info" } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [painel, setPainel] = useState<"entrada" | "coa">("coa");
  const [coaInicio, setCoaInicio] = useState(hojeIso);
  const [coaFim, setCoaFim] = useState(hojeIso);
  const [coaTurno, setCoaTurno] = useState("TODOS");
  const [coaEquipamento, setCoaEquipamento] = useState("");
  const [coaItems, setCoaItems] = useState<
    Array<{
      id: number | null;
      data: string | null;
      turno: string | null;
      codEquipamento: number | null;
      tipoEquipamento: string | null;
      horaMotor: number | null;
      horasElevador: number | null;
      horasMotorRodadas: number | null;
      horasElevadorRodadas: number | null;
    }>
  >([]);
  const [coaStatus, setCoaStatus] = useState("Selecione o período/turno e consulte o que já foi enviado.");

  const showToast = (msg: string, tipo: "ok" | "erro" | "info" = "info") => {
    setToast({ msg, tipo });
    window.setTimeout(() => setToast(null), 5000);
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

  const atualizarLinha = (index: number, patch: Partial<HorasMotorLinha>) => {
    setLinhas((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const buscarUltimas = async (codigos: number[]) => {
    const json = await api.horasMotorUltimaAntes({ data, turno, equipamentos: codigos });
    setUltimas(json.ultimas ?? {});
    return json.ultimas ?? {};
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

  const enviarCoa = async () => {
    const semCod = linhas.filter((r) => r.codEquipamento == null);
    if (semCod.length) {
      showToast("Informe o código de todos os equipamentos.", "erro");
      return;
    }
    setBusy("enviar");
    try {
      const json = await api.horasMotorEnviarCoa(payload());
      setLinhas((prev) => prev.map((linha) => ({ ...linha, apiId: json.enviados.find((item) => item.codEquipamento === linha.codEquipamento)?.apiId ?? linha.apiId })));
      if (!json.ok) {
        const det = (json.erros ?? []).map((e) => `${e.codEquipamento ?? "?"}: ${e.erro}`).join(" | ");
        throw new Error(det || json.error || "Falha no COA");
      }
      showToast(`${json.enviados.length} equipamento(s) enviados ao COA.`, "ok");
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), "erro");
    } finally {
      setBusy(null);
    }
  };

  const consultarCoa = async () => {
    if (!coaInicio || !coaFim) {
      showToast("Informe a data inicial e final antes de consultar.", "erro");
      return;
    }
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
      setCoaItems([]);
      const json = await api.horasMotorConsultarCoa({ dataInicio: inicio, dataFim: fim, turno: coaTurno, equipamento: coaEquipamento.trim() });
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
        <strong>HORAS MOTOR / ELEVADOR</strong>
        <div className="horas-entrada-actions">
          {painel === "entrada" ? (
            <>
              <button type="button" className="btn" disabled={busy != null} onClick={() => setPainel("coa")}>
                Consultar lançamentos
              </button>
              <button type="button" className="btn" disabled={busy != null} onClick={() => void verificarUltimas()}>
                {busy === "ultima" ? "Consultando…" : "Última hora"}
              </button>
              <button type="button" className="btn primary" disabled={busy != null} onClick={() => void enviarCoa()}>
                {busy === "enviar" ? "Enviando…" : "Enviar ao COA"}
              </button>
            </>
          ) : (
            <button type="button" className="btn" onClick={() => { setLinhas([emptyLinha()]); setUltimas({}); setPainel("entrada"); }}>
              Novo lançamento
            </button>
          )}
        </div>
      </header>

      {painel === "coa" ? (
        <div className="panel horas-entrada-panel">
          <div className="horas-entrada-header">
            <div className="horas-entrada-header-left">
              <label>
                <span>DE:</span>
                <input type="date" value={coaInicio} onChange={(e) => setCoaInicio(e.target.value)} />
              </label>
              <label>
                <span>ATÉ:</span>
                <input type="date" value={coaFim} onChange={(e) => setCoaFim(e.target.value)} />
              </label>
              <label>
                <span>TURNO:</span>
                <select value={coaTurno} onChange={(e) => setCoaTurno(e.target.value)}>
                  <option value="TODOS">Todos</option>
                  <option value="A">A</option>
                  <option value="B">B</option>
                </select>
              </label>
              <label>
                <span>EQUIPAMENTO:</span>
                <input type="number" min="1" step="1" value={coaEquipamento} placeholder="Todos" onChange={(e) => setCoaEquipamento(e.target.value)} />
              </label>
              <button type="button" className="btn primary" disabled={busy != null} onClick={() => void consultarCoa()}>
                {busy === "coa" ? "Consultando…" : "Consultar COA"}
              </button>
            </div>
          </div>
          <p className="lead">{coaStatus}</p>
          <div className="table-wrap horas-coa-table-wrap" role="region" aria-label="Lançamentos de horas da API" tabIndex={0}>
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
                  <th>Motor rodadas</th>
                  <th>Elevador rodadas</th>
                  <th />
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
                    <td>{fmtNum(it.horasMotorRodadas)}</td>
                    <td>{fmtNum(it.horasElevadorRodadas)}</td>
                    <td><button type="button" className="btn" disabled={busy != null || it.id == null} onClick={() => {
                      setData(it.data ?? hojeIso());
                      setTurno(it.turno || "A");
                      setLinhas([{ tipoEquipamento: "COLHEDEIRA", codEquipamento: it.codEquipamento, horaMotor: it.horaMotor, horasElevador: it.horasElevador, apiId: it.id }]);
                      setUltimas({});
                      setPainel("entrada");
                    }}>Editar</button></td>
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
              <div className="horas-entrada-header-left">
                <label>
                  <span>DATA:</span>
                  <input
                    type="date"
                    value={data}
                    onChange={(e) => {
                      setData(e.target.value);
                      setUltimas({});
                    }}
                  />
                </label>
                <label>
                  <span>TURNO:</span>
                  <select
                    value={turno}
                    onChange={(e) => {
                      setTurno(e.target.value);
                      setUltimas({});
                    }}
                  >
                    <option value="A">A</option>
                    <option value="B">B</option>
                  </select>
                </label>
              </div>
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
                            className="btn horas-entrada-remove"
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
            <button type="button" className="btn horas-entrada-add" onClick={() => setLinhas((prev) => [...prev, emptyLinha()])}>
              + Equipamento
            </button>
            <p className="lead">Última hora = apontamento anterior do mesmo equipamento (turno/data anteriores).</p>
          </div>


        </>
      )}
    </section>
  );
}
