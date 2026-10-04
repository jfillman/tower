import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { useState, useMemo, useEffect, useCallback } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import TextField from '@material-ui/core/TextField';
import InputAdornment from '@material-ui/core/InputAdornment';
import SearchIcon from '@material-ui/icons/Search';
import StarIcon from '@material-ui/icons/Star';
import StarBorderIcon from '@material-ui/icons/StarBorder';
import Typography from '@material-ui/core/Typography';
import { ResponseErrorPanel, Progress } from '@backstage/core-components';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { isKubernetesAvailable } from '@backstage/plugin-kubernetes';
import { useApi } from '@backstage/core-plugin-api';
import { stringifyEntityRef } from '@backstage/catalog-model';
import { fontMono, fontDisplay, useHangarTokens } from './brand/tokens.esm.js';
import { HangarMark } from './brand/HangarMark.esm.js';
import { useSearchParams } from 'react-router-dom';
import { ProvisioningStrip } from './provisioning/ProvisioningStrip.esm.js';
import { ProvisioningView } from './provisioning/ProvisioningView.esm.js';
import { useNow, toItems } from './provisioning/shared.esm.js';
import { useProvisioning } from './provisioning/useProvisioning.esm.js';
import { serviceClassOf, deployTargetOf, isTowerService, hasCapabilities, CAP } from './serviceClass.esm.js';

