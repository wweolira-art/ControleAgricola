import type { EntradaCanaDiariaDashboardData, IndicadoresColheitaProducaoData, RelatorioDiarioProducaoData } from "../../api";
import type { CSSProperties } from "react";

type KpiCard = IndicadoresColheitaProducaoData["resumo"]["kpiCards"][number];
type DiaDisp = IndicadoresColheitaProducaoData["disponibilidadeDiaria"][number];
type IndicadorPrincipal = RelatorioDiarioProducaoData["indicadorPrincipal"][number];
type EntradaFrotaItem = {
  chave: string;
  nome: string;
  icon: string;
  total: number;
  paradas: number;
  disponiveis: number;
  disponibilidade: number | null;
};

const FROTA_META: Record<string, { nome: string; icon: string }> = {
  COLHEDEIRA: { nome: "COLHEDORA", icon: "colhedora.png" },
  TRATOR_TRANSBORDO: { nome: "TRATOR TRANSBORDO", icon: "trator.png" },
  IMPLEMENTO_TRANSBORDO: { nome: "IMPL. TRANSB", icon: "transbordo.png" },
  CAVALO_MECANICO: { nome: "CAV. MECANICO", icon: "caminhao.png" },
  REBOQUE: { nome: "REBOQUE", icon: "caminhao.png" },
};

function fmt0(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "-";
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(n);
}

function fmt2(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "-";
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);
}

function fmtPct(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "-";
  return `${fmt2(n)}%`;
}

function fmtDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("pt-BR");
}

function fmtHoras(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "-";
  return `${fmt2(n)} h`;
}

function fmtTon(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "-";
  return `${fmt2(n)} t`;
}

function disponibilidadeTone(pct: number | null | undefined) {
  if (pct == null || !Number.isFinite(pct)) return "#6b7280";
  if (pct >= 80) return "#18823a";
  if (pct >= 60) return "#d8a408";
  return "#c7352b";
}

function frotaStats(card: KpiCard) {
  const total = card.total ?? card.equipamentos?.length ?? 0;
  const paradas = Math.min(total, card.parado ?? 0);
  const disponiveis = Math.max(0, total - paradas);
  return { total, paradas, disponiveis, disponibilidade: card.disponibilidade };
}

function FrotaCard({ card }: { card: KpiCard }) {
  const stats = frotaStats(card);
  const pct = stats.disponibilidade == null ? 0 : Math.max(0, Math.min(100, stats.disponibilidade));
  const cor = disponibilidadeTone(stats.disponibilidade);
  return (
    <article
      className="frota-dash-frota-card frota-card"
      style={{
        "--pct": `${pct}%`,
        "--cor": cor,
        "--texto-cor": stats.disponibilidade == null ? "#6b7280" : cor,
      } as CSSProperties}
    >
      <img className="frota-dash-frota-icon frota-icon" src={`/indicadores/${card.icon}`} alt="" width={44} height={34} />
      <strong>{card.label}</strong>
      <div className="frota-dash-ring frota-ring">
        <span>{stats.disponibilidade == null ? "-" : `${Math.round(pct)}%`}</span>
      </div>
      <div className="frota-dash-meta frota-meta">
        Total: {fmt0(stats.total)} · Disponíveis: {fmt0(stats.disponiveis)}
      </div>
      <div className="frota-dash-bar frota-bar" aria-label={`${stats.disponiveis} disponíveis e ${stats.paradas} parados`}>
        <span className="ok">{fmt0(stats.disponiveis)}</span>
        <span className="stop">{fmt0(stats.paradas)}</span>
      </div>
    </article>
  );
}

function EntradaFrotaCard({ item }: { item: EntradaFrotaItem }) {
  const pct = item.disponibilidade == null ? 0 : Math.max(0, Math.min(100, item.disponibilidade));
  const cor = disponibilidadeTone(item.disponibilidade);
  return (
    <article
      className="frota-dash-frota-card frota-card"
      style={{
        "--pct": `${pct}%`,
        "--cor": cor,
        "--texto-cor": item.disponibilidade == null ? "#6b7280" : cor,
      } as CSSProperties}
    >
      <img className="frota-dash-frota-icon frota-icon" src={`/indicadores/${item.icon}`} alt="" width={44} height={34} />
      <strong>{item.nome}</strong>
      <div className="frota-dash-ring frota-ring">
        <span>{item.disponibilidade == null ? "-" : `${Math.round(pct)}%`}</span>
      </div>
      <div className="frota-dash-meta frota-meta">
        Total: {fmt0(item.total)} · Disponíveis: {fmt0(item.disponiveis)}
      </div>
      <div className="frota-dash-bar frota-bar" aria-label={`${item.disponiveis} disponíveis e ${item.paradas} parados`}>
        <span className="ok">{fmt0(item.disponiveis)}</span>
        <span className="stop">{fmt0(item.paradas)}</span>
      </div>
    </article>
  );
}

