import { Fragment, useState } from "react";
import type { IndicadoresProducaoLinha } from "../../api";

function fmt2(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function ThQuebra({ lines }: { lines: string[] }) {
  return (
    <th className="num indicadores-th-break">
      {lines.map((line, index) => (
        <span key={`${line}-${index}`}>
          {index > 0 ? <br /> : null}
          {line}
        </span>
      ))}
    </th>
  );
}

function dispPct(linhas: IndicadoresProducaoLinha[]) {
  const horasPotenciais = linhas.reduce((acc, row) => acc + (row.horasPotenciais ?? 0), 0);
  const horasOficina = linhas.reduce((acc, row) => acc + (row.horasOficina ?? 0), 0);
  if (horasPotenciais > 0) return (Math.max(horasPotenciais - horasOficina, 0) / horasPotenciais) * 100;
  const withPct = linhas.filter((row) => row.disponibilidadePct != null);
  if (!withPct.length) return null;
  return withPct.reduce((acc, row) => acc + (row.disponibilidadePct ?? 0), 0) / withPct.length;
}

function CelulaDisponibilidade({ pct }: { pct: number | null | undefined }) {
  if (pct == null || !Number.isFinite(pct)) return <td className="num">—</td>;
  const tone = pct < 85 ? "indicadores-parado-cell" : "indicadores-rodando-cell";
  return <td className={`num ${tone}`}>{fmt2(pct)}%</td>;
}

function CelulaDisponibilidadeTotal({
  linhas,
  totais,
}: {
  linhas: IndicadoresProducaoLinha[];
  totais: IndicadoresProducaoLinha | null;
}) {
  const pct = totais?.disponibilidadePct ?? dispPct(linhas);
  return (
    <td className="num">
      <strong>{pct == null ? "—" : `${fmt2(pct)}%`}</strong>
    </td>
  );
}

function DetalheProducaoTurno({ row }: { row: IndicadoresProducaoLinha }) {
  const turnos = row.producaoPorTurno ?? [];
  if (!turnos.length) {
    return <span className="indicadores-turno-vazio">Sem horas de elevador registradas por turno no período.</span>;
  }
  return (
    <div className="indicadores-turno-detalhe">
      <strong>Produção proporcional às horas do elevador — colhedeira {row.equipTag}</strong>
      <span>Ton/h aplicado: {fmt2(row.tonHrElevador)}</span>
      <div className="indicadores-turno-metricas">
        <span>
          <small>Hrs motor</small>
          <b>{fmt2(row.hrsMotor)}</b>
        </span>
        <span>
          <small>Hrs elevador</small>
          <b>{fmt2(row.hrsElevador)}</b>
        </span>
        <span>
          <small>Lt/ton</small>
          <b>{fmt2(row.ltTon)}</b>
        </span>
        <span>
          <small>Lt/hr</small>
          <b>{fmt2(row.ltHr)}</b>
        </span>
        <span>
          <small>Ton/hr motor</small>
          <b>{fmt2(row.tonHrMotor)}</b>
        </span>
        <span>
          <small>Ton/hr elevador</small>
          <b>{fmt2(row.tonHrElevador)}</b>
        </span>
      </div>
      <table>
        <thead>
          <tr>
            <th>Turno</th>
            <th className="num">Horas elevador</th>
            <th className="num">% das horas</th>
            <th className="num">Produção estimada (t)</th>
          </tr>
        </thead>
        <tbody>
          {turnos.map((turno) => (
            <tr key={turno.turno}>
              <td>Turno {turno.turno}</td>
              <td className="num">{fmt2(turno.horasElevador)}</td>
              <td className="num">{fmt2(turno.percentualHoras)}%</td>
              <td className="num">{fmt2(turno.toneladaColhida)}</td>
            </tr>
          ))}
          <tr>
            <td>
              <strong>Total</strong>
            </td>
            <td className="num">
              <strong>{fmt2(turnos.reduce((total, turno) => total + turno.horasElevador, 0))}</strong>
            </td>
            <td className="num">
              <strong>100,00%</strong>
            </td>
            <td className="num">
              <strong>{fmt2(turnos.reduce((total, turno) => total + turno.toneladaColhida, 0))}</strong>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function TabelaColhedora({
  linhas,
  totais,
  ocultarLitrosCombustivel = false,
  ocultarHorasMotorElevador = false,
  mostrarDisponibilidade = false,
  mostrarProducaoPorTurno = false,
  rotuloEquip = "Frota",
}: {
  linhas: IndicadoresProducaoLinha[];
  totais: IndicadoresProducaoLinha | null;
  ocultarLitrosCombustivel?: boolean;
  ocultarHorasMotorElevador?: boolean;
  mostrarDisponibilidade?: boolean;
  mostrarProducaoPorTurno?: boolean;
  rotuloEquip?: string;
}) {
  const [equipamentoAberto, setEquipamentoAberto] = useState<string | null>(null);
  const colunas =
    1 +
    (mostrarDisponibilidade ? 1 : 0) +
    1 +
    (ocultarLitrosCombustivel ? 0 : 1) +
    (ocultarHorasMotorElevador ? 0 : 2) +
    5 +
    (mostrarProducaoPorTurno ? 1 : 0);
  return (
    <table className="data indicadores-producao-table">
      <thead>
        <tr>
          <th>{rotuloEquip}</th>
          {mostrarDisponibilidade ? <ThQuebra lines={["Disponi-", "bilidade"]} /> : null}
          <ThQuebra lines={["Tonelada", "Colhida"]} />
          {ocultarLitrosCombustivel ? null : <th className="num">Litros Combustível</th>}
          {ocultarHorasMotorElevador ? null : <th className="num">Hrs Motor</th>}
          {ocultarHorasMotorElevador ? null : <th className="num">Hrs Elevador</th>}
          <th className="num">Lt/ton</th>
          <th className="num">Lt/hr</th>
          <ThQuebra lines={["Ton/hr", "Motor"]} />
          <ThQuebra lines={["Ton/hr", "Elevador"]} />
          <th className="num">Ton/dia</th>
          {mostrarProducaoPorTurno ? <th>Ações</th> : null}
        </tr>
      </thead>
      <tbody>
        {linhas.map((row) => {
          const aberto = equipamentoAberto === row.equipTag;
          return (
            <Fragment key={row.equipTag}>
              <tr className={row.parado ? "indicadores-parado" : ""}>
                <td>{row.equipTag}</td>
                {mostrarDisponibilidade ? <CelulaDisponibilidade pct={row.disponibilidadePct} /> : null}
                <td className="num">{fmt2(row.toneladaColhida)}</td>
                {ocultarLitrosCombustivel ? null : <td className="num">{fmt2(row.litrosCombustivel)}</td>}
                {ocultarHorasMotorElevador ? null : <td className="num">{fmt2(row.hrsMotor)}</td>}
                {ocultarHorasMotorElevador ? null : <td className="num">{fmt2(row.hrsElevador)}</td>}
                <td className="num">{fmt2(row.ltTon)}</td>
                <td className="num">{fmt2(row.ltHr)}</td>
                <td className="num">{fmt2(row.tonHrMotor)}</td>
                <td className="num">{fmt2(row.tonHrElevador)}</td>
                <td className="num">{fmt2(row.tonDia)}</td>
                {mostrarProducaoPorTurno ? (
                  <td>
                    <button
                      type="button"
                      className="btn indicadores-turno-btn"
                      onClick={() => setEquipamentoAberto(aberto ? null : row.equipTag)}
                    >
                      {aberto ? "Fechar turnos" : "Ver turnos"}
                    </button>
                  </td>
                ) : null}
              </tr>
              {mostrarProducaoPorTurno && aberto ? (
                <tr className="indicadores-turno-linha">
                  <td colSpan={colunas}>
                    <DetalheProducaoTurno row={row} />
                  </td>
                </tr>
              ) : null}
            </Fragment>
          );
        })}
        {totais ? (
          <tr className="indicadores-producao-total">
            <td>
              <strong>Total</strong>
            </td>
            {mostrarDisponibilidade ? <CelulaDisponibilidadeTotal linhas={linhas} totais={totais} /> : null}
            <td className="num">
              <strong>{fmt2(totais.toneladaColhida)}</strong>
            </td>
            {ocultarLitrosCombustivel ? null : (
              <td className="num">
                <strong>{fmt2(totais.litrosCombustivel)}</strong>
              </td>
            )}
            {ocultarHorasMotorElevador ? null : (
              <td className="num">
                <strong>{fmt2(totais.hrsMotor)}</strong>
              </td>
            )}
            {ocultarHorasMotorElevador ? null : (
              <td className="num">
                <strong>{fmt2(totais.hrsElevador)}</strong>
              </td>
            )}
            <td className="num">
              <strong>{fmt2(totais.ltTon)}</strong>
            </td>
            <td className="num">
              <strong>{fmt2(totais.ltHr)}</strong>
            </td>
            <td className="num">
              <strong>{fmt2(totais.tonHrMotor)}</strong>
            </td>
            <td className="num">
              <strong>{fmt2(totais.tonHrElevador)}</strong>
            </td>
            <td className="num">
              <strong>{fmt2(totais.tonDia)}</strong>
            </td>
            {mostrarProducaoPorTurno ? <td /> : null}
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}

export function TabelaTrator({
  linhas,
  totais,
  ocultarLitrosCombustivel = false,
  ocultarHorasMotorElevador = false,
  mostrarDisponibilidade = false,
  rotuloEquip = "Frota",
}: {
  linhas: IndicadoresProducaoLinha[];
  totais: IndicadoresProducaoLinha | null;
  ocultarLitrosCombustivel?: boolean;
  ocultarHorasMotorElevador?: boolean;
  mostrarDisponibilidade?: boolean;
  rotuloEquip?: string;
}) {
  return (
    <table className="data indicadores-producao-table">
      <thead>
        <tr>
          <th>{rotuloEquip}</th>
          {mostrarDisponibilidade ? <ThQuebra lines={["Disponi-", "bilidade"]} /> : null}
          <ThQuebra lines={["Tonelada", "Colhida"]} />
          {ocultarLitrosCombustivel ? null : <th className="num">Litros Combustível</th>}
          {ocultarHorasMotorElevador ? null : <th className="num">Hrs Motor</th>}
          <th className="num">Lt/ton</th>
          <th className="num">Lt/hr</th>
          <ThQuebra lines={["Ton/hora", "Motor"]} />
          <ThQuebra lines={["Ton/dia/", "maquina"]} />
        </tr>
      </thead>
      <tbody>
        {linhas.map((row) => (
          <tr key={row.equipTag} className={row.parado ? "indicadores-parado" : ""}>
            <td>{row.equipTag}</td>
            {mostrarDisponibilidade ? <CelulaDisponibilidade pct={row.disponibilidadePct} /> : null}
            <td className="num">{fmt2(row.toneladaColhida)}</td>
            {ocultarLitrosCombustivel ? null : <td className="num">{fmt2(row.litrosCombustivel)}</td>}
            {ocultarHorasMotorElevador ? null : <td className="num">{fmt2(row.hrsMotor)}</td>}
            <td className="num">{fmt2(row.ltTon)}</td>
            <td className="num">{fmt2(row.ltHr)}</td>
            <td className="num">{fmt2(row.tonHrMotor)}</td>
            <td className="num">{fmt2(row.tonDia)}</td>
          </tr>
        ))}
        {totais ? (
          <tr className="indicadores-producao-total">
            <td>
              <strong>Total</strong>
            </td>
            {mostrarDisponibilidade ? <CelulaDisponibilidadeTotal linhas={linhas} totais={totais} /> : null}
            <td className="num">
              <strong>{fmt2(totais.toneladaColhida)}</strong>
            </td>
            {ocultarLitrosCombustivel ? null : (
              <td className="num">
                <strong>{fmt2(totais.litrosCombustivel)}</strong>
              </td>
            )}
            {ocultarHorasMotorElevador ? null : (
              <td className="num">
                <strong>{fmt2(totais.hrsMotor)}</strong>
              </td>
            )}
            <td className="num">
              <strong>{fmt2(totais.ltTon)}</strong>
            </td>
            <td className="num">
              <strong>{fmt2(totais.ltHr)}</strong>
            </td>
            <td className="num">
              <strong>{fmt2(totais.tonHrMotor)}</strong>
            </td>
            <td className="num">
              <strong>{fmt2(totais.tonDia)}</strong>
            </td>
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}

export function TabelaCaminhao({
  linhas,
  totais,
  ocultarLitrosCombustivel = false,
  ocultarKmRodados = false,
  mostrarDisponibilidade = false,
  rotuloEquip = "Frota",
}: {
  linhas: IndicadoresProducaoLinha[];
  totais: IndicadoresProducaoLinha | null;
  ocultarLitrosCombustivel?: boolean;
  ocultarKmRodados?: boolean;
  mostrarDisponibilidade?: boolean;
  rotuloEquip?: string;
}) {
  return (
    <table className="data indicadores-producao-table">
      <thead>
        <tr>
          <th>{rotuloEquip}</th>
          {mostrarDisponibilidade ? <ThQuebra lines={["Disponi-", "bilidade"]} /> : null}
          <ThQuebra lines={["Tonelada", "Colhida"]} />
          {ocultarLitrosCombustivel ? null : <th className="num">Litros Combustível</th>}
          {ocultarKmRodados ? null : <th className="num">Km rodados</th>}
          <th className="num">Km/lt</th>
          <th className="num">Lt/ton</th>
          <th className="num">Ton/viagem</th>
          <th className="num">Media diária</th>
        </tr>
      </thead>
      <tbody>
        {linhas.map((row) => (
          <tr key={row.equipTag} className={row.parado ? "indicadores-parado" : ""}>
            <td>{row.equipTag}</td>
            {mostrarDisponibilidade ? <CelulaDisponibilidade pct={row.disponibilidadePct} /> : null}
            <td className="num">{fmt2(row.toneladaColhida)}</td>
            {ocultarLitrosCombustivel ? null : <td className="num">{fmt2(row.litrosCombustivel)}</td>}
            {ocultarKmRodados ? null : <td className="num">{fmt2(row.kmRodados)}</td>}
            <td className="num">{fmt2(row.kmLt)}</td>
            <td className="num">{fmt2(row.ltTon)}</td>
            <td className="num">{fmt2(row.tonViagem)}</td>
            <td className="num">{fmt2(row.mediaDiaria)}</td>
          </tr>
        ))}
        {totais ? (
          <tr className="indicadores-producao-total">
            <td>
              <strong>Total</strong>
            </td>
            {mostrarDisponibilidade ? <CelulaDisponibilidadeTotal linhas={linhas} totais={totais} /> : null}
            <td className="num">
              <strong>{fmt2(totais.toneladaColhida)}</strong>
            </td>
            {ocultarLitrosCombustivel ? null : (
              <td className="num">
                <strong>{fmt2(totais.litrosCombustivel)}</strong>
              </td>
            )}
            {ocultarKmRodados ? null : (
              <td className="num">
                <strong>{fmt2(totais.kmRodados)}</strong>
              </td>
            )}
            <td className="num">
              <strong>{fmt2(totais.kmLt)}</strong>
            </td>
            <td className="num">
              <strong>{fmt2(totais.ltTon)}</strong>
            </td>
            <td className="num">
              <strong>{fmt2(totais.tonViagem)}</strong>
            </td>
            <td className="num">
              <strong>{fmt2(totais.mediaDiaria)}</strong>
            </td>
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}
