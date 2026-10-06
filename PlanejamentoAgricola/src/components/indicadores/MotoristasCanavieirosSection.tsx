import { useEffect, useMemo, useState } from "react";
import type { IndicadoresColheitaProducaoData } from "../../api";

type EquipamentoOpcao = {
  equipTag: string;
  toneladaColhida: number;
};

type MotoristaConfig = {
  id: string;
  matricula: string;
  nome: string;
};

type EquipamentoGrupoConfig = {
  id: string;
  equipTag: string;
  percentual: number;
  motoristas: MotoristaConfig[];
};

type GrupoConfig = {
  id: string;
  equipamentos: EquipamentoGrupoConfig[];
  folguista: MotoristaConfig;
  folguistaPercentual: number;
};

const STORAGE_KEY = "motoristas-canavieiros-grupos-v1";

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptyMotorista(): MotoristaConfig {
  return { id: uid("mot"), matricula: "", nome: "" };
}

function emptyEquipamento(equipTag = ""): EquipamentoGrupoConfig {
  return {
    id: uid("eq"),
    equipTag,
    percentual: 24,
    motoristas: [emptyMotorista(), emptyMotorista()],
  };
}

function emptyGrupo(opcoes: EquipamentoOpcao[] = []): GrupoConfig {
  return {
    id: uid("grp"),
    equipamentos: [emptyEquipamento(opcoes[0]?.equipTag ?? ""), emptyEquipamento(opcoes[1]?.equipTag ?? "")],
    folguista: emptyMotorista(),
    folguistaPercentual: 20,
  };
}

function readGrupos(): GrupoConfig[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed as GrupoConfig[];
  } catch {
    return [];
  }
}

