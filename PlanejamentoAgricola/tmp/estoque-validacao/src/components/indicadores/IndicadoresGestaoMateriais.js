import { jsx, jsxs } from "react/jsx-runtime";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  api
} from "../../api";
import { ConsultaProgressBar } from "../ConsultaProgressBar";
import { PrintButton } from "../PrintButton";
import { useReportAutoRefresh } from "./useReportAutoRefresh";
const TIPOS = [
  "Combust\xEDvel",
  "Lubrificante",
  "Pneu",
  "Servico",
  "Filtro",
  "Graxa",
  "Aditivo",
  "Pe\xE7as e Acess\xF3rios"
];
const PRIORIDADE_META = {
  critico: { label: "CR\xCDTICO", className: "gm-prio-critico" },
  alto: { label: "ALTO", className: "gm-prio-alto" },
  medio: { label: "M\xC9DIO", className: "gm-prio-medio" },
  ok: { label: "OK", className: "gm-prio-ok" }
};
const PRIORIDADE_ORDER = {
  critico: 1,
  alto: 2,
  medio: 3,
  ok: 4
};
function defaultRange() {
  const now = /* @__PURE__ */ new Date();
  const from = new Date(now.getFullYear() - 3, 0, 1);
  const pad = (n) => String(n).padStart(2, "0");
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return { from: iso(from), to: iso(now) };
}
function fmtDate(iso) {
  if (!iso) return "\u2014";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}
function fmtQty(n) {
  if (n == null || !Number.isFinite(n)) return "\u2014";
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}
function fmtMoney(n) {
  if (n == null || !Number.isFinite(n)) return "\u2014";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}
