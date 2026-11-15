import { useMemo, useState } from "react";
import type { ConsumoAnaliticoLinha } from "../../api";

const formatar = (value: number | null) => value == null ? "—" : value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const grupos = { colhedora: "Colhedeiras", trator: "Tratores", caminhao: "Caminhões" };

export function RelatorioAnaliticoCombustivel({ linhas }: { linhas: ConsumoAnaliticoLinha[] }) {
  const [grupo, setGrupo] = useState("");
  const [equipamento, setEquipamento] = useState("");
  const opcoes = useMemo(() => [...new Set(linhas.filter(row => !grupo || row.grupo === grupo).map(row => row.equipamento))]
    .sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true })), [linhas, grupo]);
  const visiveis = useMemo(() => linhas.filter(row => (!grupo || row.grupo === grupo) && (!equipamento || row.equipamento === equipamento)), [linhas, grupo, equipamento]);
  const totais = useMemo(() => visiveis.reduce((acc, row) => ({ litros: acc.litros + row.litrosCombustivel, toneladas: acc.toneladas + row.toneladaColhida }), { litros: 0, toneladas: 0 }), [visiveis]);
  return <section className="panel consumo-analitico">
    <h3>Relatório analítico <small>{visiveis.length.toLocaleString("pt-BR")} registros</small></h3>
    <div className="form-grid consumo-analitico-filtros no-print">
      <label>Tipo de equipamento<select value={grupo} onChange={event => { setGrupo(event.target.value); setEquipamento(""); }}>
        <option value="">Todos</option>
        {Object.entries(grupos).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <label>Equipamento<select value={equipamento} onChange={event => setEquipamento(event.target.value)}>
        <option value="">Todos</option>
        {opcoes.map(value => <option key={value} value={value}>{value}</option>)}
      </select></label>
    </div>
    <div className="table-wrap consumo-analitico-scroll" tabIndex={0} role="region" aria-label="Dados diários de consumo de combustível">
      <table className="data consumo-analitico-tabela" aria-label="Relatório analítico de combustível">
        <colgroup><col className="col-data" /><col className="col-equipamento" /><col className="col-fazenda" /><col className="col-litros" /><col className="col-producao" /><col className="col-indice" /><col className="col-indice" /></colgroup>
        <thead><tr><th scope="col" className="left">Data</th><th scope="col" className="left">Equipamento</th><th scope="col" className="left">Fazenda</th><th scope="col" className="num">Combustível (L)</th><th scope="col" className="num">Produção (t)</th><th scope="col" className="num">L/h</th><th scope="col" className="num">L/ton</th></tr></thead>
        <tbody>{visiveis.map(row => <tr key={`${row.grupo}-${row.data}-${row.codEquipamento}`}>
          <td className="left">{row.data.split("-").reverse().join("/")}</td><td className="left consumo-analitico-equipamento">{row.equipamento}</td><td className="left consumo-analitico-fazenda">{row.fazenda || "—"}</td>
          <td className="num">{formatar(row.litrosCombustivel)}</td><td className="num">{formatar(row.toneladaColhida)}</td>
          <td className="num">{formatar(row.ltHr)}</td><td className="num">{formatar(row.ltTon)}</td>
        </tr>)}{!visiveis.length && <tr><td colSpan={7} className="consumo-analitico-vazio">Nenhum registro encontrado para os filtros selecionados.</td></tr>}</tbody>
        {visiveis.length > 0 && <tfoot><tr><th scope="row" colSpan={3} className="left">Total</th><td className="num">{formatar(totais.litros)}</td><td className="num">{formatar(totais.toneladas)}</td><td className="num">—</td><td className="num">{formatar(totais.toneladas > 0 ? totais.litros / totais.toneladas : null)}</td></tr></tfoot>}
      </table>
    </div>
  </section>;
}
