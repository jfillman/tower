import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { useState, useEffect, useMemo, useCallback } from 'react';
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
const useStyles = makeStyles(() => ({
  wrap: { maxWidth: 720, margin: "0 auto" },
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
  title: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 32, color: ({ t }) => t.textHi, marginBottom: 6 },
  titleRow: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" },
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
  list: { border: ({ t }) => `1px solid ${t.line}`, borderRadius: 5, overflow: "hidden", backgroundColor: ({ t }) => t.panel },
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
  name: { fontFamily: fontDisplay, fontWeight: 600, fontSize: 15, color: ({ t }) => t.textHi },
  meta: { fontFamily: fontMono, fontSize: 11.5, color: ({ t }) => t.textFaint },
  empty: { padding: "24px 18px", fontSize: 13, color: ({ t }) => t.textLo, fontStyle: "italic" },
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
  starBtnActive: { color: ({ t }) => t.amberInk }
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
  useEffect(() => {
    let cancelled = false;
    catalogApi.getEntities({ filter: { kind: "Component" } }).then((res) => {
      if (!cancelled) setEntities(res.items.filter(isKubernetesAvailable));
    }).catch((e) => {
      if (!cancelled) setError(String(e));
    });
    return () => {
      cancelled = true;
    };
  }, [catalogApi]);
  const { starred, toggle: toggleStarred } = useStarredApps();
  const filtered = useMemo(() => {
    if (!entities) return [];
    const q = query.trim().toLowerCase();
    const list = q ? entities.filter(
      (e) => e.metadata.name.toLowerCase().includes(q) || (e.metadata.title ?? "").toLowerCase().includes(q) || (e.metadata.description ?? "").toLowerCase().includes(q)
    ) : entities;
    return [...list].sort((a, b) => a.metadata.name.localeCompare(b.metadata.name));
  }, [entities, query]);
  const starredEntities = useMemo(
    () => (entities ?? []).filter((e) => starred.has(stringifyEntityRef(e))).sort((a, b) => a.metadata.name.localeCompare(b.metadata.name)),
    [entities, starred]
  );
  const filteredMinusStarred = filtered.filter((e) => !starred.has(stringifyEntityRef(e)));
  if (error) return /* @__PURE__ */ jsx(ResponseErrorPanel, { error: new Error(error) });
  const renderRow = (e) => {
    const ref = stringifyEntityRef(e);
    const isStarred = starred.has(ref);
    return /* @__PURE__ */ jsxs(
      "div",
      {
        className: classes.row,
        role: "button",
        tabIndex: 0,
        onClick: () => onSelect(ref),
        onKeyDown: (ev) => {
          if (ev.key === "Enter" || ev.key === " ") {
            ev.preventDefault();
            onSelect(ref);
          }
        },
        children: [
          /* @__PURE__ */ jsxs("div", { className: classes.rowMain, children: [
            /* @__PURE__ */ jsx(
              "button",
              {
                type: "button",
                className: `${classes.starBtn} ${isStarred ? classes.starBtnActive : ""}`,
                title: isStarred ? "Unstar" : "Star",
                onClick: (ev) => {
                  ev.stopPropagation();
                  toggleStarred(ref);
                },
                children: isStarred ? /* @__PURE__ */ jsx(StarIcon, { fontSize: "small" }) : /* @__PURE__ */ jsx(StarBorderIcon, { fontSize: "small" })
              }
            ),
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("div", { className: classes.name, children: e.metadata.title ?? e.metadata.name }),
              e.metadata.description && /* @__PURE__ */ jsx("div", { className: classes.meta, children: e.metadata.description })
            ] })
          ] }),
          /* @__PURE__ */ jsx("div", { className: classes.meta, children: e.spec?.owner })
        ]
      },
      ref
    );
  };
  return /* @__PURE__ */ jsxs("div", { className: classes.wrap, children: [
    /* @__PURE__ */ jsxs(Typography, { className: classes.eyebrow, children: [
      /* @__PURE__ */ jsx(HangarMark, { glyph: "tower", size: 16 }),
      "Tower"
    ] }),
    /* @__PURE__ */ jsxs("div", { className: classes.titleRow, children: [
      /* @__PURE__ */ jsx(Typography, { className: classes.title, children: "Choose an application" }),
      /* @__PURE__ */ jsx("button", { className: classes.dashboardLink, onClick: onOpenDashboard, type: "button", children: "Fleet Dashboard \u2192" })
    ] }),
    /* @__PURE__ */ jsx(Typography, { className: classes.sub, children: "Releases, topology, pull requests, images, config and SLOs for one app, all in one place." }),
    /* @__PURE__ */ jsx(
      TextField,
      {
        className: classes.search,
        fullWidth: true,
        variant: "outlined",
        size: "small",
        placeholder: "Search applications\u2026",
        value: query,
        onChange: (e) => setQuery(e.target.value),
        InputProps: {
          startAdornment: /* @__PURE__ */ jsx(InputAdornment, { position: "start", children: /* @__PURE__ */ jsx(SearchIcon, { fontSize: "small", style: { color: t.textFaint } }) })
        }
      }
    ),
    !entities ? /* @__PURE__ */ jsx(Progress, {}) : /* @__PURE__ */ jsxs(Fragment, { children: [
      starredEntities.length > 0 && /* @__PURE__ */ jsxs("div", { className: classes.starredSection, children: [
        /* @__PURE__ */ jsx("div", { className: classes.starredLabel, children: "Starred" }),
        /* @__PURE__ */ jsx("div", { className: classes.list, children: starredEntities.map(renderRow) })
      ] }),
      /* @__PURE__ */ jsx("div", { className: classes.list, children: filteredMinusStarred.length === 0 ? /* @__PURE__ */ jsx("div", { className: classes.empty, children: filtered.length === 0 ? `No applications match "${query}".` : "Every match is already starred above." }) : filteredMinusStarred.map(renderRow) })
    ] })
  ] });
}

export { AppPicker };
//# sourceMappingURL=AppPicker.esm.js.map
