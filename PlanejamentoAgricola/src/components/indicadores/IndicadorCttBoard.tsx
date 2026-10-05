import { useMemo, useRef, useState } from "react";
import type { IndicadoresColheitaProducaoData, IndicadoresProducaoLinha } from "../../api";
import {
  INDICADORES_CTT,
  INDICADORES_CTT_CAMINHAO,
  INDICADORES_CTT_TRATOR,
  metaNoPeriodo,
  resumirIndicadorCtt,
  tomContraMeta,
  type CttIndicadorDef,
  type CttIndicadorId,
  type CttMaquina,
} from "../../lib/indicador-ctt";
import { readMetaCtt, writeMetaCtt, type CttQuadro } from "../../lib/metas-locais";
import { CopyVisualButton } from "../CopyVisualButton";

function fmtNum(n: number | null | undefined, unidade: "num" | "pct" = "num", casas?: number) {
  if (n == null || !Number.isFinite(n)) return "—";
  const formatted = new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: unidade === "pct" ? 1 : casas ?? 2,
  }).format(n);
  return unidade === "pct" ? `${formatted}%` : formatted;
}

function classeTom(tom: string) {
  return tom ? ` indicador-ctt-tom indicador-ctt-tom--${tom}` : "";
}

function frenteTitulo(label: string) {
  const texto = label.trim();
  if (!texto) return "SEM FRENTE";
  return texto.toLocaleUpperCase("pt-BR");
}

function valorOuZero(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return 0;
  return value;
}

function maquinaBase(row: IndicadoresProducaoLinha, valores: CttMaquina["valores"]): CttMaquina {
  return {
    equipTag: row.equipTag,
    frenteKey: row.frenteKey || "sem-frente",
    frenteLabel: row.frenteLabel || "Sem frente",
    valores,
    pesoTon: row.toneladaColhida ?? 0,
    horasMotor: row.hrsMotor ?? 0,
    horasElevador: row.hrsElevador ?? 0,
    litros: row.litrosCombustivel ?? 0,
    kmRodados: row.kmRodados ?? 0,
    litrosOleo: row.litrosOleoHidraulico ?? 0,
    oleoInformado: row.litrosOleoHidraulico != null,
    horasPotenciais: row.horasPotenciais ?? 0,
    horasOficina: row.horasOficina ?? 0,
  };
}

function montarColhedora(
  row: IndicadoresProducaoLinha,
  perdas: Map<number, number>,
  mineral: Map<number, number>,
): CttMaquina {
  const litrosAbastecimento = row.litrosCombustivel ?? 0;
  const horasAbastecimento = row.kmhsAbastecimento ?? 0;
  const valores: Partial<Record<CttIndicadorId, number | null>> = {
    hrsElevador: row.hrsElevador ?? 0,
    hrsMotor: row.hrsMotor ?? 0,
    disponibilidade: row.disponibilidadePct ?? null,
    tonDia: valorOuZero(row.toneladaColhida),
    tonHrMotor: row.tonHrMotor,
    tonHrElevador: row.tonHrElevador,
    dieselHr: horasAbastecimento > 0 ? litrosAbastecimento / horasAbastecimento : null,
    dieselTon: row.ltTon,
    perdasHa: perdas.get(row.codEquipamento) ?? null,
    impurezaMineral: mineral.get(row.codEquipamento) ?? null,
  };
  return { ...maquinaBase(row, valores), litrosAbastecimento, horasAbastecimento };
}

function montarTrator(row: IndicadoresProducaoLinha): CttMaquina {
  const toneladas = row.toneladaColhida ?? 0;
  const litrosAbastecimento = row.litrosPosto ?? 0;
  const horasAbastecimento = row.kmhsPosto ?? 0;
  const valores: Partial<Record<CttIndicadorId, number | null>> = {
    disponibilidade: row.disponibilidadePct ?? null,
    hrsMotor: row.hrsMotor ?? 0,
    tonDia: valorOuZero(toneladas),
    dieselHr: horasAbastecimento > 0 ? litrosAbastecimento / horasAbastecimento : null,
    dieselTon: toneladas > 0 ? row.litrosCombustivel / toneladas : null,
    oleoTon:
      row.litrosOleoHidraulico == null || !(toneladas > 0) ? null : row.litrosOleoHidraulico / toneladas,
  };
  return { ...maquinaBase(row, valores), litrosAbastecimento, horasAbastecimento };
}

