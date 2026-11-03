import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../../store";
import { rendimentoAgricolaApi } from "../../lib/rendimento-agricola-api";
import { resumirRendimento, validarPeriodoRendimento, type RendimentoData, type RendimentoOpcoes, type RendimentoParametro } from "../../lib/rendimento-agricola";
import { safraDefaultRange } from "../colheita/colheita-utils";
import { ConsultaProgressBar } from "../ConsultaProgressBar";
import "./rendimento-agricola.css";

const fmt = (value: number | null | undefined) => value == null ? "—" : value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const date = (value: string | null | undefined) => value ? value.slice(0, 10).split("-").reverse().join("/") : "—";
const initialMeta = { codObjetoCusto: "", codOperacao: "", rendimentoPrevisto: "", consumoPrevisto: "" };

export function IndicadoresRendimentoAgricola() {
  const { safra } = useApp();
  const defaults = useMemo(() => safraDefaultRange(safra?.code), [safra?.code]);
  const [inicio, setInicio] = useState(defaults.from), [fim, setFim] = useState(defaults.to);
  const [objeto, setObjeto] = useState(""), [operacao, setOperacao] = useState("");
  const [aplicados, setAplicados] = useState({ objeto: "", operacao: "" });
  const [opcoes, setOpcoes] = useState<RendimentoOpcoes | null>(null);
  const [data, setData] = useState<RendimentoData | null>(null);
  const [loading, setLoading] = useState(false), [loadingOpcoes, setLoadingOpcoes] = useState(false);
  const [erro, setErro] = useState(""), [erroOpcoes, setErroOpcoes] = useState("");
  const [meta, setMeta] = useState(initialMeta), [saving, setSaving] = useState(false);
  const [erroMeta, setErroMeta] = useState(""), [mensagem, setMensagem] = useState("");
  const [configAberta, setConfigAberta] = useState(false);
  const request = useRef(0);
  useEffect(() => {
    request.current++;
    setInicio(defaults.from); setFim(defaults.to); setData(null); setLoading(false); setErro("");
  }, [defaults]);
  useEffect(() => () => { request.current++; }, []);
  async function carregarOpcoes() {
    setLoadingOpcoes(true); setErroOpcoes("");
    try { setOpcoes(await rendimentoAgricolaApi.opcoes()); }
    catch (e) { setErroOpcoes(e instanceof Error ? e.message : "Não foi possível carregar os cadastros."); }
    finally { setLoadingOpcoes(false); }
  }
  useEffect(() => { void carregarOpcoes(); }, []);
  const parametros = opcoes?.parametros ?? data?.parametros ?? [];
  const resumo = useMemo(() => resumirRendimento(data?.dados ?? [], parametros)
    .filter((row) => (!aplicados.objeto || String(row.codObjetoCusto) === aplicados.objeto) && (!aplicados.operacao || String(row.codOperacao) === aplicados.operacao)), [data, parametros, aplicados]);
  const detalhes = useMemo(() => (data?.dados ?? []).filter((row) =>
    (!aplicados.objeto || String(row.codObjetoCusto) === aplicados.objeto) && (!aplicados.operacao || String(row.codOperacaoAgricola) === aplicados.operacao)), [data, aplicados]);
  const total = resumo.reduce((sum, row) => ({ area: sum.area + row.areaHa, horas: sum.horas + row.horas, litros: sum.litros + row.litros }), { area: 0, horas: 0, litros: 0 });
  async function consultar() {
    try { validarPeriodoRendimento(inicio, fim); } catch (e) { setErro((e as Error).message); return; }
    const id = ++request.current;
    const filtros = { objeto, operacao };
    setLoading(true); setErro("");
    try {
      const result = await rendimentoAgricolaApi.consultar(inicio, fim);
      if (request.current !== id) return;
      setData(result); setAplicados(filtros);
      setOpcoes((current) => current ? { ...current, parametros: result.parametros } : current);
    } catch (e) { if (request.current === id) setErro(e instanceof Error ? e.message : "Não foi possível consultar o rendimento."); }
    finally { if (request.current === id) setLoading(false); }
  }
  async function salvar() {
    setSaving(true); setErroMeta(""); setMensagem("");
    try {
      const salvo = await rendimentoAgricolaApi.salvar({ codObjetoCusto: Number(meta.codObjetoCusto), codOperacao: Number(meta.codOperacao), rendimentoPrevisto: Number(meta.rendimentoPrevisto), consumoPrevisto: Number(meta.consumoPrevisto) });
      const atualizar = (values: RendimentoParametro[]) => [...values.filter((p) => p.codObjetoCusto !== salvo.codObjetoCusto || p.codOperacao !== salvo.codOperacao), salvo];
      setOpcoes((current) => current ? { ...current, parametros: atualizar(current.parametros) } : current);
      setData((current) => current ? { ...current, parametros: atualizar(current.parametros) } : current);
      setMensagem("Metas salvas para este objeto de custo e operação."); setMeta(initialMeta);
    } catch (e) { setErroMeta(e instanceof Error ? e.message : "Não foi possível salvar as metas."); }
    finally { setSaving(false); }
  }
  function editar(p: RendimentoParametro) {
    setMeta({ codObjetoCusto: String(p.codObjetoCusto), codOperacao: String(p.codOperacao), rendimentoPrevisto: String(p.rendimentoPrevisto), consumoPrevisto: String(p.consumoPrevisto) });
    setConfigAberta(true); setErroMeta(""); setMensagem("");
  }
  const opcoesSelect = (values: { codigo: number; descricao: string }[] | undefined) => values?.map((row) => <option key={row.codigo} value={row.codigo}>{row.codigo} — {row.descricao}</option>);
  return <section className="rendimento-agricola">
    <header><h2>Rendimento Agrícola</h2><p>Rendimento e consumo previstos e realizados por objeto de custo e operação.</p></header>
    {erroOpcoes && <p role="alert">{erroOpcoes} <button type="button" className="btn" onClick={() => void carregarOpcoes()}>Tentar carregar cadastros</button></p>}
    <form className="ra-filtros" onSubmit={(event) => { event.preventDefault(); void consultar(); }}>
      <label>Início<input type="date" required value={inicio} onChange={(e) => setInicio(e.target.value)} /></label>
      <label>Fim<input type="date" required min={inicio} value={fim} onChange={(e) => setFim(e.target.value)} /></label>
      <label>Objeto de custo<select value={objeto} onChange={(e) => setObjeto(e.target.value)}><option value="">Todos</option>{opcoesSelect(opcoes?.objetosCusto)}</select></label>
      <label>Operação<select value={operacao} onChange={(e) => setOperacao(e.target.value)}><option value="">Todas</option>{opcoesSelect(opcoes?.operacoes)}</select></label>
      <button type="submit" className="btn primary" disabled={loading || loadingOpcoes}>{loading ? "Consultando…" : "Consultar"}</button>
    </form>
    <ConsultaProgressBar active={loading} className="consulta-progress--compact" />
    {erro && <p className="ra-erro" role="alert">{erro}</p>}
    <details open={configAberta} onToggle={(e) => setConfigAberta(e.currentTarget.open)} className="ra-parametros">
      <summary>Metas por objeto de custo e operação</summary>
      <p>Cadastre o rendimento em hectares por hora e o consumo em litros por hora. A mesma operação pode ter metas diferentes em cada objeto de custo.</p>
      {opcoes?.podeEditar ? <form className="ra-filtros" onSubmit={(event) => { event.preventDefault(); void salvar(); }}>
        <label>Objeto de custo<select required value={meta.codObjetoCusto} onChange={(e) => setMeta({ ...meta, codObjetoCusto: e.target.value })}><option value="">Selecione</option>{opcoesSelect(opcoes.objetosCusto)}</select></label>
        <label>Operação<select required value={meta.codOperacao} onChange={(e) => setMeta({ ...meta, codOperacao: e.target.value })}><option value="">Selecione</option>{opcoesSelect(opcoes.operacoes)}</select></label>
        <label>Rendimento previsto (ha/h)<input required type="number" min="0.000001" step="any" value={meta.rendimentoPrevisto} onChange={(e) => setMeta({ ...meta, rendimentoPrevisto: e.target.value })} /></label>
        <label>Consumo previsto (L/h)<input required type="number" min="0.000001" step="any" value={meta.consumoPrevisto} onChange={(e) => setMeta({ ...meta, consumoPrevisto: e.target.value })} /></label>
        <button className="btn primary" type="submit" disabled={saving}>{saving ? "Salvando…" : "Salvar metas"}</button>
        <button className="btn" type="button" disabled={saving} onClick={() => { setMeta(initialMeta); setErroMeta(""); setMensagem(""); }}>Limpar</button>
      </form> : <p>O cadastro de metas exige permissão de edição desta aba.</p>}
      {erroMeta && <p className="ra-erro" role="alert">{erroMeta}</p>}{mensagem && <p role="status">{mensagem}</p>}
      <div className="ra-table"><table><thead><tr><th>Objeto de custo</th><th>Operação</th><th>Previsto (ha/h)</th><th>Previsto (L/h)</th>{opcoes?.podeEditar && <th>Ações</th>}</tr></thead>
        <tbody>{parametros.map((p) => <tr key={`${p.codObjetoCusto}:${p.codOperacao}`}><td>{p.codObjetoCusto} — {p.objetoCusto}</td><td>{p.codOperacao} — {p.operacao}</td><td>{fmt(p.rendimentoPrevisto)}</td><td>{fmt(p.consumoPrevisto)}</td>{opcoes?.podeEditar && <td><button className="btn" type="button" onClick={() => editar(p)}>Editar</button></td>}</tr>)}</tbody></table></div>
      {!parametros.length && <p>Nenhuma meta cadastrada.</p>}
    </details>
    {data ? <>
      <p>Período consultado: {date(data.inicio)} a {date(data.fim)} · Atualizado em {new Date(data.atualizadoEm).toLocaleString("pt-BR")}</p>
      {data.avisos.map((aviso) => <p className="ra-aviso" key={aviso}>{aviso}</p>)}
      <div className="ra-kpis"><div>Área (ha)<strong>{fmt(total.area)}</strong></div><div>Horas trabalhadas<strong>{fmt(total.horas)}</strong></div><div>Combustível (L)<strong>{fmt(total.litros)}</strong></div></div>
      <div className="ra-table"><table><thead><tr><th>Objeto de custo</th><th>Operação</th><th>Previsto (ha/h)</th><th>Realizado (ha/h)</th><th>Previsto (L/h)</th><th>Realizado (L/h)</th><th>Área (ha)</th><th>Horas</th><th>Litros</th></tr></thead>
        <tbody>{resumo.map((row) => <tr key={row.chave}><td>{row.codObjetoCusto == null ? "" : `${row.codObjetoCusto} — `}{row.objetoCusto}</td><td>{row.codOperacao == null ? "" : `${row.codOperacao} — `}{row.operacao}</td><td>{fmt(row.rendimentoPrevisto)}</td><td>{fmt(row.rendimentoRealizado)}</td><td>{fmt(row.consumoPrevisto)}</td><td>{fmt(row.consumoRealizado)}</td><td>{fmt(row.areaHa)}</td><td>{fmt(row.horas)}</td><td>{fmt(row.litros)}</td></tr>)}</tbody></table></div>
      {!detalhes.length && <p>Nenhum abastecimento de equipamento por horímetro encontrado no período e filtros. As metas cadastradas continuam disponíveis para comparação.</p>}
      <details className="ra-detalhes"><summary>Conferir operação por data e equipamento ({detalhes.length})</summary><div className="ra-table"><table><thead><tr><th>Abastecimento</th><th>Data abastecimento</th><th>Data operação</th><th>Equipamento</th><th>Objeto de custo</th><th>Operação</th><th>Área (ha)</th><th>Horas</th><th>Litros</th></tr></thead><tbody>{detalhes.map((row) => <tr key={`${row.origem}:${row.idAbastecimento}`}><td>{row.idAbastecimento}</td><td>{date(row.dataAbastecimento)}</td><td>{date(row.dataOperacao)}</td><td>{row.codEquipamento ?? "—"}</td><td>{row.codObjetoCusto ?? "—"} — {row.objetoCusto || "Sem objeto identificado"}</td><td>{row.descricaoOperacao || "Sem operação identificada"}</td><td>{fmt(row.areaHa)}</td><td>{fmt(row.horasTrabalho)}</td><td>{fmt(row.qtdeLitros)}</td></tr>)}</tbody></table></div></details>
    </> : <p>Selecione o período e clique em Consultar.</p>}
    <p className="ra-nota">A consulta segue a regra de Combustível: considera o período pela data do abastecimento e identifica a última operação apontada desde o abastecimento anterior. A área e as horas são do intervalo entre abastecimentos. Quando há várias operações no intervalo, os totais ficam vinculados à última operação identificada. O objeto vem desse apontamento ou do histórico vigente do equipamento. Realizado: área ÷ horas e litros ÷ horas, somente para equipamentos por horímetro. “—” indica ausência de meta ou de horas para calcular.</p>
  </section>;
}
