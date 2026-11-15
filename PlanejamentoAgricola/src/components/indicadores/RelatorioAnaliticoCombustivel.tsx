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
  return <section className="panel">
    <h3>Relatório analítico</h3>
    <div className="form-grid no-print">
      <label>Tipo de equipamento<select value={grupo} onChange={event => { setGrupo(event.target.value); setEquipamento(""); }}>
        <option value="">Todos</option>
        {Object.entries(grupos).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <label>Equipamento<select value={equipamento} onChange={event => setEquipamento(event.target.value)}>
        <option value="">Todos</option>
        {opcoes.map(value => <option key={value} value={value}>{value}</option>)}
      </select></label>
    </div>
    <p>Dados diários do período consultado. Litros/hora segue a regra do painel: colhedeiras usam os horímetros dos abastecimentos; tratores usam os abastecimentos do posto. Para caminhões, litros/hora não se aplica. “—” indica ausência de base para o cálculo.</p>
    <div className="table-wrap">
      <table>
        <thead><tr><th>Data</th><th>Equipamento</th><th>Fazenda</th><th>Litros de combustível</th><th>Tonelada colhida</th><th>Litros/hr</th><th>Litros/ton</th></tr></thead>
        <tbody>{visiveis.map(row => <tr key={`${row.grupo}-${row.data}-${row.codEquipamento}`}>
          <td>{row.data.split("-").reverse().join("/")}</td><td>{row.equipamento}</td><td>{row.fazenda || "—"}</td>
          <td>{formatar(row.litrosCombustivel)}</td><td>{formatar(row.toneladaColhida)}</td>
          <td>{formatar(row.ltHr)}</td><td>{formatar(row.ltTon)}</td>
        </tr>)}</tbody>
        {visiveis.length > 0 && <tfoot><tr><th colSpan={3}>Total</th><th>{formatar(totais.litros)}</th><th>{formatar(totais.toneladas)}</th><th>—</th><th>{formatar(totais.toneladas > 0 ? totais.litros / totais.toneladas : null)}</th></tr></tfoot>}
      </table>
    </div>
    {!visiveis.length && <p>Nenhum registro encontrado no período para os filtros selecionados.</p>}
  </section>;
}