const STORAGE_KEY = "tower.starredApps";
function loadStarred() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw)) : /* @__PURE__ */ new Set();
  } catch {
    return /* @__PURE__ */ new Set();
  }
}
function saveStarred(starred) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...starred]));
  } catch {
  }
}
function useStarredApps() {
  const [starred, setStarred] = useState(() => loadStarred());
  const toggle = useCallback((entityRef) => {
    setStarred((prev) => {
      const next = new Set(prev);
      if (next.has(entityRef)) next.delete(entityRef);
      else next.add(entityRef);
      saveStarred(next);
      return next;
    });
  }, []);
  return { starred, toggle };
}
const VIEW_MODE_KEY = "tower.viewMode";
function loadViewMode() {
  try {
    const raw = localStorage.getItem(VIEW_MODE_KEY);
    return raw === "list" ? "list" : "cards";
  } catch {
    return "cards";
  }
}
const ALL = "all";
const CATALOG_REFRESH_MS = 3e4;
const isListable = (e) => !hasCapabilities(e, [CAP.k8sRuntime]) || isKubernetesAvailable(e);
const useStyles = makeStyles(() => ({
  wrap: { maxWidth: 1080, margin: "0 auto" },
  eyebrow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontFamily: fontMono,
    fontSize: 11,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: ({ t }) => t.textFaint,
    marginBottom: 10
  },
  title: {
    fontFamily: fontDisplay,
    fontWeight: 700,
    fontSize: 32,
    color: ({ t }) => t.textHi,
    marginBottom: 6
  },
  titleRow: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap"
  },
  dashboardLink: {
    fontFamily: fontMono,
    fontSize: 12,
    letterSpacing: "0.03em",
    color: ({ t }) => t.sky,
    background: "none",
    border: "none",
    padding: 0,
    cursor: "pointer",
    "&:hover": { textDecoration: "underline" }
  },
  sub: { fontSize: 14, color: ({ t }) => t.textLo, marginBottom: 24 },
  search: { marginBottom: 20 },
  list: {
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 5,
    overflow: "hidden",
    backgroundColor: ({ t }) => t.panel
  },
  row: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "13px 18px",
    borderBottom: ({ t }) => `1px solid ${t.lineSoft}`,
    cursor: "pointer",
    "&:last-child": { borderBottom: "none" },
    "&:hover": { backgroundColor: ({ t }) => t.panelAlt }
  },
  name: {
    fontFamily: fontDisplay,
    fontWeight: 600,
    fontSize: 15,
    color: ({ t }) => t.textHi
  },
  meta: { fontFamily: fontMono, fontSize: 11.5, color: ({ t }) => t.textFaint },
  empty: {
    padding: "24px 18px",
    fontSize: 13,
    color: ({ t }) => t.textLo,
    fontStyle: "italic"
  },
  rowMain: { display: "flex", alignItems: "center", gap: 12, minWidth: 0 },
  // Always rendered above the search box's own (filterable) list - starred
  // apps stay one click away regardless of what's typed into search
  // (2026-09-12: "stared resources are always fixed and visible to
  // select").
  starredSection: { marginBottom: 20 },
  starredLabel: {
    fontFamily: fontMono,
    fontSize: 10.5,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: ({ t }) => t.textFaint,
    marginBottom: 8
  },
  starBtn: {
    display: "inline-flex",
    background: "none",
    border: "none",
    padding: 4,
    margin: -4,
    cursor: "pointer",
    color: ({ t }) => t.textFaint,
    flexShrink: 0,
    "&:hover": { color: ({ t }) => t.amberInk }
  },
  starBtnActive: { color: ({ t }) => t.amberInk },
  tabs: {
    display: "flex",
    gap: 2,
    borderBottom: ({ t }) => `1px solid ${t.line}`,
    marginBottom: 20
  },
  tab: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "9px 16px",
    background: "none",
    border: "none",
    borderBottom: "2px solid transparent",
    marginBottom: -1,
    cursor: "pointer",
    fontFamily: fontDisplay,
    fontWeight: 600,
    fontSize: 14,
    color: ({ t }) => t.textLo,
    "&:hover": { color: ({ t }) => t.textHi }
  },
  tabOn: { color: ({ t }) => t.textHi, borderBottomColor: ({ t }) => t.amber },
  tabBadge: {
    fontFamily: fontMono,
    fontSize: 11,
    fontWeight: 600,
    padding: "1px 7px",
    borderRadius: 10,
    backgroundColor: ({ t }) => t.amber,
    color: ({ t }) => t.bg
  },
  toolbar: {
    display: "flex",
    gap: 12,
    alignItems: "center",
    flexWrap: "wrap",
    marginBottom: 20
  },
  searchGrow: { flex: "1 1 240px", minWidth: 200 },
  segment: {
    display: "inline-flex",
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 5,
    overflow: "hidden",
    backgroundColor: ({ t }) => t.panel,
    flexShrink: 0
  },
  segBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    background: "none",
    border: "none",
    borderRight: ({ t }) => `1px solid ${t.line}`,
    padding: "8px 14px",
    cursor: "pointer",
    fontSize: 13,
    color: ({ t }) => t.textLo,
    "&:last-child": { borderRight: "none" },
    "&:hover": { color: ({ t }) => t.textHi }
  },
  segBtnActive: {
    color: ({ t }) => t.textHi,
    backgroundColor: ({ t }) => t.panelAlt,
    boxShadow: ({ t }) => `inset 0 -2px 0 ${t.amber}`
  },
  segCount: {
    fontFamily: fontMono,
    fontSize: 11,
    color: ({ t }) => t.textFaint
  },
  sectionHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    marginBottom: 8
  },
  sectionLabel: {
    fontFamily: fontMono,
    fontSize: 10.5,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: ({ t }) => t.textFaint
  },
  cards: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
    gap: 12
  },
  card: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    padding: 14,
    minWidth: 0,
    cursor: "pointer",
    backgroundColor: ({ t }) => t.panel,
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 5,
    "&:hover": { backgroundColor: ({ t }) => t.panelAlt }
  },
  cardTop: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8
  },
  cardDesc: {
    fontSize: 12.5,
    color: ({ t }) => t.textLo,
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
    minHeight: 36
  },
  cardFoot: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8
  },
  typeChip: {
    display: "inline-flex",
    fontFamily: fontMono,
    fontSize: 11,
    padding: "3px 7px",
    borderRadius: 4,
    whiteSpace: "nowrap",
    border: ({ t }) => `1px solid ${t.line}`,
    color: ({ t }) => t.textLo
  },
  typeChipAi: { color: ({ t }) => t.sky, borderColor: ({ t }) => t.skyLine },
  tableWrap: {
    overflowX: "auto",
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 5,
    backgroundColor: ({ t }) => t.panel
  },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: {
    textAlign: "left",
    padding: "8px 12px",
    fontFamily: fontMono,
    fontSize: 10.5,
    fontWeight: 500,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: ({ t }) => t.textFaint,
    borderBottom: ({ t }) => `1px solid ${t.line}`,
    whiteSpace: "nowrap"
  },
  tr: {
    cursor: "pointer",
    "&:hover": { backgroundColor: ({ t }) => t.panelAlt },
    "&:last-child td": { borderBottom: "none" }
  },
  td: {
    padding: "10px 12px",
    borderBottom: ({ t }) => `1px solid ${t.lineSoft}`,
    verticalAlign: "middle",
    color: ({ t }) => t.textLo
  },
  tdDesc: {
    maxWidth: 360,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap"
  }
}));
function AppPicker({
  onSelect,
  onOpenDashboard
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const catalogApi = useApi(catalogApiRef);
  const [entities, setEntities] = useState(void 0);
  const [error, setError] = useState(void 0);
  const [query, setQuery] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  const provisioning = useProvisioning();
  const now = useNow();
  const provItems = useMemo(() => toItems(provisioning.items, now), [provisioning.items, now]);
  const inFlight = useMemo(() => provItems.filter((i) => !i.derived.stalled), [provItems]);
  const view = searchParams.get("view") === "provisioning" ? "provisioning" : "services";
  const selectedService = searchParams.get("service") ?? void 0;
  const openProvisioning = (name) => setSearchParams(name ? { view: "provisioning", service: name } : { view: "provisioning" });
  const openServices = () => setSearchParams({});
  const [typeFilter, setTypeFilter] = useState(ALL);
  const [providerFilter, setProviderFilter] = useState(ALL);
  const [viewMode, setViewModeState] = useState(() => loadViewMode());
  useEffect(() => {
    let cancelled = false;
    let loaded = false;
    const load = () => catalogApi.getEntities({ filter: { kind: "Component" } }).then((res) => {
      if (cancelled) return;
      loaded = true;
      setError(void 0);
      setEntities(res.items.filter(isTowerService).filter(isListable));
    }).catch((e) => {
      if (!cancelled && !loaded) setError(String(e));
    });
    load();
    const id = setInterval(load, CATALOG_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [catalogApi]);
  const { starred, toggle: toggleStarred } = useStarredApps();
  const setViewMode = (mode) => {
    setViewModeState(mode);
    try {
      localStorage.setItem(VIEW_MODE_KEY, mode);
    } catch {
    }
  };
  const classChips = useMemo(() => {
    const byId = /* @__PURE__ */ new Map();
    for (const e of entities ?? []) {
      const c = serviceClassOf(e);
      const chip = byId.get(c.id) ?? { id: c.id, label: c.labelPlural, count: 0 };
      chip.count += 1;
      byId.set(c.id, chip);
    }
    return [...byId.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }, [entities]);
  const providerChips = useMemo(() => {
    const byId = /* @__PURE__ */ new Map();
    for (const e of entities ?? []) {
      const p = deployTargetOf(e)?.provider;
      if (p) byId.set(p, (byId.get(p) ?? 0) + 1);
    }
    return byId.size > 1 ? [...byId.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])) : [];
  }, [entities]);
  const matchesFilters = useCallback(
    (e) => (typeFilter === ALL || serviceClassOf(e).id === typeFilter) && (providerFilter === ALL || deployTargetOf(e)?.provider === providerFilter),
    [typeFilter, providerFilter]
  );
  const filtered = useMemo(() => {
    if (!entities) return [];
    const q = query.trim().toLowerCase();
    const list = entities.filter((e) => {
      if (!matchesFilters(e)) return false;
      if (!q) return true;
      return e.metadata.name.toLowerCase().includes(q) || (e.metadata.title ?? "").toLowerCase().includes(q) || (e.metadata.description ?? "").toLowerCase().includes(q);
    });
    return [...list].sort((a, b) => a.metadata.name.localeCompare(b.metadata.name));
  }, [entities, query, matchesFilters]);
  const starredEntities = useMemo(
    () => (entities ?? []).filter((e) => starred.has(stringifyEntityRef(e)) && matchesFilters(e)).sort((a, b) => a.metadata.name.localeCompare(b.metadata.name)),
    [entities, starred, matchesFilters]
  );
  const filteredMinusStarred = filtered.filter((e) => !starred.has(stringifyEntityRef(e)));
  if (error) return /* @__PURE__ */ jsx(ResponseErrorPanel, { error: new Error(error) });
  const activate = (ref) => ({
    role: "button",
    tabIndex: 0,
    onClick: () => onSelect(ref),
    onKeyDown: (ev) => {
      if (ev.target === ev.currentTarget && (ev.key === "Enter" || ev.key === " ")) {
        ev.preventDefault();
        onSelect(ref);
      }
    }
  });
  const renderStar = (ref) => {
    const isStarred = starred.has(ref);
    return /* @__PURE__ */ jsx(
      "button",
      {
        type: "button",
        className: `${classes.starBtn} ${isStarred ? classes.starBtnActive : ""}`,
        title: isStarred ? "Unstar" : "Star",
        "aria-pressed": isStarred,
        "aria-label": `${isStarred ? "Unstar" : "Star"} ${ref}`,
        onClick: (ev) => {
          ev.stopPropagation();
          toggleStarred(ref);
        },
        children: isStarred ? /* @__PURE__ */ jsx(StarIcon, { fontSize: "small" }) : /* @__PURE__ */ jsx(StarBorderIcon, { fontSize: "small" })
      }
    );
  };
  const renderTypeChip = (e) => {
    const cls = serviceClassOf(e);
    const target = deployTargetOf(e);
    return /* @__PURE__ */ jsxs("span", { className: `${classes.typeChip} ${cls.id === "ai-workload" ? classes.typeChipAi : ""}`, children: [
      cls.label,
      target && target.id !== "k8s-rollout" ? ` \xB7 ${target.label}` : ""
    ] });
  };
  const renderCard = (e) => {
    const ref = stringifyEntityRef(e);
    return /* @__PURE__ */ jsxs("div", { className: classes.card, ...activate(ref), children: [
      /* @__PURE__ */ jsxs("div", { className: classes.cardTop, children: [
        /* @__PURE__ */ jsx("div", { className: classes.name, children: e.metadata.title ?? e.metadata.name }),
        renderStar(ref)
      ] }),
      /* @__PURE__ */ jsx("div", { className: classes.cardDesc, children: e.metadata.description }),
      /* @__PURE__ */ jsxs("div", { className: classes.cardFoot, children: [
        renderTypeChip(e),
        /* @__PURE__ */ jsx("span", { className: classes.meta, children: e.spec?.owner })
      ] })
    ] }, ref);
  };
  const renderTable = (list) => /* @__PURE__ */ jsx("div", { className: classes.tableWrap, children: /* @__PURE__ */ jsxs("table", { className: classes.table, children: [
    /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { children: [
      /* @__PURE__ */ jsx("th", { className: classes.th, style: { width: 40 }, "aria-label": "Starred" }),
      /* @__PURE__ */ jsx("th", { className: classes.th, children: "Service" }),
      /* @__PURE__ */ jsx("th", { className: classes.th, children: "Type" }),
      /* @__PURE__ */ jsx("th", { className: classes.th, children: "Owner" }),
      /* @__PURE__ */ jsx("th", { className: classes.th, children: "Description" })
    ] }) }),
    /* @__PURE__ */ jsx("tbody", { children: list.map((e) => {
      const ref = stringifyEntityRef(e);
      return /* @__PURE__ */ jsxs("tr", { className: classes.tr, ...activate(ref), children: [
        /* @__PURE__ */ jsx("td", { className: classes.td, children: renderStar(ref) }),
        /* @__PURE__ */ jsx("td", { className: classes.td, children: /* @__PURE__ */ jsx("span", { className: classes.name, children: e.metadata.title ?? e.metadata.name }) }),
        /* @__PURE__ */ jsx("td", { className: classes.td, children: renderTypeChip(e) }),
        /* @__PURE__ */ jsx("td", { className: `${classes.td} ${classes.meta}`, children: e.spec?.owner }),
        /* @__PURE__ */ jsx("td", { className: `${classes.td} ${classes.tdDesc}`, children: e.metadata.description })
      ] }, ref);
    }) })
  ] }) });
  let emptyMessage = "Every match is already starred above.";
  if (filtered.length === 0) {
    if (query.trim()) emptyMessage = `No services match "${query}".`;
    else if (typeFilter === ALL && providerFilter === ALL) emptyMessage = "No services yet.";
    else emptyMessage = "No services match these filters.";
  }
  const renderCollection = (list) => viewMode === "cards" ? /* @__PURE__ */ jsx("div", { className: classes.cards, children: list.map(renderCard) }) : renderTable(list);
  return /* @__PURE__ */ jsxs("div", { className: classes.wrap, children: [
    /* @__PURE__ */ jsxs(Typography, { className: classes.eyebrow, children: [
      /* @__PURE__ */ jsx(HangarMark, { glyph: "tower", size: 16 }),
      "Tower"
    ] }),
    /* @__PURE__ */ jsxs("div", { className: classes.titleRow, children: [
      /* @__PURE__ */ jsx(Typography, { className: classes.title, children: "Services" }),
      /* @__PURE__ */ jsx("button", { className: classes.dashboardLink, onClick: onOpenDashboard, type: "button", children: "Fleet Dashboard \u2192" })
    ] }),
    /* @__PURE__ */ jsx(Typography, { className: classes.sub, children: "Everything running on Hangar. Select a service to open its tabs." }),
    /* @__PURE__ */ jsxs("div", { className: classes.tabs, role: "tablist", "aria-label": "Services sections", children: [
      /* @__PURE__ */ jsx(
        "button",
        {
          type: "button",
          role: "tab",
          "aria-selected": view === "services",
          className: `${classes.tab} ${view === "services" ? classes.tabOn : ""}`,
          onClick: openServices,
          children: "Services"
        }
      ),
      /* @__PURE__ */ jsxs(
        "button",
        {
          type: "button",
          role: "tab",
          "aria-selected": view === "provisioning",
          className: `${classes.tab} ${view === "provisioning" ? classes.tabOn : ""}`,
          onClick: () => openProvisioning(),
          children: [
            "Provisioning",
            inFlight.length > 0 && /* @__PURE__ */ jsx("span", { className: classes.tabBadge, children: inFlight.length })
          ]
        }
      )
    ] }),
    view === "provisioning" ? /* @__PURE__ */ jsx(
      ProvisioningView,
      {
        items: provItems,
        selected: selectedService,
        onSelect: openProvisioning,
        error: provisioning.error,
        loading: provisioning.loading
      }
    ) : /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx(ProvisioningStrip, { items: inFlight, onOpen: openProvisioning }),
      /* @__PURE__ */ jsxs("div", { className: classes.toolbar, children: [
        /* @__PURE__ */ jsx("div", { className: classes.segment, role: "group", "aria-label": "Workload type", children: [{ id: ALL, label: "All", count: entities?.length }, ...classChips.map((c) => ({ ...c }))].map((f) => /* @__PURE__ */ jsxs(
          "button",
          {
            type: "button",
            "aria-pressed": typeFilter === f.id,
            className: `${classes.segBtn} ${typeFilter === f.id ? classes.segBtnActive : ""}`,
            onClick: () => setTypeFilter(f.id),
            children: [
              f.label,
              /* @__PURE__ */ jsx("span", { className: classes.segCount, children: entities ? f.count : "" })
            ]
          },
          f.id
        )) }),
        providerChips.length > 0 && /* @__PURE__ */ jsx("div", { className: classes.segment, role: "group", "aria-label": "Runs on", children: [[ALL, entities?.length ?? 0], ...providerChips].map(([id, count]) => /* @__PURE__ */ jsxs(
          "button",
          {
            type: "button",
            "aria-pressed": providerFilter === id,
            className: `${classes.segBtn} ${providerFilter === id ? classes.segBtnActive : ""}`,
            onClick: () => setProviderFilter(id),
            children: [
              id === ALL ? "Anywhere" : id,
              /* @__PURE__ */ jsx("span", { className: classes.segCount, children: count })
            ]
          },
          id
        )) }),
        /* @__PURE__ */ jsx(
          TextField,
          {
            className: classes.searchGrow,
            variant: "outlined",
            size: "small",
            placeholder: "Search services\u2026",
            value: query,
            onChange: (e) => setQuery(e.target.value),
            InputProps: {
              startAdornment: /* @__PURE__ */ jsx(InputAdornment, { position: "start", children: /* @__PURE__ */ jsx(SearchIcon, { fontSize: "small", style: { color: t.textFaint } }) })
            }
          }
        )
      ] }),
      !entities ? /* @__PURE__ */ jsx(Progress, {}) : /* @__PURE__ */ jsxs(Fragment, { children: [
        starredEntities.length > 0 && /* @__PURE__ */ jsxs("div", { className: classes.starredSection, children: [
          /* @__PURE__ */ jsx("div", { className: classes.starredLabel, children: "Starred" }),
          renderCollection(starredEntities)
        ] }),
        /* @__PURE__ */ jsxs("div", { className: classes.sectionHead, children: [
          /* @__PURE__ */ jsxs("span", { className: classes.sectionLabel, children: [
            "All services \xB7 ",
            filteredMinusStarred.length
          ] }),
          /* @__PURE__ */ jsx("div", { className: classes.segment, role: "group", "aria-label": "View", children: ["cards", "list"].map((mode) => /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              "aria-pressed": viewMode === mode,
              className: `${classes.segBtn} ${viewMode === mode ? classes.segBtnActive : ""}`,
              onClick: () => setViewMode(mode),
              children: mode === "cards" ? "Cards" : "List"
            },
            mode
          )) })
        ] }),
        filteredMinusStarred.length === 0 ? /* @__PURE__ */ jsx("div", { className: classes.list, children: /* @__PURE__ */ jsx("div", { className: classes.empty, children: emptyMessage }) }) : renderCollection(filteredMinusStarred)
      ] })
    ] })
  ] });
}

export { AppPicker, CATALOG_REFRESH_MS };
//# sourceMappingURL=AppPicker.esm.js.map
