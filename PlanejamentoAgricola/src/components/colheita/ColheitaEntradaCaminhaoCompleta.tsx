import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { api, type ColheitaCaminhaoOpKey, type ColheitaCaminhaoRow } from "../../api";
import { formatQty } from "../../lib/format";
import { ColheitaFiltros, useColheitaPeriod } from "./ColheitaFiltros";
import { cell, formatOrdsDate } from "./colheita-utils";

function numberCell(value: number | null | undefined, digits = 2) {
  return value == null ? "—" : value.toLocaleString("pt-BR", { maximumFractionDigits: digits });
}

function taxaDivisao(dividendo: number, divisor: number) {
  if (!(divisor > 0)) return 0;
  return Math.round((dividendo / divisor) * 1000) / 10;
}

const OP_GROUPS: { key: "colhedeiras" | "tratores"; label: string; ops: { key: ColheitaCaminhaoOpKey; label: string }[] }[] = [
  {
    key: "colhedeiras",
    label: "Colhedeiras",
    ops: ["op01", "op02", "op03", "op04"].map((key, index) => ({ key, label: `OP ${String(index + 1).padStart(2, "0")}` })),
  },
  {
    key: "tratores",
    label: "Tratores",
    ops: ["op05", "op06", "op07", "op08", "op09", "op10", "op11", "op12"].map((key, index) => ({ key, label: `OP ${String(index + 1).padStart(2, "0")}` })),
  },
];

const OP_COLS = OP_GROUPS.flatMap((group) => group.ops);

type OpDraft = Record<ColheitaCaminhaoOpKey, { codigoFuncionario: string; viagens: string }>;

function emptyOpDraft(): OpDraft {
  return Object.fromEntries(OP_COLS.map(({ key }) => [key, { codigoFuncionario: "", viagens: "" }])) as OpDraft;
}

function parseOpValue(value: string | null | undefined) {
  const text = (value ?? "").trim();
  if (!text) return { codigoFuncionario: "", viagens: "" };
  const match = text.match(/^(.+?)\s*-\s*(.+)$/);
  if (!match) return { codigoFuncionario: text, viagens: "" };
  return { codigoFuncionario: match[1].trim(), viagens: match[2].trim() };
}

