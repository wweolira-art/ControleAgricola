import { useEffect, useMemo, useState } from "react";
import { api, type Material, type OracleMaterial } from "../api";
import { ReadOnlyFieldset, useCanEditItems } from "../lib/editAccess";
import { useApp } from "../store";
import { materialPriceExportData, materialPricesForSafra, materialPriceConflicts } from "../lib/material-price-export";

const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const parseValor = (raw: string) => {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

export function Materials() {
  const { safra } = useApp();
  const canEdit = useCanEditItems();
  const [rows, setRows] = useState<Material[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [tipo, setTipo] = useState<"E" | "G">("E");
  const [valor, setValor] = useState("");
  const [empenho, setEmpenho] = useState("");
  const [grupo, setGrupo] = useState("");
  const [query, setQuery] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [exportOpen, setExportOpen] = useState(false);

  const load = () => api.materials().then(setRows);
  const loadGroups = () =>
    api
      .materialGroups()
      .then((data) => setGroups(data.groups))
      .catch(() => undefined);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const materials = await api.materials();
        if (!active) return;
        setRows(materials);
        if (!canEdit || !materials.some((row) => row.tipo === "E" && !row.empenho?.trim())) return;
        setSyncing(true);
        const result = await api.syncMaterialGroups();
        if (!active) return;
        setRows(result.materials);
        const filled = result.materials.filter((row) => row.tipo === "E" && row.empenho?.trim()).length
          - materials.filter((row) => row.tipo === "E" && row.empenho?.trim()).length;
        const missing = result.materials.filter((row) => row.tipo === "E" && !row.empenho?.trim()).length;
        setSyncMessage(`${filled} empenho(s) preenchido(s) automaticamente pelo Oracle e pelas regras de grupo.${missing ? ` ${missing} material(is) continuam sem vínculo automático e podem ser preenchidos manualmente.` : ""}`);
      } catch (error) {
        if (active) setErr(error instanceof Error ? error.message : "Não foi possível buscar os empenhos no Oracle.");
      } finally {
        if (active) setSyncing(false);
      }
    })();
    void loadGroups();
    return () => { active = false; };
  }, [canEdit]);

  const filtered = useMemo(() => {
    const tokens = fold(query.trim()).split(/\s+/).filter(Boolean);
    if (!tokens.length) return rows;
    return rows.filter((row) => {
      const hay = fold(`${row.code} ${row.description} ${row.empenho ?? ""} ${row.grupo ?? ""}`);
      return tokens.every((token) => hay.includes(token));
    });
  }, [rows, query]);

  return (
    <div className="page">
      <p className="lead">
        Cadastre os materiais com código, descrição, tipo, preço unitário e empenho. No tipo E você
        escolhe o grupo do material. O preço entra no cálculo automático; a fórmula é
        definida na tela de cálculo. Você também pode importar materiais do Oracle.
      </p>
      {syncing ? <p className="lead" role="status">Buscando grupos e empenhos no Oracle…</p> : null}
      {!syncing && syncMessage ? <p className="lead" role="status">{syncMessage}</p> : null}
      <div className="modal-actions">
        {safra ? <SyncPlanningPricesButton safraId={safra.id} safraCode={safra.code} /> : null}
        <button type="button" className="btn" disabled={!rows.some((row) => row.tipo === "E")}
          onClick={() => setExportOpen(true)}>
          Gerar Excel de preços — tipo E
        </button>
      </div>
      {exportOpen && safra ? <ExportMaterialPrices key={safra.id} materials={rows} safraCode={safra.code} safraId={safra.id}
        onClose={() => setExportOpen(false)} /> : null}

      <ReadOnlyFieldset>

      <section className="panel">
        <h3>Novo material</h3>
        <div className="form-grid">
          <label>
            Código do material
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Ex.: 16642" />
          </label>
          <label>
            Descrição
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: ROUNDUP WG" />
          </label>
          <label>
            Tipo
            <select
              value={tipo}
              onChange={(e) => {
                const next = e.target.value as "E" | "G";
                setTipo(next);
                if (next !== "E") setGrupo("");
              }}
            >
              <option value="E">E</option>
              <option value="G">G</option>
            </select>
          </label>
          {tipo === "E" ? (
            <label>
              Grupo
              <select value={grupo} onChange={(e) => setGrupo(e.target.value)}>
                <option value="">Sem grupo</option>
                {groups.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label>
            Valor unitário
            <input value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Ex.: 21,51" />
          </label>
          <label>
            Código de empenho
            <input value={empenho} onChange={(e) => setEmpenho(e.target.value)} placeholder="Ex.: 241" />
          </label>
        </div>
        {err ? <p className="lead" style={{ padding: "0 16px", color: "var(--danger)" }}>{err}</p> : null}
        <div className="modal-actions" style={{ padding: "0 16px 16px" }}>
          <button
            className="btn primary"
            onClick={async () => {
              try {
                setErr(null);
                await api.addMaterial({
                  code,
                  description,
                  tipo,
                  empenho,
                  valor: parseValor(valor),
                  grupo: tipo === "E" ? grupo || null : null,
                });
                setCode("");
                setDescription("");
                setTipo("E");
                setValor("");
                setEmpenho("");
                setGrupo("");
                await load();
              } catch (e) {
                setErr(e instanceof Error ? e.message : "Não foi possível salvar.");
              }
            }}
          >
            Cadastrar material
          </button>
          <button className="btn" onClick={() => setImportOpen(true)}>
            Importar do Oracle
          </button>
          <button
            className="btn"
            disabled={syncing}
            onClick={async () => {
              try {
                setErr(null);
                setSyncing(true);
                const data = await api.syncMaterialGroups();
                setRows(data.materials);
                await loadGroups();
                setSyncMessage(`${data.updated} material(is) importado(s) atualizado(s) com grupo e empenho.`);
              } catch (e) {
                setErr(e instanceof Error ? e.message : "Não foi possível atualizar os empenhos dos materiais importados.");
              } finally {
                setSyncing(false);
              }
            }}
          >
            {syncing ? "Atualizando empenhos…" : "Atualizar empenhos dos materiais importados"}
          </button>
        </div>
      </section>

      <section className="panel">
        <h3>
          Materiais cadastrados
          <small>{query.trim() ? `${filtered.length} de ${rows.length}` : rows.length}</small>
        </h3>
        <div className="form-grid" style={{ gridTemplateColumns: "1fr", paddingBottom: 8 }}>
          <label>
            Pesquisar
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Digite o código, a descrição, o empenho ou o grupo"
            />
          </label>
        </div>
        <table className="data">
          <thead>
            <tr>
              <th>Código</th>
              <th>Descrição</th>
              <th>Tipo</th>
              <th>Grupo</th>
              <th>Valor</th>
              <th>Empenho</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.id}>
                <td className="left">{row.code}</td>
                <td className="desc">{row.description}</td>
                <td>{row.tipo}</td>
                <td>
                  {row.tipo === "E" ? (
                    <select
                      className="cell-select"
                      value={row.grupo ?? ""}
                      onChange={async (e) => {
                        await api.updateMaterial(row.id, { grupo: e.target.value || null });
                        await load();
                      }}
                    >
                      <option value="">Sem grupo</option>
                      {(row.grupo && !groups.includes(row.grupo) ? [row.grupo, ...groups] : groups).map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    "—"
                  )}
                </td>
                <td>
                  <input
                    className="cell"
                    defaultValue={row.valor ?? ""}
                    key={`${row.id}-${row.valor}`}
                    onBlur={async (e) => {
                      const raw = e.target.value.trim();
                      const next = raw ? Number(raw.replace(",", ".")) : null;
                      if (next === row.valor) return;
                      await api.updateMaterial(row.id, { valor: next });
                      await load();
                    }}
                  />
                </td>
                <td>
                  <input
                    className="cell"
                    aria-label={`Código de empenho do material ${row.code}`}
                    defaultValue={row.empenho ?? ""}
                    key={`${row.id}-empenho-${row.empenho ?? ""}`}
                    placeholder="Código de empenho"
                    onBlur={async (event) => {
                      const next = event.target.value.trim();
                      if (next === (row.empenho ?? "")) return;
                      try {
                        setErr(null);
                        await api.updateMaterial(row.id, { empenho: next || null });
                        await load();
                      } catch (error) {
                        setErr(error instanceof Error ? error.message : "Não foi possível salvar o empenho.");
                      }
                    }}
                  />
                </td>
                <td>
                  <button
                    className="icon-btn"
                    title="Excluir"
                    onClick={async () => {
                      if (!confirm(`Excluir o material ${row.code}?`)) return;
                      await api.deleteMaterial(row.id);
                      await load();
                    }}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
            {!filtered.length ? (
              <tr>
                <td className="left" colSpan={7}>
                  Nenhum material encontrado.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
      {importOpen ? (
        <ImportOracleMaterials
          onClose={() => setImportOpen(false)}
          onImported={async (materials) => {
            setRows(materials);
            await loadGroups();
            setImportOpen(false);
          }}
        />
      ) : null}
      </ReadOnlyFieldset>
    </div>
  );
}

function ExportMaterialPrices({ materials, safraCode, safraId, onClose }: {
  materials: Material[];
  safraCode: string;
  safraId: number;
  onClose: () => void;
}) {
  const [group, setGroup] = useState("1");
  const [company, setCompany] = useState("1");
  const [branch, setBranch] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [prices, setPrices] = useState<Material[] | null>(null);
  const [conflicts, setConflicts] = useState<ReturnType<typeof materialPriceConflicts>>([]);
  const [corrections, setCorrections] = useState<Record<number, string>>({});
  async function loadSafraPrices() {
    const [rules, lines, catalog] = await Promise.all([api.calcRules(safraId), api.materialPlanningPrices(safraId), api.materials()]);
    if (rules.safraId !== safraId || lines.safraId !== safraId) throw new Error("A safra consultada mudou. Abra a exportação novamente.");
    const pending = materialPriceConflicts(catalog, rules.rules, safraId, lines.prices);
    setConflicts(pending);
    if (pending.length) throw new Error(`${pending.length} material(is) ainda possuem preços diferentes. Confira a lista abaixo e defina o preço que deve ser aplicado.`);
    return materialPricesForSafra(catalog, rules.rules, safraId, lines.prices);
  }
  useEffect(() => {
    let active = true;
    void loadSafraPrices().then((data) => {
      if (active) setPrices(data);
    }).catch((err) => {
      if (active) setError(err instanceof Error ? err.message : "Não foi possível consultar os preços da safra.");
    });
    return () => { active = false; };
  }, [materials, safraId]);
  const selected = (prices ?? materials).filter((material) => material.tipo === "E");
  const missingPrice = selected.filter((material) => material.valor == null || !Number.isFinite(material.valor)).length;
  const missingEmpenho = selected.filter((material) => !material.empenho?.trim()).length;
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="material-price-export-title"
        onClick={(event) => event.stopPropagation()} style={{ maxWidth: 640 }}>
        <h3 id="material-price-export-title">Exportar preços dos materiais tipo E</h3>
        <p className="lead">Exporta todos os {selected.length} materiais do tipo E no modelo de importação de preços,
          com o preço das linhas dos materiais no planejamento da safra <strong>{safraCode}</strong>,
          de setembro a agosto. A pesquisa da lista não limita esta exportação.</p>
        <div className="form-grid">
          <label>Grupo de empresa<input type="number" min="1" value={group} onChange={(e) => setGroup(e.target.value)} /></label>
          <label>Empresa<input type="number" min="1" value={company} onChange={(e) => setCompany(e.target.value)} /></label>
          <label>Filial<input type="number" min="1" value={branch} onChange={(e) => setBranch(e.target.value)} /></label>
        </div>
        {!prices && !error ? <p className="lead" role="status">Consultando preços da safra…</p> : null}
        {prices && (missingPrice || missingEmpenho) ? <p className="lead" role="status">
          {missingPrice} material(is) sem preço definido nesta safra e {missingEmpenho} sem empenho.
          Esses campos sairão vazios no Excel. Defina os preços no cálculo dos materiais no planejamento.
        </p> : null}
        {error ? <p className="lead" role="alert" style={{ color: "var(--danger)" }}>{error}</p> : null}
        {conflicts.length ? <div style={{ maxHeight: 300, overflow: "auto" }}>
          <p className="lead">Materiais sem preço válido no cadastro não são atualizados pelo botão.
            Informe o preço correto abaixo para salvar na aba Materiais e aplicar aos centros desta safra.</p>
          {conflicts.map(({ material, prices: values }) => <div key={material.id} style={{ padding: "8px 0" }}>
            <strong>{material.code} — {material.description}</strong>
            <p>Preços no planejamento: {values.map((value) => value.toLocaleString("pt-BR", { maximumFractionDigits: 6 })).join("; ")}.
              Cadastro: {material.valor == null ? "sem preço" : material.valor.toLocaleString("pt-BR")}.</p>
            <label>Preço a aplicar (R$)
              <input aria-label={`Preço a aplicar do material ${material.code}`} value={corrections[material.id] ?? ""}
                onChange={(event) => setCorrections((current) => ({ ...current, [material.id]: event.target.value }))}
                placeholder="Informe o preço correto" />
            </label>
            <button type="button" className="btn" disabled={busy} onClick={async () => {
              const raw = (corrections[material.id] ?? "").trim();
              const value = Number(raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw);
              if (!Number.isFinite(value) || value <= 0) { setError("Informe um preço maior que zero para aplicar."); return; }
              setBusy(true); setError(null);
              try {
                await api.updateMaterial(material.id, { valor: value });
                await api.syncPlanningMaterialPrices(safraId);
                setPrices(await loadSafraPrices());
              } catch (err) {
                setPrices(null); setError(err instanceof Error ? err.message : "Não foi possível aplicar o preço.");
              } finally { setBusy(false); }
            }}>Salvar preço e aplicar à safra {safraCode}</button>
          </div>)}
        </div> : null}
        <SyncPlanningPricesButton safraId={safraId} safraCode={safraCode} onUpdated={async () => {
          setError(null);
          try { setPrices(await loadSafraPrices()); }
          catch (err) { setPrices(null); setError(err instanceof Error ? err.message : "Não foi possível consultar os preços."); }
        }} />
        <div className="modal-actions">
          <button type="button" className="btn" disabled={busy} onClick={onClose}>Cancelar</button>
          <button type="button" className="btn primary" disabled={busy || !prices} onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              const data = materialPriceExportData(await loadSafraPrices(), {
                safraId, safraCode, group: Number(group), company: Number(company), branch: Number(branch),
              });
              const XLSX = await import("xlsx");
              const sheet = XLSX.utils.aoa_to_sheet([data.headers, ...data.rows]);
              sheet["!cols"] = [28, 19, 15, 13, 18, 29, ...Array(12).fill(12)].map((wch) => ({ wch }));
              for (let row = 1; row <= data.rows.length; row++) {
                for (let col = 6; col < 18; col++) {
                  const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })];
                  if (cell?.t === "n") cell.z = "#,##0.00####";
                }
              }
              const workbook = XLSX.utils.book_new();
              XLSX.utils.book_append_sheet(workbook, sheet, "Planilha1");
              XLSX.writeFile(workbook, `Importacao_Planejamento_Preco_Materiais_E_${safraCode.replace(/\//g, "-")}.xlsx`);
              onClose();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Não foi possível gerar o Excel de preços.");
            } finally {
              setBusy(false);
            }
          }}>{busy ? "Gerando…" : "Gerar Excel"}</button>
        </div>
      </div>
    </div>
  );
}

