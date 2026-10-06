import { useEffect, useMemo, useState } from "react";
import type { ExternalSiteGroup } from "../api";
import {
  INDICADORES_GROUPS,
  isNativeTabHidden,
  type IndicadoresReportId,
  type IndicadoresSectionId,
} from "../lib/nativeEmbedTabs";
import { canAccessNativeTab } from "../lib/permissions";
import { useApp } from "../store";
import { ExternalSiteFrame } from "./ExternalSiteFrame";
import { IndicadoresColheitaProducao } from "./indicadores/IndicadoresColheitaProducao";
import { IndicadoresCombustivel } from "./indicadores/IndicadoresCombustivel";
import { IndicadoresControleEstoque } from "./indicadores/IndicadoresControleEstoque";
import { IndicadoresDisponibilidadeEquipamentos } from "./indicadores/IndicadoresDisponibilidadeEquipamentos";
import { IndicadoresMapaFazendas } from "./indicadores/IndicadoresMapaFazendas";
import { IndicadoresManutencaoProgramada } from "./indicadores/IndicadoresManutencaoProgramada";
import { IndicadoresGestaoManutencao } from "./indicadores/IndicadoresGestaoManutencao";
import { IndicadoresLubrificacao } from "./indicadores/IndicadoresLubrificacao";
import { ReportExpand } from "./indicadores/ReportExpand";
import { IndicadoresPneus } from "./indicadores/IndicadoresPneus";
import { IndicadoresMateriais } from "./indicadores/IndicadoresMateriais";
import { IndicadoresIrrigacao } from "./indicadores/IndicadoresIrrigacao";
import { IndicadoresAnaliseBiometrica } from "./indicadores/IndicadoresAnaliseBiometrica";

export type { IndicadoresReportId };
export { INDICADORES_GROUPS };

type ReportDef = (typeof INDICADORES_GROUPS)[number]["reports"][number];

type ReportTab = ReportDef & {
  groupTitle: string;
  externalUrl?: string;
  externalItemId?: number;
};

