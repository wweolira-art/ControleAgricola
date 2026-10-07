import { Component, useEffect, useMemo, type ReactNode } from "react";
import { ExternalSitesAdmin } from "./components/ExternalSitesAdmin";
import { SiteGroupLoader } from "./components/SiteGroupPage";
import { SafraSelect } from "./components/SafraSelect";
import { Sidebar, VerifiedMark } from "./components/Sidebar";
import { Login } from "./components/Login";
import { RecursosHumanos } from "./components/RecursosHumanos";
import { UsersAdmin } from "./components/UsersAdmin";
import { costPlanningSubtitle, costPlanningTitle } from "./components/CostPlanningHub";
import { EditAccessProvider, ReadOnlyBanner } from "./lib/editAccess";
import { APP_PRODUCT_NAME } from "./lib/appFlavor";
import { indicadoresSectionOf, indicadoresSectionTitle } from "./lib/nativeEmbedTabs";
import { canEditPage } from "./lib/permissions";
import { useApp, type Page } from "./store";

class ScreenError extends Component<{ children: ReactNode }, { message: string | null }> {
  state = { message: null as string | null };

  static getDerivedStateFromError(error: Error) {
    return { message: error.message || "Erro ao abrir esta tela." };
  }

  render() {
    if (this.state.message) {
      return (
        <div className="page">
          <p className="lead" style={{ color: "var(--danger)" }}>
            Esta tela não carregou: {this.state.message}
          </p>
          <button className="btn" onClick={() => this.setState({ message: null })}>
            Tentar de novo
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function appScreenTitle(
  page: Page,
  sheets: ReturnType<typeof useApp>["sheets"],
  siteGroups: ReturnType<typeof useApp>["siteGroups"],
) {
  const siteGroup = page.kind === "siteGroup" ? siteGroups.find((group) => group.id === page.groupId) : null;
  const activeCostView =
    page.kind === "costPlanning"
      ? page.view
      : page.kind === "siteGroup" && siteGroup?.nativeKey === "cost-planning"
        ? page.costView
        : null;
  if (activeCostView) return costPlanningTitle(activeCostView, sheets, siteGroups);
  if (page.kind === "siteGroup" && siteGroup?.nativeKey === "indicadores") {
    const section = page.section ?? indicadoresSectionOf(page.tabKey) ?? "agricola";
    return indicadoresSectionTitle(section);
  }
  if (page.kind === "siteGroup") return siteGroup?.label ?? "Site incorporado";
  if (page.kind === "recursosHumanos") return "Recursos Humanos";
  if (page.kind === "externalSites") return "Sites incorporados";
  if (page.kind === "users") return "Usuários e permissões";
  return "Custo e Planejamento";
}

export function App() {
  const {
    ready,
    error,
    page,
    sheets,
    siteGroups,
    theme,
    toggleTheme,
    safra,
    setSheetVerified,
    authUser,
    authLoading,
    login,
    logout,
    reloadSiteGroups,
    go,
  } = useApp();

  const screenKey =
    page.kind === "costPlanning"
      ? page.view.tab === "sheet"
        ? `costPlanning-sheet-${page.view.sheetId}`
        : page.view.tab === "external"
          ? `costPlanning-external-${page.view.itemId}`
          : `costPlanning-${page.view.tab}`
      : page.kind === "siteGroup"
        ? page.costView
          ? page.costView.tab === "sheet"
            ? `siteGroup-${page.groupId}-sheet-${page.costView.sheetId}`
            : page.costView.tab === "external"
              ? `siteGroup-${page.groupId}-external-${page.costView.itemId}`
              : `siteGroup-${page.groupId}-${page.costView.tab}`
          : `siteGroup-${page.groupId}-${page.section ?? ""}-${page.tabKey ?? page.itemId ?? "root"}`
        : page.kind;

  const siteGroup = page.kind === "siteGroup" ? siteGroups.find((group) => group.id === page.groupId) : null;
  const canEditCurrent = useMemo(
    () => canEditPage(authUser?.permissions, page, siteGroups),
    [authUser?.permissions, page, siteGroups],
  );

  useEffect(() => {
    if (authUser) {
      document.documentElement.dataset.app = "authenticated";
    } else {
      delete document.documentElement.dataset.app;
    }
  }, [authUser]);

  const title = appScreenTitle(page, sheets, siteGroups);

  useEffect(() => {
    document.title = authUser ? `${title} · ${APP_PRODUCT_NAME}` : `Login · ${APP_PRODUCT_NAME}`;
  }, [authUser, title]);

  if (authLoading) {
    return (
      <div className="boot">
        <div>
          <h1>Verificando sessão…</h1>
          <p>Aguarde um instante.</p>
        </div>
      </div>
    );
  }

  if (!authUser) {
    return <Login onLogin={login} />;
  }

  if (error && !sheets.length) {
    return (
      <div className="boot">
        <div>
          <h1>Banco de dados indisponível</h1>
          <p>Suba a API com npm run dev e recarregue. {error}</p>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="boot">
        <div>
          <h1>Abrindo o orçamento…</h1>
          <p>Lendo o SQLite e as premissas da safra.</p>
        </div>
      </div>
    );
  }

  const activeCostView =
    page.kind === "costPlanning"
      ? page.view
      : page.kind === "siteGroup" && siteGroup?.nativeKey === "cost-planning"
        ? page.costView
        : null;
  const sheetId = activeCostView?.tab === "sheet" ? activeCostView.sheetId : null;
  const current = sheetId ? sheets.find((s) => s.id === sheetId) : null;
  const verified = Boolean(current?.verified);
  const subtitle =
    activeCostView
      ? costPlanningSubtitle(activeCostView, safra?.label)
      : page.kind === "siteGroup"
            ? siteGroup?.nativeKey === "gestao-colheita"
              ? "Ferramentas da colheita e sites externos configurados nesta aba."
              : siteGroup?.nativeKey === "cost-planning"
                ? "Orçamento, custos da safra e relatórios incorporados."
                : siteGroup?.nativeKey === "indicadores"
                  ? ""
                  : "Site externo aberto dentro do orçamento."
            : page.kind === "externalSites"
              ? "Cadastre URLs e escolha se o site entra em uma aba existente (como Custo e Planejamento) ou em uma nova aba no menu."
              : page.kind === "recursosHumanos"
                ? "Custo de funcionários orçado x realizado e quadro mensal."
              : page.kind === "users"
                ? "Crie usuários, verifique senhas e defina quais abas cada pessoa pode acessar."
                : "Planejamento e controle de custos da safra.";

  return (
    <div className="app">
      <Sidebar />
      <main className="main">
        <header className="topbar">
          <div>
            <h2>
              {verified ? <VerifiedMark /> : null}
              {title}
            </h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <div className="topbar-actions">
            {current?.kind === "cost_center" && canEditCurrent ? (
              <label className="check-label verified-toggle">
                <span className="check-row">
                  <input
                    type="checkbox"
                    checked={verified}
                    onChange={(e) => void setSheetVerified(current.id, e.target.checked)}
                  />
                  Verificado pela diretoria
                </span>
              </label>
            ) : null}
            <SafraSelect variant="top" />
            <span className="login-user-chip" title={authUser.email}>
              {authUser.nome}
            </span>
            <button type="button" className="btn" onClick={logout}>
              Sair
            </button>
            <button className="btn theme-btn" onClick={toggleTheme}>
              {theme === "dark" ? "Versão clara" : "Versão escura"}
            </button>
          </div>
        </header>
        <ReadOnlyBanner />
        <EditAccessProvider canEdit={canEditCurrent}>
        <ScreenError key={screenKey}>
          {page.kind === "siteGroup" ? (
            <SiteGroupLoader
              groupId={page.groupId}
              section={page.section}
              itemId={page.itemId}
              tabKey={page.tabKey}
              subPath={page.subPath}
              costView={page.costView}
              onCostView={(costView) => go({ kind: "siteGroup", groupId: page.groupId, costView })}
              onNavigate={(next) => go({ kind: "siteGroup", groupId: page.groupId, section: page.section, ...next })}
            />
          ) : null}
          {page.kind === "recursosHumanos" ? <RecursosHumanos /> : null}
          {page.kind === "externalSites" ? <ExternalSitesAdmin onChanged={() => void reloadSiteGroups()} /> : null}
          {page.kind === "users" ? <UsersAdmin /> : null}
        </ScreenError>
        </EditAccessProvider>
      </main>
    </div>
  );
}