function SyncPlanningPricesButton({ safraId, safraCode, onUpdated }: {
  safraId: number; safraCode: string; onUpdated?: () => Promise<void>;
}) {
  const canEdit = useCanEditItems();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  if (!canEdit) return null;
  return <div>
    <button type="button" className="btn" disabled={busy}
      title={`Aplica os preços positivos da aba Materiais em todos os centros de custo da safra ${safraCode} e recalcula os valores.`}
      onClick={async () => {
        setBusy(true); setMessage(""); setError(false);
        try {
          const result = await api.syncPlanningMaterialPrices(safraId);
          setMessage(`Safra ${safraCode}: ${result.updatedLines} linha(s) e ${result.updatedRules} parâmetro(s) atualizados e recalculados. ${result.skippedMaterials} material(is) sem preço válido no cadastro foram mantidos sem alteração.`);
          await onUpdated?.();
        } catch (err) {
          setError(true); setMessage(err instanceof Error ? err.message : "Não foi possível atualizar os preços.");
        } finally { setBusy(false); }
      }}>
      {busy ? "Atualizando preços e recalculando…" : `Aplicar preços da aba Materiais aos centros — safra ${safraCode}`}
    </button>
    {message ? <p className="lead" role={error ? "alert" : "status"}
      style={error ? { color: "var(--danger)" } : undefined}>{message}</p> : null}
  </div>;
}