function entradaFrotaCards(data: EntradaCanaDiariaDashboardData | null): EntradaFrotaItem[] {
  const frota = data?.resumo.frota ?? {};
  return Object.entries(FROTA_META).map(([chave, meta]) => {
    const dados = frota[chave] ?? {};
    const total = Number(dados.total ?? (chave === "COLHEDEIRA" ? data?.resumo.colhedeiras_cadastradas : 0) ?? 0);
    const paradas = Math.min(total, Number(dados.paradas ?? 0));
    const disponiveis = Math.max(0, total - paradas);
    const disponibilidade =
      dados.disponibilidade == null
        ? chave === "COLHEDEIRA"
          ? data?.resumo.disponibilidade_colhedeiras ?? null
          : total
            ? 100
            : null
        : Number(dados.disponibilidade);
    return { chave, ...meta, total, paradas, disponiveis, disponibilidade };
  });
}

function resumoPeriodo(data: IndicadoresColheitaProducaoData | null, entrada: EntradaCanaDiariaDashboardData | null) {
  if (entrada) {
    return {
      metaDiaria: entrada.resumo.meta_diaria ?? null,
      cotaUsina: entrada.resumo.cota_usina ?? entrada.resumo.cota_diaria ?? null,
      toneladas: entrada.resumo.toneladas_cana ?? null,
      diferenca: entrada.resumo.diferenca ?? null,
      atingimento: entrada.resumo.atingimento ?? null,
      viagens: null,
      tonViagem: entrada.resumo.ton_viagem_media ?? null,
      motivosQtd: entrada.resumo.motivos_parada?.length ?? 0,
      horasParadas: entrada.resumo.horas_paradas_total ?? 0,
      dispColhedora: entrada.resumo.disponibilidade_colhedeiras ?? null,
      dispTransbordo: mediaDisponibilidade(entrada.dias.map((row) => row.disponibilidade_trator_transbordo)),
      horasManutencao: entrada.dias.reduce((acc, row) => acc + (row.horas_manutencao_colhedeiras ?? 0), 0),
    };
  }
  const dias = data?.disponibilidadeDiaria ?? [];
  const desempenho = data?.desempenhoDiario ?? [];
  const toneladas =
    desempenho.reduce((acc, row) => acc + (row.toneladas ?? 0), 0) ||
    dias.reduce((acc, row) => acc + (row.toneladaColhida ?? 0), 0);
  const viagens = desempenho.reduce((acc, row) => acc + (row.viagens ?? 0), 0);
  const tonViagem = viagens > 0 ? toneladas / viagens : null;
  const motivos = data?.motivosParada?.linhas ?? [];
  const horasParadas = data?.motivosParada?.horasTotal ?? motivos.reduce((acc, row) => acc + row.horas, 0);
  const dispColhedora = mediaDisponibilidade(dias.map((row) => row.colhedora.disponibilidade));
  const dispTransbordo = mediaDisponibilidade(dias.map((row) => row.transbordo.disponibilidade));
  const horasManutencao = (data?.horasOperacaoDiaria ?? []).reduce((acc, row) => acc + (row.horasManutencao ?? 0), 0);
  return {
    metaDiaria: null,
    cotaUsina: null,
    toneladas,
    diferenca: null,
    atingimento: null,
    viagens,
    tonViagem,
    motivosQtd: motivos.length,
    horasParadas,
    dispColhedora,
    dispTransbordo,
    horasManutencao,
  };
}

function mediaDisponibilidade(values: Array<number | null | undefined>) {
  const valid = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (!valid.length) return null;
  return valid.reduce((acc, value) => acc + value, 0) / valid.length;
}

function DashboardCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "positivo" | "negativo";
}) {
  return (
    <article className="frota-dash-card">
      <span>{label}</span>
      <strong className={tone}>{value}</strong>
      <small>{hint}</small>
    </article>
  );
}