function normalizeLabel(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function buildTabs(
  group: ExternalSiteGroup,
  permissions: string[] | undefined,
  section: IndicadoresSectionId,
): ReportTab[] {
  const hidden = group.hiddenNativeTabs ?? [];
  const externalItems = group.items.filter((item) => item.visible);
  const entry = INDICADORES_GROUPS.find((row) => row.id === section);
  if (!entry) return [];
  return entry.reports
      .filter((report) => !isNativeTabHidden(hidden, report.id))
      .filter((report) => canAccessNativeTab(permissions, group, report.id))
      .map((report) => {
        const external = externalItems.find(
          (item) => normalizeLabel(item.label) === normalizeLabel(report.label),
        );
        return {
          ...report,
          groupTitle: entry.title,
          externalUrl: report.id === "manutencao" ? undefined : external?.url,
          externalItemId: report.id === "manutencao" ? undefined : external?.id,
        };
      });
}

function reportBody(
  active: IndicadoresReportId,
  current: ReportTab | undefined,
  initialSubPath: string[] | undefined,
  onNavigate: ((next: { tabKey?: string; itemId?: number; subPath?: string[]; section?: IndicadoresSectionId }) => void) | undefined,
  section: IndicadoresSectionId,
) {
  const isNative = current?.native;
  if (isNative && active === "irrigacao") return <IndicadoresIrrigacao />;
  if (isNative && active === "pneus") return <IndicadoresPneus />;
  if (isNative && active === "colheita-producao") {
    return (
      <IndicadoresColheitaProducao
        initialSubPath={initialSubPath}
        onSubNavigate={(subPath) =>
          onNavigate?.({ tabKey: active, itemId: current.externalItemId, section, subPath })
        }
      />
    );
  }
  if (isNative && active === "combustivel") return <IndicadoresCombustivel />;
  if (isNative && active === "controle-estoque") return <IndicadoresControleEstoque />;
  if (isNative && active === "analise-biometrica") return <IndicadoresAnaliseBiometrica />;
  if (isNative && active === "disponibilidade-equipamentos") return <IndicadoresDisponibilidadeEquipamentos />;
  if (isNative && active === "mapa-fazendas") return <IndicadoresMapaFazendas />;
  if (isNative && active === "materiais") return <IndicadoresMateriais />;
  if (isNative && active === "manutencao") {
    return <IndicadoresManutencaoProgramada externalQuadroUrl={current?.externalUrl} />;
  }
  if (isNative && active === "gestao-manutencao") return <IndicadoresGestaoManutencao />;
  if (isNative && active === "lubrificacao") return <IndicadoresLubrificacao />;
  if (current?.externalUrl) {
    return <ExternalSiteFrame url={current.externalUrl} title={current.label} />;
  }
  return (
    <div className="panel">
      <p className="lead">{current?.label ?? "Relatório"}</p>
      <p className="lead">
        Cadastre a URL em Sistema → Sites incorporados, subaba &quot;{current?.label}&quot; na aba
        Indicadores.
      </p>
    </div>
  );
}

export function IndicadoresPage({
  group,
  section,
  initialItemId,
  initialTabKey,
  initialSubPath,
  onNavigate,
}: {
  group: ExternalSiteGroup;
  section: IndicadoresSectionId;
  initialItemId?: number;
  initialTabKey?: string;
  initialSubPath?: string[];
  onNavigate?: (next: { tabKey?: string; itemId?: number; subPath?: string[]; section?: IndicadoresSectionId }) => void;
}) {
  const { authUser } = useApp();
  const permissions = authUser?.permissions;
  const tabs = useMemo(() => buildTabs(group, permissions, section), [group, permissions, section]);
  const sectionTitle = INDICADORES_GROUPS.find((entry) => entry.id === section)?.title ?? "Indicadores";

  const [active, setActive] = useState<IndicadoresReportId>(() => {
    if (initialTabKey && tabs.some((tab) => tab.id === initialTabKey)) {
      return initialTabKey as IndicadoresReportId;
    }
    if (initialItemId) {
      const hit = tabs.find((tab) => tab.externalItemId === initialItemId);
      if (hit) return hit.id;
    }
    return tabs[0]?.id ?? "irrigacao";
  });

  useEffect(() => {
    if (initialTabKey && tabs.some((tab) => tab.id === initialTabKey)) {
      setActive(initialTabKey as IndicadoresReportId);
      return;
    }
    if (initialItemId) {
      const hit = tabs.find((tab) => tab.externalItemId === initialItemId);
      if (hit) setActive(hit.id);
    }
  }, [initialTabKey, initialItemId, tabs]);

  useEffect(() => {
    if (!tabs.some((tab) => tab.id === active)) {
      setActive(tabs[0]?.id ?? "irrigacao");
    }
  }, [tabs, active]);

  const current = tabs.find((tab) => tab.id === active);

  if (!tabs.length) {
    return (
      <div className="page external-site-page indicadores-page">
        <p className="lead">Nenhuma tela de {sectionTitle} liberada para este usuário.</p>
      </div>
    );
  }

  return (
    <div className="page external-site-page indicadores-page">
      <div className="kind-toggle external-site-tabs indicadores-tabs indicadores-nav no-print" aria-label={sectionTitle}>
        {tabs.map((report) => (
          <button
            key={report.id}
            type="button"
            className={`btn ${active === report.id ? "primary" : ""}`}
            onClick={() => {
              setActive(report.id);
              onNavigate?.({ tabKey: report.id, itemId: report.externalItemId, section, subPath: [] });
            }}
          >
            {report.label}
          </button>
        ))}
      </div>
      <ReportExpand
        title={current?.label ?? "Relatório"}
        className={
          active === "mapa-fazendas"
            ? "report-expand-mapa"
            : active === "colheita-producao"
            ? "report-expand-desempenho"
            : active === "irrigacao"
              ? "report-expand-irrigacao"
              : undefined
        }
        compactToggle={active === "mapa-fazendas"}
      >
        {reportBody(active, current, initialSubPath, onNavigate, section)}
      </ReportExpand>
    </div>
  );
}
