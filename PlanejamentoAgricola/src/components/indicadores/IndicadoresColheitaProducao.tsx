import { ConsultaProgressBar } from "../ConsultaProgressBar";
import { useReportAutoRefresh } from "./useReportAutoRefresh";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  type IndicadoresColheitaProducaoData,
  type IndicadoresColheitaQualidadeData,
  type RelatorioDiarioProducaoData,
} from "../../api";
import { useApp } from "../../store";
import { safraDefaultRange } from "../colheita/colheita-utils";
import { ConsumoCombustivelSection } from "./ConsumoCombustivelSection";
import { FrotaDisponibilidadeDashboard } from "./FrotaDisponibilidadeDashboard";
import { QualidadeColheitaSection } from "./QualidadeColheitaSection";
import { QualidadeEquipamentoFilter, type QualidadeEquipamentoOpcao } from "./QualidadeEquipamentoFilter";
import { QualidadePerdasAnalitico } from "./QualidadePerdasAnalitico";
import { HorasMotorElevadorSection } from "./HorasMotorElevadorSection";
import { ConsumoOleoHidraulicoSection } from "./ConsumoOleoHidraulicoSection";
import { RelatorioDesempenhoColheita, type DesempenhoView } from "./RelatorioDesempenhoColheita";
import type { ComparativoDisponibilidadeMensal } from "../../lib/comparativo-disponibilidade";
import { ParadasColheitaSection } from "./ParadasColheitaSection";

type ColheitaSubAba =
  | "frota-disponibilidade"
  | "paradas-colheita"
  | "desempenho-producao"
  | "qualidade-colheita"
  | "consumo-combustivel"
  | "consumo-oleo-hidraulico"
  | "horas-motor-elevador";
type QualidadeView = "dashboard" | "analitico";

const SUB_ABA_PATHS: Record<ColheitaSubAba, string> = {
  "frota-disponibilidade": "frota-e-disponibilidade",
  "paradas-colheita": "paradas-na-colheita",
  "desempenho-producao": "desempenho-e-producao",
  "qualidade-colheita": "qualidade-colheita",
  "consumo-combustivel": "consumo-de-combustivel",
  "consumo-oleo-hidraulico": "consumo-de-oleo-hidraulico",
  "horas-motor-elevador": "horas-motor-elevador",
};

const DESEMPENHO_VIEW_PATHS: Record<DesempenhoView, string> = {
  producao: "entrada-cana-maquina",
  horas: "horas-trabalhadas-x-horas-paradas",
  ctt: "indicador-ctt",
  disponibilidade: "disponibilidade-mes-safra",
};

function normalizedPathKey(text: string) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function subAbaFromPath(parts?: string[]): ColheitaSubAba | null {
  const key = normalizedPathKey(parts?.[0] ?? "");
  return (Object.entries(SUB_ABA_PATHS).find(([id, slug]) => key === normalizedPathKey(id) || key === normalizedPathKey(slug))?.[0] ??
    null) as ColheitaSubAba | null;
}

function desempenhoViewFromPath(parts?: string[]): DesempenhoView | null {
  const key = normalizedPathKey(parts?.[1] ?? parts?.[0] ?? "");
  return (Object.entries(DESEMPENHO_VIEW_PATHS).find(([id, slug]) => key === normalizedPathKey(id) || key === normalizedPathKey(slug))?.[0] ??
    null) as DesempenhoView | null;
}

function todayLocalIso() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

function desempenhoPeriodoAtual() {
  const today = new Date();
  return {
    from: `${today.getFullYear()}-09-01`,
    to: todayLocalIso(),
  };
}

