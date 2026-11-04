import { useEffect, useState } from "react";
import { api, type ProducaoFaixaPreco, type ProducaoFechamento, type ProducaoFuncionarioEquipamento } from "../../api";
import { formatQty } from "../../lib/format";
import { ColheitaFiltros, useColheitaPeriod } from "./ColheitaFiltros";

export type ProducaoOperadorSubtab = "fechamento" | "funcionario-equipamento" | "precos";

const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const qty = (value: number) => formatQty(value);
const emptyCadastro = (): Partial<ProducaoFuncionarioEquipamento> => ({ codFuncionario: "", equipamento: "", dataInicial: "", dataFinal: null });
const emptyFaixa = (): Partial<ProducaoFaixaPreco> => ({ grupo: "todos", equipamento: null, ordem: 1, faixaToneladas: 0, precoTonelada: 0, dataInicial: "", dataFinal: null });
const tituloMes = (date: string) => new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(`${date}T12:00:00`)).toUpperCase();
const diasNoPeriodo = (inicio: string, fim: string) => Math.max(1, Math.round((new Date(`${fim}T12:00:00`).getTime() - new Date(`${inicio}T12:00:00`).getTime()) / 86_400_000) + 1);

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
      <p className="lead">Produção = toneladas distribuídas do funcionário × preço por tonelada cadastrado para o equipamento e período.</p>
      <ColheitaFiltros title="" dataInicio={dataInicio} dataFim={dataFim} onChange={setPeriod} loading={loading} onConsultar={() => void consultar()} />
      {err ? <p className="lead" style={{ color: "var(--danger)" }}>{err}</p> : null}
      {fechamento ? <>
        <div className="modal-actions no-print"><button className="btn" onClick={() => window.print()}>Imprimir relatório</button></div>
        <article className="fechamento-producao-pdf" aria-label="Relatório de pagamento de produção">
          <h2>PAGAMENTO DE PRODUÇÃO - {tituloMes(fechamento.periodo.dataFim)}</h2>
          <div className="fechamento-producao-faixas"><strong>PREÇOS DA PRODUÇÃO</strong><table><thead><tr><th>Grupo</th><th>Equip.</th><th>Faixa</th><th>Toneladas</th><th>R$/t</th></tr></thead><tbody>
            {faixas.length ? faixas.map((item) => <tr key={item.id}><td>{item.grupo}</td><td>{item.equipamento || "Todos"}</td><td>{item.ordem}ª faixa</td><td>{qty(item.faixaToneladas)}</td><td>{money(item.precoTonelada)}</td></tr>) : <tr><td colSpan={5}>Cadastre os preços na aba Preço da produção.</td></tr>}
          </tbody></table></div>
          {(["colhedeiras", "tratores"] as const).map((grupo) => {
            const linhas = fechamento.dados.filter((row) => row.grupo === grupo);
            const titulo = grupo === "colhedeiras" ? "OPERADOR DE COLHEDORA" : "OPERADOR DE TRATOR";
            const toneladas = linhas.reduce((sum, row) => sum + row.toneladasInformadas, 0);
            const producao = linhas.reduce((sum, row) => sum + row.producao, 0);
            return <section className="fechamento-producao-bloco" key={grupo}>
              <table><thead><tr><th>EQUIP.</th><th>NOME</th><th className="num">TON.</th><th>FAIXA</th><th className="num">R$/t</th><th className="num">PRODUÇÃO</th><th className="num">PERDAS NO MÊS</th><th className="num">LITROS PRODUÇÃO</th><th className="num">LITROS/t</th><th className="num">TON/DIA</th><th className="num">VALOR TOTAL</th></tr></thead>
                <tbody>{linhas.map((row) => <tr key={`${row.grupo}-${row.codFuncionario}`}><td>{row.equipamento || "—"}</td><td><strong>{row.codFuncionario}</strong> - {row.funcionario || "FUNCIONÁRIO NÃO IDENTIFICADO"}</td><td className="num">{qty(row.toneladasInformadas)}</td><td>{row.faixa}</td><td className="num">{money(row.precoTonelada)}</td><td className="num">{money(row.producao)}</td><td className="num">—</td><td className="num">—</td><td className="num">—</td><td className="num">{qty(row.toneladasInformadas / diasNoPeriodo(fechamento.periodo.dataInicio, fechamento.periodo.dataFim))}</td><td className="num">{money(row.producao)}</td></tr>)}</tbody>
                <tfoot><tr><th colSpan={2}>SUB TOTAL - {titulo}</th><th className="num">{qty(toneladas)}</th><th /><th /><th className="num">{money(producao)}</th><th>—</th><th>—</th><th>—</th><th className="num">{qty(toneladas / diasNoPeriodo(fechamento.periodo.dataInicio, fechamento.periodo.dataFim))}</th><th className="num">{money(producao)}</th></tr></tfoot>
              </table>
            </section>;
          })}
          <footer><strong>TOTAL GERAL</strong><span>{money(fechamento.totalProducao)}</span></footer>
          <p>Total das colhedeiras: <strong>{qty(fechamento.totalColhedeiras)} t</strong> · Período: {fechamento.periodo.dataInicio} a {fechamento.periodo.dataFim}</p>
        </article>
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
      <header><h3>Preço da produção por faixa</h3><span>Faixa em toneladas e preço aplicável</span></header>
      <p className="lead">Cadastre a tonelagem da faixa e o preço por tonelada. No fechamento será aplicado o preço da maior faixa atingida pelo funcionário.</p>
      <div className="form-grid">
        <label>Grupo<select value={faixa.grupo ?? "todos"} onChange={(e) => setFaixa((v) => ({ ...v, grupo: e.target.value as ProducaoFaixaPreco["grupo"] }))}><option value="todos">Todos</option><option value="colhedeiras">Colhedeiras</option><option value="tratores">Tratores</option></select></label>
        <label>Equipamento (opcional)<input value={faixa.equipamento ?? ""} onChange={(e) => setFaixa((v) => ({ ...v, equipamento: e.target.value || null }))} placeholder="Ex.: 5001" /></label>
        <label>Ordem da faixa<select value={faixa.ordem ?? 1} onChange={(e) => setFaixa((v) => ({ ...v, ordem: Number(e.target.value) }))}>{Array.from({ length: 10 }, (_, index) => index + 1).map((ordem) => <option key={ordem} value={ordem}>{ordem}ª faixa</option>)}</select></label>
        <label>Faixa (t)<input type="number" min="0" step="0.001" value={faixa.faixaToneladas ?? 0} onChange={(e) => setFaixa((v) => ({ ...v, faixaToneladas: Number(e.target.value) }))} placeholder="Ex.: 3600" /></label>
        <label>Preço por tonelada (R$)<input type="number" min="0" step="0.0001" value={faixa.precoTonelada ?? 0} onChange={(e) => setFaixa((v) => ({ ...v, precoTonelada: Number(e.target.value) }))} /></label>
        <label>Data inicial<input type="date" value={faixa.dataInicial ?? ""} onChange={(e) => setFaixa((v) => ({ ...v, dataInicial: e.target.value }))} /></label>
        <label>Data final<input type="date" value={faixa.dataFinal ?? ""} onChange={(e) => setFaixa((v) => ({ ...v, dataFinal: e.target.value || null }))} /></label>
      </div>
      <div className="modal-actions"><button className="btn primary" disabled={saving} onClick={() => void salvarFaixa()}>{faixa.id ? "Salvar alteração" : "Cadastrar faixa"}</button><button className="btn" onClick={() => setFaixa(emptyFaixa())}>Limpar</button></div>
      {err ? <p className="lead" style={{ color: "var(--danger)" }}>{err}</p> : null}
      <div className="table-wrap"><table className="data"><thead><tr><th>Grupo</th><th>Equipamento</th><th>Faixa</th><th className="num">Toneladas</th><th className="num">Preço/t</th><th>Período</th><th>Ações</th></tr></thead><tbody>
        {faixas.map((row) => <tr key={row.id}><td>{row.grupo}</td><td>{row.equipamento || "Todos"}</td><td>{row.ordem}ª faixa</td><td className="num">{qty(row.faixaToneladas)}</td><td className="num">{money(row.precoTonelada)}</td><td>{row.dataInicial} {row.dataFinal ? `a ${row.dataFinal}` : "em diante"}</td><td><button className="btn" onClick={() => setFaixa(row)}>Alterar</button> <button className="btn" onClick={() => void api.excluirProducaoFaixaPreco(row.id).then(loadFaixas)}>Excluir</button></td></tr>)}
      </tbody></table></div>
    </section>
  );
}
