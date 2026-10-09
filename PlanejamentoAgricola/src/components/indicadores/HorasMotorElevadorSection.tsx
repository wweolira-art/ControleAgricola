import { useEffect, useMemo, useState } from "react";
import { api, type ColheitaHorasRow } from "../../api";
import { anexarHorasRodadas } from "../../lib/colheita-horas-rodadas";
import { cell, formatOrdsDate } from "../colheita/colheita-utils";

function fmtHoras(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function diaFromData(value: string | null | undefined) {
  if (!value) return null;
  const s = String(value).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})/);
  if (!br) return null;
  const ano = br[3].length === 2 ? `20${br[3]}` : br[3];
  return `${ano}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
}

function addDays(dia: string, days: number) {
  const match = dia.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return dia;
  const dt = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

function dentroPeriodo(row: ColheitaHorasRow, inicio: string, fim: string) {
  const dia = diaFromData(row.data);
  if (!dia) return false;
  return dia >= inicio && dia <= fim;
}

type TipoOpcao = { codTipoEquipamento: number; label: string };

type Props = {
  dataInicio: string;
  dataFim: string;
  consultarToken: number;
  onLoadingChange?: (loading: boolean) => void;
};

export function HorasMotorElevadorSection({ dataInicio, dataFim, consultarToken, onLoadingChange }: Props) {
  const [rows, setRows] = useState<ColheitaHorasRow[]>([]);
  const [tipos, setTipos] = useState<TipoOpcao[]>([]);
  const [codTipoEquipamento, setCodTipoEquipamento] = useState<number | null>(null);
  const [equipamentoFiltro, setEquipamentoFiltro] = useState("");
  const [resumo, setResumo] = useState<{ totalLinhas?: number; qtdEquipamentos?: number; truncado?: boolean } | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [consultado, setConsultado] = useState(false);

  useEffect(() => {
    if (!consultarToken) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        onLoadingChange?.(true);
        setErr(null);
        const data = await api.colheitaHorasMaquina({ dataInicio: addDays(dataInicio, -1), dataFim });
        if (cancelled) return;
        setRows(data.dados);
        setTipos(data.filtros?.tipos ?? []);
        setResumo(data.resumo);
        setConsultado(true);
        setCodTipoEquipamento((prev) => {
          if (prev == null) return null;
          const stillValid = (data.filtros?.tipos ?? []).some((t) => t.codTipoEquipamento === prev);
          return stillValid ? prev : null;
        });
      } catch (e) {
        if (cancelled) return;
        setRows([]);
        setTipos([]);
        setResumo(null);
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
    // Consulta só ao clicar em Consultar (token); datas vêm do render desse clique.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dataInicio/dataFim deliberadamente fora
  }, [consultarToken, onLoadingChange]);

  const linhasContexto = useMemo(() => {
    const equipamento = equipamentoFiltro.trim().toLowerCase();
    return rows.filter((r) => {
      if (codTipoEquipamento != null && r.codTipoEquipamento !== codTipoEquipamento) return false;
      if (!equipamento) return true;
      return String(r.codEquipamento ?? "").toLowerCase().includes(equipamento);
    });
  }, [rows, codTipoEquipamento, equipamentoFiltro]);

  const comRodadasContexto = useMemo(() => anexarHorasRodadas(linhasContexto), [linhasContexto]);

  const comRodadas = useMemo(
    () => comRodadasContexto.filter((row) => dentroPeriodo(row as ColheitaHorasRow, dataInicio, dataFim)),
    [comRodadasContexto, dataInicio, dataFim],
  );

  const totaisRodadas = useMemo(
    () =>
      comRodadas.reduce(
        (acc, row) => {
          acc.motor += row.horasMotorRodadas ?? 0;
          acc.elevador += row.horasElevadorRodadas ?? 0;
          return acc;
        },
        { motor: 0, elevador: 0 },
      ),
    [comRodadas],
  );

  const resumoFiltrado = useMemo(() => {
    if (!consultado) return null;
    const equipamentos = new Set(comRodadas.map((r) => r.codEquipamento).filter((v) => v != null));
    return {
      totalLinhas: comRodadas.length,
      qtdEquipamentos: equipamentos.size,
      truncado: resumo?.truncado,
    };
  }, [consultado, comRodadas, resumo?.truncado]);

  if (!consultado && !loading) {
    return <p className="lead">Consulte o período para ver as horas de motor e elevador.</p>;
  }

  return (
    <>
      <div className="horas-motor-filter no-print">
        <label>
          Tipo de equipamento
          <select
            value={codTipoEquipamento ?? ""}
            disabled={loading || !tipos.length}
            onChange={(e) => setCodTipoEquipamento(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Todos</option>
            {tipos.map((tipo) => (
              <option key={tipo.codTipoEquipamento} value={tipo.codTipoEquipamento}>
                {tipo.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Código do equipamento
          <input
            value={equipamentoFiltro}
            disabled={loading || !rows.length}
            onChange={(e) => setEquipamentoFiltro(e.target.value)}
            placeholder="Ex.: 5001"
          />
        </label>
      </div>

      {err ? (
        <p className="lead" style={{ color: "var(--danger)" }}>
          {err}
        </p>
      ) : null}
      {resumoFiltrado ? (
        <div className="kpis">
          <div className="kpi">
            <span>Registros</span>
            <strong>{resumoFiltrado.totalLinhas}</strong>
          </div>
          <div className="kpi">
            <span>Equipamentos</span>
            <strong>{resumoFiltrado.qtdEquipamentos}</strong>
          </div>
          <div className="kpi">
            <span>Motor rodadas</span>
            <strong>{fmtHoras(totaisRodadas.motor)}</strong>
          </div>
          <div className="kpi">
            <span>Elevador rodadas</span>
            <strong>{fmtHoras(totaisRodadas.elevador)}</strong>
          </div>
        </div>
      ) : null}
      {resumoFiltrado?.truncado ? (
        <p className="lead" style={{ color: "var(--warn, #b8860b)" }}>
          Resultado parcialmente truncado — reduza o período se necessário.
        </p>
      ) : null}
      {loading && !rows.length ? <p className="lead">Carregando horas…</p> : null}
      {!loading && consultado && !comRodadas.length && !err ? (
        <p className="lead">
          Nenhum registro de horas no período
          {codTipoEquipamento != null || equipamentoFiltro.trim() ? " para os filtros selecionados" : ""}.
        </p>
      ) : null}
      {comRodadas.length ? (
        <section className="panel indicadores-tabela-panel">
          <h3 className="indicadores-tabela-title">Horas motor / Elevador</h3>
          <div className="table-wrap">
            <table className="data indicadores-producao-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Equipamento</th>
                  <th>Tipo</th>
                  <th>Turno</th>
                  <th className="num">Horas motor</th>
                  <th className="num">Horas motor rodadas</th>
                  <th className="num">Horas elevador</th>
                  <th className="num">Horas elevador rodadas</th>
                </tr>
              </thead>
              <tbody>
                {comRodadas.map((r, i) => (
                  <tr key={r.id != null ? String(r.id) : `${r.codEquipamento}-${r.data}-${r.turno}-${i}`}>
                    <td>{formatOrdsDate(r.data)}</td>
                    <td>{cell(r.codEquipamento)}</td>
                    <td>{r.tipoDescricao?.trim() || (r.codTipoEquipamento != null ? String(r.codTipoEquipamento) : "—")}</td>
                    <td>{cell(r.turno)}</td>
                    <td className="num">{fmtHoras(r.horaMotor)}</td>
                    <td className="num">{fmtHoras(r.horasMotorRodadas)}</td>
                    <td className="num">{fmtHoras(r.horasElevador)}</td>
                    <td className="num">{fmtHoras(r.horasElevadorRodadas)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </>
  );
}