function parseViagens(value: string) {
  const normalized = value.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function makeDraft(row: ColheitaCaminhaoRow): OpDraft {
  return Object.fromEntries(OP_COLS.map(({ key }) => [key, parseOpValue(row[key])])) as OpDraft;
}

function formatOpDraft(value: { codigoFuncionario: string; viagens: string }) {
  const codigo = value.codigoFuncionario.trim();
  const viagens = value.viagens.trim();
  if (codigo && viagens) return `${codigo} - ${viagens}`;
  return codigo || viagens || null;
}

function totalViagensRow(row: ColheitaCaminhaoRow, ops = OP_COLS) {
  return ops.reduce((acc, { key }) => acc + parseViagens(parseOpValue(row[key]).viagens), 0);
}

function toneladaPorViagemRow(row: ColheitaCaminhaoRow, ops = OP_COLS) {
  const viagens = totalViagensRow(row, ops);
  return viagens > 0 ? (row.pesoLiquido ?? 0) / viagens : null;
}

function normalizeCodigoFuncionario(value: string) {
  const trimmed = value.trim();
  return trimmed.replace(/^0+/, "") || trimmed;
}

function codigoRepetidoDraft(draft: OpDraft) {
  const vistos = new Set<string>();
  for (const { key, label } of OP_COLS) {
    const codigo = normalizeCodigoFuncionario(draft[key].codigoFuncionario);
    if (!codigo) continue;
    if (vistos.has(codigo)) return label;
    vistos.add(codigo);
  }
  return null;
}

export function ColheitaEntradaCaminhaoCompleta() {
  const { dataInicio, dataFim, setPeriod } = useColheitaPeriod();
  const [busca, setBusca] = useState("");
  const [pesagemFiltro, setPesagemFiltro] = useState("");
  const [guiaFiltro, setGuiaFiltro] = useState("");
  const [caminhaoFiltro, setCaminhaoFiltro] = useState("");
  const [rows, setRows] = useState<ColheitaCaminhaoRow[]>([]);
  const [resumo, setResumo] = useState<{ totalLinhas?: number; pesoLiquidoTotal?: number; truncado?: boolean } | null>(null);
  const [funcionarios, setFuncionarios] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<ColheitaCaminhaoRow | null>(null);
  const [bulkEdit, setBulkEdit] = useState<{ codigo: string; descricao: string; novoCodigo: string; groupKey: "colhedeiras" | "tratores" } | null>(null);
  const [opDraft, setOpDraft] = useState<OpDraft>(() => emptyOpDraft());

  const filteredRows = useMemo(() => {
    const pesagem = pesagemFiltro.trim();
    const guia = guiaFiltro.trim();
    if (!pesagem && !guia) return rows;
    return rows.filter(
      (row) =>
        (!pesagem || String(row.pesagem ?? "").includes(pesagem)) &&
        (!guia || String(row.guia ?? "").includes(guia)),
    );
  }, [guiaFiltro, pesagemFiltro, rows]);

  const stats = useMemo(() => {
    const guias = new Set<string>();
    const caminhoes = new Set<string>();
    let bruto = 0;
    let tara = 0;
    let liquido = 0;
    let comEquipamento = 0;
    for (const row of filteredRows) {
      if (row.guia != null) guias.add(String(row.guia));
      if (row.caminhao != null) caminhoes.add(String(row.caminhao));
      bruto += row.pesoBruto ?? 0;
      tara += row.pesoTara ?? 0;
      liquido += row.pesoLiquido ?? 0;
      if (row.codEquipamento != null) comEquipamento += 1;
    }
    return {
      guias: guias.size,
      caminhoes: caminhoes.size,
      bruto,
      tara,
      liquido,
      pctEquipamento: taxaDivisao(comEquipamento, filteredRows.length),
    };
  }, [filteredRows]);

  const resumoPorGrupo = useMemo(() => OP_GROUPS.map((group) => {
    const funcionariosResumo = new Map<string, { codigo: string; descricao: string; viagens: number; toneladas: number; apontamentos: number }>();
    let vazias = 0;
    let semCodigo = 0;
    let semViagens = 0;
    let completas = 0;
    for (const row of filteredRows) {
      const ops = group.ops.map(({ key }) => parseOpValue(row[key]))
        .map((parsed) => ({ ...parsed, codigoFuncionario: parsed.codigoFuncionario.trim(), viagensNumero: parseViagens(parsed.viagens) }))
        .filter((parsed) => parsed.codigoFuncionario);
      const viagensLinha = ops.reduce((acc, item) => acc + item.viagensNumero, 0);
      const toneladaPorViagem = viagensLinha > 0 ? (row.pesoLiquido ?? 0) / viagensLinha : 0;
      for (const parsed of ops) {
        const prev = funcionariosResumo.get(parsed.codigoFuncionario) || { codigo: parsed.codigoFuncionario, descricao: funcionarios[parsed.codigoFuncionario] ?? "", viagens: 0, toneladas: 0, apontamentos: 0 };
        prev.descricao = funcionarios[parsed.codigoFuncionario] ?? prev.descricao;
        prev.viagens += parsed.viagensNumero;
        prev.toneladas += parsed.viagensNumero * toneladaPorViagem;
        prev.apontamentos += 1;
        funcionariosResumo.set(parsed.codigoFuncionario, prev);
      }
      for (const { key } of group.ops) {
        const parsed = parseOpValue(row[key]);
        const codigo = parsed.codigoFuncionario.trim();
        const viagens = parsed.viagens.trim();
        if (!codigo && !viagens) vazias += 1;
        else if (!codigo && viagens) semCodigo += 1;
        else if (codigo && !viagens) semViagens += 1;
        else completas += 1;
      }
    }
    return {
      ...group,
      funcionarios: [...funcionariosResumo.values()].sort((a, b) => b.toneladas - a.toneladas || b.viagens - a.viagens || a.codigo.localeCompare(b.codigo, "pt-BR", { numeric: true })),
      pendencias: { completas, vazias, semCodigo, semViagens },
    };
  }), [filteredRows, funcionarios]);

  const load = async () => {
    try {
      setLoading(true);
      setErr(null);
      const data = await api.colheitaEntradaCaminhao({
        dataInicio,
        dataFim,
        busca: busca.trim() || undefined,
        caminhao: caminhaoFiltro.trim() || undefined,
      });
      setRows(data.dados);
      setResumo(data.resumo);
      setFuncionarios(data.funcionarios ?? {});
    } catch (e) {
      setRows([]);
      setResumo(null);
      setFuncionarios({});
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const openEdit = (row: ColheitaCaminhaoRow) => {
    setEditing(row);
    setOpDraft(makeDraft(row));
    setErr(null);
  };

  const setDraftValue = (key: ColheitaCaminhaoOpKey, field: "codigoFuncionario" | "viagens", value: string) => {
    setOpDraft((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  };

  const saveOps = async () => {
    if (!editing || editing.pesagem == null || editing.guia == null) return;
    const repetido = codigoRepetidoDraft(opDraft);
    if (repetido) {
      setErr(`Não é permitido repetir o mesmo código de funcionário nas OPs da mesma linha. Verifique ${repetido}.`);
      return;
    }
    try {
      setSaving(true);
      setErr(null);
      const ops = Object.fromEntries(OP_COLS.map(({ key }) => [key, opDraft[key]]));
      await api.salvarColheitaEntradaCaminhaoOps({ pesagem: editing.pesagem, guia: editing.guia, ops });
      const patch = Object.fromEntries(OP_COLS.map(({ key }) => [key, formatOpDraft(opDraft[key])])) as Partial<ColheitaCaminhaoRow>;
      setRows((prev) =>
        prev.map((row) =>
          row.pesagem === editing.pesagem && row.guia === editing.guia
            ? { ...row, ...patch }
            : row,
        ),
      );
      setEditing(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const saveBulkCodigo = async () => {
    if (!bulkEdit) return;
    const codigoAtual = bulkEdit.codigo.trim();
    const novoCodigo = bulkEdit.novoCodigo.trim();
    if (!codigoAtual || !novoCodigo) {
      setErr("Informe o novo código do funcionário.");
      return;
    }
    const afetadas = rows
      .map((row) => {
        const draft = makeDraft(row);
        let changed = false;
      const group = OP_GROUPS.find((item) => item.key === bulkEdit.groupKey)!;
      for (const { key } of group.ops) {
          if (draft[key].codigoFuncionario.trim() === codigoAtual) {
            draft[key] = { ...draft[key], codigoFuncionario: novoCodigo };
            changed = true;
          }
        }
        return { row, draft, changed };
      })
      .filter((item) => item.changed && item.row.pesagem != null && item.row.guia != null);
    if (!afetadas.length) {
      setErr("Nenhuma OP encontrada para esse código no período carregado.");
      return;
    }
    try {
      setSaving(true);
      setErr(null);
      const invalida = afetadas.find((item) => codigoRepetidoDraft(item.draft));
      if (invalida) {
        const repetido = codigoRepetidoDraft(invalida.draft);
        setErr(
          `A alteração geraria funcionário repetido na pesagem ${cell(invalida.row.pesagem)} / guia ${cell(invalida.row.guia)}. Verifique ${repetido}.`,
        );
        return;
      }
      for (const item of afetadas) {
        await api.salvarColheitaEntradaCaminhaoOps({
          pesagem: item.row.pesagem as number,
          guia: item.row.guia as number,
          ops: Object.fromEntries(OP_COLS.map(({ key }) => [key, item.draft[key]])),
        });
      }
      setBulkEdit(null);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const exportResumoExcel = (grupo: (typeof resumoPorGrupo)[number]) => {
    const totalViagens = grupo.funcionarios.reduce((acc, item) => acc + item.viagens, 0);
    const totalToneladas = grupo.funcionarios.reduce((acc, item) => acc + item.toneladas, 0);
    const totalApontamentos = grupo.funcionarios.reduce((acc, item) => acc + item.apontamentos, 0);
    const linhas = [
      [`Resumo de viagens por funcionário — ${grupo.label}`],
      [`Período: ${formatOrdsDate(dataInicio)} a ${formatOrdsDate(dataFim)}`],
      [],
      ["Cód. funcionário", "Funcionário", "Viagens", "Toneladas", "Apontamentos"],
      ...grupo.funcionarios.map((item) => [
        item.codigo,
        item.descricao || "",
        item.viagens,
        item.toneladas,
        item.apontamentos,
      ]),
      ["Total", "", totalViagens, totalToneladas, totalApontamentos],
    ];
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet(linhas);
    sheet["!cols"] = [{ wch: 18 }, { wch: 42 }, { wch: 12 }, { wch: 14 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(workbook, sheet, grupo.label);
    XLSX.writeFile(workbook, `resumo-viagens-${grupo.key}-${dataInicio || "inicio"}-${dataFim || "fim"}.xlsx`);
  };

  return (
    <div className="entrada-cana-completa-page">
      {err ? <p className="lead" style={{ color: "var(--danger)" }}>{err}</p> : null}
      {resumo ? (
        <div className="kpis entrada-cana-completa-kpis">
          <div className="kpi"><span>Registros</span><strong>{filteredRows.length}</strong></div>
          <div className="kpi"><span>Guias</span><strong>{stats.guias}</strong></div>
          <div className="kpi"><span>Caminhões</span><strong>{stats.caminhoes}</strong></div>
          <div className="kpi"><span>Peso bruto (t)</span><strong>{formatQty(stats.bruto)}</strong></div>
          <div className="kpi"><span>Tara (t)</span><strong>{formatQty(stats.tara)}</strong></div>
          <div className="kpi"><span>Peso líquido (t)</span><strong>{formatQty(stats.liquido)}</strong></div>
          <div className="kpi"><span>Com equipamento</span><strong>{numberCell(stats.pctEquipamento, 1)}%</strong></div>
        </div>
      ) : null}
      {resumo?.truncado ? (
        <p className="lead" style={{ color: "var(--warn, #b8860b)" }}>
          Lista truncada pelo limite de registros.
        </p>
      ) : null}
      <section className="panel entrada-cana-completa-panel">
        <header>
          <h3>Registros de entrada cana caminhão</h3>
          <span>{filteredRows.length.toLocaleString("pt-BR")} linha{filteredRows.length === 1 ? "" : "s"}</span>
        </header>
        <ColheitaFiltros
          className="entrada-cana-table-filtros"
          title=""
          dataInicio={dataInicio}
          dataFim={dataFim}
          onChange={setPeriod}
          busca={busca}
          onBuscaChange={setBusca}
          showBusca
          loading={loading}
          onConsultar={() => void load()}
          dateTextMode
        >
          <label>
            Pesagem (filtro local)
            <input value={pesagemFiltro} onChange={(e) => setPesagemFiltro(e.target.value)} placeholder="Filtrar Nº pesagem já consultada" inputMode="numeric" />
          </label>
          <label>
            Guia (filtro local)
            <input value={guiaFiltro} onChange={(e) => setGuiaFiltro(e.target.value)} placeholder="Filtrar Nº guia já consultada" inputMode="numeric" />
          </label>
          <label>
            Caminhão
            <input value={caminhaoFiltro} onChange={(e) => setCaminhaoFiltro(e.target.value)} placeholder="Nº caminhão" inputMode="numeric" />
          </label>
        </ColheitaFiltros>
        {filteredRows.length ? (
          <>
          <div className="table-wrap entrada-cana-completa-wrap">
            <table className="data entrada-cana-completa-table">
              <thead>
                <tr>
                  <th>Pesagem</th>
                  <th>Guia</th>
                  <th>Caminhão</th>
                  <th>Cód. equip.</th>
                  <th>Data</th>
                  <th>Fazenda</th>
                  <th>Talhão</th>
                  <th className="num">Bruto</th>
                  <th className="num">Tara</th>
                  <th className="num">Líquido</th>
                  <th className="num">Ton./viagem colhed.</th>
                  <th className="num">Ton./viagem trator</th>
                  <th className="num">ATR</th>
                  {OP_COLS.map(({ key, label }) => <th key={key}>{label}</th>)}
                  <th>Ações</th>
                  <th>Rowid</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row, index) => (
                  <tr key={`${row.pesagem ?? "p"}-${row.guia ?? "g"}-${index}`}>
                    <td>{cell(row.pesagem)}</td>
                    <td>{cell(row.guia)}</td>
                    <td>{cell(row.caminhao)}</td>
                    <td>{cell(row.codEquipamento)}</td>
                    <td>{formatOrdsDate(row.data)}</td>
                    <td>{cell(row.fazenda)}</td>
                    <td>{cell(row.talhao)}</td>
                    <td className="num">{numberCell(row.pesoBruto)}</td>
                    <td className="num">{numberCell(row.pesoTara)}</td>
                    <td className="num">{numberCell(row.pesoLiquido)}</td>
                    <td className="num">{numberCell(toneladaPorViagemRow(row, OP_GROUPS[0].ops), 3)}</td>
                    <td className="num">{numberCell(toneladaPorViagemRow(row, OP_GROUPS[1].ops), 3)}</td>
                    <td className="num">{numberCell(row.atr, 3)}</td>
                    {OP_COLS.map(({ key }) => <td key={key}>{cell(row[key])}</td>)}
                    <td>
                      <button
                        type="button"
                        className="icon-btn entrada-cana-op-edit"
                        title="Editar código do funcionário e número de viagens"
                        aria-label="Editar OPs"
                        onClick={() => openEdit(row)}
                        disabled={row.pesagem == null || row.guia == null}
                      >
                        <span aria-hidden="true">✎</span>
                      </button>
                    </td>
                    <td>{cell(row.rowid)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {resumoPorGrupo.map((grupo) => (
            <div className="entrada-cana-viagens-resumo" key={grupo.key}>
              <header>
                <h4>Resumo de viagens — {grupo.label}</h4>
                <div className="entrada-cana-viagens-actions">
                  <span>{grupo.funcionarios.length.toLocaleString("pt-BR")} funcionário{grupo.funcionarios.length === 1 ? "" : "s"}</span>
                  <button type="button" className="btn entrada-cana-export-btn" disabled={!grupo.funcionarios.length} onClick={() => exportResumoExcel(grupo)}>Gerar Excel</button>
                </div>
              </header>
              {grupo.funcionarios.length ? (
                <div className="table-wrap entrada-cana-viagens-wrap">
                  <div className="entrada-cana-op-auditoria">
                    <span><strong>{grupo.pendencias.completas.toLocaleString("pt-BR")}</strong> OPs completas</span>
                    <span><strong>{grupo.pendencias.vazias.toLocaleString("pt-BR")}</strong> sem código e sem viagens</span>
                    <span><strong>{grupo.pendencias.semCodigo.toLocaleString("pt-BR")}</strong> com viagem sem código</span>
                    <span><strong>{grupo.pendencias.semViagens.toLocaleString("pt-BR")}</strong> com código sem viagem</span>
                  </div>
                  <table className="data entrada-cana-viagens-table">
                    <thead><tr><th>Cód. funcionário</th><th>Funcionário</th><th className="num">Viagens</th><th className="num">Toneladas</th><th className="num">Apontamentos</th><th>Ações</th></tr></thead>
                    <tbody>
                      {grupo.funcionarios.map((item) => (
                        <tr key={item.codigo}>
                          <td>{item.codigo}</td><td>{item.descricao || "—"}</td><td className="num">{numberCell(item.viagens, 2)}</td><td className="num">{numberCell(item.toneladas, 3)}</td><td className="num">{item.apontamentos.toLocaleString("pt-BR")}</td>
                          <td><button type="button" className="btn entrada-cana-resumo-edit" disabled={saving} onClick={() => setBulkEdit({ codigo: item.codigo, descricao: item.descricao, novoCodigo: item.codigo, groupKey: grupo.key })}>Alterar período</button></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot><tr><th>Total</th><th /><th className="num">{numberCell(grupo.funcionarios.reduce((acc, item) => acc + item.viagens, 0), 2)}</th><th className="num">{numberCell(grupo.funcionarios.reduce((acc, item) => acc + item.toneladas, 0), 3)}</th><th className="num">{grupo.funcionarios.reduce((acc, item) => acc + item.apontamentos, 0).toLocaleString("pt-BR")}</th><th /></tr></tfoot>
                  </table>
                </div>
              ) : <p className="lead">Nenhuma viagem informada nas OPs de {grupo.label.toLowerCase()}.</p>}
            </div>
          ))}
          </>
        ) : null}
        {rows.length && !filteredRows.length ? (
          <p className="lead">Nenhum registro encontrado entre as pesagens e guias já consultadas.</p>
        ) : null}
      </section>
      {editing ? (
        <div className="modal-back" onClick={() => (!saving ? setEditing(null) : undefined)}>
          <div className="modal wide entrada-cana-op-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Editar OPs da entrada</h3>
            <div className="entrada-cana-op-meta">
              <span>Pesagem <strong>{cell(editing.pesagem)}</strong></span>
              <span>Guia <strong>{cell(editing.guia)}</strong></span>
              <span>Caminhão <strong>{cell(editing.caminhao)}</strong></span>
            </div>
            {OP_GROUPS.map((grupo) => (
              <section className="entrada-cana-op-group" key={grupo.key}>
                <header>
                  <h4>{grupo.label}</h4>
                  <span>{grupo.ops.length} OPs</span>
                </header>
                <div className="entrada-cana-op-grid">
                  {grupo.ops.map(({ key, label }) => (
                    <div className="entrada-cana-op-row" key={key}>
                      <strong>{label}</strong>
                      <label>
                        Código do funcionário
                        <input value={opDraft[key].codigoFuncionario} onChange={(e) => setDraftValue(key, "codigoFuncionario", e.target.value)} placeholder="Ex.: 131727" />
                      </label>
                      <label>
                        Nº viagens
                        <input value={opDraft[key].viagens} onChange={(e) => setDraftValue(key, "viagens", e.target.value)} placeholder="Ex.: 2" inputMode="numeric" />
                      </label>
                    </div>
                  ))}
                </div>
              </section>
            ))}
            <div className="modal-actions">
              <button className="btn" type="button" disabled={saving} onClick={() => setEditing(null)}>
                Cancelar
              </button>
              <button className="btn primary" type="button" disabled={saving} onClick={() => void saveOps()}>
                Salvar
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {bulkEdit ? (
        <div className="modal-back" onClick={() => (!saving ? setBulkEdit(null) : undefined)}>
          <div className="modal entrada-cana-periodo-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Alterar funcionário no período</h3>
            <div className="entrada-cana-op-meta">
              <span>Código atual <strong>{bulkEdit.codigo}</strong></span>
              <span>Funcionário <strong>{bulkEdit.descricao || "—"}</strong></span>
              <span>Grupo <strong>{OP_GROUPS.find((group) => group.key === bulkEdit.groupKey)?.label}</strong></span>
            </div>
            <label className="entrada-cana-periodo-field">
              Novo código do funcionário
              <input
                value={bulkEdit.novoCodigo}
                onChange={(e) => setBulkEdit((prev) => prev ? { ...prev, novoCodigo: e.target.value } : prev)}
                placeholder="Ex.: 131727"
              />
            </label>
            <p className="entrada-cana-periodo-note">
              Essa alteração troca o código somente nas OPs de {OP_GROUPS.find((group) => group.key === bulkEdit.groupKey)?.label.toLowerCase()} do período carregado. As viagens de cada OP serão mantidas.
            </p>
            <div className="modal-actions">
              <button className="btn" type="button" disabled={saving} onClick={() => setBulkEdit(null)}>
                Cancelar
              </button>
              <button className="btn primary" type="button" disabled={saving} onClick={() => void saveBulkCodigo()}>
                {saving ? "Salvando..." : "Aplicar no período"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
