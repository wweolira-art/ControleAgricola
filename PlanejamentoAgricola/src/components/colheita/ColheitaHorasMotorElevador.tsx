import { useEffect, useRef, useState } from "react";
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
  const [coaTipo, setCoaTipo] = useState("");
  const [tiposEquipamento, setTiposEquipamento] = useState<Array<{ codTipoEquipamento: number; label: string }>>([]);
  const [erroTipos, setErroTipos] = useState(false);
  useEffect(() => {
    let ativo = true;
    void api.horasMotorTipos().then((result) => { if (ativo) setTiposEquipamento(result.tipos); })
      .catch(() => { if (ativo) setErroTipos(true); });
    return () => { ativo = false; };
  }, []);
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
  const [edicao, setEdicao] = useState<{
    id: number; data: string; turno: string; codEquipamento: number;
    horaMotor: number | null; horasElevador: number | null;
  } | null>(null);
  const [erroEdicao, setErroEdicao] = useState<string | null>(null);
  const dialogEdicao = useRef<HTMLDialogElement>(null);

  // A leitura anterior é usada tanto como referência visual quanto no cálculo
  // das horas rodadas. Faça a busca automaticamente quando forem informados
  // os equipamentos, sem obrigar o usuário a clicar em "Última hora".
  const codigosParaUltima = linhas
    .map((row) => row.codEquipamento)
    .filter((cod): cod is number => cod != null && Number.isFinite(cod));
  const chaveCodigosParaUltima = [...new Set(codigosParaUltima)].sort((a, b) => a - b).join(",");

  useEffect(() => {
    const codigos = chaveCodigosParaUltima
      .split(",")
      .map(Number)
      .filter((cod) => Number.isFinite(cod));
    if (!codigos.length) {
      setUltimas({});
      return;
    }

    let ativo = true;
    const timer = window.setTimeout(() => {
      void api.horasMotorUltimaAntes({ data, turno, equipamentos: codigos })
        .then((result) => {
          if (ativo) setUltimas(result.ultimas ?? {});
        })
        // A busca manual continua exibindo o erro ao usuário. Na busca
        // automática, mantenha os campos vazios para não interromper a digitação.
        .catch(() => {
          if (ativo) setUltimas({});
        });
    }, 400);

    return () => {
      ativo = false;
      window.clearTimeout(timer);
    };
  }, [data, turno, chaveCodigosParaUltima]);

  useEffect(() => {
    const dialog = dialogEdicao.current;
    if (edicao && dialog && !dialog.open) dialog.showModal();
    if (!edicao && dialog?.open) dialog.close();
  }, [edicao]);

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
      // Deixa o formulário pronto para o próximo apontamento, sem exigir que
      // o operador apague código e horímetros linha por linha.
      setLinhas((prev) => prev.map(() => emptyLinha()));
      setUltimas({});
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
      const json = await api.horasMotorConsultarCoa({ dataInicio: inicio, dataFim: fim, turno: coaTurno, equipamento: coaEquipamento.trim(), codTipoEquipamento: coaTipo ? Number(coaTipo) : undefined });
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

  const salvarEdicao = async () => {
    if (!edicao || busy != null) return;
    setBusy("editar");
    setErroEdicao(null);
    try {
      const result = await api.horasMotorEnviarCoa({
        data: edicao.data,
        turno: edicao.turno,
        equipamentos: [{
          tipoEquipamento: "OUTRO", codEquipamento: edicao.codEquipamento,
          horaMotor: edicao.horaMotor, horasElevador: edicao.horasElevador, apiId: edicao.id,
        }],
      });
      if (!result.ok) throw new Error(result.erros?.map((item) => item.erro).join(" | ") || result.error || "Não foi possível salvar.");
      setEdicao(null);
      showToast("Lançamento atualizado na API.", "ok");
      await consultarCoa();
    } catch (e) {
      setErroEdicao(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const excluirCoa = async (item: { id: number | null; data: string | null; turno: string | null; codEquipamento: number | null }) => {
    if (item.id == null || busy != null) return;
    const descricao = `${fmtData(item.data)} · equipamento ${item.codEquipamento ?? "—"} · turno ${item.turno ?? "—"}`;
    if (!window.confirm(`Excluir este lançamento?\n\n${descricao}\n\nEsta ação não pode ser desfeita.`)) return;
    setBusy("excluir");
    try {
      await api.colheitaExcluirHorasMaquina(item.id);
      setCoaItems((items) => items.filter((row) => row.id !== item.id));
      showToast("Lançamento excluído da API.", "ok");
      await consultarCoa();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Não foi possível excluir o lançamento.", "erro");
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
              <label>
                <span>TIPO DE EQUIPAMENTO:</span>
                <select value={coaTipo} onChange={(event) => setCoaTipo(event.target.value)}>
                  <option value="">Todos</option>
                  {tiposEquipamento.map((tipo) => <option key={tipo.codTipoEquipamento} value={tipo.codTipoEquipamento}>{tipo.label}</option>)}
                </select>
              </label>
              {erroTipos ? <span role="alert">Não foi possível carregar os tipos. Atualize a página para tentar novamente.</span> : null}
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
                    <td className={(it.horasMotorRodadas ?? 0) > 50 ? "horas-rodadas-excedidas" : undefined}>{fmtNum(it.horasMotorRodadas)}</td>
                    <td className={(it.horasElevadorRodadas ?? 0) > 50 ? "horas-rodadas-excedidas" : undefined}>{fmtNum(it.horasElevadorRodadas)}</td>
                    <td>
                      <button type="button" className="btn" disabled={busy != null || it.id == null || it.codEquipamento == null} onClick={() => {
                        if (it.id == null || it.codEquipamento == null) return;
                        setErroEdicao(null);
                        setEdicao({ id: it.id, data: it.data ?? hojeIso(), turno: it.turno || "A", codEquipamento: it.codEquipamento, horaMotor: it.horaMotor, horasElevador: it.horasElevador });
                      }}>Editar</button>
                      <button type="button" className="btn danger" disabled={busy != null || it.id == null} onClick={() => void excluirCoa(it)}>
                        {busy === "excluir" ? "Excluindo…" : "Excluir"}
                      </button>
                    </td>
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
      <dialog ref={dialogEdicao} className="horas-edicao-dialog" aria-labelledby="horas-edicao-title"
        onCancel={(event) => { event.preventDefault(); if (busy !== "editar") setEdicao(null); }}>
        {edicao ? <form onSubmit={(event) => { event.preventDefault(); void salvarEdicao(); }}>
          <h3 id="horas-edicao-title">Editar lançamento #{edicao.id}</h3>
          <fieldset disabled={busy === "editar"}>
            <label>Data<input autoFocus required type="date" value={edicao.data} onChange={(event) => setEdicao({ ...edicao, data: event.target.value })} /></label>
            <label>Turno<select value={edicao.turno} onChange={(event) => setEdicao({ ...edicao, turno: event.target.value })}><option value="A">A</option><option value="B">B</option></select></label>
            <label>Equipamento<input required type="number" min="1" step="1" value={edicao.codEquipamento} onChange={(event) => setEdicao({ ...edicao, codEquipamento: Number(event.target.value) })} /></label>
            <label>Horímetro do motor<input required type="number" min="0" step="any" value={edicao.horaMotor ?? ""} onChange={(event) => setEdicao({ ...edicao, horaMotor: num(event.target.value) })} /></label>
            <label>Horímetro do elevador<input type="number" min="0" step="any" value={edicao.horasElevador ?? ""} onChange={(event) => setEdicao({ ...edicao, horasElevador: num(event.target.value) })} /></label>
          </fieldset>
          {erroEdicao ? <p role="alert" className="horas-entrada-toast is-erro">{erroEdicao}</p> : null}
          <div className="horas-edicao-actions">
            <button type="button" className="btn" disabled={busy === "editar"} onClick={() => setEdicao(null)}>Cancelar</button>
            <button type="submit" className="btn primary" disabled={busy === "editar"}>{busy === "editar" ? "Salvando…" : "Salvar alterações"}</button>
          </div>
        </form> : null}
      </dialog>
    </section>
  );
}