function materialLabel(item) {
  return `${item.codMaterial}-${item.descricao}`;
}
function extractLeadingCode(value) {
  const match = value.trim().match(/^\d+/);
  return match?.[0] ?? "";
}
function sortValue(item, key) {
  if (key === "descricao") return materialLabel(item);
  if (key === "prioridade") return PRIORIDADE_ORDER[item.prioridade];
  if (key === "ultimaEntrada") return item.ultimaEntrada ?? "";
  return item[key] ?? Number.NEGATIVE_INFINITY;
}
function compareItems(a, b, sort) {
  const av = sortValue(a, sort.key);
  const bv = sortValue(b, sort.key);
  const dir = sort.dir === "asc" ? 1 : -1;
  if (typeof av === "string" || typeof bv === "string") {
    const result = String(av).localeCompare(String(bv), "pt-BR", { numeric: true, sensitivity: "base" });
    return result * dir;
  }
  if (av === bv) return materialLabel(a).localeCompare(materialLabel(b), "pt-BR", { numeric: true, sensitivity: "base" });
  return (av < bv ? -1 : 1) * dir;
}
function DetalheMaterial({
  item,
  onClose
}) {
  const prio = PRIORIDADE_META[item.prioridade];
  return /* @__PURE__ */ jsxs("aside", { className: "indicadores-mapa-float indicadores-mapa-overlay gm-overlay", children: [
    /* @__PURE__ */ jsxs("header", { className: "gm-overlay-head", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("h3", { children: materialLabel(item) }),
        /* @__PURE__ */ jsxs("p", { children: [
          "C\xF3d. ",
          item.codMaterial,
          " \xB7 ",
          item.tipo
        ] })
      ] }),
      /* @__PURE__ */ jsx("button", { type: "button", className: "indicadores-mapa-close", onClick: onClose, "aria-label": "Fechar detalhes", children: "\xD7" })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "gm-overlay-body", children: /* @__PURE__ */ jsxs("dl", { className: "indicadores-mapa-dl indicadores-mapa-dl-grid", children: [
      /* @__PURE__ */ jsx("dt", { children: "Grupo" }),
      /* @__PURE__ */ jsx("dd", { children: item.grupo }),
      /* @__PURE__ */ jsx("dt", { children: "Sa\xEDda (per\xEDodo)" }),
      /* @__PURE__ */ jsx("dd", { children: fmtQty(item.saida) }),
      /* @__PURE__ */ jsx("dt", { children: "M\xE9dia m\xEAs" }),
      /* @__PURE__ */ jsx("dd", { children: fmtQty(item.mediaMes) }),
      /* @__PURE__ */ jsx("dt", { children: "Estoque atual" }),
      /* @__PURE__ */ jsx("dd", { children: fmtQty(item.estoqueAtual) }),
      /* @__PURE__ */ jsx("dt", { children: "Cobertura (meses)" }),
      /* @__PURE__ */ jsx("dd", { children: item.coberturaMeses != null ? fmtQty(item.coberturaMeses) : "\u2014" }),
      /* @__PURE__ */ jsx("dt", { children: "\xDAltima entrada" }),
      /* @__PURE__ */ jsx("dd", { children: fmtDate(item.ultimaEntrada) }),
      /* @__PURE__ */ jsx("dt", { children: "Quantidade sugerida" }),
      /* @__PURE__ */ jsx("dd", { children: fmtQty(item.qtdSugerida) }),
      /* @__PURE__ */ jsx("dt", { children: "Prioridade" }),
      /* @__PURE__ */ jsx("dd", { children: /* @__PURE__ */ jsx("span", { className: `gm-prioridade ${prio.className}`, children: prio.label }) }),
      /* @__PURE__ */ jsx("dt", { children: "Pre\xE7o m\xE9dio" }),
      /* @__PURE__ */ jsx("dd", { children: fmtMoney(item.precoMedio) }),
      /* @__PURE__ */ jsx("dt", { children: "Quantidade pendente de entrega" }),
      /* @__PURE__ */ jsx("dd", { children: fmtQty(item.quantidadePendenteEntrega) })
    ] }) })
  ] });
}
function IndicadoresGestaoMateriais() {
  const defaults = useMemo(() => defaultRange(), []);
  const [dataInicio, setDataInicio] = useState(defaults.from);
  const [dataFim, setDataFim] = useState(defaults.to);
  const [tipos, setTipos] = useState([]);
  const [almoxarifado, setAlmoxarifado] = useState("");
  const [materiaisSelecionados, setMateriaisSelecionados] = useState(() => /* @__PURE__ */ new Set());
  const [buscaMaterial, setBuscaMaterial] = useState("");
  const [mesesEstoque, setMesesEstoque] = useState("12");
  const [data, setData] = useState(null);
  const [opcoes, setOpcoes] = useState(null);
  const [opcoesLoading, setOpcoesLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [consultado, setConsultado] = useState(false);
  const [collapsed, setCollapsed] = useState(/* @__PURE__ */ new Set());
  const [selected, setSelected] = useState(null);
  const [detailOpen, setDetailOpen] = useState(true);
  const [sort, setSort] = useState({ key: "descricao", dir: "asc" });
  useEffect(() => {
    let active = true;
    api.indicadoresGestaoMateriaisOpcoes().then(
      (result) => {
        if (active) setOpcoes(result);
      },
      () => void 0
    ).finally(() => {
      if (active) setOpcoesLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);
  const load = useCallback(async () => {
    try {
      setLoading(true);
      setErr(null);
      const result = await api.indicadoresGestaoMateriais({
        dataInicio,
        dataFim,
        tipos: tipos.length ? tipos : void 0,
        almoxarifado: extractLeadingCode(almoxarifado) || void 0,
        codMateriais: [...materiaisSelecionados],
        mesesEstoque: mesesEstoque || void 0
      });
      setData(result);
      setConsultado(true);
      setCollapsed(/* @__PURE__ */ new Set());
      setSelected(null);
    } catch (e) {
      setData(null);
      setConsultado(true);
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [dataInicio, dataFim, tipos, almoxarifado, materiaisSelecionados, mesesEstoque]);
  useReportAutoRefresh(() => {
    if (consultado && !loading) void load();
  });
  const tiposLabel = tipos.length ? `${tipos.length} selecionado(s)` : "Todos";
  const materiaisFiltro = data?.materiais ?? opcoes?.materiais ?? [];
  const materiaisEncontrados = useMemo(
    () => materiaisFiltro.filter((row) => !buscaMaterial.trim() || `${row.codigo} ${row.descricao}`.toLocaleLowerCase("pt-BR").includes(buscaMaterial.trim().toLocaleLowerCase("pt-BR"))).slice(0, 150),
    [buscaMaterial, materiaisFiltro]
  );
  function alternarMaterial(codigo) {
    setMateriaisSelecionados((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(codigo)) proximo.delete(codigo);
      else proximo.add(codigo);
      return proximo;
    });
  }
  const gruposOrdenados = useMemo(
    () => (data?.grupos ?? []).map((grupo) => ({
      ...grupo,
      itens: [...grupo.itens].sort((a, b) => compareItems(a, b, sort))
    })),
    [data, sort]
  );
  function toggleTipo(name) {
    setTipos((current) => current.includes(name) ? current.filter((item) => item !== name) : [...current, name]);
  }
  function toggleGroup(key) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  function sortBy(key) {
    setSort((current) => current.key === key ? { key, dir: current.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" });
  }
  function SortHeader({ label, sortKey, className }) {
    const active = sort.key === sortKey;
    return /* @__PURE__ */ jsx("th", { className, "aria-sort": active ? sort.dir === "asc" ? "ascending" : "descending" : "none", children: /* @__PURE__ */ jsxs("button", { type: "button", className: "gm-sort-btn", onClick: () => sortBy(sortKey), children: [
      /* @__PURE__ */ jsx("span", { children: label }),
      /* @__PURE__ */ jsx("span", { className: "gm-sort-indicator", children: active ? sort.dir === "asc" ? "\u25B2" : "\u25BC" : "\u2195" })
    ] }) });
  }
  return /* @__PURE__ */ jsxs("section", { className: "panel gm-report print-report-intro", children: [
    /* @__PURE__ */ jsxs("h3", { className: "no-print", children: [
      "Gest\xE3o de materiais",
      data?.grupos.length ? /* @__PURE__ */ jsx("span", { className: "panel-h3-actions", children: /* @__PURE__ */ jsx(PrintButton, {}) }) : null
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "gm-filters no-print", children: [
      /* @__PURE__ */ jsxs("label", { children: [
        /* @__PURE__ */ jsx("span", { children: "Per\xEDodo entrada" }),
        /* @__PURE__ */ jsxs("div", { className: "gm-date-range", children: [
          /* @__PURE__ */ jsx("input", { type: "date", value: dataInicio, onChange: (e) => setDataInicio(e.target.value) }),
          /* @__PURE__ */ jsx("input", { type: "date", value: dataFim, onChange: (e) => setDataFim(e.target.value) })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("label", { children: [
        /* @__PURE__ */ jsx("span", { children: "Tipo material" }),
        /* @__PURE__ */ jsx(
          "input",
          {
            list: "gm-tipo-material-options",
            value: tipos.length === 1 ? tipos[0] : tipos.length ? tiposLabel : "",
            onChange: (e) => setTipos(e.target.value.trim() ? [e.target.value] : []),
            placeholder: "Todos"
          }
        ),
        /* @__PURE__ */ jsx("datalist", { id: "gm-tipo-material-options", children: TIPOS.map((t) => /* @__PURE__ */ jsx("option", { value: t }, t)) })
      ] }),
      /* @__PURE__ */ jsxs("label", { children: [
        /* @__PURE__ */ jsx("span", { children: "Almoxarifado" }),
        /* @__PURE__ */ jsx(
          "input",
          {
            list: "gm-almoxarifado-options",
            value: almoxarifado,
            onChange: (e) => setAlmoxarifado(e.target.value),
            placeholder: "Todos"
          }
        ),
        /* @__PURE__ */ jsx("datalist", { id: "gm-almoxarifado-options", children: (data?.almoxarifados ?? opcoes?.almoxarifados ?? []).map((row) => /* @__PURE__ */ jsx("option", { value: `${row.codigo} \u2014 ${row.descricao}` }, row.codigo)) })
      ] }),
      /* @__PURE__ */ jsxs("label", { className: "gm-material-filter", children: [
        /* @__PURE__ */ jsx("span", { children: "Material" }),
        /* @__PURE__ */ jsxs("details", { className: "gm-material-picker", children: [
          /* @__PURE__ */ jsx("summary", { children: materiaisSelecionados.size ? `${materiaisSelecionados.size} selecionado(s)` : "Todos os materiais" }),
          /* @__PURE__ */ jsxs("div", { className: "gm-material-picker-popover", children: [
            /* @__PURE__ */ jsx(
              "input",
              {
                type: "search",
                value: buscaMaterial,
                onChange: (e) => setBuscaMaterial(e.target.value),
                placeholder: opcoesLoading ? "Carregando materiais\u2026" : "Buscar c\xF3digo ou descri\xE7\xE3o"
              }
            ),
            /* @__PURE__ */ jsxs("div", { className: "gm-material-picker-actions", children: [
              /* @__PURE__ */ jsx("button", { type: "button", onClick: () => setMateriaisSelecionados(/* @__PURE__ */ new Set()), children: "Limpar sele\xE7\xE3o" }),
              /* @__PURE__ */ jsxs("span", { children: [
                materiaisSelecionados.size,
                " selecionado(s)"
              ] })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "gm-material-picker-list", role: "listbox", "aria-label": "Materiais dispon\xEDveis", children: [
              materiaisEncontrados.map((row) => /* @__PURE__ */ jsxs("label", { children: [
                /* @__PURE__ */ jsx("input", { type: "checkbox", checked: materiaisSelecionados.has(row.codigo), onChange: () => alternarMaterial(row.codigo) }),
                /* @__PURE__ */ jsx("strong", { children: row.codigo }),
                " \u2014 ",
                row.descricao
              ] }, row.codigo)),
              !opcoesLoading && !materiaisEncontrados.length ? /* @__PURE__ */ jsx("span", { children: "Nenhum material encontrado." }) : null
            ] })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("label", { children: [
        /* @__PURE__ */ jsx("span", { children: "Meses de estoque" }),
        /* @__PURE__ */ jsx(
          "input",
          {
            type: "number",
            min: 1,
            max: 60,
            value: mesesEstoque,
            onChange: (e) => setMesesEstoque(e.target.value)
          }
        )
      ] }),
      /* @__PURE__ */ jsx("div", { className: "gm-filter-actions", children: /* @__PURE__ */ jsx("button", { type: "button", className: "btn primary", disabled: loading, onClick: () => void load(), children: loading ? "Consultando\u2026" : "Consultar" }) })
    ] }),
    /* @__PURE__ */ jsx(ConsultaProgressBar, { active: loading, label: "Consultando gest\xE3o de materiais\u2026", className: "consulta-progress--compact" }),
    /* @__PURE__ */ jsxs("div", { className: "kind-toggle no-print gm-tipos-toggle", children: [
      TIPOS.map((name) => /* @__PURE__ */ jsx(
        "button",
        {
          type: "button",
          className: `btn${tipos.includes(name) ? " primary" : ""}`,
          onClick: () => toggleTipo(name),
          children: name
        },
        name
      )),
      /* @__PURE__ */ jsx("button", { type: "button", className: `btn${!tipos.length ? " primary" : ""}`, onClick: () => setTipos([]), children: "Todos" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "gm-legend no-print", children: [
      /* @__PURE__ */ jsx("strong", { children: "Legenda:" }),
      /* @__PURE__ */ jsxs("span", { children: [
        /* @__PURE__ */ jsx("i", { className: "gm-dot gm-prio-critico" }),
        " CR\xCDTICO = estoque zero ou < 1 m\xEAs"
      ] }),
      /* @__PURE__ */ jsxs("span", { children: [
        /* @__PURE__ */ jsx("i", { className: "gm-dot gm-prio-alto" }),
        " ALTO = 1\u20132 meses"
      ] }),
      /* @__PURE__ */ jsxs("span", { children: [
        /* @__PURE__ */ jsx("i", { className: "gm-dot gm-prio-medio" }),
        " M\xC9DIO = 2\u20133 meses"
      ] }),
      /* @__PURE__ */ jsxs("span", { children: [
        /* @__PURE__ */ jsx("i", { className: "gm-dot gm-prio-ok" }),
        " OK = > 3 meses"
      ] }),
      /* @__PURE__ */ jsx("span", { children: "Estoque atual = \xFAltimo saldo em material.estoque por material/almoxarifado (quantidade > 0)" }),
      /* @__PURE__ */ jsx("span", { children: "Qtde sugerida = max(0, 4 \xD7 m\xE9dia m\xEAs \u2212 estoque atual)" })
    ] }),
    err ? /* @__PURE__ */ jsx("p", { className: "lead no-print", style: { color: "var(--danger)" }, children: err }) : null,
    /* @__PURE__ */ jsxs("div", { className: "gm-stage", children: [
      detailOpen && selected ? /* @__PURE__ */ jsx(DetalheMaterial, { item: selected, onClose: () => setDetailOpen(false) }) : null,
      !consultado && !loading ? /* @__PURE__ */ jsx("p", { className: "lead", children: "Defina os filtros e clique em Consultar para exibir a gest\xE3o de materiais." }) : null,
      consultado || loading ? /* @__PURE__ */ jsx("div", { className: "table-wrap gm-table-wrap", children: /* @__PURE__ */ jsxs("table", { className: "data gm-table", children: [
        /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { children: [
          /* @__PURE__ */ jsx(SortHeader, { label: "Descri\xE7\xE3o", sortKey: "descricao" }),
          /* @__PURE__ */ jsx(SortHeader, { label: "Sa\xEDda", sortKey: "saida", className: "num" }),
          /* @__PURE__ */ jsx(SortHeader, { label: "M\xE9dia m\xEAs", sortKey: "mediaMes", className: "num" }),
          /* @__PURE__ */ jsx(SortHeader, { label: "Estoque atual", sortKey: "estoqueAtual", className: "num" }),
          /* @__PURE__ */ jsx(SortHeader, { label: "Cobertura (meses)", sortKey: "coberturaMeses", className: "num" }),
          /* @__PURE__ */ jsx(SortHeader, { label: "Qtd. sugerida", sortKey: "qtdSugerida", className: "num" }),
          /* @__PURE__ */ jsx(SortHeader, { label: "Prioridade", sortKey: "prioridade" }),
          /* @__PURE__ */ jsx("th", { className: "num", children: "Qtd. pendente de entrega" })
        ] }) }),
        /* @__PURE__ */ jsxs("tbody", { children: [
          gruposOrdenados.map((grupo) => {
            const open = !collapsed.has(grupo.tipo);
            return /* @__PURE__ */ jsxs(Fragment, { children: [
              /* @__PURE__ */ jsx("tr", { className: "gm-group-row", onClick: () => toggleGroup(grupo.tipo), children: /* @__PURE__ */ jsxs("td", { colSpan: 8, children: [
                /* @__PURE__ */ jsxs("strong", { children: [
                  open ? "[\u2212]" : "[+]",
                  " ",
                  grupo.label
                ] }),
                /* @__PURE__ */ jsxs("span", { className: "gm-group-totals", children: [
                  fmtQty(grupo.totais.saida),
                  " \xB7 ",
                  fmtQty(grupo.totais.estoqueAtual),
                  " est."
                ] })
              ] }) }),
              open ? grupo.itens.map((item) => {
                const prio = PRIORIDADE_META[item.prioridade];
                const isSelected = selected?.codMaterial === item.codMaterial;
                return /* @__PURE__ */ jsxs(
                  "tr",
                  {
                    className: `gm-item-row${isSelected ? " is-selected" : ""}`,
                    onClick: () => {
                      setSelected(item);
                      setDetailOpen(true);
                    },
                    children: [
                      /* @__PURE__ */ jsx("td", { children: materialLabel(item) }),
                      /* @__PURE__ */ jsx("td", { className: "num", children: fmtQty(item.saida) }),
                      /* @__PURE__ */ jsx("td", { className: "num", children: fmtQty(item.mediaMes) }),
                      /* @__PURE__ */ jsx("td", { className: "num", children: fmtQty(item.estoqueAtual) }),
                      /* @__PURE__ */ jsx("td", { className: "num", children: item.coberturaMeses != null ? fmtQty(item.coberturaMeses) : "\u2014" }),
                      /* @__PURE__ */ jsx("td", { className: "num", children: fmtQty(item.qtdSugerida) }),
                      /* @__PURE__ */ jsx("td", { children: /* @__PURE__ */ jsx("span", { className: `gm-prioridade ${prio.className}`, children: prio.label }) }),
                      /* @__PURE__ */ jsx("td", { className: `num${item.quantidadePendenteEntrega > 0 ? " gm-pendente-entrega" : ""}`, children: fmtQty(item.quantidadePendenteEntrega) })
                    ]
                  },
                  item.codMaterial
                );
              }) : null
            ] }, grupo.tipo);
          }),
          data?.totais ? /* @__PURE__ */ jsxs("tr", { className: "gm-total-row", children: [
            /* @__PURE__ */ jsx("td", { children: /* @__PURE__ */ jsx("strong", { children: "Total" }) }),
            /* @__PURE__ */ jsx("td", { className: "num", children: /* @__PURE__ */ jsx("strong", { children: fmtQty(data.totais.saida) }) }),
            /* @__PURE__ */ jsx("td", { className: "num", children: /* @__PURE__ */ jsx("strong", { children: fmtQty(data.totais.mediaMes) }) }),
            /* @__PURE__ */ jsx("td", { className: "num", children: /* @__PURE__ */ jsx("strong", { children: fmtQty(data.totais.estoqueAtual) }) }),
            /* @__PURE__ */ jsx("td", {}),
            /* @__PURE__ */ jsx("td", { className: "num", children: /* @__PURE__ */ jsx("strong", { children: fmtQty(data.totais.qtdSugerida) }) }),
            /* @__PURE__ */ jsx("td", {}),
            /* @__PURE__ */ jsx("td", {})
          ] }) : null
        ] })
      ] }) }) : null
    ] })
  ] });
}
export {
  IndicadoresGestaoMateriais
};