function montarCaminhao(row: IndicadoresProducaoLinha): CttMaquina {
  const toneladas = row.toneladaColhida ?? 0;
  const km = row.kmRodados ?? 0;
  const litros = row.litrosCombustivel ?? 0;
  const valores: Partial<Record<CttIndicadorId, number | null>> = {
    disponibilidade: row.disponibilidadePct ?? null,
    tonDia: valorOuZero(toneladas),
    dieselKm: km > 0 ? litros / km : null,
    eficienciaKm: litros > 0 ? km / litros : null,
  };
  return maquinaBase(row, valores);
}

export function IndicadorCttBoard({ data }: { data: IndicadoresColheitaProducaoData }) {
  const dias = Math.max(1, data.filtros.dias || 1);
  const [metasVersao, setMetasVersao] = useState(0);

  const frentes = useMemo(() => {
    const perdas = new Map<number, number>();
    for (const row of data.qualidade?.porEquipamento ?? []) {
      if (row.codEquipamento == null || row.tonHaPerda == null) continue;
      perdas.set(row.codEquipamento, row.tonHaPerda);
    }
    const mineral = new Map<number, number>();
    for (const row of data.qualidade?.impurezaPorEquipamento ?? []) {
      if (row.codEquipamento == null || row.impurezaMineral == null) continue;
      mineral.set(row.codEquipamento, row.impurezaMineral);
    }

    const grupos = new Map<string, CttMaquina[]>();
    for (const row of data.tabelas.colhedora.linhas) {
      const maquina = montarColhedora(row, perdas, mineral);
      const lista = grupos.get(maquina.frenteKey) ?? [];
      lista.push(maquina);
      grupos.set(maquina.frenteKey, lista);
    }

    return [...grupos.entries()]
      .map(([key, maquinas]) => ({
        key,
        label: frenteTitulo(maquinas[0]?.frenteLabel ?? "Sem frente"),
        maquinas: maquinas.slice().sort((a, b) => a.equipTag.localeCompare(b.equipTag, "pt-BR", { numeric: true })),
      }))
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { numeric: true }));
  }, [data]);

  const caminhoes = useMemo(
    () =>
      data.tabelas.caminhao.linhas
        .map(montarCaminhao)
        .sort((a, b) => a.equipTag.localeCompare(b.equipTag, "pt-BR", { numeric: true })),
    [data],
  );

  const tratores = useMemo(
    () =>
      data.tabelas.trator.linhas
        .map(montarTrator)
        .sort((a, b) => a.equipTag.localeCompare(b.equipTag, "pt-BR", { numeric: true })),
    [data],
  );

  if (!frentes.length && !tratores.length && !caminhoes.length) {
    return <p className="lead">Nenhuma colhedora, trator ou caminhão com movimento no período.</p>;
  }

  return (
    <div className="indicador-ctt-stack">
      {frentes.map((frente) => (
        <QuadroCtt
          key={frente.key}
          rotulo="Indicadores – Colhedora"
          quadro="colhedora"
          indicadores={INDICADORES_CTT}
          maquinas={frente.maquinas}
          dias={dias}
          metasVersao={metasVersao}
          onMetaSalva={() => setMetasVersao((n) => n + 1)}
        />
      ))}
      {tratores.length ? (
        <QuadroCtt
          rotulo="Indicadores – Todos Tratores CTT"
          quadro="trator"
          indicadores={INDICADORES_CTT_TRATOR}
          maquinas={tratores}
          dias={dias}
          metasVersao={metasVersao}
          onMetaSalva={() => setMetasVersao((n) => n + 1)}
        />
      ) : null}
      {caminhoes.length ? (
        <QuadroCtt
          rotulo="Indicadores – Todos Caminhões CTT"
          quadro="caminhao"
          indicadores={INDICADORES_CTT_CAMINHAO}
          maquinas={caminhoes}
          dias={dias}
          metasVersao={metasVersao}
          onMetaSalva={() => setMetasVersao((n) => n + 1)}
        />
      ) : null}
    </div>
  );
}