function fmt2(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "-";
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function fmtPct(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "-";
  return `${fmt2(n)}%`;
}

function valorEquipamento(producao: number, percentual: number) {
  return producao * (percentual / 100);
}

function valorFolguista(subtotalMotoristas: number, percentual: number) {
  if (!(percentual > 0) || percentual >= 100) return 0;
  return subtotalMotoristas * (percentual / (100 - percentual));
}

export function MotoristasCanavieirosSection({ data }: { data: IndicadoresColheitaProducaoData | null }) {
  const opcoes = useMemo<EquipamentoOpcao[]>(() => {
    return [...(data?.tabelas.caminhao.linhas ?? [])]
      .filter((row) => row.equipTag)
      .map((row) => ({
        equipTag: row.equipTag,
        toneladaColhida: row.toneladaColhida ?? 0,
      }))
      .sort((a, b) => a.equipTag.localeCompare(b.equipTag, "pt-BR", { numeric: true }));
  }, [data]);

  const producaoPorEquip = useMemo(() => new Map(opcoes.map((row) => [row.equipTag, row.toneladaColhida])), [opcoes]);

  const [grupos, setGrupos] = useState<GrupoConfig[]>(() => readGrupos());

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(grupos));
    } catch {}
  }, [grupos]);

  const updateGrupo = (grupoId: string, updater: (grupo: GrupoConfig) => GrupoConfig) => {
    setGrupos((atuais) => atuais.map((grupo) => (grupo.id === grupoId ? updater(grupo) : grupo)));
  };

  const totaisGerais = grupos.reduce(
    (acc, grupo) => {
      const subtotalMotoristas = grupo.equipamentos.reduce((sum, eq) => {
        const producao = producaoPorEquip.get(eq.equipTag) ?? 0;
        return sum + valorEquipamento(producao, eq.percentual) * eq.motoristas.length;
      }, 0);
      const folga = valorFolguista(subtotalMotoristas, grupo.folguistaPercentual);
      acc.producao += grupo.equipamentos.reduce((sum, eq) => sum + (producaoPorEquip.get(eq.equipTag) ?? 0), 0);
      acc.valor += subtotalMotoristas + folga;
      return acc;
    },
    { producao: 0, valor: 0 },
  );

  return (
    <section className="motoristas-canavieiros">
      <div className="motoristas-toolbar no-print">
        <div>
          <h2>Produção dos motoristas canavieiros</h2>
          <p>Monte grupos com dois caminhões, defina motoristas, percentual e folguista.</p>
        </div>
        <button className="btn primary" type="button" onClick={() => setGrupos((atuais) => [...atuais, emptyGrupo(opcoes)])}>
          Adicionar tabela
        </button>
      </div>

      {!data ? <p className="lead">Consulte o período para carregar a produção dos caminhões.</p> : null}

      <div className="motoristas-report">
        <header className="motoristas-report-head">
          <strong>PRODUÇÃO DOS MOTORISTAS CANAVIEIROS</strong>
          <span>
            {data?.filtros.dataInicio ? new Date(`${data.filtros.dataInicio}T12:00:00`).toLocaleDateString("pt-BR") : "-"} A{" "}
            {data?.filtros.dataFim ? new Date(`${data.filtros.dataFim}T12:00:00`).toLocaleDateString("pt-BR") : "-"}
          </span>
        </header>

        <div className="motoristas-total-geral motoristas-total-geral--top">
          <span>TOTAL GERAL</span>
          <b>{fmt2(totaisGerais.producao)}</b>
          <b>{fmt2(totaisGerais.valor)}</b>
        </div>

        {grupos.length ? (
          grupos.map((grupo) => {
            const subtotalMotoristas = grupo.equipamentos.reduce((sum, eq) => {
              const producao = producaoPorEquip.get(eq.equipTag) ?? 0;
              return sum + valorEquipamento(producao, eq.percentual) * eq.motoristas.length;
            }, 0);
            const folga = valorFolguista(subtotalMotoristas, grupo.folguistaPercentual);
            const producaoGrupo = grupo.equipamentos.reduce((sum, eq) => sum + (producaoPorEquip.get(eq.equipTag) ?? 0), 0);
            const valorGrupo = subtotalMotoristas + folga;

            return (
              <article className="motoristas-pay-block" key={grupo.id}>
                <div className="motoristas-config no-print">
                  <button
                    className="btn"
                    type="button"
                    onClick={() => setGrupos((atuais) => atuais.filter((item) => item.id !== grupo.id))}
                  >
                    Remover tabela
                  </button>
                  <label>
                    % folguista
                    <input
                      type="number"
                      min={0}
                      max={95}
                      step={1}
                      value={grupo.folguistaPercentual}
                      onChange={(e) =>
                        updateGrupo(grupo.id, (atual) => ({ ...atual, folguistaPercentual: Number(e.target.value) || 0 }))
                      }
                    />
                  </label>
                </div>

                <table className="motoristas-pay-table">
                  <thead>
                    <tr>
                      <th>FROTA</th>
                      <th>MATRICULA</th>
                      <th>MOTORISTA</th>
                      <th>PRODUÇÃO (TON)</th>
                      <th>%</th>
                      <th>VALOR TOTAL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grupo.equipamentos.map((eq) => {
                      const producao = producaoPorEquip.get(eq.equipTag) ?? 0;
                      const valor = valorEquipamento(producao, eq.percentual);
                      return eq.motoristas.map((motorista, motoristaIndex) => (
                        <tr key={`${eq.id}-${motorista.id}`}>
                          <td>
                            {motoristaIndex === 0 ? (
                              <select
                                value={eq.equipTag}
                                onChange={(e) =>
                                  updateGrupo(grupo.id, (atual) => ({
                                    ...atual,
                                    equipamentos: atual.equipamentos.map((item) =>
                                      item.id === eq.id ? { ...item, equipTag: e.target.value } : item,
                                    ),
                                  }))
                                }
                              >
                                <option value="">Selecione</option>
                                {opcoes.map((opcao) => (
                                  <option key={opcao.equipTag} value={opcao.equipTag}>
                                    {opcao.equipTag}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              eq.equipTag || "-"
                            )}
                          </td>
                          <td>
                            <input
                              value={motorista.matricula}
                              onChange={(e) =>
                                updateGrupo(grupo.id, (atual) => ({
                                  ...atual,
                                  equipamentos: atual.equipamentos.map((item) =>
                                    item.id === eq.id
                                      ? {
                                          ...item,
                                          motoristas: item.motoristas.map((mot) =>
                                            mot.id === motorista.id ? { ...mot, matricula: e.target.value } : mot,
                                          ),
                                        }
                                      : item,
                                  ),
                                }))
                              }
                            />
                          </td>
                          <td>
                            <input
                              value={motorista.nome}
                              onChange={(e) =>
                                updateGrupo(grupo.id, (atual) => ({
                                  ...atual,
                                  equipamentos: atual.equipamentos.map((item) =>
                                    item.id === eq.id
                                      ? {
                                          ...item,
                                          motoristas: item.motoristas.map((mot) =>
                                            mot.id === motorista.id ? { ...mot, nome: e.target.value.toUpperCase() } : mot,
                                          ),
                                        }
                                      : item,
                                  ),
                                }))
                              }
                            />
                          </td>
                          <td className="num">{motoristaIndex === 0 ? fmt2(producao) : ""}</td>
                          <td className="num">
                            {motoristaIndex === 0 ? (
                              <input
                                type="number"
                                min={0}
                                step={0.1}
                                value={eq.percentual}
                                onChange={(e) =>
                                  updateGrupo(grupo.id, (atual) => ({
                                    ...atual,
                                    equipamentos: atual.equipamentos.map((item) =>
                                      item.id === eq.id ? { ...item, percentual: Number(e.target.value) || 0 } : item,
                                    ),
                                  }))
                                }
                              />
                            ) : (
                              fmtPct(eq.percentual)
                            )}
                          </td>
                          <td className="num">{fmt2(valor)}</td>
                        </tr>
                      ));
                    })}
                    <tr>
                      <td>FOLGUISTA</td>
                      <td>
                        <input
                          value={grupo.folguista.matricula}
                          onChange={(e) =>
                            updateGrupo(grupo.id, (atual) => ({
                              ...atual,
                              folguista: { ...atual.folguista, matricula: e.target.value },
                            }))
                          }
                        />
                      </td>
                      <td>
                        <input
                          value={grupo.folguista.nome}
                          onChange={(e) =>
                            updateGrupo(grupo.id, (atual) => ({
                              ...atual,
                              folguista: { ...atual.folguista, nome: e.target.value.toUpperCase() },
                            }))
                          }
                        />
                      </td>
                      <td className="num"></td>
                      <td className="num">{fmtPct(grupo.folguistaPercentual)}</td>
                      <td className="num">{fmt2(folga)}</td>
                    </tr>
                    <tr className="motoristas-total-row">
                      <td colSpan={3}>TOTAL</td>
                      <td className="num">{fmt2(producaoGrupo)}</td>
                      <td></td>
                      <td className="num">{fmt2(valorGrupo)}</td>
                    </tr>
                  </tbody>
                </table>
              </article>
            );
          })
        ) : (
          <p className="lead">Adicione uma tabela para vincular dois caminhões, motoristas e folguista.</p>
        )}

        <div className="motoristas-total-geral">
          <span>TOTAL GERAL</span>
          <b>{fmt2(totaisGerais.producao)}</b>
          <b>{fmt2(totaisGerais.valor)}</b>
        </div>
      </div>
    </section>
  );
}
