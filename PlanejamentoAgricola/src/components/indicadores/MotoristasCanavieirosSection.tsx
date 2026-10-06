import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  type ColheitaCaminhaoRow,
  type ColheitaFazendaUsinaRow,
  type ColheitaPrecoRaioRow,
  type ColheitaVinculoItem,
  type IndicadoresColheitaProducaoData,
} from "../../api";
import {
  buildMotoristasCanavieirosWorkbook,
  valorEquipamento,
  valorFolguista,
  valorLinha,
} from "../../lib/motoristas-canavieiros-excel";
import {
  chavePeriodoMotoristas,
  normalizarGruposPeriodo,
  PERIODO_MOTORISTAS_REGISTRADO,
  registrarLegadoNoPeriodo,
  type EquipamentoPeriodoConfig,
  type GrupoMotoristaPeriodo,
  type MotoristaPeriodoConfig,
} from "../../lib/motoristas-canavieiros-periodos";

type EquipamentoOpcao = {
  equipTag: string;
  toneladaColhida: number;
};

type MotoristaConfig = MotoristaPeriodoConfig;
type EquipamentoGrupoConfig = EquipamentoPeriodoConfig;
type GrupoConfig = GrupoMotoristaPeriodo;

const LEGACY_KEY = "motoristas-canavieiros-grupos-v1";
const STORE_KEY = "motoristas-canavieiros-periodos-v1";

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
    folguistas: [emptyMotorista()],
    folguistaPercentual: 20,
  };
}

function readStore(): Record<string, GrupoConfig[]> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).map(([key, value]) => [key, normalizarGruposPeriodo(value)]),
    );
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, GrupoConfig[]>) {
  localStorage.setItem(STORE_KEY, JSON.stringify(store));
}

function readLocalPeriodo(dataInicio: string, dataFim: string) {
  return readStore()[chavePeriodoMotoristas(dataInicio, dataFim)] ?? [];
}

function writeLocalPeriodo(dataInicio: string, dataFim: string, grupos: GrupoConfig[]) {
  const store = readStore();
  store[chavePeriodoMotoristas(dataInicio, dataFim)] = grupos;
  writeStore(store);
}

async function migrarLegado() {
  const raw = localStorage.getItem(LEGACY_KEY);
  if (raw == null) return;
  let legado: unknown = [];
  try {
    legado = JSON.parse(raw);
  } catch {
    return;
  }
  const store = registrarLegadoNoPeriodo(readStore(), legado);
  writeStore(store);
  const { dataInicio, dataFim } = PERIODO_MOTORISTAS_REGISTRADO;
  const grupos = store[chavePeriodoMotoristas(dataInicio, dataFim)] ?? [];
  if (!grupos.length) {
    localStorage.removeItem(LEGACY_KEY);
    return;
  }
  try {
    await api.colheitaSalvarMotoristasCanavieiros({ dataInicio, dataFim, grupos });
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    // A lista antiga permanece para a próxima tentativa.
  }
}

async function carregarPeriodo(dataInicio: string, dataFim: string) {
  const local = readLocalPeriodo(dataInicio, dataFim);
  try {
    const remote = normalizarGruposPeriodo((await api.colheitaMotoristasCanavieiros({ dataInicio, dataFim })).grupos);
    if (!remote.length && local.length) {
      await api.colheitaSalvarMotoristasCanavieiros({ dataInicio, dataFim, grupos: local }).catch(() => undefined);
      return local;
    }
    writeLocalPeriodo(dataInicio, dataFim, remote);
    return remote;
  } catch {
    return local;
  }
}

async function persistirPeriodo(dataInicio: string, dataFim: string, grupos: GrupoConfig[]) {
  const normalizados = normalizarGruposPeriodo(grupos);
  writeLocalPeriodo(dataInicio, dataFim, normalizados);
  await api.colheitaSalvarMotoristasCanavieiros({ dataInicio, dataFim, grupos: normalizados });
  return normalizados;
}

function labelPeriodo(dataInicio: string, dataFim: string) {
  const fmt = (iso: string) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR") : "-");
  return `${fmt(dataInicio)} a ${fmt(dataFim)}`;
}