function defComMetaLocal(quadro: CttQuadro, def: CttIndicadorDef): CttIndicadorDef {
  return { ...def, meta: readMetaCtt(quadro, def.id, def.meta) };
}

function persistirMetaCtt(quadro: CttQuadro, def: CttIndicadorDef, dias: number, valorExibido: number) {
  const base = def.escalaComDias ? valorExibido / Math.max(1, dias) : valorExibido;
  writeMetaCtt(quadro, def.id, base);
}

function QuadroCtt({
  rotulo,
  quadro,
  indicadores,
  maquinas,
  dias,
  metasVersao,
  onMetaSalva,
}: {
  rotulo: string;
  quadro: CttQuadro;
  indicadores: CttIndicadorDef[];
  maquinas: CttMaquina[];
  dias: number;
  metasVersao: number;
  onMetaSalva: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  void metasVersao;
  return (
    <section className="indicador-ctt-board">
      <div className="indicador-ctt-toolbar no-print">
        <CopyVisualButton targetRef={ref} />
      </div>
      <article ref={ref}>
        <div className="table-wrap indicador-ctt-wrap">
            <table className="data indicador-ctt-table">
              <thead>
                <tr className="indicador-ctt-cols">
                  <th>{rotulo}</th>
                  {maquinas.map((maquina) => (
                    <th key={maquina.equipTag} className="num">
                      {maquina.equipTag}
                    </th>
                  ))}
                  <th className="num">Total</th>
                  <th className="num indicador-ctt-meta">META</th>
                  <th className="num">Média real</th>
                  <th className="num">% Meta</th>
                </tr>
              </thead>
              <tbody>
                {indicadores.map((def) => {
                  const defLocal = defComMetaLocal(quadro, def);
                  const resumo = resumirIndicadorCtt(defLocal, maquinas, dias);
                  const meta = metaNoPeriodo(defLocal, dias);
                  const tomResumo = tomContraMeta(defLocal.sentido, resumo.media, meta);
                  return (
                    <tr key={def.id}>
                      <th scope="row">{def.label}</th>
                      {maquinas.map((maquina) => {
                        const valor = maquina.valores[def.id];
                        return (
                          <td key={maquina.equipTag} className={`num${classeTom(tomContraMeta(def.sentido, valor, meta))}`}>
                            {fmtNum(valor, def.unidade, def.casas)}
                          </td>
                        );
                      })}
                      <td className="num">{fmtNum(resumo.total, def.unidade, def.casas)}</td>
                      <td className="num indicador-ctt-meta">
                        <input
                          className="indicador-ctt-meta-input"
                          type="number"
                          step={def.unidade === "pct" ? 0.1 : 0.01}
                          defaultValue={Number.isFinite(meta) ? meta : ""}
                          key={`${def.id}-${meta}`}
                          aria-label={`Meta ${def.label}`}
                          onBlur={(e) => {
                            const n = Number(String(e.target.value).replace(",", "."));
                            if (!Number.isFinite(n)) {
                              e.target.value = Number.isFinite(meta) ? String(meta) : "";
                              return;
                            }
                            persistirMetaCtt(quadro, def, dias, n);
                            onMetaSalva();
                          }}
                        />
                      </td>
                      <td className={`num${classeTom(tomResumo)}`}>{fmtNum(resumo.media, def.unidade, def.casas)}</td>
                      <td className={`num${classeTom(tomResumo)}`}>{fmtNum(resumo.pctMeta, "pct")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </article>
      </section>
  );
}
