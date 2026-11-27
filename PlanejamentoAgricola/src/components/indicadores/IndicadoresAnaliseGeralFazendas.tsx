import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { authStorage } from "../../api";
import { consultarAnaliseGeralFazendas } from "../../lib/analise-geral-api";
import { useApp } from "../../store";
import type { AnaliseGeralFazendasData } from "../../lib/analiseGeralFazendas";
import { periodosAnaliseGeralPadrao, type AnaliseGeralPeriodo } from "../../lib/analiseGeralPeriodos";
import { safraDefaultRange } from "../colheita/colheita-utils";
import { ConsultaProgressBar } from "../ConsultaProgressBar";
import "./analise-geral-fazendas.css";
import { DiagnosticoTch } from './DiagnosticoTch';

const fmt = (value: number | null, digits = 2) => value == null ? "—" : value.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const periodoLabel = (periodo?: AnaliseGeralPeriodo) => periodo ? `${periodo.inicio.split("-").reverse().join("/")} a ${periodo.fim.split("-").reverse().join("/")}` : "";

export function IndicadoresAnaliseGeralFazendas() {
  const { safra } = useApp();
  const defaults = useMemo(() => safraDefaultRange(safra?.code), [safra?.code]);
  const [periodos, setPeriodos] = useState(() => periodosAnaliseGeralPadrao(defaults.from, defaults.to));
  const [data, setData] = useState<AnaliseGeralFazendasData | null>(null);
  const [busca, setBusca] = useState("");
  const [referencia, setReferencia] = useState('');
  const [comDados, setComDados] = useState(false);
  const [loading, setLoading] = useState(false), [error, setError] = useState("");
  const request = useRef(0);
  useEffect(() => { request.current++; setPeriodos(periodosAnaliseGeralPadrao(defaults.from, defaults.to)); setData(null); setLoading(false); setError(""); }, [defaults]);
  useEffect(() => () => { request.current++; }, []);
  const load = useCallback(async () => {
    const current = ++request.current;
    setLoading(true); setError(""); setData(null);
    try {
      const result = await consultarAnaliseGeralFazendas({ inicio: periodos.compactacao.inicio, fim: periodos.compactacao.fim, periodos, safraCode: safra?.code, token: authStorage.getToken() });
      if (current === request.current) setData(result);
    } catch (e) { if (current === request.current) setError(e instanceof Error ? e.message : "Não foi possível consultar as fazendas."); }
    finally { if (current === request.current) setLoading(false); }
  }, [periodos, safra?.code]);
  const rows = useMemo(() => (data?.fazendas ?? []).filter((row) =>
    (!busca.trim() || normalize(`${row.fazenda} ${row.codigo ?? ""}`).includes(normalize(busca.trim()))) &&
    (!comDados || row.compactacaoTotal != null || row.tocosPercentual != null || row.tch != null)), [data, busca, comDados]);
  return <section className="analise-geral-fazendas">
    <header><h2>Análise geral das fazendas</h2><p>Produtividade, evidências de manejo e próximos passos de investigação por talhão.</p></header>
    <form className="agf-filtros" onSubmit={(event) => { event.preventDefault(); void load(); }}>
      <label>Data de referência<input type="date" required min={defaults.from} max={defaults.to} value={periodos.tch.fim} onChange={e=>{request.current++; setLoading(false); setData(null); setPeriodos(periodosAnaliseGeralPadrao(defaults.from,e.target.value));}} /></label>
      <p>Última biometria da safra até esta data. Insumos e irrigação acompanham o ciclo de cada talhão, inclusive em safras anteriores.</p>
      <label>Fazenda<input type="search" value={busca} onChange={(event) => setBusca(event.target.value)} placeholder="Buscar por descrição ou código" /></label>
      <label className="agf-check"><input type="checkbox" checked={comDados} onChange={(event) => setComDados(event.target.checked)} />Somente fazendas com dados</label>
      <button className="btn primary" type="submit" disabled={loading || (!periodos.tch.fim || periodos.tch.fim < defaults.from || periodos.tch.fim > defaults.to)}>{loading ? "Consultando…" : "Consultar"}</button>
    </form>
    <ConsultaProgressBar active={loading} className="consulta-progress--compact" />
    {error ? <p role="alert" className="agf-erro">{error}</p> : null}
    {data?.avisos.map((aviso) => <p role="status" className="agf-aviso" key={aviso}>{aviso}</p>)}
    {data ? <>
      <label>Referência de TCH (t/ha)<input type="number" min="0.1" step="any" value={referencia} onChange={e=>setReferencia(e.target.value)} placeholder="Informar referência" /></label>
      {data.diagnostico?.avisos.map(x=><p role="status" key={x}>{x}</p>)}
      <p className="agf-atualizacao">{rows.length} fazenda(s) · Atualizado em {new Date(data.atualizadoEm).toLocaleString("pt-BR")}</p>
      <div className="agf-tabela"><table><thead><tr>
        <th scope="col">Descrição da fazenda</th>
        <th scope="col" title="Média de todas as leituras válidas das faixas de profundidade, como a coluna Total do relatório de compactação.">Compactação de solo total (kPa)<small>{periodoLabel(data.periodos?.compactacao)}</small></th>
        <th scope="col" title="Total de tocos danificados dividido pelo total de tocos analisados, multiplicado por 100.">Tocos %<small>{periodoLabel(data.periodos?.tocos)}</small></th>
        <th scope="col" title="Último TCH válido de cada talhão na safra até a data de referência, ponderado pela área disponível.">TCH análise biométrica (t/ha)<small>{periodoLabel(data.periodos?.tch)}</small></th>
        <th scope="col">Resumo dos possíveis motivos</th>
      </tr></thead><tbody>{rows.length ? rows.map((row) => <tr key={row.id}>
        <th scope="row" title={row.codigo ? `Código ${row.codigo}` : ""}>{row.fazenda}</th>
        <td>{fmt(row.compactacaoTotal, 1)}</td><td>{fmt(row.tocosPercentual, 3)}{row.tocosPercentual != null ? "%" : ""}</td><td>{fmt(row.tch)}</td>
        <td><DiagnosticoTch talhoes={data.diagnostico?.talhoes.filter(t=>row.codigo!=null && t.fazenda===Number(row.codigo))??[]} referencia={Number.isFinite(Number(referencia))&&Number(referencia)>0?Number(referencia):null}/></td>
      </tr>) : <tr><td colSpan={5}>Nenhuma fazenda encontrada para os filtros selecionados.</td></tr>}</tbody></table></div>
      <p className="agf-nota">“—” indica ausência de dados, não ausência de problema. Compactação e tocos são contexto agregado da safra até a data de referência, não causas atribuídas aos talhões. TCH: última avaliação válida por talhão, ponderada apenas pelas áreas disponíveis; sem áreas, média simples. Consulte as datas no detalhe.</p>
    </> : !loading && !error ? <p>Defina a data de referência e clique em Consultar.</p> : null}
  </section>;
}
