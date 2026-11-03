import { useEffect, useState } from "react";
import { api, type ProducaoFaixaPreco, type ProducaoFechamento, type ProducaoFuncionarioEquipamento } from "../../api";
import { formatQty } from "../../lib/format";
import { ColheitaFiltros, useColheitaPeriod } from "./ColheitaFiltros";

export type ProducaoOperadorSubtab = "fechamento" | "funcionario-equipamento" | "precos";

const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const qty = (value: number) => formatQty(value);
const emptyCadastro = (): Partial<ProducaoFuncionarioEquipamento> => ({ codFuncionario: "", equipamento: "", dataInicial: "", dataFinal: null });
const emptyFaixa = (): Partial<ProducaoFaixaPreco> => ({ grupo: "todos", equipamento: null, descricao: "", metaInicial: 0, metaFinal: null, precoTonelada: 0, dataInicial: "", dataFinal: null });

export function ColheitaFechamentoProducao({ tab }: { tab: ProducaoOperadorSubtab }) {
  const { dataInicio, dataFim, setPeriod } = useColheitaPeriod();
  const [fechamento, setFechamento] = useState<ProducaoFechamento | null>(null);
  const [cadastros, setCadastros] = useState<ProducaoFuncionarioEquipamento[]>([]);
  const [faixas, setFaixas] = useState<ProducaoFaixaPreco[]>([]);
  const [cadastro, setCadastro] = useState<Partial<ProducaoFuncionarioEquipamento>>(emptyCadastro);
  const [faixa, setFaixa] = useState<Partial<ProducaoFaixaPreco>>(emptyFaixa);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const loadCadastros = async () => setCadastros((await api.producaoFuncionarioEquipamento()).dados);
  const loadFaixas = async () => setFaixas((await api.producaoFaixasPreco()).dados);
  useEffect(() => { void Promise.all([loadCadastros(), loadFaixas()]).catch((e) => setErr(e instanceof Error ? e.message : String(e))); }, []);

  const consultar = async () => {
    try { setLoading(true); setErr(null); setFechamento(await api.producaoFechamento({ dataInicio, dataFim })); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  };
  const salvarCadastro = async () => {
    try { setSaving(true); setErr(null); await api.salvarProducaoFuncionarioEquipamento(cadastro); await loadCadastros(); setCadastro(emptyCadastro()); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  };
  const salvarFaixa = async () => {
    try { setSaving(true); setErr(null); await api.salvarProducaoFaixaPreco(faixa); await loadFaixas(); setFaixa(emptyFaixa()); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  };

  if (tab === "fechamento") return (
    <section className="panel entrada-cana-completa-panel">
      <header><h3>Fechamento de produção</h3><span>Modelo do relatório de pagamento de produção</span></header>
      <p className="lead">Produção = toneladas distribuídas do funcionário × preço por tonelada da faixa vigente. A faixa é identificada pela meta de toneladas e pelo equipamento cadastrado.</p>
      <ColheitaFiltros title="" dataInicio={dataInicio} dataFim={dataFim} onChange={setPeriod} loading={loading} onConsultar={() => void consultar()} />
      {err ? <p className="lead" style={{ color: "var(--danger)" }}>{err}</p> : null}
      {fechamento ? <>
        <div className="kpis entrada-cana-completa-kpis">
          <div className="kpi"><span>Total colhedeiras (t)</span><strong>{qty(fechamento.totalColhedeiras)}</strong></div>
          <div className="kpi"><span>Produção total</span><strong>{money(fechamento.totalProducao)}</strong></div>
          <div className="kpi"><span>Funcionários</span><strong>{fechamento.dados.length}</strong></div>
        </div>
        <div className="table-wrap"><table className="data"><thead><tr><th>Grupo</th><th>Cód. funcionário</th><th>Funcionário</th><th>Equipamento</th><th className="num">Toneladas</th><th>Faixa aplicada</th><th className="num">Preço/t</th><th className="num">Produção</th></tr></thead>
          <tbody>{fechamento.dados.map((row) => <tr key={`${row.grupo}-${row.codFuncionario}`}><td>{row.grupo === "colhedeiras" ? "Colhedeiras" : "Tratores"}</td><td>{row.codFuncionario}</td><td>{row.funcionario || "—"}</td><td>{row.equipamento || "Não cadastrado"}</td><td className="num">{qty(row.toneladasInformadas)}</td><td>{row.faixa}</td><td className="num">{money(row.precoTonelada)}</td><td className="num">{money(row.producao)}</td></tr>)}</tbody>
          <tfoot><tr><th colSpan={4}>Total</th><th className="num">{qty(fechamento.dados.reduce((sum, row) => sum + row.toneladasInformadas, 0))}</th><th /><th /><th className="num">{money(fechamento.totalProducao)}</th></tr></tfoot>
        </table></div>
      </> : <p className="lead">Selecione o período e clique em Consultar para gerar o fechamento.</p>}
    </section>
  );

  if (tab === "funcionario-equipamento") return (
    <section className="panel entrada-cana-completa-panel">
      <header><h3>Cadastro de funcionário ao equipamento</h3><span>Vínculo válido por período</span></header>
      <div className="form-grid">
        <label>Cód. funcionário<input value={cadastro.codFuncionario ?? ""} onChange={(e) => setCadastro((v) => ({ ...v, codFuncionario: e.target.value }))} /></label>
        <label>Equipamento<input value={cadastro.equipamento ?? ""} onChange={(e) => setCadastro((v) => ({ ...v, equipamento: e.target.value }))} placeholder="Ex.: 5001" /></label>
        <label>Data inicial<input type="date" value={cadastro.dataInicial ?? ""} onChange={(e) => setCadastro((v) => ({ ...v, dataInicial: e.target.value }))} /></label>
        <label>Data final<input type="date" value={cadastro.dataFinal ?? ""} onChange={(e) => setCadastro((v) => ({ ...v, dataFinal: e.target.value || null }))} /></label>
      </div>
      <div className="modal-actions"><button className="btn primary" disabled={saving} onClick={() => void salvarCadastro()}>{cadastro.id ? "Salvar alteração" : "Cadastrar vínculo"}</button><button className="btn" onClick={() => setCadastro(emptyCadastro())}>Limpar</button></div>
      {err ? <p className="lead" style={{ color: "var(--danger)" }}>{err}</p> : null}
      <div className="table-wrap"><table className="data"><thead><tr><th>Cód. funcionário</th><th>Equipamento</th><th>Data inicial</th><th>Data final</th><th>Ações</th></tr></thead><tbody>
        {cadastros.map((row) => <tr key={row.id}><td>{row.codFuncionario}</td><td>{row.equipamento}</td><td>{row.dataInicial}</td><td>{row.dataFinal || "Em aberto"}</td><td><button className="btn" onClick={() => setCadastro(row)}>Alterar</button> <button className="btn" onClick={() => void api.excluirProducaoFuncionarioEquipamento(row.id).then(loadCadastros)}>Excluir</button></td></tr>)}
      </tbody></table></div>
    </section>
  );

  return (
    <section className="panel entrada-cana-completa-panel">
      <header><h3>Preço da produção por faixa</h3><span>Meta de toneladas e preço aplicável</span></header>
      <p className="lead">Cadastre as faixas de meta. Quando o funcionário atingir a meta, o preço por tonelada daquela faixa será aplicado no fechamento.</p>
      <div className="form-grid">
        <label>Grupo<select value={faixa.grupo ?? "todos"} onChange={(e) => setFaixa((v) => ({ ...v, grupo: e.target.value as ProducaoFaixaPreco["grupo"] }))}><option value="todos">Todos</option><option value="colhedeiras">Colhedeiras</option><option value="tratores">Tratores</option></select></label>
        <label>Equipamento (opcional)<input value={faixa.equipamento ?? ""} onChange={(e) => setFaixa((v) => ({ ...v, equipamento: e.target.value || null }))} placeholder="Ex.: 5001" /></label>
        <label>Descrição da faixa<input value={faixa.descricao ?? ""} onChange={(e) => setFaixa((v) => ({ ...v, descricao: e.target.value }))} placeholder="Ex.: 1ª faixa" /></label>
        <label>Meta inicial (t)<input type="number" min="0" value={faixa.metaInicial ?? 0} onChange={(e) => setFaixa((v) => ({ ...v, metaInicial: Number(e.target.value) }))} /></label>
        <label>Meta final (t)<input type="number" min="0" value={faixa.metaFinal ?? ""} onChange={(e) => setFaixa((v) => ({ ...v, metaFinal: e.target.value === "" ? null : Number(e.target.value) }))} placeholder="Sem limite" /></label>
        <label>Preço por tonelada (R$)<input type="number" min="0" step="0.0001" value={faixa.precoTonelada ?? 0} onChange={(e) => setFaixa((v) => ({ ...v, precoTonelada: Number(e.target.value) }))} /></label>
        <label>Data inicial<input type="date" value={faixa.dataInicial ?? ""} onChange={(e) => setFaixa((v) => ({ ...v, dataInicial: e.target.value }))} /></label>
        <label>Data final<input type="date" value={faixa.dataFinal ?? ""} onChange={(e) => setFaixa((v) => ({ ...v, dataFinal: e.target.value || null }))} /></label>
      </div>
      <div className="modal-actions"><button className="btn primary" disabled={saving} onClick={() => void salvarFaixa()}>{faixa.id ? "Salvar alteração" : "Cadastrar faixa"}</button><button className="btn" onClick={() => setFaixa(emptyFaixa())}>Limpar</button></div>
      {err ? <p className="lead" style={{ color: "var(--danger)" }}>{err}</p> : null}
      <div className="table-wrap"><table className="data"><thead><tr><th>Grupo</th><th>Equipamento</th><th>Faixa</th><th className="num">Meta inicial</th><th className="num">Meta final</th><th className="num">Preço/t</th><th>Período</th><th>Ações</th></tr></thead><tbody>
        {faixas.map((row) => <tr key={row.id}><td>{row.grupo}</td><td>{row.equipamento || "Todos"}</td><td>{row.descricao || "—"}</td><td className="num">{qty(row.metaInicial)}</td><td className="num">{row.metaFinal == null ? "Sem limite" : qty(row.metaFinal)}</td><td className="num">{money(row.precoTonelada)}</td><td>{row.dataInicial} {row.dataFinal ? `a ${row.dataFinal}` : "em diante"}</td><td><button className="btn" onClick={() => setFaixa(row)}>Alterar</button> <button className="btn" onClick={() => void api.excluirProducaoFaixaPreco(row.id).then(loadFaixas)}>Excluir</button></td></tr>)}
      </tbody></table></div>
    </section>
  );
}
