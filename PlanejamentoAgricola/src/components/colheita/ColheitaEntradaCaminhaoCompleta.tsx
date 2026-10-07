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

const OP_COLS: { key: ColheitaCaminhaoOpKey; label: string }[] = [
  { key: "op01", label: "OP 01" },
  { key: "op02", label: "OP 02" },
  { key: "op03", label: "OP 03" },
  { key: "op04", label: "OP 04" },
  { key: "op05", label: "OP 05" },
  { key: "op06", label: "OP 06" },
  { key: "op07", label: "OP 07" },
];

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

function totalViagensRow(row: ColheitaCaminhaoRow) {
  return OP_COLS.reduce((acc, { key }) => acc + parseViagens(parseOpValue(row[key]).viagens), 0);
}

function toneladaPorViagemRow(row: ColheitaCaminhaoRow) {
  const viagens = totalViagensRow(row);
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
  const [bulkEdit, setBulkEdit] = useState<{ codigo: string; descricao: string; novoCodigo: string } | null>(null);
  const [opDraft, setOpDraft] = useState<OpDraft>(() => emptyOpDraft());

  const stats = useMemo(() => {
    const guias = new Set<string>();
    const caminhoes = new Set<string>();
    let bruto = 0;
    let tara = 0;
    let liquido = 0;
    let comEquipamento = 0;
    for (const row of rows) {
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
      pctEquipamento: taxaDivisao(comEquipamento, rows.length),
    };
  }, [rows]);

  const resumoViagensFuncionarios = useMemo(() => {
    const mapa = new Map<string, { codigo: string; descricao: string; viagens: number; toneladas: number; apontamentos: number }>();
    for (const row of rows) {
      const ops = OP_COLS.map(({ key }) => parseOpValue(row[key]))
        .map((parsed) => ({ ...parsed, codigoFuncionario: parsed.codigoFuncionario.trim(), viagensNumero: parseViagens(parsed.viagens) }))
        .filter((parsed) => parsed.codigoFuncionario);
      const viagensLinha = ops.reduce((acc, item) => acc + item.viagensNumero, 0);
      const toneladaPorViagem = viagensLinha > 0 ? (row.pesoLiquido ?? 0) / viagensLinha : 0;
      for (const parsed of ops) {
        const codigo = parsed.codigoFuncionario;
        const prev = mapa.get(codigo) || { codigo, descricao: funcionarios[codigo] ?? "", viagens: 0, toneladas: 0, apontamentos: 0 };
        prev.descricao = funcionarios[codigo] ?? prev.descricao;
        prev.viagens += parsed.viagensNumero;
        prev.toneladas += parsed.viagensNumero * toneladaPorViagem;
        prev.apontamentos += 1;
        mapa.set(codigo, prev);
      }
    }
    return [...mapa.values()].sort((a, b) => b.toneladas - a.toneladas || b.viagens - a.viagens || a.codigo.localeCompare(b.codigo, "pt-BR", { numeric: true }));
  }, [funcionarios, rows]);

  const resumoPendenciasOps = useMemo(() => {
    let vazias = 0;
    let semCodigo = 0;
    let semViagens = 0;
    let completas = 0;
    for (const row of rows) {
      for (const { key } of OP_COLS) {
        const parsed = parseOpValue(row[key]);
        const codigo = parsed.codigoFuncionario.trim();
        const viagens = parsed.viagens.trim();
        if (!codigo && !viagens) vazias += 1;
        else if (!codigo && viagens) semCodigo += 1;
        else if (codigo && !viagens) semViagens += 1;
        else completas += 1;
      }
    }
    return { completas, vazias, semCodigo, semViagens };
  }, [rows]);

  const load = async () => {
    try {
      setLoading(true);
      setErr(null);
      const data = await api.colheitaEntradaCaminhao({
        dataInicio,
        dataFim,
        busca: busca.trim() || undefined,
        pesagem: pesagemFiltro.trim() || undefined,
        guia: guiaFiltro.trim() || undefined,
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
        for (const { key } of OP_COLS) {
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

  const exportResumoExcel = () => {
    const totalViagens = resumoViagensFuncionarios.reduce((acc, item) => acc + item.viagens, 0);
    const totalToneladas = resumoViagensFuncionarios.reduce((acc, item) => acc + item.toneladas, 0);
    const totalApontamentos = resumoViagensFuncionarios.reduce((acc, item) => acc + item.apontamentos, 0);
    const linhas = [
      ["Resumo de viagens por funcionário no período"],
      [`Período: ${formatOrdsDate(dataInicio)} a ${formatOrdsDate(dataFim)}`],
      [],
      ["Cód. funcionário", "Funcionário", "Viagens", "Toneladas", "Apontamentos"],
      ...resumoViagensFuncionarios.map((item) => [
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
    XLSX.utils.book_append_sheet(workbook, sheet, "Resumo viagens");
    XLSX.writeFile(workbook, `resumo-viagens-funcionarios-${dataInicio || "inicio"}-${dataFim || "fim"}.xlsx`);
  };

  return (
    <div className="entrada-cana-completa-page">
      {err ? <p className="lead" style={{ color: "var(--danger)" }}>{err}</p> : null}
      {resumo ? (
        <div className="kpis entrada-cana-completa-kpis">
          <div className="kpi"><span>Registros</span><strong>{resumo.totalLinhas ?? rows.length}</strong></div>
          <div className="kpi"><span>Guias</span><strong>{stats.guias}</strong></div>
          <div className="kpi"><span>Caminhões</span><strong>{stats.caminhoes}</strong></div>
          <div className="kpi"><span>Peso bruto (t)</span><strong>{formatQty(stats.bruto)}</strong></div>
          <div className="kpi"><span>Tara (t)</span><strong>{formatQty(stats.tara)}</strong></div>
          <div className="kpi"><span>Peso líquido (t)</span><strong>{formatQty(resumo.pesoLiquidoTotal ?? stats.liquido)}</strong></div>
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
          <span>{rows.length.toLocaleString("pt-BR")} linha{rows.length === 1 ? "" : "s"}</span>
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
            Pesagem
            <input value={pesagemFiltro} onChange={(e) => setPesagemFiltro(e.target.value)} placeholder="Nº pesagem" inputMode="numeric" />
          </label>
          <label>
            Guia
            <input value={guiaFiltro} onChange={(e) => setGuiaFiltro(e.target.value)} placeholder="Nº guia" inputMode="numeric" />
          </label>
          <label>
            Caminhão
            <input value={caminhaoFiltro} onChange={(e) => setCaminhaoFiltro(e.target.value)} placeholder="Nº caminhão" inputMode="numeric" />
          </label>
        </ColheitaFiltros>
        {rows.length ? (
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
                  <th className="num">Ton./viagem</th>
                  <th className="num">ATR</th>
                  <th>OP 01</th>
                  <th>OP 02</th>
                  <th>OP 03</th>
                  <th>OP 04</th>
                  <th>OP 05</th>
                  <th>OP 06</th>
                  <th>OP 07</th>
                  <th>Ações</th>
                  <th>Rowid</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
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
                    <td className="num">{numberCell(toneladaPorViagemRow(row), 3)}</td>
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
          <div className="entrada-cana-viagens-resumo">
            <header>
              <h4>Resumo de viagens por funcionário no período</h4>
              <div className="entrada-cana-viagens-actions">
                <span>{resumoViagensFuncionarios.length.toLocaleString("pt-BR")} funcionário{resumoViagensFuncionarios.length === 1 ? "" : "s"}</span>
                <button
                  type="button"
                  className="btn entrada-cana-export-btn"
                  disabled={!resumoViagensFuncionarios.length}
                  onClick={exportResumoExcel}
                >
                  Gerar Excel
                </button>
              </div>
            </header>
            {resumoViagensFuncionarios.length ? (
              <div className="table-wrap entrada-cana-viagens-wrap">
                <div className="entrada-cana-op-auditoria">
                  <span><strong>{resumoPendenciasOps.completas.toLocaleString("pt-BR")}</strong> OPs completas</span>
                  <span><strong>{resumoPendenciasOps.vazias.toLocaleString("pt-BR")}</strong> sem código e sem viagens</span>
                  <span><strong>{resumoPendenciasOps.semCodigo.toLocaleString("pt-BR")}</strong> com viagem sem código</span>
                  <span><strong>{resumoPendenciasOps.semViagens.toLocaleString("pt-BR")}</strong> com código sem viagem</span>
                </div>
                <table className="data entrada-cana-viagens-table">
                  <thead>
                    <tr>
                      <th>Cód. funcionário</th>
                      <th>Funcionário</th>
                      <th className="num">Viagens</th>
                      <th className="num">Toneladas</th>
                      <th className="num">Apontamentos</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resumoViagensFuncionarios.map((item) => (
                      <tr key={item.codigo}>
                        <td>{item.codigo}</td>
                        <td>{item.descricao || "—"}</td>
                        <td className="num">{numberCell(item.viagens, 2)}</td>
                        <td className="num">{numberCell(item.toneladas, 3)}</td>
                        <td className="num">{item.apontamentos.toLocaleString("pt-BR")}</td>
                        <td>
                          <button
                            type="button"
                            className="btn entrada-cana-resumo-edit"
                            disabled={saving}
                            onClick={() => setBulkEdit({ codigo: item.codigo, descricao: item.descricao, novoCodigo: item.codigo })}
                          >
                            Alterar período
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th>Total</th>
                      <th />
                      <th className="num">{numberCell(resumoViagensFuncionarios.reduce((acc, item) => acc + item.viagens, 0), 2)}</th>
                      <th className="num">{numberCell(resumoViagensFuncionarios.reduce((acc, item) => acc + item.toneladas, 0), 3)}</th>
                      <th className="num">{resumoViagensFuncionarios.reduce((acc, item) => acc + item.apontamentos, 0).toLocaleString("pt-BR")}</th>
                      <th />
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <p className="lead">Nenhuma viagem informada nas OPs para o período consultado.</p>
            )}
          </div>
          </>
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
            <div className="entrada-cana-op-grid">
              {OP_COLS.map(({ key, label }) => (
                <div className="entrada-cana-op-row" key={key}>
                  <strong>{label}</strong>
                  <label>
                    Código do funcionário
                    <input
                      value={opDraft[key].codigoFuncionario}
                      onChange={(e) => setDraftValue(key, "codigoFuncionario", e.target.value)}
                      placeholder="Ex.: 131727"
                    />
                  </label>
                  <label>
                    Nº viagens
                    <input
                      value={opDraft[key].viagens}
                      onChange={(e) => setDraftValue(key, "viagens", e.target.value)}
                      placeholder="Ex.: 2"
                      inputMode="numeric"
                    />
                  </label>
                </div>
              ))}
            </div>
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
              Essa alteração troca o código em todas as OPs do período carregado. As viagens de cada OP serão mantidas.
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
