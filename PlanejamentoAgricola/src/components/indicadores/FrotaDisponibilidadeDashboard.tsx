import type { IndicadoresColheitaProducaoData } from "../../api";
import type { CSSProperties } from "react";

type KpiCard = IndicadoresColheitaProducaoData["resumo"]["kpiCards"][number];
type DiaDisp = IndicadoresColheitaProducaoData["disponibilidadeDiaria"][number];

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
      className="frota-dash-frota-card"
      style={{
        "--pct": `${pct}%`,
        "--cor": cor,
        "--texto-cor": stats.disponibilidade == null ? "#6b7280" : cor,
      } as CSSProperties}
    >
      <img className="frota-dash-frota-icon" src={`/indicadores/${card.icon}`} alt="" width={44} height={34} />
      <strong>{card.label}</strong>
      <div className="frota-dash-ring">
        <span>{stats.disponibilidade == null ? "-" : `${Math.round(pct)}%`}</span>
      </div>
      <div className="frota-dash-meta">
        Total: {fmt0(stats.total)} · Disponíveis: {fmt0(stats.disponiveis)}
      </div>
      <div className="frota-dash-bar" aria-label={`${stats.disponiveis} disponíveis e ${stats.paradas} parados`}>
        <span className="ok">{fmt0(stats.disponiveis)}</span>
        <span className="stop">{fmt0(stats.paradas)}</span>
      </div>
    </article>
  );
}

function resumoPeriodo(data: IndicadoresColheitaProducaoData | null) {
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
    toneladas,
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

function MotivosChart({ data }: { data: IndicadoresColheitaProducaoData | null }) {
  const motivos = [...(data?.motivosParada?.linhas ?? [])].sort((a, b) => b.horas - a.horas);
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

function DashboardTable({ data }: { data: IndicadoresColheitaProducaoData | null }) {
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

export function FrotaDisponibilidadeDashboard({
  frotaData,
  periodData,
  loading,
}: {
  frotaData: IndicadoresColheitaProducaoData | null;
  periodData: IndicadoresColheitaProducaoData | null;
  loading?: boolean;
}) {
  const cards = frotaData?.resumo.kpiCards ?? periodData?.resumo.kpiCards ?? [];
  const resumo = resumoPeriodo(periodData);

  return (
    <div className="frota-dash-wrap">
      <section className="frota-dash-head">
        <div>
          <h1>Meta de tonelagem × cota diária</h1>
          <p>Comparação da produção no período com frota disponível, disponibilidade mecânica e paradas.</p>
        </div>
      </section>

      <p className={`frota-dash-status${loading ? " aviso" : ""}`}>
        {loading ? "Atualizando dados..." : periodData ? "Dados atualizados." : "Use Consultar para carregar o período."}
      </p>

      <section className="frota-dash-panel frota-dash-frota-panel">
        <h2>Frota atual</h2>
        {cards.length ? (
          <div className="frota-dash-frota-cards">
            {cards.map((card) => (
              <FrotaCard key={card.id} card={card} />
            ))}
          </div>
        ) : (
          <p className="frota-dash-empty">Carregando frota...</p>
        )}
      </section>

      <MotivosChart data={periodData} />

      <section className="frota-dash-cards">
        <DashboardCard label="Toneladas de cana" value={fmt2(resumo.toneladas)} hint="apontadas no período" />
        <DashboardCard label="Viagens" value={fmt0(resumo.viagens)} hint="viagens registradas no período" />
        <DashboardCard label="Ton./viagem" value={fmt2(resumo.tonViagem)} hint="média do período" />
        <DashboardCard label="Disp. colhedeira" value={fmtPct(resumo.dispColhedora)} hint="média no período" />
        <DashboardCard label="Disp. trator transbordo" value={fmtPct(resumo.dispTransbordo)} hint="média no período" />
        <DashboardCard label="Paradas" value={fmt0(resumo.motivosQtd)} hint={`${fmtHoras(resumo.horasParadas)} no período`} />
        <DashboardCard label="Manutenção colhedeiras" value={fmtHoras(resumo.horasManutencao)} hint="horas no período" />
      </section>

      <DashboardTable data={periodData} />
    </div>
  );
}