function fmt2(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "-";
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function fmtPct(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "-";
  return `${fmt2(n)}%`;
}

function fazendaKey(value: string | null | undefined) {
  return String(value ?? "").trim() || "SEM FAZENDA";
}

function normalizeName(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function fazendaNomeFromLabel(label: string | null | undefined) {
  const raw = String(label ?? "").trim();
  const parts = raw.split(" - ");
  return parts.length > 1 ? parts.slice(1).join(" - ").trim() : raw;
}

function codigoPrefixo(value: string | null | undefined) {
  const match = String(value ?? "").trim().match(/^(\d{2}\.\d+)/);
  return match?.[1] ?? null;
}

function caminhaoKey(value: string | number | null | undefined) {
  if (value == null) return "";
  const raw = String(value).trim();
  return /^\d+$/.test(raw) ? String(Number(raw)) : raw;
}

function equipAliases(value: string | number | null | undefined) {
  const key = caminhaoKey(value);
  if (!key) return [];
  const parts = key
    .split(/[-\s/]+/)
    .map((part) => caminhaoKey(part))
    .filter(Boolean);
  return [...new Set([key, ...parts])];
}

function buildRaioMap(fazendaUsina: ColheitaFazendaUsinaRow[]) {
  const byLabel = new Map<string, number>();
  const byNome = new Map<string, number>();
  const byPrefixo = new Map<string, number>();
  for (const row of fazendaUsina) {
    if (row.raio == null) continue;
    const label = String(row.descricaoUsina ?? "").trim();
    if (!label) continue;
    byLabel.set(label, row.raio);
    const nome = normalizeName(fazendaNomeFromLabel(label));
    if (nome) byNome.set(nome, row.raio);
    const prefixo = codigoPrefixo(label);
    if (prefixo && !byPrefixo.has(prefixo)) byPrefixo.set(prefixo, row.raio);
  }
  return { byLabel, byNome, byPrefixo };
}

function resolvePrecoRaio(raio: number | null, precoRaio: ColheitaPrecoRaioRow[]) {
  if (raio == null || !Number.isFinite(raio)) return null;
  const validos = precoRaio
    .filter((row) => row.raio != null && (row.preco != null || row.producao != null))
    .map((row) => ({ raio: row.raio as number, preco: (row.preco ?? row.producao) as number }))
    .sort((a, b) => a.raio - b.raio);
  if (!validos.length) return null;
  const exato = validos.find((row) => row.raio === raio);
  if (exato) return exato.preco;
  const abaixo = [...validos].reverse().find((row) => row.raio <= raio);
  return abaixo?.preco ?? validos[0]?.preco ?? null;
}

function resolveRaio(fazenda: string, raioMap: ReturnType<typeof buildRaioMap>) {
  const label = String(fazenda ?? "").trim();
  if (!label || label === "SEM FAZENDA") return null;
  if (raioMap.byLabel.has(label)) return raioMap.byLabel.get(label) ?? null;
  const prefixo = codigoPrefixo(label);
  if (prefixo && raioMap.byPrefixo.has(prefixo)) return raioMap.byPrefixo.get(prefixo) ?? null;
  const nome = normalizeName(fazendaNomeFromLabel(label));
  if (nome && raioMap.byNome.has(nome)) return raioMap.byNome.get(nome) ?? null;
  for (const [key, raio] of raioMap.byNome) {
    if (nome.includes(key) || key.includes(nome)) return raio;
  }
  return null;
}

function codAssociadoVinculo(item: ColheitaVinculoItem) {
  if (item.codEquipamento != null) return caminhaoKey(item.codEquipamento);
  const associacoes = [...(item.associacoes ?? [])].filter((row) => row.codEquipamento != null);
  associacoes.sort((a, b) => String(b.dataFim ?? "").localeCompare(String(a.dataFim ?? "")));
  return associacoes[0]?.codEquipamento != null ? caminhaoKey(associacoes[0].codEquipamento) : "";
}

function EquipamentoFazendasTable({
  equipTag,
  percentual,
  producaoTotal,
  frota,
  fazendas,
  precoRaio,
}: {
  equipTag: string;
  percentual: number | null;
  producaoTotal: number;
  frota?: string | null;
  fazendas: Array<{ fazenda: string; producao: number; raio: number | null }>;
  precoRaio: ColheitaPrecoRaioRow[];
}) {
  const linhas = fazendas.length ? fazendas : [{ fazenda: "SEM FAZENDA", producao: producaoTotal, raio: null }];
  const total = linhas.reduce((acc, row) => acc + row.producao, 0);
  const calculaValores = percentual != null && percentual > 0;
  const totalRaio = linhas.reduce((acc, row) => {
    const preco = resolvePrecoRaio(row.raio, precoRaio);
    return acc + (valorLinha(row.producao, preco) ?? 0);
  }, 0);
  const frotaLabel = frota || equipTag || "-";
  return (
    <table className="motoristas-producao-table">
      <thead>
        <tr>
          <th>MOTORISTA</th>
          <th>COD. USINA</th>
          <th>FROTA</th>
          <th>FAZENDA</th>
          <th>PRODUÇÃO (TON)</th>
          <th>RAIO MÉDIO</th>
          <th>VALOR / RAIO</th>
          <th>TOTAL</th>
          <th>DISP(%)</th>
          <th>COMBUSTÍVEL (KM/LT)</th>
          <th>LÍQUIDO À RECEBER</th>
        </tr>
      </thead>
      <tbody>
        {linhas.map((row, index) => {
          const preco = resolvePrecoRaio(row.raio, precoRaio);
          const valor = valorLinha(row.producao, preco);
          return (
            <tr key={`${equipTag}-${row.fazenda}-${index}`}>
              <td></td>
              <td>{index === 0 ? equipTag || "-" : ""}</td>
              <td>{index === 0 ? frotaLabel : ""}</td>
              <td>{row.fazenda}</td>
              <td className="num">{fmt2(row.producao)}</td>
              <td className="num">{row.raio == null ? "" : fmt2(row.raio)}</td>
              <td className="num">{preco == null ? "" : fmt2(preco)}</td>
              <td className="num">{valor == null ? "" : fmt2(valor)}</td>
              <td className="num"></td>
              <td className="num"></td>
              <td className="num">{valor == null ? "" : fmt2(valor)}</td>
            </tr>
          );
        })}
        <tr className="motoristas-producao-total">
          <td colSpan={4}>TOTAL</td>
          <td className="num">{fmt2(total)}</td>
          <td></td>
          <td></td>
          <td className="num">{totalRaio > 0 ? fmt2(totalRaio) : calculaValores ? fmt2(valorEquipamento(total, percentual)) : ""}</td>
          <td></td>
          <td></td>
          <td className="num">{totalRaio > 0 ? fmt2(totalRaio) : calculaValores ? fmt2(valorEquipamento(total, percentual)) : ""}</td>
        </tr>
      </tbody>
    </table>
  );
}

export function MotoristasCanavieirosSection({
  data,
  dataInicio,
  dataFim,
  entradaCaminhao = [],
  vinculosCaminhao = [],
  fazendaUsina = [],
  precoRaio = [],
}: {
  data: IndicadoresColheitaProducaoData | null;
  dataInicio: string;
  dataFim: string;
  entradaCaminhao?: ColheitaCaminhaoRow[];
  vinculosCaminhao?: ColheitaVinculoItem[];
  fazendaUsina?: ColheitaFazendaUsinaRow[];
  precoRaio?: ColheitaPrecoRaioRow[];
}) {
  const vinculoPorCaminhao = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of vinculosCaminhao) {
      const caminhao = caminhaoKey(item.caminhao);
      const cod = codAssociadoVinculo(item);
      if (caminhao && cod) map.set(caminhao, cod);
      if (cod) map.set(cod, cod);
    }
    return map;
  }, [vinculosCaminhao]);

  const opcoes = useMemo<EquipamentoOpcao[]>(() => {
    const temAssociacao = vinculoPorCaminhao.size > 0;
    return [...(data?.tabelas.caminhao.linhas ?? [])]
      .filter((row) => row.equipTag && (!temAssociacao || vinculoPorCaminhao.has(caminhaoKey(row.equipTag))))
      .map((row) => ({
        equipTag: vinculoPorCaminhao.get(caminhaoKey(row.equipTag)) ?? row.equipTag,
        toneladaColhida: row.toneladaColhida ?? 0,
      }))
      .sort((a, b) => a.equipTag.localeCompare(b.equipTag, "pt-BR", { numeric: true }));
  }, [data, vinculoPorCaminhao]);

  const producaoPorEquip = useMemo(() => new Map(opcoes.map((row) => [row.equipTag, row.toneladaColhida])), [opcoes]);
  const raioMap = useMemo(() => buildRaioMap(fazendaUsina), [fazendaUsina]);
  const fazendasPorEquip = useMemo(() => {
    const map = new Map<string, Array<{ fazenda: string; producao: number; raio: number | null }>>();
    const buckets = new Map<string, Map<string, number>>();
    const addBucket = (equip: string, fazenda: string, producao: number) => {
      if (!equip) return;
      const porFazenda = buckets.get(equip) ?? new Map<string, number>();
      porFazenda.set(fazenda, (porFazenda.get(fazenda) ?? 0) + producao);
      buckets.set(equip, porFazenda);
    };
    for (const row of entradaCaminhao) {
      const fazenda = fazendaKey(row.fazenda);
      const producao = row.pesoLiquido ?? 0;
      const caminhao = caminhaoKey(row.caminhao);
      const codEquipamento = caminhaoKey(row.codEquipamento);
      addBucket(caminhao, fazenda, producao);
      addBucket(codEquipamento, fazenda, producao);
      if (caminhao && codEquipamento) addBucket(`${caminhao}-${codEquipamento}`, fazenda, producao);
    }
    for (const [equip, porFazenda] of buckets) {
      map.set(
        equip,
        [...porFazenda.entries()]
          .map(([fazenda, producao]) => ({ fazenda, producao }))
          .map((row) => ({ ...row, raio: resolveRaio(row.fazenda, raioMap) }))
          .sort((a, b) => a.fazenda.localeCompare(b.fazenda, "pt-BR", { numeric: true })),
      );
    }
    return map;
  }, [entradaCaminhao, raioMap]);

  const fazendasDoEquipamento = (equipTag: string) => {
    for (const alias of equipAliases(equipTag)) {
      const rows = fazendasPorEquip.get(alias);
      if (rows?.length) return rows;
    }
    return [];
  };
  const equipamentosPorFazenda = useMemo(() => {
    const principal = new Map<string, Map<string, number>>();
    const frotaPorEquip = new Map<string, string>();
    const temAssociacao = vinculoPorCaminhao.size > 0;
    for (const row of entradaCaminhao) {
      const equipTag = caminhaoKey(row.caminhao) || caminhaoKey(row.codEquipamento);
      if (!equipTag) continue;
      const frota = vinculoPorCaminhao.get(equipTag) || caminhaoKey(row.codEquipamento);
      if (temAssociacao && !frota) continue;
      if (frota && !frotaPorEquip.has(equipTag)) frotaPorEquip.set(equipTag, frota);
      const fazenda = fazendaKey(row.fazenda);
      const porFazenda = principal.get(equipTag) ?? new Map<string, number>();
      porFazenda.set(fazenda, (porFazenda.get(fazenda) ?? 0) + (row.pesoLiquido ?? 0));
      principal.set(equipTag, porFazenda);
    }
    const fromEntrada = [...principal.entries()]
      .map(([equipTag, porFazenda]) => {
        const fazendas = [...porFazenda.entries()]
          .map(([fazenda, producao]) => ({ fazenda, producao }))
          .map((row) => ({ ...row, raio: resolveRaio(row.fazenda, raioMap) }))
          .sort((a, b) => a.fazenda.localeCompare(b.fazenda, "pt-BR", { numeric: true }));
        const toneladaColhida = fazendas.reduce((acc, row) => acc + row.producao, 0);
        let frota = frotaPorEquip.get(equipTag) ?? null;
        if (!frota || frota === equipTag) {
          const match = opcoes
            .map((opcao) => ({ ...opcao, diff: Math.abs(opcao.toneladaColhida - toneladaColhida) }))
            .sort((a, b) => a.diff - b.diff)[0];
          const tolerancia = Math.max(10, toneladaColhida * 0.01);
          if (match && match.diff <= tolerancia) frota = match.equipTag;
        }
        return {
          equipTag,
          frota,
          toneladaColhida,
          fazendas,
        };
      })
      .filter((row) => row.toneladaColhida > 0)
      .sort((a, b) => a.equipTag.localeCompare(b.equipTag, "pt-BR", { numeric: true }));
    if (fromEntrada.length) return fromEntrada;
    return opcoes.map((opcao) => ({
      ...opcao,
      frota: null,
      fazendas: fazendasDoEquipamento(opcao.equipTag),
    }));
  }, [entradaCaminhao, opcoes, fazendasPorEquip, raioMap, vinculoPorCaminhao]);

  const totalFinanceiroPorEquipamento = useMemo(() => {
    const map = new Map<string, number>();
    const addTotal = (key: string | null | undefined, total: number) => {
      for (const alias of equipAliases(key)) {
        map.set(alias, Math.max(map.get(alias) ?? 0, total));
      }
    };
    for (const item of equipamentosPorFazenda) {
      const total = item.fazendas.reduce((acc, row) => {
        const preco = resolvePrecoRaio(row.raio, precoRaio);
        return acc + (valorLinha(row.producao, preco) ?? 0);
      }, 0);
      addTotal(item.equipTag, total);
      addTotal(item.frota, total);
      if (item.equipTag && item.frota) {
        addTotal(`${item.equipTag}-${item.frota}`, total);
        addTotal(`${item.frota}-${item.equipTag}`, total);
      }
    }
    return map;
  }, [equipamentosPorFazenda, precoRaio]);

  const totalFinanceiroEquipamento = (equipTag: string) => {
    for (const alias of equipAliases(equipTag)) {
      const total = totalFinanceiroPorEquipamento.get(alias);
      if (total != null) return total;
    }
    const producaoSelecionada = producaoPorEquip.get(equipTag) ?? 0;
    if (producaoSelecionada > 0) {
      const candidato = equipamentosPorFazenda
        .map((item) => {
          const diff = Math.abs(item.toneladaColhida - producaoSelecionada);
          const total = item.fazendas.reduce((acc, row) => {
            const preco = resolvePrecoRaio(row.raio, precoRaio);
            return acc + (valorLinha(row.producao, preco) ?? 0);
          }, 0);
          return { diff, item, total };
        })
        .filter((row) => row.total > 0)
        .sort((a, b) => a.diff - b.diff)[0];
      const tolerancia = Math.max(10, producaoSelecionada * 0.01);
      if (candidato && candidato.diff <= tolerancia) return candidato.total;
    }
    return fazendasDoEquipamento(equipTag).reduce((acc, row) => {
      const preco = resolvePrecoRaio(row.raio, precoRaio);
      return acc + (valorLinha(row.producao, preco) ?? 0);
    }, 0);
  };

  const [grupos, setGrupos] = useState<GrupoConfig[]>([]);
  const [saveState, setSaveState] = useState<"carregando" | "salvo" | "pendente" | "salvando" | "erro">("carregando");
  const [saveError, setSaveError] = useState<string | null>(null);
  const savedJson = useRef("[]");
  const gruposRef = useRef(grupos);
  const periodRef = useRef({ dataInicio, dataFim });
  const requestId = useRef(0);
  gruposRef.current = grupos;

  useEffect(() => {
    if (JSON.stringify(grupos) === savedJson.current) return;
    setSaveState((atual) => (atual === "carregando" || atual === "salvando" ? atual : "pendente"));
  }, [grupos]);

  useEffect(() => {
    const request = ++requestId.current;
    const inicio = dataInicio;
    const fim = dataFim;
    if (!inicio || !fim) return;
    setSaveState("carregando");
    setSaveError(null);
    void (async () => {
      try {
        await migrarLegado();
        if (request !== requestId.current) return;
        const previous = periodRef.current;
        const mudouPeriodo = previous.dataInicio !== inicio || previous.dataFim !== fim;
        if (mudouPeriodo && previous.dataInicio && previous.dataFim && JSON.stringify(gruposRef.current) !== savedJson.current) {
          await persistirPeriodo(previous.dataInicio, previous.dataFim, gruposRef.current);
        }
        const carregados = await carregarPeriodo(inicio, fim);
        if (request !== requestId.current) return;
        periodRef.current = { dataInicio: inicio, dataFim: fim };
        savedJson.current = JSON.stringify(carregados);
        setGrupos(carregados);
        setSaveState("salvo");
      } catch (e) {
        if (request !== requestId.current) return;
        setSaveError(e instanceof Error ? e.message : String(e));
        setSaveState("erro");
      }
    })();
  }, [dataInicio, dataFim]);

  const salvarPeriodo = async () => {
    if (!dataInicio || !dataFim) return;
    setSaveState("salvando");
    setSaveError(null);
    try {
      const salvos = await persistirPeriodo(dataInicio, dataFim, grupos);
      savedJson.current = JSON.stringify(salvos);
      periodRef.current = { dataInicio, dataFim };
      setGrupos(salvos);
      setSaveState("salvo");
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
      setSaveState("erro");
    }
  };

  const updateGrupo = (grupoId: string, updater: (grupo: GrupoConfig) => GrupoConfig) => {
    setGrupos((atuais) => atuais.map((grupo) => (grupo.id === grupoId ? updater(grupo) : grupo)));
  };

  const totaisGerais = grupos.reduce(
    (acc, grupo) => {
      const subtotalMotoristas = grupo.equipamentos.reduce((sum, eq) => {
        const totalCaminhao = totalFinanceiroEquipamento(eq.equipTag);
        return sum + valorEquipamento(totalCaminhao, eq.percentual) * eq.motoristas.length;
      }, 0);
      const folga = valorFolguista(subtotalMotoristas, grupo.folguistaPercentual);
      acc.producao += grupo.equipamentos.reduce((sum, eq) => sum + (producaoPorEquip.get(eq.equipTag) ?? 0), 0);
      acc.valor += subtotalMotoristas + folga;
      return acc;
    },
    { producao: 0, valor: 0 },
  );

  const exportarExcel = () => {
    const workbook = buildMotoristasCanavieirosWorkbook({
      dataInicio: data?.filtros.dataInicio ?? null,
      dataFim: data?.filtros.dataFim ?? null,
      equipamentos: equipamentosPorFazenda.map((item) => ({
        equipTag: item.equipTag,
        frota: item.frota,
        toneladaColhida: item.toneladaColhida,
        fazendas: item.fazendas.map((row) => ({
          fazenda: row.fazenda,
          producao: row.producao,
          raio: row.raio,
          preco: resolvePrecoRaio(row.raio, precoRaio),
        })),
      })),
      grupos: grupos.map((grupo) => ({
        folguistaPercentual: grupo.folguistaPercentual,
        folguistas: (grupo.folguistas?.length ? grupo.folguistas : [emptyMotorista()]).map((folguista) => ({
          matricula: folguista.matricula,
          nome: folguista.nome,
        })),
        equipamentos: grupo.equipamentos.map((eq) => ({
          equipTag: eq.equipTag,
          percentual: eq.percentual,
          producao: producaoPorEquip.get(eq.equipTag) ?? 0,
          totalFinanceiro: totalFinanceiroEquipamento(eq.equipTag),
          lookupTags: equipAliases(eq.equipTag),
          motoristas: eq.motoristas.map((motorista) => ({
            matricula: motorista.matricula,
            nome: motorista.nome,
          })),
        })),
      })),
    });
    const blob = new Blob(["\uFEFF", workbook.xml], { type: "application/vnd.ms-excel;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `motoristas-canavieiros-${data?.filtros.dataInicio ?? "inicio"}-${data?.filtros.dataFim ?? "fim"}.xls`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="motoristas-canavieiros">
      <div className="motoristas-toolbar no-print">
        <div>
          <h2>Produção dos motoristas canavieiros</h2>
          <p>Cada período guarda os motoristas, o equipamento e o percentual. No período seguinte eles podem mudar de frota.</p>
          <p className={`motoristas-save-status${saveState === "erro" ? " is-error" : ""}`}>
            {saveState === "carregando"
              ? "Carregando motoristas do período…"
              : saveState === "salvando"
                ? "Salvando…"
                : saveState === "pendente"
                  ? "Alterações ainda não salvas neste período."
                  : saveState === "erro"
                    ? saveError || "Não foi possível salvar os motoristas."
                    : `Salvo para ${labelPeriodo(dataInicio, dataFim)}.`}
          </p>
        </div>
        <div className="motoristas-toolbar-actions">
          <button className={`btn${saveState === "pendente" ? " primary" : ""}`} type="button" onClick={() => void salvarPeriodo()} disabled={!dataInicio || !dataFim || saveState === "carregando" || saveState === "salvando"}>
            Salvar período
          </button>
          <button className="btn" type="button" onClick={exportarExcel} disabled={!data}>
            Gerar Excel
          </button>
          <button className="btn" type="button" onClick={() => window.print()}>
            Imprimir
          </button>
          <button className="btn primary" type="button" onClick={() => setGrupos((atuais) => [...atuais, emptyGrupo(opcoes)])}>
            Adicionar tabela
          </button>
        </div>
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

        {equipamentosPorFazenda.length ? (
          <section className="motoristas-fazendas-auto">
            {equipamentosPorFazenda.map((opcao) => (
              <EquipamentoFazendasTable
                key={`auto-${opcao.equipTag}`}
                equipTag={opcao.equipTag}
                frota={opcao.frota}
                percentual={null}
                producaoTotal={opcao.toneladaColhida}
                fazendas={opcao.fazendas}
                precoRaio={precoRaio}
              />
            ))}
          </section>
        ) : null}

        {grupos.length ? (
          grupos.map((grupo) => {
            const subtotalMotoristas = grupo.equipamentos.reduce((sum, eq) => {
              const totalCaminhao = totalFinanceiroEquipamento(eq.equipTag);
              return sum + valorEquipamento(totalCaminhao, eq.percentual) * eq.motoristas.length;
            }, 0);
            const folga = valorFolguista(subtotalMotoristas, grupo.folguistaPercentual);
            const folguistas = grupo.folguistas?.length ? grupo.folguistas : [emptyMotorista()];
            const valorPorFolguista = folguistas.length ? folga / folguistas.length : 0;
            const producaoGrupo = grupo.equipamentos.reduce((sum, eq) => sum + (producaoPorEquip.get(eq.equipTag) ?? 0), 0);
            const valorGrupo = subtotalMotoristas + folga;

            return (
              <article className="motoristas-group-block" key={grupo.id}>
                <div className="motoristas-config no-print">
                  <button
                    className="btn"
                    type="button"
                    onClick={() => setGrupos((atuais) => atuais.filter((item) => item.id !== grupo.id))}
                  >
                    Remover tabela
                  </button>
                  <button
                    className="btn"
                    type="button"
                    onClick={() =>
                      updateGrupo(grupo.id, (atual) => ({
                        ...atual,
                        equipamentos: [...atual.equipamentos, emptyEquipamento()],
                      }))
                    }
                  >
                    Adicionar caminhão
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
                  <button
                    className="btn"
                    type="button"
                    onClick={() =>
                      updateGrupo(grupo.id, (atual) => ({
                        ...atual,
                        folguistas: [...(atual.folguistas?.length ? atual.folguistas : [emptyMotorista()]), emptyMotorista()],
                      }))
                    }
                  >
                    Adicionar folguista
                  </button>
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
                      <th className="no-print">AÇÕES</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grupo.equipamentos.map((eq) => {
                      const producao = producaoPorEquip.get(eq.equipTag) ?? 0;
                      const totalCaminhao = totalFinanceiroEquipamento(eq.equipTag);
                      const valor = valorEquipamento(totalCaminhao, eq.percentual);
                      return (
                        <Fragment key={`${eq.id}-motoristas`}>
                          {eq.motoristas.map((motorista, motoristaIndex) => (
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
                              <td className="motoristas-row-actions no-print">
                                {motoristaIndex === 0 ? (
                                  <button
                                    className="btn"
                                    type="button"
                                    disabled={grupo.equipamentos.length <= 1}
                                    onClick={() =>
                                      updateGrupo(grupo.id, (atual) => ({
                                        ...atual,
                                        equipamentos:
                                          atual.equipamentos.length > 1
                                            ? atual.equipamentos.filter((item) => item.id !== eq.id)
                                            : atual.equipamentos,
                                      }))
                                    }
                                  >
                                    Remover frota
                                  </button>
                                ) : null}
                                <button
                                  className="btn"
                                  type="button"
                                  disabled={eq.motoristas.length <= 1}
                                  onClick={() =>
                                    updateGrupo(grupo.id, (atual) => ({
                                      ...atual,
                                      equipamentos: atual.equipamentos.map((item) =>
                                        item.id === eq.id
                                          ? {
                                              ...item,
                                              motoristas:
                                                item.motoristas.length > 1
                                                  ? item.motoristas.filter((mot) => mot.id !== motorista.id)
                                                  : item.motoristas,
                                            }
                                          : item,
                                      ),
                                    }))
                                  }
                                >
                                  Remover
                                </button>
                              </td>
                            </tr>
                          ))}
                          <tr className="motoristas-add-row no-print" key={`${eq.id}-add`}>
                            <td colSpan={7}>
                              <button
                                className="btn"
                                type="button"
                                onClick={() =>
                                  updateGrupo(grupo.id, (atual) => ({
                                    ...atual,
                                    equipamentos: atual.equipamentos.map((item) =>
                                      item.id === eq.id ? { ...item, motoristas: [...item.motoristas, emptyMotorista()] } : item,
                                    ),
                                  }))
                                }
                              >
                                Adicionar motorista na frota {eq.equipTag || "-"}
                              </button>
                            </td>
                          </tr>
                        </Fragment>
                      );
                    })}
                    {folguistas.map((folguista, folguistaIndex) => (
                      <tr key={`folguista-${folguista.id}`}>
                        <td>{folguistaIndex === 0 ? "FOLGUISTA" : ""}</td>
                        <td>
                          <input
                            value={folguista.matricula}
                            onChange={(e) =>
                              updateGrupo(grupo.id, (atual) => ({
                                ...atual,
                                folguistas: (atual.folguistas?.length ? atual.folguistas : folguistas).map((item) =>
                                  item.id === folguista.id ? { ...item, matricula: e.target.value } : item,
                                ),
                              }))
                            }
                          />
                        </td>
                        <td>
                          <input
                            value={folguista.nome}
                            onChange={(e) =>
                              updateGrupo(grupo.id, (atual) => ({
                                ...atual,
                                folguistas: (atual.folguistas?.length ? atual.folguistas : folguistas).map((item) =>
                                  item.id === folguista.id ? { ...item, nome: e.target.value.toUpperCase() } : item,
                                ),
                              }))
                            }
                          />
                        </td>
                        <td className="num"></td>
                        <td className="num">{folguistaIndex === 0 ? fmtPct(grupo.folguistaPercentual) : ""}</td>
                        <td className="num">{fmt2(valorPorFolguista)}</td>
                        <td className="motoristas-row-actions no-print">
                          <button
                            className="btn"
                            type="button"
                            disabled={folguistas.length <= 1}
                            onClick={() =>
                              updateGrupo(grupo.id, (atual) => ({
                                ...atual,
                                folguistas:
                                  (atual.folguistas?.length ? atual.folguistas : folguistas).length > 1
                                    ? (atual.folguistas?.length ? atual.folguistas : folguistas).filter((item) => item.id !== folguista.id)
                                    : atual.folguistas,
                              }))
                            }
                          >
                            Remover
                          </button>
                        </td>
                      </tr>
                    ))}
                    <tr className="motoristas-total-row">
                      <td colSpan={3}>TOTAL</td>
                      <td className="num">{fmt2(producaoGrupo)}</td>
                      <td></td>
                      <td className="num">{fmt2(valorGrupo)}</td>
                      <td className="no-print"></td>
                    </tr>
                  </tbody>
                </table>
              </article>
            );
          })
        ) : saveState === "carregando" ? null : (
          <p className="lead">
            {dataInicio === PERIODO_MOTORISTAS_REGISTRADO.dataInicio && dataFim === PERIODO_MOTORISTAS_REGISTRADO.dataFim
              ? "Nenhum motorista salvo para este período. Adicione uma tabela e salve."
              : `Nenhum motorista salvo para ${labelPeriodo(dataInicio, dataFim)}. Adicione uma tabela e salve o período. Os motoristas já lançados estão em ${labelPeriodo(PERIODO_MOTORISTAS_REGISTRADO.dataInicio, PERIODO_MOTORISTAS_REGISTRADO.dataFim)}.`}
          </p>
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