export function IndicadoresColheitaProducao({
  initialSubPath,
  onSubNavigate,
}: {
  initialSubPath?: string[];
  onSubNavigate?: (subPath: string[]) => void;
}) {
  const { safra } = useApp();
  const defaults = useMemo(() => safraDefaultRange(safra?.code), [safra?.code]);
  const desempenhoDefaults = useMemo(() => desempenhoPeriodoAtual(), []);
  const [dataInicio, setDataInicio] = useState(defaults.from);
  const [dataFim, setDataFim] = useState(defaults.to);

  useEffect(() => {
    setDataInicio(defaults.from);
    setDataFim(defaults.to);
  }, [defaults.from, defaults.to]);
  const initialSubAba = useMemo(() => subAbaFromPath(initialSubPath), [initialSubPath]);
  const initialDesempenhoView = useMemo(() => desempenhoViewFromPath(initialSubPath), [initialSubPath]);
  const [subAba, setSubAba] = useState<ColheitaSubAba>(initialSubAba ?? "frota-disponibilidade");
  const [frotaData, setFrotaData] = useState<IndicadoresColheitaProducaoData | null>(null);
  const [periodData, setPeriodData] = useState<IndicadoresColheitaProducaoData | null>(null);
  const [relatorioDiarioData, setRelatorioDiarioData] = useState<RelatorioDiarioProducaoData | null>(null);
  const [producaoData, setProducaoData] = useState<IndicadoresColheitaProducaoData | null>(null);
  const [horasData, setHorasData] = useState<IndicadoresColheitaProducaoData | null>(null);
  const [cttData, setCttData] = useState<IndicadoresColheitaProducaoData | null>(null);
  const [desempenhoView, setDesempenhoView] = useState<DesempenhoView>(initialDesempenhoView ?? "producao");
  const [dispCompData, setDispCompData] = useState<ComparativoDisponibilidadeMensal | null>(null);
  const [loadingFrota, setLoadingFrota] = useState(false);
  const [loadingPeriod, setLoadingPeriod] = useState(false);
  const [loadingDesempenho, setLoadingDesempenho] = useState(false);
  const [errFrota, setErrFrota] = useState<string | null>(null);
  const [errPeriod, setErrPeriod] = useState<string | null>(null);
  const [qualEquipOpcoes, setQualEquipOpcoes] = useState<QualidadeEquipamentoOpcao[]>([]);
  const [qualEquipSelected, setQualEquipSelected] = useState<Set<number>>(() => new Set());
  const [qualidadeView, setQualidadeView] = useState<QualidadeView>("dashboard");
  const [qualidadeConsultToken, setQualidadeConsultToken] = useState(0);
  const [horasConsultToken, setHorasConsultToken] = useState(0);
  const [oleoConsultToken, setOleoConsultToken] = useState(0);
  const [paradasConsultToken, setParadasConsultToken] = useState(0);
  const [loadingQualidade, setLoadingQualidade] = useState(false);
  const [loadingHoras, setLoadingHoras] = useState(false);
  const [loadingOleo, setLoadingOleo] = useState(false);
  const [loadingParadas, setLoadingParadas] = useState(false);
  const [qualidadeConsultada, setQualidadeConsultada] = useState(false);
  const qualidadeSemFiltroRef = useRef<IndicadoresColheitaQualidadeData | null>(null);
  const qualidadeReqRef = useRef(0);
  const qualFilterKeyRef = useRef<string | null>(null);

  const refDate = useMemo(() => new Date().toISOString().slice(0, 10), []);

  useEffect(() => {
    if (subAba !== "desempenho-producao") return;
    setDataInicio(desempenhoDefaults.from);
    setDataFim(desempenhoDefaults.to);
  }, [desempenhoDefaults.from, desempenhoDefaults.to, subAba]);

  useEffect(() => {
    if (initialSubAba) setSubAba(initialSubAba);
  }, [initialSubAba]);

  useEffect(() => {
    if (initialDesempenhoView) setDesempenhoView(initialDesempenhoView);
  }, [initialDesempenhoView]);

  const navigateSubAba = useCallback(
    (next: ColheitaSubAba) => {
      setSubAba(next);
      const nextView = next === "desempenho-producao" ? desempenhoView : null;
      onSubNavigate?.(nextView ? [SUB_ABA_PATHS[next], DESEMPENHO_VIEW_PATHS[nextView]] : [SUB_ABA_PATHS[next]]);
    },
    [desempenhoView, onSubNavigate],
  );

  const navigateDesempenhoView = useCallback(
    (next: DesempenhoView) => {
      setDesempenhoView(next);
      onSubNavigate?.([SUB_ABA_PATHS["desempenho-producao"], DESEMPENHO_VIEW_PATHS[next]]);
    },
    [onSubNavigate],
  );

  const qualEquipamentosFiltro = useMemo(() => {
    if (!qualEquipSelected.size || qualEquipSelected.size === qualEquipOpcoes.length) return undefined;
    return [...qualEquipSelected];
  }, [qualEquipOpcoes.length, qualEquipSelected]);

  const qualFilterKey = useMemo(
    () => qualEquipamentosFiltro?.slice().sort((a, b) => a - b).join(",") ?? "",
    [qualEquipamentosFiltro],
  );

  const applyQualidadeEquipFilter = useCallback(
    async (filtro?: number[]) => {
      if (!dataInicio || !dataFim || !qualidadeSemFiltroRef.current) return;
      const reqId = ++qualidadeReqRef.current;
      try {
        setLoadingQualidade(true);
        if (!filtro?.length) {
          if (reqId !== qualidadeReqRef.current) return;
          setPeriodData((prev) =>
            prev && qualidadeSemFiltroRef.current ? { ...prev, qualidade: qualidadeSemFiltroRef.current } : prev,
          );
          return;
        }
        const qualidade = await api.indicadoresColheitaQualidade({
          dataInicio,
          dataFim,
          codEquipamentos: filtro,
        });
        if (reqId !== qualidadeReqRef.current) return;
        setPeriodData((prev) => (prev ? { ...prev, qualidade } : prev));
      } catch (e) {
        if (reqId !== qualidadeReqRef.current) return;
        setErrPeriod(e instanceof Error ? e.message : String(e));
      } finally {
        if (reqId === qualidadeReqRef.current) setLoadingQualidade(false);
      }
    },
    [dataInicio, dataFim],
  );

  const loadFrota = useCallback(async () => {
    try {
      setLoadingFrota(true);
      setErrFrota(null);
      const result = await api.indicadoresColheitaProducaoFrota({ refDate });
      setFrotaData(result);
    } catch (e) {
      setFrotaData(null);
      setErrFrota(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingFrota(false);
    }
  }, [refDate]);

  const loadPeriod = useCallback(async () => {
    try {
      setLoadingPeriod(true);
      setErrPeriod(null);
      qualFilterKeyRef.current = null;
      const [result, relatorioDiario] = await Promise.all([
        api.indicadoresColheitaProducao({
          dataInicio,
          dataFim,
          refDate: dataFim,
        }),
        api.indicadoresRelatorioDiarioProducao({
          data: dataFim,
          dataInicio,
          safraInicio: defaults.from,
        }),
      ]);
      qualidadeSemFiltroRef.current = result.qualidade ?? null;
      setPeriodData(result);
      setRelatorioDiarioData(relatorioDiario);
      setQualidadeConsultada(Boolean(result.qualidade));
      if (result.qualidade?.equipamentosOpcoes?.length) {
        setQualEquipOpcoes(result.qualidade.equipamentosOpcoes);
        setQualEquipSelected((prev) => {
          if (!prev.size) return prev;
          const valid = new Set(result.qualidade!.equipamentosOpcoes!.map((eq) => eq.codEquipamento));
          const next = new Set([...prev].filter((cod) => valid.has(cod)));
          return next.size === prev.size ? prev : next;
        });
      }
      qualFilterKeyRef.current = qualFilterKey;
      await applyQualidadeEquipFilter(qualEquipamentosFiltro);
      setQualidadeConsultToken((token) => token + 1);

    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (/failed to fetch|network|proxy|ECONNREFUSED|ECONNRESET/i.test(message)) {
        setErrPeriod("Não foi possível consultar a API. Aguarde o servidor reiniciar e clique em Consultar novamente.");
      } else {
        setErrPeriod(message);
      }
    } finally {
      setLoadingPeriod(false);
    }
  }, [applyQualidadeEquipFilter, dataInicio, dataFim, defaults.from, qualEquipamentosFiltro, qualFilterKey]);

  const loadDesempenho = useCallback(async (vista: DesempenhoView) => {
    try {
      setLoadingDesempenho(true);
      setErrPeriod(null);
      if (vista === "disponibilidade") {
        const result = await api.indicadoresDisponibilidadeComparativoMensal({
          safraCode: safra?.code,
          dataFim,
        });
        setDispCompData(result);
        return;
      }
      const result = await api.indicadoresColheitaProducao({
        dataInicio,
        dataFim,
        refDate: dataFim,
        modo: vista === "horas" ? "horas" : vista === "ctt" ? "ctt" : "entrada",
      });
      if (vista === "horas") setHorasData(result);
      else if (vista === "ctt") setCttData(result);
      else setProducaoData(result);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (/failed to fetch|network|proxy|ECONNREFUSED|ECONNRESET/i.test(message)) {
        setErrPeriod("Não foi possível consultar a API. Aguarde o servidor reiniciar e clique em Consultar novamente.");
      } else {
        setErrPeriod(message);
      }
    } finally {
      setLoadingDesempenho(false);
    }
  }, [dataFim, dataInicio, safra?.code]);

  useEffect(() => {
    if (!qualidadeConsultada || subAba !== "qualidade-colheita") return;
    if (qualFilterKeyRef.current === null) {
      qualFilterKeyRef.current = qualFilterKey;
      return;
    }
    if (qualFilterKeyRef.current === qualFilterKey) return;
    qualFilterKeyRef.current = qualFilterKey;
    const timer = window.setTimeout(() => {
      void applyQualidadeEquipFilter(qualEquipamentosFiltro);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [
    applyQualidadeEquipFilter,
    qualEquipamentosFiltro,
    qualFilterKey,
    qualidadeConsultada,
    subAba,
  ]);

  useEffect(() => {
    if (subAba !== "frota-disponibilidade") return;
    void loadFrota();
  }, [loadFrota, subAba]);

  useReportAutoRefresh(async () => {
    if (subAba === "frota-disponibilidade" && !loadingFrota) await loadFrota();
    if (subAba === "desempenho-producao" && desempenhoView !== "ctt" && !loadingDesempenho) {
      await loadDesempenho(desempenhoView);
    }
  });

  return (
    <>
      <div className="kind-toggle indicadores-colheita-subtabs">
        <button
          type="button"
          className={`btn${subAba === "frota-disponibilidade" ? " primary" : ""}`}
          onClick={() => navigateSubAba("frota-disponibilidade")}
        >
          Frota e disponibilidade
        </button>
        <button
          type="button"
          className={`btn${subAba === "paradas-colheita" ? " primary" : ""}`}
          onClick={() => navigateSubAba("paradas-colheita")}
        >
          Paradas na colheita
        </button>
        <button
          type="button"
          className={`btn${subAba === "desempenho-producao" ? " primary" : ""}`}
          onClick={() => navigateSubAba("desempenho-producao")}
        >
          Desempenho e produção
        </button>
        <button
          type="button"
          className={`btn${subAba === "qualidade-colheita" ? " primary" : ""}`}
          onClick={() => navigateSubAba("qualidade-colheita")}
        >
          Qualidade colheita
        </button>
        <button
          type="button"
          className={`btn${subAba === "consumo-combustivel" ? " primary" : ""}`}
          onClick={() => navigateSubAba("consumo-combustivel")}
        >
          Consumo de combustível
        </button>
        <button
          type="button"
          className={`btn${subAba === "consumo-oleo-hidraulico" ? " primary" : ""}`}
          onClick={() => navigateSubAba("consumo-oleo-hidraulico")}
        >
          Consumo de óleo hidráulico
        </button>
        <button
          type="button"
          className={`btn${subAba === "horas-motor-elevador" ? " primary" : ""}`}
          onClick={() => navigateSubAba("horas-motor-elevador")}
        >
          Horas motor/ Elevador
        </button>
      </div>

      {errFrota ? (
        <p className="lead" style={{ color: "var(--danger)" }}>
          Frota: {errFrota}
        </p>
      ) : null}

      <section className="panel indicadores-periodo-filter no-print">
        <div className="indicadores-periodo-filter-row">
          <strong>Produção no período</strong>
          <label>
            De
            <input
              type="date"
              value={dataInicio}
              disabled={subAba === "desempenho-producao"}
              onChange={(e) => setDataInicio(e.target.value)}
            />
          </label>
          <label>
            Até
            <input
              type="date"
              value={dataFim}
              disabled={subAba === "desempenho-producao"}
              onChange={(e) => setDataFim(e.target.value)}
            />
          </label>
          {subAba === "qualidade-colheita" && qualidadeView === "dashboard" ? (
            <QualidadeEquipamentoFilter
              opcoes={qualEquipOpcoes}
              selected={qualEquipSelected}
              onChange={setQualEquipSelected}
              disabled={loadingPeriod}
            />
          ) : null}
          <button
            className="btn primary"
            disabled={loadingPeriod || loadingDesempenho || loadingHoras || loadingOleo || loadingParadas}
            onClick={() => {
              if (subAba === "horas-motor-elevador") {
                setHorasConsultToken((token) => token + 1);
                return;
              }
              if (subAba === "consumo-oleo-hidraulico") {
                setOleoConsultToken((token) => token + 1);
                return;
              }
              if (subAba === "paradas-colheita") {
                setParadasConsultToken((token) => token + 1);
                return;
              }
              if (subAba === "desempenho-producao") {
                void loadDesempenho(desempenhoView);
                return;
              }
              void loadPeriod();
            }}
          >
            {loadingPeriod || loadingDesempenho || loadingHoras || loadingOleo || loadingParadas ? "Consultando…" : "Consultar"}
          </button>
        </div>
        <ConsultaProgressBar
          active={loadingPeriod || loadingDesempenho || loadingQualidade || loadingHoras || loadingOleo || loadingParadas}
          label={
            loadingHoras
              ? "Consultando horas motor/elevador…"
              : loadingOleo
                ? "Consultando consumo de óleo hidráulico…"
                : loadingParadas
                  ? "Consultando paradas da colheita…"
                : loadingDesempenho
                  ? desempenhoView === "horas"
                    ? "Consultando horas trabalhadas…"
                    : desempenhoView === "ctt"
                      ? "Consultando indicador CTT…"
                      : desempenhoView === "disponibilidade"
                        ? "Consultando comparativo de disponibilidade…"
                      : "Consultando entrada de cana máquina…"
                : loadingQualidade
                  ? "Atualizando qualidade da colheita…"
                  : "Consultando produção no período…"
          }
          className="consulta-progress--inline"
        />
      </section>

      {errPeriod ? (
        <p className="lead" style={{ color: "var(--danger)" }}>
          {errPeriod}
        </p>
      ) : null}

      {periodData?.resumo.truncadoEntrada || periodData?.resumo.truncadoHoras ? (
        <p className="lead" style={{ color: "var(--warn, #b8860b)" }}>
          Dados parcialmente truncados — reduza o período se necessário.
        </p>
      ) : null}

      {subAba === "horas-motor-elevador" ? (
        <HorasMotorElevadorSection
          dataInicio={dataInicio}
          dataFim={dataFim}
          consultarToken={horasConsultToken}
          onLoadingChange={setLoadingHoras}
        />
      ) : subAba === "paradas-colheita" ? (
        <ParadasColheitaSection
          dataInicio={dataInicio}
          dataFim={dataFim}
          consultarToken={paradasConsultToken}
          onLoadingChange={setLoadingParadas}
        />
      ) : subAba === "consumo-oleo-hidraulico" ? (
        <ConsumoOleoHidraulicoSection
          dataInicio={dataInicio}
          dataFim={dataFim}
          safraCode={safra?.code}
          consultarToken={oleoConsultToken}
          onLoadingChange={setLoadingOleo}
        />
      ) : subAba === "consumo-combustivel" ? (
        periodData ? (
          <ConsumoCombustivelSection data={periodData} />
        ) : (
          <p className="lead">Consulte o período para ver o consumo de combustível.</p>
        )
      ) : subAba === "qualidade-colheita" ? (
        <>
          <div className="kind-toggle qualidade-view-toggle no-print">
            <button
              type="button"
              className={`btn${qualidadeView === "dashboard" ? " primary" : ""}`}
              onClick={() => setQualidadeView("dashboard")}
            >
              Dashboard
            </button>
            <button
              type="button"
              className={`btn${qualidadeView === "analitico" ? " primary" : ""}`}
              onClick={() => setQualidadeView("analitico")}
            >
              Relatório analítico
            </button>
          </div>
          {qualidadeView === "analitico" ? (
            <QualidadePerdasAnalitico
              dataInicio={dataInicio}
              dataFim={dataFim}
              consultarToken={qualidadeConsultToken}
            />
          ) : periodData?.qualidade ? (
            <QualidadeColheitaSection data={periodData.qualidade} />
          ) : (
            <p className="lead">Consulte o período para ver a qualidade da colheita.</p>
          )}
        </>
      ) : subAba === "frota-disponibilidade" ? (
        <FrotaDisponibilidadeDashboard
          frotaData={frotaData}
          periodData={periodData}
          relatorioDiarioData={relatorioDiarioData}
          loading={loadingFrota || loadingPeriod}
        />
      ) : subAba === "desempenho-producao" ? (
        <RelatorioDesempenhoColheita
          data={desempenhoView === "horas" ? horasData : desempenhoView === "ctt" ? cttData : producaoData}
          dataInicio={dataInicio}
          dataFim={dataFim}
          view={desempenhoView}
          onViewChange={navigateDesempenhoView}
          disponibilidade={dispCompData}
          safraLabel={safra?.code ? `Safra ${safra.code}` : null}
        />
      ) : null}
    </>
  );
}
