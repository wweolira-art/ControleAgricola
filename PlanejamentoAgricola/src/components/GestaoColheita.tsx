import { useMemo, useState } from "react";
import {
  api,
  type ColheitaCaminhaoRow,
  type ColheitaFazendaUsinaRow,
  type ColheitaPrecoRaioRow,
  type ColheitaVinculoItem,
  type IndicadoresColheitaProducaoData,
} from "../api";
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
  const [vinculosCaminhao, setVinculosCaminhao] = useState<ColheitaVinculoItem[]>([]);
  const [fazendaUsina, setFazendaUsina] = useState<ColheitaFazendaUsinaRow[]>([]);
  const [precoRaio, setPrecoRaio] = useState<ColheitaPrecoRaioRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const consultar = async () => {
    try {
      setLoading(true);
      setErr(null);
      const [result, entrada, usinaResult, precosResult] = await Promise.all([
        api.indicadoresColheitaProducao({
          dataInicio,
          dataFim,
          refDate: dataFim,
        }),
        api.colheitaEntradaCaminhao({ dataInicio, dataFim }),
        api.colheitaFazendaUsina().catch((e) => {
          setErr(`Aviso: não foi possível carregar os raios das fazendas. ${e instanceof Error ? e.message : String(e)}`);
          return { dados: [] as ColheitaFazendaUsinaRow[] };
        }),
        api.colheitaPrecoRaio().catch((e) => {
          setErr(`Aviso: não foi possível carregar os preços dos raios. ${e instanceof Error ? e.message : String(e)}`);
          return { dados: [] as ColheitaPrecoRaioRow[] };
        }),
      ]);
      const vinculos = new Map<string, ColheitaVinculoItem>();
      for (const row of entrada.dados) {
        if (row.caminhao == null || row.codEquipamento == null) continue;
        const key = String(row.caminhao);
        const atual = vinculos.get(key) ?? {
          caminhao: row.caminhao,
          qtdEntradas: 0,
          ultimaData: row.data ?? null,
          codEquipamento: row.codEquipamento,
          associacoes: [],
        };
        atual.qtdEntradas += 1;
        if (row.data && (!atual.ultimaData || row.data > atual.ultimaData)) atual.ultimaData = row.data;
        atual.codEquipamento = row.codEquipamento;
        vinculos.set(key, atual);
      }
      setData(result);
      setEntradaCaminhao(entrada.dados);
      setVinculosCaminhao([...vinculos.values()]);
      setFazendaUsina(usinaResult.dados);
      setPrecoRaio(precosResult.dados);
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
      <MotoristasCanavieirosSection
        data={data}
        dataInicio={dataInicio}
        dataFim={dataFim}
        entradaCaminhao={entradaCaminhao}
        vinculosCaminhao={vinculosCaminhao}
        fazendaUsina={fazendaUsina}
        precoRaio={precoRaio}
      />
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
