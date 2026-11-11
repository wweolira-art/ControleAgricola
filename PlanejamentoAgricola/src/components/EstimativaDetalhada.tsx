import { useEffect, useMemo, useState } from "react";
import { api, type EstimativaDetalhadaEnergiaLinha } from "../api";
import { formatBRL } from "../lib/format";
import { ReadOnlyFieldset, useCanEditItems } from "../lib/editAccess";
import { useApp } from "../store";

type LinhaEdicao = EstimativaDetalhadaEnergiaLinha;

function novaLinha(): LinhaEdicao {
  return {
    id: -Date.now() - Math.floor(Math.random() * 1000),
    contratoJatoba: "",
    descricao: "",
    mediaSafra: 0,
    mediaEntressafra: 0,
  };
}

export function EstimativaDetalhada() {
  const { safra, safraId } = useApp();
  const canEdit = useCanEditItems();
  const [linhas, setLinhas] = useState<LinhaEdicao[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMessage(null);
    api.estimativaDetalhadaEnergia(safraId)
      .then((dados) => {
        if (!cancelled) setLinhas(dados);
      })
      .catch((error: Error) => {
        if (!cancelled) setMessage(error.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [safraId]);

  const totalEstimado = useMemo(
    () => linhas.reduce(
      (total, linha) => total + ((Number(linha.mediaSafra) || 0) + (Number(linha.mediaEntressafra) || 0)) * 6,
      0,
    ),
    [linhas],
  );

  const alterar = <K extends keyof LinhaEdicao>(index: number, key: K, value: LinhaEdicao[K]) => {
    setLinhas((atuais) => atuais.map((linha, posicao) => posicao === index ? { ...linha, [key]: value } : linha));
  };

  const salvar = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const dados = await api.salvarEstimativaDetalhadaEnergia(
        safraId,
        linhas.map(({ contratoJatoba, descricao, mediaSafra, mediaEntressafra }) => ({
          contratoJatoba,
          descricao,
          mediaSafra: Number(mediaSafra) || 0,
          mediaEntressafra: Number(mediaEntressafra) || 0,
        })),
      );
      setLinhas(dados);
      setMessage("Estimativa de energia elétrica salva.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível salvar a estimativa.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="panel estimativa-detalhada-panel">
      <div className="kind-toggle" style={{ marginBottom: 14 }}>
        <button type="button" className="btn primary">Energia elétrica</button>
      </div>
      <header className="panel-header">
        <div>
          <h3>Energia elétrica</h3>
          <p className="lead">Estimativa detalhada da safra {safra?.code ?? "selecionada"}. As médias são mensais e o total estimado considera 6 meses de safra e 6 de entressafra.</p>
        </div>
      </header>
      <ReadOnlyFieldset>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Contrato Jatobá</th>
                <th>Descrição</th>
                <th className="cell-money">Média Safra (mensal)</th>
                <th className="cell-money">Média entressafra (mensal)</th>
                <th className="cell-money">Total Estimado</th>
                {canEdit ? <th>Ações</th> : null}
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={canEdit ? 6 : 5}>Carregando estimativa…</td></tr> : null}
              {!loading && !linhas.length ? <tr><td colSpan={canEdit ? 6 : 5}>Nenhuma estimativa cadastrada para esta safra.</td></tr> : null}
              {linhas.map((linha, index) => {
                const totalLinha = ((Number(linha.mediaSafra) || 0) + (Number(linha.mediaEntressafra) || 0)) * 6;
                return (
                  <tr key={linha.id}>
                    <td><input value={linha.contratoJatoba} onChange={(event) => alterar(index, "contratoJatoba", event.target.value)} placeholder="Contrato" /></td>
                    <td><input value={linha.descricao} onChange={(event) => alterar(index, "descricao", event.target.value)} placeholder="Descrição" /></td>
                    <td><input className="cell-money" type="number" min="0" step="0.01" value={linha.mediaSafra || ""} onChange={(event) => alterar(index, "mediaSafra", Number(event.target.value) || 0)} /></td>
                    <td><input className="cell-money" type="number" min="0" step="0.01" value={linha.mediaEntressafra || ""} onChange={(event) => alterar(index, "mediaEntressafra", Number(event.target.value) || 0)} /></td>
                    <td className="cell-money"><strong>{formatBRL(totalLinha)}</strong></td>
                    {canEdit ? <td><button type="button" className="btn danger" onClick={() => setLinhas((atuais) => atuais.filter((_, posicao) => posicao !== index))}>Remover</button></td> : null}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="total">
                <td colSpan={4}>Total Estimado</td>
                <td className="cell-money">{formatBRL(totalEstimado)}</td>
                {canEdit ? <td /> : null}
              </tr>
            </tfoot>
          </table>
        </div>
        {canEdit ? <div className="actions" style={{ marginTop: 14 }}>
          <button type="button" className="btn" onClick={() => setLinhas((atuais) => [...atuais, novaLinha()])}>Adicionar linha</button>
          <button type="button" className="btn primary" disabled={saving} onClick={() => void salvar()}>{saving ? "Salvando…" : "Salvar"}</button>
        </div> : null}
      </ReadOnlyFieldset>
      {message ? <p className="lead" style={{ marginTop: 12 }}>{message}</p> : null}
    </section>
  );
}
