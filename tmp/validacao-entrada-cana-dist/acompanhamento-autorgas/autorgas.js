(() => {
  const apiUrl = "/api/autorgas";
  const canInsert = new URLSearchParams(window.location.search).get("canInsert") === "1";
  const state = { items: [] };
  const byId = (id) => document.getElementById(id);
  const formatNumber = (value) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(Number(value) || 0);
  const parseDate = (value) => {
    if (!value) return null;
    const source = String(value).trim();
    const iso = source.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    const br = source.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (br) return new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]));
    const date = new Date(source);
    return Number.isNaN(date.getTime()) ? null : date;
  };
  const formatDate = (value) => {
    if (!value) return "—";
    const date = parseDate(value);
    return !date ? String(value) : new Intl.DateTimeFormat("pt-BR").format(date);
  };
  const statusOf = (item) => {
    if (!item.data_inicio || !item.data_fim) return "Sem período";
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const start = parseDate(item.data_inicio); const end = parseDate(item.data_fim);
    if (!start || !end) return "Sem período";
    if (today > end) return "Vencido";
    if (today >= start) return "Em andamento";
    return "Planejado";
  };
  const daysRemaining = (item) => {
    if (!item.data_fim) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const end = parseDate(item.data_fim);
    if (!end) return null;
    end.setHours(0, 0, 0, 0);
    return Math.round((end.getTime() - today.getTime()) / 86400000);
  };
  const setMessage = (text, success = false, form = false) => {
    const target = byId(form ? "form-message" : "message");
    target.textContent = text || "";
    target.className = `message${text ? " visible" : ""}${success ? " success" : ""}`;
  };
  const render = () => {
    const query = byId("search").value.trim().toLocaleLowerCase("pt-BR");
    const selectedStatus = byId("status-filter").value;
    const shown = state.items.filter((item) => {
      const value = `${item.id ?? ""} ${item.descricao ?? ""} ${item.fazenda ?? ""}`.toLocaleLowerCase("pt-BR");
      return (!query || value.includes(query)) && (selectedStatus === "Todos" || statusOf(item) === selectedStatus);
    });
    const totalFlow = state.items.reduce((sum, item) => sum + (Number(item.vazao_m3h) || 0), 0);
    byId("total-card").textContent = state.items.length;
    byId("progress-card").textContent = state.items.filter((item) => statusOf(item) === "Em andamento").length;
    byId("late-card").textContent = state.items.filter((item) => statusOf(item) === "Vencido").length;
    byId("flow-card").textContent = `${formatNumber(totalFlow)} m³/h`;
    const rows = byId("rows");
    rows.replaceChildren();
    if (!shown.length) {
      const row = document.createElement("tr"); const cell = document.createElement("td");
      cell.colSpan = 11; cell.textContent = "Nenhum acompanhamento encontrado."; row.append(cell); rows.append(row); return;
    }
    shown.forEach((item) => {
      const status = statusOf(item); const remaining = daysRemaining(item); const row = document.createElement("tr");
      const cells = [item.id, item.descricao, item.fazenda, `${formatNumber(item.vazao_m3h)} m³/h`, `${formatNumber(item.operacao_h_dia)} h/dia`, item.meses ?? "—", formatDate(item.data_inicio), formatDate(item.data_fim)];
      cells.forEach((value) => { const cell = document.createElement("td"); cell.textContent = value ?? "—"; row.append(cell); });
      const daysCell = document.createElement("td");
      daysCell.textContent = remaining == null ? "—" : remaining < 0 ? `${Math.abs(remaining)} em atraso` : `${remaining} dia(s)`;
      if (remaining != null) daysCell.className = remaining < 0 ? "days-late" : remaining <= 210 ? "days-alert" : "";
      row.append(daysCell);
      const alertCell = document.createElement("td"); const alert = document.createElement("span");
      alert.className = `badge ${remaining != null && remaining >= 0 && remaining <= 210 ? "badge-alerta" : "badge-sem-alerta"}`;
      alert.textContent = remaining != null && remaining >= 0 && remaining <= 210 ? "Próximo do fim" : remaining != null && remaining < 0 ? "Prazo vencido" : "Sem alerta";
      alertCell.append(alert); row.append(alertCell);
      const statusCell = document.createElement("td"); const badge = document.createElement("span");
      badge.className = `badge badge-${status.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replaceAll(" ", "-").toLocaleLowerCase("pt-BR")}`; badge.textContent = status; statusCell.append(badge); row.append(statusCell); rows.append(row);
    });
  };
  const load = async () => {
    setMessage("Carregando acompanhamentos...");
    try {
      const response = await fetch(apiUrl, { headers: authHeaders() });
      if (!response.ok) throw new Error(`Falha ${response.status}`);
      const data = await response.json(); state.items = Array.isArray(data.items) ? data.items : [];
      byId("update-time").textContent = `Atualizado em ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date())}`;
      setMessage(""); render();
    } catch (_) { state.items = []; render(); setMessage("Não foi possível carregar os acompanhamentos da API Oracle."); }
  };
  const authHeaders = () => {
    const token = localStorage.getItem("pa_auth_token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  };
  const dialog = byId("insert-dialog");
  if (!canInsert) byId("insert-button").hidden = true;
  byId("insert-button").addEventListener("click", () => { setMessage("", false, true); dialog.showModal(); });
  byId("close-button").addEventListener("click", () => dialog.close());
  byId("cancel-button").addEventListener("click", () => dialog.close());
  byId("refresh-button").addEventListener("click", load);
  byId("search").addEventListener("input", render); byId("status-filter").addEventListener("change", render);
  byId("insert-form").addEventListener("submit", async (event) => {
    event.preventDefault(); const form = event.currentTarget; const save = byId("save-button"); const data = new FormData(form);
    const optionalDate = (key) => data.get(key) ? new Date(`${data.get(key)}T00:00:00`).toISOString() : null;
    const payload = { descricao: data.get("descricao"), fazenda: data.get("fazenda"), meses: Number(data.get("meses")), vazao_m3h: Number(data.get("vazao_m3h")), operacao_h_dia: Number(data.get("operacao_h_dia")), data_inicio: optionalDate("data_inicio"), data_fim: optionalDate("data_fim") };
    try {
      save.disabled = true; save.textContent = "Salvando..."; setMessage("", false, true);
      const response = await fetch(apiUrl, { method: "POST", headers: { ...authHeaders(), "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!response.ok) throw new Error(await response.text());
      form.reset(); dialog.close(); await load(); setMessage("Acompanhamento inserido com sucesso.", true);
    } catch (_) { setMessage("Não foi possível salvar o acompanhamento na API Oracle.", false, true); }
    finally { save.disabled = false; save.textContent = "Salvar acompanhamento"; }
  });
  load();
})();
