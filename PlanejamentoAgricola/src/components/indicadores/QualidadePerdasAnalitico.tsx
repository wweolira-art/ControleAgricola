import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  api,
  type PerdasAnaliticoAgrupamento,
  type PerdasAnaliticoLinha,
  type PerdasColheitaAnaliticoData,
} from "../../api";
import { ConsultaProgressBar } from "../ConsultaProgressBar";
import { PrintButton } from "../PrintButton";
import { QualidadeEquipamentoFilter, type QualidadeEquipamentoOpcao } from "./QualidadeEquipamentoFilter";

const TIPO_COLHEDORA = 81;

const AGRUPAMENTOS: Array<{ id: PerdasAnaliticoAgrupamento; label: string }> = [
  { id: "tipoCorte", label: "Tipo de corte" },
  { id: "equipamento", label: "Equipamento" },
  { id: "operador", label: "Operador" },
  { id: "fazenda", label: "Fazenda / talhão" },
  { id: "frente", label: "Frente" },
  { id: "turno", label: "Turno" },
  { id: "mes", label: "Mês" },
  { id: "nenhum", label: "Sem agrupamento" },
];

function fmtDate(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString("pt-BR");
}

function fmtNum(n: number | null | undefined, digits = 2) {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);
}

function fmtPct(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${fmtNum(n, 2)}%`;
}

function LinhaTabela({
  row,
  resumoTalhao,
  subtotal,
}: {
  row: PerdasAnaliticoLinha;
  resumoTalhao?: boolean;
  subtotal?: boolean;
}) {
  return (
    <tr className={subtotal ? "perdas-analitico-subtotal-row" : undefined}>
      <td>{subtotal ? <strong>{row.fazZonaTalhao}</strong> : row.fazZonaTalhao}</td>
      <td className="num">{row.numeroAmostra || "—"}</td>
      <td className="num">{fmtNum(row.areaAmostra, 2)}</td>
      <td className="num">{subtotal ? <strong>{fmtNum(row.estilhaco, 2)}</strong> : fmtNum(row.estilhaco, 2)}</td>
      <td className="num">{subtotal ? <strong>{fmtNum(row.desconte, 2)}</strong> : fmtNum(row.desconte, 2)}</td>
      <td className="num">{subtotal ? <strong>{fmtNum(row.canaAgarrada, 2)}</strong> : fmtNum(row.canaAgarrada, 2)}</td>
      <td className="num">{subtotal ? <strong>{fmtNum(row.canaPicada, 2)}</strong> : fmtNum(row.canaPicada, 2)}</td>
      <td className="num">{subtotal ? <strong>{fmtNum(row.tolete, 2)}</strong> : fmtNum(row.tolete, 2)}</td>
      <td className="num">{subtotal ? <strong>{fmtNum(row.tocoMecanizado, 2)}</strong> : fmtNum(row.tocoMecanizado, 2)}</td>
      <td className="num">{subtotal ? <strong>{fmtNum(row.totalPerdas, 2)}</strong> : fmtNum(row.totalPerdas, 2)}</td>
      <td className="num">{subtotal ? <strong>{fmtNum(row.perdasTcHa, 2)}</strong> : fmtNum(row.perdasTcHa, 2)}</td>
      <td className="num">{subtotal ? <strong>{fmtPct(row.pctPerdasEst)}</strong> : fmtPct(row.pctPerdasEst)}</td>
      <td className="num">{subtotal ? <strong>{fmtPct(row.pctPerdasReal)}</strong> : fmtPct(row.pctPerdasReal)}</td>
    </tr>
  );
}

function TabelaCabecalho({ resumoTalhao }: { resumoTalhao?: boolean }) {
  return (
    <thead>
      <tr>
        <th>Faz - Zona - Talhão</th>
        <th className="num">{resumoTalhao ? "Amostras" : "Número"}</th>
        <th className="num">Área Amost</th>
        <th className="num">Estilhaço</th>
        <th className="num">Desponte</th>
        <th className="num">Cana agarrada</th>
        <th className="num">Cana picada</th>
        <th className="num">Tolete</th>
        <th className="num">Toco mec. &gt;3cm</th>
        <th className="num">Total perdas</th>
        <th className="num">Perdas TC/ha</th>
        <th className="num">(%) Perdas est.</th>
        <th className="num">(%) Perdas real</th>
      </tr>
    </thead>
  );
}

export function QualidadePerdasAnalitico({
  dataInicio,
  dataFim,
  consultarToken,
}: {
  dataInicio: string;
  dataFim: string;
  consultarToken: number;
}) {
  const [agrupamento, setAgrupamento] = useState<PerdasAnaliticoAgrupamento>("tipoCorte");
  const [data, setData] = useState<PerdasColheitaAnaliticoData | null>(null);
  const [equipOpcoes, setEquipOpcoes] = useState<QualidadeEquipamentoOpcao[]>([]);
  const [equipSelected, setEquipSelected] = useState<Set<number>>(() => new Set());
  const [tiposOpcoes, setTiposOpcoes] = useState<QualidadeEquipamentoOpcao[]>([]);
  const [tiposSelected, setTiposSelected] = useState<Set<number>>(() => new Set([TIPO_COLHEDORA]));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const equipamentosFiltro = useMemo(() => {
    if (!equipSelected.size || equipSelected.size === equipOpcoes.length) return undefined;
    return [...equipSelected];
  }, [equipOpcoes.length, equipSelected]);

  const tiposFiltroKey = useMemo(() => {
    const codigos = !tiposSelected.size
      ? tiposOpcoes.map((tipo) => tipo.codEquipamento)
      : [...tiposSelected];
    return [...codigos].sort((a, b) => a - b).join(",");
  }, [tiposOpcoes, tiposSelected]);

  const tiposContexto = useMemo(() => {
    if (!tiposOpcoes.length) return "";
    if (!tiposSelected.size || tiposSelected.size >= tiposOpcoes.length) return " · todos os tipos de equipamento";
    const nomes = tiposOpcoes
      .filter((tipo) => tiposSelected.has(tipo.codEquipamento))
      .map((tipo) => tipo.label);
    return nomes.length ? ` · tipo: ${nomes.join(", ")}` : "";
  }, [tiposOpcoes, tiposSelected]);

  const load = useCallback(async () => {
    if (!dataInicio || !dataFim) return;
    setLoading(true);
    setError(null);
    try {
      const codTiposEquipamento = tiposFiltroKey
        .split(",")
        .map((part) => Number(part))
        .filter((cod) => Number.isFinite(cod) && cod > 0);
      const result = await api.indicadoresColheitaPerdasAnalitico({
        dataInicio,
        dataFim,
        agrupamento,
        codEquipamentos: equipamentosFiltro,
        codTiposEquipamento: codTiposEquipamento.length ? codTiposEquipamento : undefined,
      });
      setData(result);
      const equipamentos = result.equipamentosOpcoes ?? [];
      setEquipOpcoes(equipamentos);
      setEquipSelected((prev) => {
        if (!prev.size) return prev;
        const valid = new Set(equipamentos.map((eq) => eq.codEquipamento));
        const next = new Set([...prev].filter((cod) => valid.has(cod)));
        return next.size === prev.size ? prev : next;
      });
      if (result.tiposOpcoes?.length) {
        const opcoes = result.tiposOpcoes.map((tipo) => ({
          codEquipamento: tipo.codTipoEquipamento,
          label: tipo.label,
        }));
        setTiposOpcoes(opcoes);
        setTiposSelected((prev) => {
          if (!prev.size) return prev;
          const valid = new Set(opcoes.map((tipo) => tipo.codEquipamento));
          const next = new Set([...prev].filter((cod) => valid.has(cod)));
          if (next.size === prev.size) return prev;
          if (next.size) return next;
          return valid.has(TIPO_COLHEDORA) ? new Set([TIPO_COLHEDORA]) : new Set();
        });
      }
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [agrupamento, dataFim, dataInicio, equipamentosFiltro, tiposFiltroKey]);

  useEffect(() => {
    if (consultarToken <= 0) return;
    void load();
  }, [consultarToken, agrupamento, equipamentosFiltro, tiposFiltroKey, load]);

  const now = new Date();

  return (
    <section className="perdas-analitico">
      <div className="perdas-analitico-toolbar no-print">
        <label>
          Agrupar por
          <select value={agrupamento} onChange={(e) => setAgrupamento(e.target.value as PerdasAnaliticoAgrupamento)}>
            {AGRUPAMENTOS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <QualidadeEquipamentoFilter
          opcoes={tiposOpcoes}
          selected={tiposSelected}
          onChange={setTiposSelected}
          disabled={loading}
          rotulo="Tipo"
          titulo="Tipos de equipamento"
          rotuloTodos="Todos os tipos"
          rotuloUm="1 tipo"
          placeholderBusca="Buscar tipo…"
          vazioBusca="Nenhum tipo encontrado."
        />
        <QualidadeEquipamentoFilter
          opcoes={equipOpcoes}
          selected={equipSelected}
          onChange={setEquipSelected}
          disabled={loading}
        />
        <button type="button" className="btn primary" disabled={loading} onClick={() => void load()}>
          {loading ? "Consultando…" : "Atualizar relatório"}
        </button>
        <PrintButton />
      </div>

      <ConsultaProgressBar active={loading} label="Consultando relatório analítico de perdas…" className="consulta-progress--inline no-print" />

      {error ? (
        <p className="lead error no-print">{error}</p>
      ) : null}

      {!data && !loading ? (
        <p className="lead no-print">Consulte o período para visualizar o relatório analítico.</p>
      ) : null}

      {data ? (
        <div className="perdas-analitico-sheet">
          <header className="perdas-analitico-header">
            <div className="perdas-analitico-header-brand">
              <img src="/elejota-agro-logo.png" alt="Elejota Agro" className="liberacao-colheita-logo perdas-analitico-logo" />
            </div>
            <div className="perdas-analitico-header-title">
              <h3>Relatório Perdas Colheita</h3>
              <span>Analítico</span>
            </div>
            <div className="perdas-analitico-header-meta">
              <span>{now.toLocaleDateString("pt-BR")}</span>
              <span>{now.toLocaleTimeString("pt-BR")}</span>
            </div>
          </header>

          <div className="perdas-analitico-context">
            <p>
              Período: {fmtDate(data.filtros.dataInicio)} a {fmtDate(data.filtros.dataFim)}
            </p>
            <p>
              Agrupamento: {AGRUPAMENTOS.find((item) => item.id === data.filtros.agrupamento)?.label ?? data.filtros.agrupamento}
              {data.filtros.agrupamento === "fazenda"
                ? " · média por talhão · subtotal com soma de perdas por fazenda"
                : ""}
              {tiposContexto}
              {equipamentosFiltro?.length ? ` · ${equipamentosFiltro.length} equipamento(s) filtrado(s)` : ""}
            </p>
            <p>Amostras: {data.amostras}</p>
          </div>

          <div className="table-wrap perdas-analitico-table-wrap">
            <table className="data perdas-analitico-table">
              <TabelaCabecalho resumoTalhao={data.filtros.agrupamento === "fazenda"} />
              <tbody>
                {data.grupos.map((grupo) => (
                  <Fragment key={grupo.chave}>
                    {data.filtros.agrupamento !== "nenhum" ? (
                      <tr className="perdas-analitico-group-row">
                        <td colSpan={13}>{grupo.label}</td>
                      </tr>
                    ) : null}
                    {grupo.linhas.map((row) => (
                      <LinhaTabela
                        key={`${grupo.chave}-${row.fazZonaTalhao}`}
                        row={row}
                        resumoTalhao={data.filtros.agrupamento === "fazenda"}
                      />
                    ))}
                    {data.filtros.agrupamento === "fazenda" && grupo.subtotal ? (
                      <LinhaTabela
                        key={`${grupo.chave}-subtotal`}
                        row={grupo.subtotal}
                        resumoTalhao
                        subtotal
                      />
                    ) : null}
                  </Fragment>
                ))}
                {data.totais ? (
                  <tr className="perdas-analitico-total-row">
                    <td>
                      <strong>Total</strong>
                    </td>
                    <td className="num">—</td>
                    <td className="num">—</td>
                    <td className="num">
                      <strong>{fmtNum(data.totais.estilhaco, 2)}</strong>
                    </td>
                    <td className="num">
                      <strong>{fmtNum(data.totais.desconte, 2)}</strong>
                    </td>
                    <td className="num">
                      <strong>{fmtNum(data.totais.canaAgarrada, 2)}</strong>
                    </td>
                    <td className="num">
                      <strong>{fmtNum(data.totais.canaPicada, 2)}</strong>
                    </td>
                    <td className="num">
                      <strong>{fmtNum(data.totais.tolete, 2)}</strong>
                    </td>
                    <td className="num">
                      <strong>{fmtNum(data.totais.tocoMecanizado, 2)}</strong>
                    </td>
                    <td className="num">
                      <strong>{fmtNum(data.totais.totalPerdas, 2)}</strong>
                    </td>
                    <td className="num">
                      <strong>{fmtNum(data.totais.perdasTcHa, 2)}</strong>
                    </td>
                    <td className="num">
                      <strong>{fmtPct(data.totais.pctPerdasEst)}</strong>
                    </td>
                    <td className="num">
                      <strong>{fmtPct(data.totais.pctPerdasReal)}</strong>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}
