import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { authStorage } from "../../api";
import { consultarAnaliseGeralFazendas } from "../../lib/analise-geral-api";
import { useApp } from "../../store";
import type { AnaliseGeralFazendasData } from "../../lib/analiseGeralFazendas";
import { ANALISE_GERAL_COLUNAS, periodosAnaliseGeralPadrao, type AnaliseGeralPeriodo } from "../../lib/analiseGeralPeriodos";
import { safraDefaultRange } from "../colheita/colheita-utils";
import { ConsultaProgressBar } from "../ConsultaProgressBar";
import "./analise-geral-fazendas.css";

const fmt = (value: number | null, digits = 2) => value == null ? "—" : value.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const periodoLabel = (periodo?: AnaliseGeralPeriodo) => periodo ? `${periodo.inicio.split("-").reverse().join("/")} a ${periodo.fim.split("-").reverse().join("/")}` : "";

export function IndicadoresAnaliseGeralFazendas() {
  const { safra } = useApp();
  const defaults = useMemo(() => safraDefaultRange(safra?.code), [safra?.code]);
  const [periodos, setPeriodos] = useState(() => periodosAnaliseGeralPadrao(defaults.from, defaults.to));
  const [data, setData] = useState<AnaliseGeralFazendasData | null>(null);
  const [busca, setBusca] = useState("");
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
    <header><h2>Análise geral das fazendas</h2><p>Compactação do solo, tocos danificados e produtividade biométrica por fazenda.</p></header>
    <form className="agf-filtros" onSubmit={(event) => { event.preventDefault(); void load(); }}>
      <div className="agf-periodos">{ANALISE_GERAL_COLUNAS.map(({ key, label }) => <fieldset key={key}>
        <legend>{label}</legend>
        <label>Início<input type="date" required aria-label={`Início — ${label}`} value={periodos[key].inicio} onChange={(event) => setPeriodos((current) => ({ ...current, [key]: { ...current[key], inicio: event.target.value } }))} /></label>
        <label>Fim<input type="date" required aria-label={`Fim — ${label}`} min={periodos[key].inicio} value={periodos[key].fim} onChange={(event) => setPeriodos((current) => ({ ...current, [key]: { ...current[key], fim: event.target.value } }))} /></label>
      </fieldset>)}</div>
      <label>Fazenda<input type="search" value={busca} onChange={(event) => setBusca(event.target.value)} placeholder="Buscar por descrição ou código" /></label>
      <label className="agf-check"><input type="checkbox" checked={comDados} onChange={(event) => setComDados(event.target.checked)} />Somente fazendas com dados</label>
      <button className="btn primary" type="submit" disabled={loading || ANALISE_GERAL_COLUNAS.some(({ key }) => !periodos[key].inicio || !periodos[key].fim || periodos[key].inicio > periodos[key].fim)}>{loading ? "Consultando…" : "Consultar"}</button>
    </form>
    <ConsultaProgressBar active={loading} className="consulta-progress--compact" />
    {error ? <p role="alert" className="agf-erro">{error}</p> : null}
    {data?.avisos.map((aviso) => <p role="status" className="agf-aviso" key={aviso}>{aviso}</p>)}
    {data ? <>
      <p className="agf-atualizacao">{rows.length} fazenda(s) · Atualizado em {new Date(data.atualizadoEm).toLocaleString("pt-BR")}</p>
      <div className="agf-tabela"><table><thead><tr>
        <th scope="col">Descrição da fazenda</th>
        <th scope="col" title="Média de todas as leituras válidas das faixas de profundidade, como a coluna Total do relatório de compactação.">Compactação de solo total (kPa)<small>{periodoLabel(data.periodos?.compactacao)}</small></th>
        <th scope="col" title="Total de tocos danificados dividido pelo total de tocos analisados, multiplicado por 100.">Tocos %<small>{periodoLabel(data.periodos?.tocos)}</small></th>
        <th scope="col" title="Média do TCH por talhão, ponderada pela área. Sem áreas disponíveis, usa a média dos talhões.">TCH análise biométrica (t/ha)<small>{periodoLabel(data.periodos?.tch)}</small></th>
      </tr></thead><tbody>{rows.length ? rows.map((row) => <tr key={row.id}>
        <th scope="row" title={row.codigo ? `Código ${row.codigo}` : ""}>{row.fazenda}</th>
        <td>{fmt(row.compactacaoTotal, 1)}</td><td>{fmt(row.tocosPercentual, 3)}{row.tocosPercentual != null ? "%" : ""}</td><td>{fmt(row.tch)}</td>
      </tr>) : <tr><td colSpan={4}>Nenhuma fazenda encontrada para os filtros selecionados.</td></tr>}</tbody></table></div>
      <p className="agf-nota">“—” indica ausência de dados no período daquela coluna. Compactação: média das leituras do penetrômetro. Tocos: análises de broca gigante da safra selecionada. TCH: mesma ponderação por área da análise biométrica.</p>
    </> : !loading && !error ? <p>Defina o período de cada coluna e clique em Consultar.</p> : null}
  </section>;
}
