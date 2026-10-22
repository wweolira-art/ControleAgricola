import { useState } from "react";
import { SafraSelect } from "./SafraSelect";
import { useApp } from "../store";
import type { ExternalSiteGroup } from "../api";
import { isSidebarSiteGroup } from "../api";
import { APP_PRODUCT_NAME, IS_CUSTO_APP } from "../lib/appFlavor";
import { INDICADORES_GROUPS, indicadoresSectionOf, isNativeTabHidden } from "../lib/nativeEmbedTabs";
import {
  canAccess,
  canAccessNativeTab,
  canAccessSiteGroup,
  canManageUsers,
  hasAnyCostPlanningAccess,
  PAGE_PERMISSIONS,
} from "../lib/permissions";

export function VerifiedMark({ title = "Planejamento verificado pela diretoria" }: { title?: string }) {
  return (
    <span className="verified-mark" title={title} aria-label={title}>
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <circle cx="8" cy="8" r="7.25" fill="currentColor" opacity="0.2" />
        <path
          d="M4.6 8.2 7 10.6 11.5 5.4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function IndicadoresGroupIcon({ section }: { section: "agricola" | "automotivo" }) {
  if (section === "agricola") {
    return (
      <svg className="nav-section-icon" viewBox="0 0 64 64" aria-hidden="true">
        <rect x="3" y="3" width="58" height="58" rx="15" fill="#f2f8e9" />
        <path d="M20 54V18c0-4 3-7 7-7v43M33 54V11c0-4 3-7 7-7v50" fill="#79b946" stroke="#347438" strokeWidth="3" strokeLinejoin="round" />
        <path d="M20 25h7M20 36h7M33 18h7M33 30h7M33 42h7" stroke="#e8f2cc" strokeWidth="3" />
        <path d="M24 20C14 17 11 11 10 7c9 1 15 5 17 12M24 33c-10 1-15 6-17 13 9 0 15-4 18-11M39 15c8-7 14-7 18-6-3 8-8 12-16 13M39 31c9-1 14 2 18 7-8 3-14 2-18-3" fill="#58a844" stroke="#347438" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M12 55h42" stroke="#a26b3a" strokeWidth="4" strokeLinecap="round" />
        <g transform="translate(39 37)">
          <circle cx="9" cy="9" r="11" fill="#155eae" stroke="#fff" strokeWidth="2" />
          <path d="M3 13V9m5 4V5m5 8V7" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
        </g>
      </svg>
    );
  }
  return (
    <svg className="nav-section-icon" viewBox="0 0 64 64" aria-hidden="true">
      <rect x="3" y="3" width="58" height="58" rx="15" fill="#edf5ff" />
      <path d="M29 10h8l1.3 5.3 4.7 2.7 4.7-2.7 5.7 5.7-2.7 4.7 2.7 4.7-2.7 4.7 2.7 4.7-5.7 5.7-4.7-2.7-4.7 2.7L37 54h-8l-1.3-5.3-4.7-2.7-4.7 2.7-5.7-5.7 2.7-4.7-2.7-4.7 2.7-4.7-2.7-4.7 5.7-5.7 4.7 2.7 4.7-2.7L29 10Z" fill="#e3a224" stroke="#9a6209" strokeWidth="2.4" strokeLinejoin="round" />
      <circle cx="33" cy="32" r="8" fill="#edf5ff" stroke="#9a6209" strokeWidth="3" />
      <path d="m44.5 41.5 8.8-8.8c1.8-1.8 4.6-.8 4.5 1.6l-.3 5.3-4 1.1-1.1 4-5.3.3c-2.4.1-4.4-2.7-2.6-4.5Z" fill="#3978b9" stroke="#174e87" strokeWidth="2.4" strokeLinejoin="round" />
      <path d="m40 46 6-6" stroke="#174e87" strokeWidth="3" strokeLinecap="round" />
      <path d="m45.5 51.5-9-9 3.5-3.5 9 9c1.5 1.5.1 4.9-2 4.9-.5 0-1-.2-1.5-.6Z" fill="#dd5a4f" stroke="#8d2f29" strokeWidth="2.2" strokeLinejoin="round" />
      <g transform="translate(39 37)">
        <circle cx="9" cy="9" r="11" fill="#155eae" stroke="#fff" strokeWidth="2" />
        <path d="M3 13V9m5 4V5m5 8V7" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
      </g>
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg className="nav-settings-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M10.2 3.5h3.6l.6 2.1c.5.2 1 .5 1.4.8l2.1-.6 1.8 3.1-1.5 1.5c.1.5.1 1.1 0 1.6l1.5 1.5-1.8 3.1-2.1-.6c-.4.3-.9.6-1.4.8l-.6 2.1h-3.6l-.6-2.1c-.5-.2-1-.5-1.4-.8l-2.1.6-1.8-3.1 1.5-1.5a6.2 6.2 0 0 1 0-1.6L4.7 8.9l1.8-3.1 2.1.6c.4-.3.9-.6 1.4-.8l.2-2.1Z" fill="currentColor" opacity=".9" />
      <circle cx="12" cy="12" r="3.1" fill="#173a67" />
    </svg>
  );
}

function HumanResourcesIcon() {
  return (
    <svg className="nav-hr-icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="7.2" r="3.2" fill="currentColor" />
      <path d="M6.2 20c.3-4 2.4-6.4 5.8-6.4s5.5 2.4 5.8 6.4" fill="currentColor" />
      <circle cx="5.3" cy="10" r="2.2" fill="currentColor" opacity=".72" />
      <path d="M1.6 18.5c.2-2.7 1.5-4.4 3.8-4.7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity=".72" />
      <circle cx="18.7" cy="10" r="2.2" fill="currentColor" opacity=".72" />
      <path d="M22.4 18.5c-.2-2.7-1.5-4.4-3.8-4.7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity=".72" />
    </svg>
  );
}

function NavigationIcon({ kind }: { kind: "planning" | "harvest" | "site" | "people" }) {
  const symbol = kind === "planning" ? "📊" : kind === "harvest" ? "🚜" : kind === "people" ? "👥" : "🌐";
  return <span className="nav-collapse-icon" aria-hidden="true">{symbol}</span>;
}

function SidebarToggleIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 5v14" stroke="currentColor" strokeWidth="1.8" />
      {collapsed ? (
        <path d="m12 12 3-3m-3 3 3 3m-3-3H7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="m12 12-3-3m3 3-3 3m3-3h5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}

export function Sidebar() {
  const { page, go, safra, siteGroups, authUser } = useApp();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("sidebar-collapsed") === "1");
  const permissions = authUser?.permissions ?? [];

  const renderSiteGroupBtn = (group: ExternalSiteGroup) => {
    const isCostPlanning = group.nativeKey === "cost-planning";
    const canSee = isCostPlanning
      ? canAccessSiteGroup(permissions, group.id) || hasAnyCostPlanningAccess(permissions)
      : canAccessSiteGroup(permissions, group.id);
    if (!canSee) return null;
    if (group.nativeKey === "indicadores") {
      const activeSection =
        page.kind === "siteGroup" && page.groupId === group.id
          ? page.section ?? indicadoresSectionOf(page.tabKey) ?? "agricola"
          : null;
      return INDICADORES_GROUPS.map((entry) => {
        const visible = entry.reports.some(
          (report) =>
            !isNativeTabHidden(group.hiddenNativeTabs, report.id) &&
            canAccessNativeTab(permissions, group, report.id),
        );
        if (!visible) return null;
        return (
          <button
            key={`${group.id}-${entry.id}`}
            className={`nav-btn nav-btn--section-icon ${activeSection === entry.id ? "active" : ""}`}
            onClick={() => go({ kind: "siteGroup", groupId: group.id, section: entry.id })}
            title={entry.title}
            aria-label={entry.title}
          >
            <IndicadoresGroupIcon section={entry.id} />
            <span className="nav-section-label">{entry.title}</span>
          </button>
        );
      });
    }
    return (
      <button
        key={group.id}
        className={`nav-btn nav-btn--with-icon ${page.kind === "siteGroup" && page.groupId === group.id ? "active" : ""}`}
        onClick={() =>
          isCostPlanning
            ? go({ kind: "costPlanning", view: { tab: "dash" } })
            : go({ kind: "siteGroup", groupId: group.id })
        }
        title={group.label}
      >
        <NavigationIcon kind={isCostPlanning ? "planning" : group.nativeKey === "gestao-colheita" ? "harvest" : "site"} />
        <span className="nav-item-label">{group.label}</span>
      </button>
    );
  };

  const visibleSiteGroups = siteGroups.filter((group) => {
    if (!isSidebarSiteGroup(group)) return false;
    if (group.nativeKey === "cost-planning") {
      if (!IS_CUSTO_APP) return false;
      return canAccessSiteGroup(permissions, group.id) || hasAnyCostPlanningAccess(permissions);
    }
    if (IS_CUSTO_APP) return false;
    return canAccessSiteGroup(permissions, group.id);
  });
  const systemPages = PAGE_PERMISSIONS.filter(
    (row) =>
      (row.pageKind === "recursosHumanos" || row.pageKind === "users") &&
      (row.pageKind === "users" ? canManageUsers(permissions) : canAccess(permissions, row.key)),
  );

  return (
    <aside className={`sidebar ${collapsed ? "is-collapsed" : ""}`}>
      <div className="brand">
        <button
          type="button"
          className="sidebar-toggle"
          onClick={() => setCollapsed((current) => {
            const next = !current;
            localStorage.setItem("sidebar-collapsed", next ? "1" : "0");
            return next;
          })}
          title={collapsed ? "Exibir menu completo" : "Ocultar textos do menu"}
          aria-label={collapsed ? "Exibir menu completo" : "Ocultar textos do menu"}
        >
          <SidebarToggleIcon collapsed={collapsed} />
        </button>
        <div className="brand-logo-wrap">
          <img
            src="/elejota-agro-logo.png"
            alt="Elejota Agro"
            className="brand-logo"
          />
        </div>
        <h1>{APP_PRODUCT_NAME}</h1>
        <small>{safra?.label ?? "Safra"}</small>
        <SafraSelect variant="side" />
      </div>

      {visibleSiteGroups.length ? <div className="nav-sec">{IS_CUSTO_APP ? "Planejamento" : "Sites e colheita"}</div> : null}
      {visibleSiteGroups.map(renderSiteGroupBtn)}
      {systemPages.length ? <div className="nav-sec">Sistema</div> : null}
      {systemPages.map((row) => (
        <button
          key={row.key}
          className={`nav-btn ghost nav-btn--with-icon ${page.kind === row.pageKind ? "active" : ""}`}
          onClick={() => go({ kind: row.pageKind })}
          title={row.label}
        >
          {row.pageKind === "users" ? <SettingsIcon /> : <HumanResourcesIcon />}
          <span className="nav-item-label">{row.label}</span>
        </button>
      ))}
    </aside>
  );
}
