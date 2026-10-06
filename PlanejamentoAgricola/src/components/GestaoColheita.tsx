import { useMemo, useState } from "react";
import { api, type ColheitaCaminhaoRow, type IndicadoresColheitaProducaoData } from "../api";
import { useApp } from "../store";
import { EntradaCanaImport } from "./EntradaCanaImport";
import { ColheitaAssociarEquipamento } from "./colheita/ColheitaAssociarEquipamento";
import { ColheitaAssociarFazenda } from "./colheita/ColheitaAssociarFazenda";
import { ColheitaEncerramentoOrdens } from "./colheita/ColheitaEncerramentoOrdens";
import { ColheitaEntradaCaminhao } from "./colheita/ColheitaEntradaCaminhao";
import { ColheitaEntradaMaquina } from "./colheita/ColheitaEntradaMaquina";
import { ColheitaHorasMaquina } from "./colheita/ColheitaHorasMaquina";
import { ColheitaHorasMotorElevador } from "./colheita/ColheitaHorasMotorElevador";
import { ColheitaLiberacao } from "./colheita/ColheitaLiberacao";
import { ColheitaResumoTransporte } from "./colheita/ColheitaResumoTransporte";
import { safraDefaultRange } from "./colheita/colheita-utils";
import { MotoristasCanavieirosSection } from "./indicadores/MotoristasCanavieirosSection";

export type GestaoColheitaTab =
  | "entrada-caminhao"
  | "entrada-maquina"
  | "associar-equipamento"
  | "horas-maquina"
  | "horas-motor-elevador"
  | "associar-fazenda"
  | "encerramento-ordens"
  | "liberacao-colheita"
  | "resumo-transporte"
  | "motoristas-canavieiros"
  | "import";

const TABS: { id: GestaoColheitaTab; label: string }[] = [
  { id: "entrada-caminhao", label: "Entrada cana caminhão" },
  { id: "entrada-maquina", label: "Entrada cana máquina" },
  { id: "associar-equipamento", label: "Associar equipamento" },
  { id: "horas-maquina", label: "Horas máquina" },
  { id: "horas-motor-elevador", label: "Horas motor/elevador" },
  { id: "associar-fazenda", label: "Associar fazenda" },
  { id: "encerramento-ordens", label: "Encerrar ordens colheita" },
  { id: "liberacao-colheita", label: "Liberação de colheita" },
  { id: "resumo-transporte", label: "Resumo transporte cana" },
  { id: "motoristas-canavieiros", label: "Motoristas canavieiros" },
  { id: "import", label: "Importar planilha" },
];

export const GESTAO_COLHEITA_TABS = TABS;

export function GestaoColheitaNativePanel({ tab }: { tab: GestaoColheitaTab }) {
  return (
    <>
      {tab === "entrada-caminhao" ? <ColheitaEntradaCaminhao /> : null}
      {tab === "entrada-maquina" ? <ColheitaEntradaMaquina /> : null}
      {tab === "associar-equipamento" ? <ColheitaAssociarEquipamento /> : null}
      {tab === "horas-maquina" ? <ColheitaHorasMaquina /> : null}
      {tab === "horas-motor-elevador" ? <ColheitaHorasMotorElevador /> : null}
      {tab === "associar-fazenda" ? <ColheitaAssociarFazenda /> : null}
      {tab === "encerramento-ordens" ? <ColheitaEncerramentoOrdens /> : null}
      {tab === "liberacao-colheita" ? <ColheitaLiberacao /> : null}
      {tab === "resumo-transporte" ? <ColheitaResumoTransporte /> : null}
      {tab === "motoristas-canavieiros" ? <MotoristasCanavieirosPanel /> : null}
      {tab === "import" ? <EntradaCanaImport /> : null}
    </>
  );
}

function MotoristasCanavieirosPanel() {
  const { safra } = useApp();
  const defaults = useMemo(() => safraDefaultRange(safra?.code), [safra?.code]);
  const [dataInicio, setDataInicio] = useState(defaults.from);
  const [dataFim, setDataFim] = useState(defaults.to);
  const [data, setData] = useState<IndicadoresColheitaProducaoData | null>(null);
  const [entradaCaminhao, setEntradaCaminhao] = useState<ColheitaCaminhaoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const consultar = async () => {
    try {
      setLoading(true);
      setErr(null);
      const [result, entrada] = await Promise.all([
        api.indicadoresColheitaProducao({
          dataInicio,
          dataFim,
          refDate: dataFim,
        }),
        api.colheitaEntradaCaminhao({ dataInicio, dataFim }),
      ]);
      setData(result);
      setEntradaCaminhao(entrada.dados);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <section className="panel indicadores-periodo-filter no-print">
        <div className="indicadores-periodo-filter-row">
          <strong>Produção dos motoristas</strong>
          <label>
            De
            <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
          </label>
          <label>
            Até
            <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
          </label>
          <button className="btn primary" type="button" disabled={loading} onClick={() => void consultar()}>
            {loading ? "Consultando…" : "Consultar"}
          </button>
        </div>
      </section>
      {err ? (
        <p className="lead" style={{ color: "var(--danger)" }}>
          {err}
        </p>
      ) : null}
      <MotoristasCanavieirosSection data={data} entradaCaminhao={entradaCaminhao} />
    </>
  );
}

/** @deprecated Use SiteGroupPage com grupo gestao-colheita */
export function GestaoColheita() {
  const [tab, setTab] = useState<GestaoColheitaTab>("entrada-caminhao");
  return (
    <div className="page">
      <div className="kind-toggle" style={{ paddingBottom: 4, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button key={t.id} className={`btn ${tab === t.id ? "primary" : ""}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <GestaoColheitaNativePanel tab={tab} />
    </div>
  );
}