function MotivosChart({
  data,
  entrada,
}: {
  data: IndicadoresColheitaProducaoData | null;
  entrada: EntradaCanaDiariaDashboardData | null;
}) {
  const motivos = entrada
    ? (entrada.resumo.motivos_parada ?? []).map((row) => ({
        motivo: row.motivo,
        horas: row.horas ?? 0,
        qtd: row.quantidade ?? 0,
      }))
    : [...(data?.motivosParada?.linhas ?? [])];
  motivos.sort((a, b) => b.horas - a.horas);
  const top = motivos.slice(0, 8);
  const rest = motivos.slice(8);
  const rows = rest.length
    ? [
        ...top,
        {
          motivo: "Outros",
          horas: rest.reduce((acc, row) => acc + row.horas, 0),
          qtd: rest.reduce((acc, row) => acc + row.qtd, 0),
        },
      ]
    : top;
  const max = Math.max(...rows.map((row) => row.horas), 0.01);

  return (
    <section className="frota-dash-panel frota-dash-motivos">
      <div className="frota-dash-section-head">
        <h2>Motivos de parada</h2>
        <p>Quantidade e horas paradas no período filtrado.</p>
      </div>
      {rows.length ? (
        <div className="frota-dash-motivos-list">
          {rows.map((row) => (
            <div className="frota-dash-motivo-row" key={row.motivo}>
              <span>{row.motivo}</span>
              <div>
                <i style={{ width: `${(row.horas / max) * 100}%` }} />
                <b>{fmtHoras(row.horas)}</b>
                <em>{fmt0(row.qtd)} parada(s)</em>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="frota-dash-empty">Sem paradas registradas no período.</p>
      )}
    </section>
  );
}

function DashboardTable({
  data,
  relatorio,
}: {
  data: IndicadoresColheitaProducaoData | null;
  relatorio: RelatorioDiarioProducaoData | null;
}) {
  if (relatorio) {
    const linhas = relatorio.indicadorPrincipal ?? [];
    return (
      <section className="frota-dash-table-wrap">
        <table className="frota-dash-table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Cota usina</th>
              <th>Realizado</th>
              <th>Diferença</th>
              <th>% cota</th>
              <th>Status</th>
              <th>Cálculo</th>
            </tr>
          </thead>
          <tbody>
            {linhas.length ? (
              linhas.map((item, index) => (
                <tr key={`${item.data ?? "sem-data"}-${index}`}>
                  <td>{fmtDate(item.data)}</td>
                  <td>{fmtTon(item.cotaUsina)}</td>
                  <td>{fmtTon(item.realizado)}</td>
                  <td className={(item.diferenca ?? 0) < 0 ? "negativo" : "positivo"}>
                    {fmtTon(item.diferenca)}
                  </td>
                  <td>{fmtPct(item.percentualCota)}</td>
                  <td className="frota-dash-status-cell">
                    <IndicadorMotivos item={item} />
                  </td>
                  <td className="frota-dash-calculo-cell">
                    <IndicadorCalculo item={item} />
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="frota-dash-empty">
                  Nenhum indicador para o período selecionado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    );
  }

  const dias = data?.disponibilidadeDiaria ?? [];
  const desempenhoPorDia = new Map((data?.desempenhoDiario ?? []).map((row) => [row.data, row]));
  const horasPorDia = new Map((data?.horasOperacaoDiaria ?? []).map((row) => [row.data, row]));

  return (
    <section className="frota-dash-table-wrap">
      <table className="frota-dash-table">
        <thead>
          <tr>
            <th>Data</th>
            <th>Toneladas de cana</th>
            <th>Ton./viagem</th>
            <th>Disp. colhedeira</th>
            <th>Horas manutenção colhedeiras</th>
            <th>Disp. trator transbordo</th>
          </tr>
        </thead>
        <tbody>
          {dias.length ? (
            dias.map((dia: DiaDisp) => {
              const desempenho = desempenhoPorDia.get(dia.data);
              const horas = horasPorDia.get(dia.data);
              const tonViagem = desempenho?.viagens ? desempenho.toneladas / desempenho.viagens : null;
              return (
                <tr key={dia.data}>
                  <td>{fmtDate(dia.data)}</td>
                  <td>{fmt2(desempenho?.toneladas ?? dia.toneladaColhida)}</td>
                  <td>{fmt2(tonViagem)}</td>
                  <td>{fmtPct(dia.colhedora.disponibilidade)}</td>
                  <td>{fmtHoras(horas?.horasManutencao)}</td>
                  <td>{fmtPct(dia.transbordo.disponibilidade)}</td>
                </tr>
              );
            })
          ) : (
            <tr>
              <td colSpan={6} className="frota-dash-empty">
                Consulte o período para carregar a tabela diária.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}

function IndicadorMotivos({ item }: { item: IndicadorPrincipal }) {
  const causas = item.naoAtingimento?.causas ?? [];
  const principal = causas[0]
    ? {
        motivo: causas[0].label,
        impacto: causas[0].toneladas,
        origem: item.status || "Indicador principal",
      }
    : {
        motivo: item.status || "Não informado",
        impacto: item.diferenca,
        origem: "Indicador principal",
      };
  const outros = causas.slice(1).map((causa) => ({
    motivo: causa.label,
    impacto: causa.toneladas,
    origem: "Indicador principal",
  }));
  return (
    <div className="frota-dash-indicador-motivos">
      <strong>Principal motivo:</strong>
      <IndicadorMotivoMini motivo={principal} destaque />
      {outros.length ? (
        <div className="frota-dash-indicador-outros">
          <strong>Outros motivos:</strong>
          {outros.map((motivo, index) => (
            <IndicadorMotivoMini key={`${motivo.motivo ?? "motivo"}-${index}`} motivo={motivo} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function IndicadorMotivoMini({
  motivo,
  destaque,
}: {
  motivo: { motivo?: string | null; impacto?: number | null; horas?: number | null; origem?: string | null };
  destaque?: boolean;
}) {
  return (
    <div className={`frota-dash-indicador-mini${destaque ? " principal" : ""}`}>
      <span>
        {motivo.motivo || "Não informado"}
        {motivo.horas != null ? ` · ${fmtHoras(motivo.horas)}` : ""}
      </span>
      <small>
        {fmtTon(motivo.impacto)} · {motivo.origem || "Não informado"}
      </small>
    </div>
  );
}

function IndicadorCalculo({ item }: { item: IndicadorPrincipal }) {
  return (
    <div className="frota-dash-calculo-box">
      <span>Cota Usina: <b>{fmtTon(item.cotaUsina)}</b></span>
      <span>Realizado: <b>{fmtTon(item.realizado)}</b></span>
      <span>Colhedoras disponíveis: <b>{fmt0(item.colhedoras)}</b></span>
      <span>Horas disponíveis: <b>{fmtHoras(item.horasMaquina)}</b></span>
      <span>Produtividade histórica: <b>{item.produtividadeHistorica == null ? "-" : `${fmt2(item.produtividadeHistorica)} t/h`}</b></span>
      <span>Capacidade necessária: <b>{item.capacidadeNecessaria == null ? "-" : `${fmt2(item.capacidadeNecessaria)} t/h`}</b></span>
      <span>Capacidade estimada: <b>{fmtTon(item.capacidadeEstimada)}</b></span>
      <span>Diferença: <b>{fmtTon(item.diferenca)}</b></span>
    </div>
  );
}

export function FrotaDisponibilidadeDashboard({
  frotaData,
  periodData,
  relatorioDiarioData,
  loading,
}: {
  frotaData: IndicadoresColheitaProducaoData | null;
  periodData: IndicadoresColheitaProducaoData | null;
  relatorioDiarioData: RelatorioDiarioProducaoData | null;
  loading?: boolean;
}) {
  const cards = frotaData?.resumo.kpiCards ?? periodData?.resumo.kpiCards ?? [];
  const resumo = resumoPeriodo(periodData, null);
  const indicadorResumo = relatorioDiarioData?.indicadorPrincipal?.[0];
  const cotaUsina = indicadorResumo?.cotaUsina ?? resumo.cotaUsina;
  const diferenca = indicadorResumo?.diferenca ?? resumo.diferenca;
  const atingimento = indicadorResumo?.percentualCota ?? resumo.atingimento;

  return (
    <div className="frota-dash-wrap">
      <section className="frota-dash-head">
        <div>
          <h1>Meta de tonelagem × cota diária</h1>
          <p>Comparação da produção no período com frota disponível, disponibilidade mecânica e paradas.</p>
        </div>
      </section>

      <p className={`frota-dash-status${loading ? " aviso" : ""}`}>
        {loading ? "Atualizando dados..." : relatorioDiarioData ? "Dados atualizados." : "Use Consultar para carregar o período."}
      </p>

      <section className="frota-dash-panel frota-dash-frota-panel frota-panel">
        <h2>Frota atual</h2>
        {cards.length ? (
          <div className="frota-dash-frota-cards frota-cards">
            {cards.map((card) => (
              <FrotaCard key={card.id} card={card} />
            ))}
          </div>
        ) : (
          <p className="frota-dash-empty">Carregando frota...</p>
        )}
      </section>

      <MotivosChart data={periodData} entrada={null} />

      <section className="frota-dash-cards">
        <DashboardCard label="Meta diária" value={fmt2(resumo.metaDiaria)} hint="metas lançadas no período" />
        <DashboardCard label="Cota usina" value={fmt2(cotaUsina)} hint="cotas recebidas no período" />
        <DashboardCard label="Toneladas de cana" value={fmt2(resumo.toneladas)} hint="apontadas no período" />
        <DashboardCard
          label="Diferença"
          value={fmt2(diferenca)}
          hint={`Atingimento: ${fmtPct(atingimento)}`}
          tone={(diferenca ?? 0) >= 0 ? "positivo" : "negativo"}
        />
      </section>

      <DashboardTable data={periodData} relatorio={relatorioDiarioData} />
    </div>
  );
}