function ImportOracleMaterials({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: (materials: Material[]) => Promise<void>;
}) {
  const [items, setItems] = useState<OracleMaterial[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr(null);
    void api
      .oracleMaterials(debounced)
      .then((data) => {
        if (!alive) return;
        setItems(data.items);
        setTruncated(Boolean(data.truncated));
      })
      .catch((e: Error) => {
        if (!alive) return;
        setItems([]);
        setTruncated(false);
        setErr(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [debounced]);

  const missingVisible = items.filter((row) => !row.imported);
  const selectedCount = selected.size;

  const toggle = (code: string, imported: boolean) => {
    if (imported) return;
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 820 }}>
        <h3>Importar materiais do Oracle</h3>
        <p className="lead" style={{ margin: "0 0 8px" }}>
          Consulta os materiais e seus grupos no Oracle. Os que já existem no
          cadastro como tipo E ficam marcados e não entram de novo. O tipo entra como E; você pode mudar depois.
        </p>
        <div className="form-grid" style={{ padding: "12px 0 8px" }}>
          <label className="span-2">
            Pesquisar
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Digite o código ou a descrição"
            />
          </label>
        </div>
        {loading ? <p className="lead">Consultando o Oracle…</p> : null}
        {err ? <p className="lead" style={{ color: "#9b2c2c" }}>{err}</p> : null}
        {!loading && !err ? (
          <p className="lead" style={{ margin: "0 0 8px" }}>
            {items.length} material(is)
            {truncated ? " (refine a pesquisa para ver mais)" : ""}
            {missingVisible.length !== items.length ? ` · ${items.length - missingVisible.length} já cadastrado(s) (tipo E)` : ""}
          </p>
        ) : null}
        {!loading && !err ? (
          <div style={{ maxHeight: 360, overflow: "auto" }}>
            <table className="data">
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      disabled={!missingVisible.length}
                      checked={missingVisible.length > 0 && missingVisible.every((row) => selected.has(row.code))}
                      onChange={(e) => {
                        setSelected((current) => {
                          const next = new Set(current);
                          for (const row of missingVisible) {
                            if (e.target.checked) next.add(row.code);
                            else next.delete(row.code);
                          }
                          return next;
                        });
                      }}
                    />
                  </th>
                  <th>Código</th>
                  <th>Descrição</th>
                  <th>Grupo</th>
                  <th>Unidade</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.code}>
                    <td>
                      <input
                        type="checkbox"
                        disabled={row.imported}
                        checked={row.imported || selected.has(row.code)}
                        onChange={() => toggle(row.code, row.imported)}
                      />
                    </td>
                    <td>{row.code}</td>
                    <td className="desc">{row.description}</td>
                    <td className="desc">{row.grupo || "—"}</td>
                    <td>{row.unit || "—"}</td>
                    <td className="left">{row.imported ? "Já cadastrado" : "Novo"}</td>
                  </tr>
                ))}
                {!items.length ? (
                  <tr>
                    <td className="left" colSpan={6}>
                      Nenhum material encontrado.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : null}
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn primary"
            disabled={saving || loading || selectedCount === 0}
            onClick={async () => {
              setSaving(true);
              setErr(null);
              try {
                const data = await api.importOracleMaterials([...selected]);
                await onImported(data.materials);
              } catch (e) {
                setErr(e instanceof Error ? e.message : "Não foi possível importar.");
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Importando…" : `Importar ${selectedCount} material${selectedCount === 1 ? "" : "is"}`}
          </button>
        </div>
      </div>
    </div>
  );
}
