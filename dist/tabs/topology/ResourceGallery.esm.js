import { jsxs, jsx, Fragment } from 'react/jsx-runtime';
import { useState, useEffect } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import Collapse from '@material-ui/core/Collapse';
import DescriptionIcon from '@material-ui/icons/Description';
import LockIcon from '@material-ui/icons/Lock';
import SettingsIcon from '@material-ui/icons/Settings';
import LayersIcon from '@material-ui/icons/Layers';
import DeviceHubIcon from '@material-ui/icons/DeviceHub';
import RouterIcon from '@material-ui/icons/Router';
import AppsIcon from '@material-ui/icons/Apps';
import TrendingUpIcon from '@material-ui/icons/TrendingUp';
import ScheduleIcon from '@material-ui/icons/Schedule';
import StorageIcon from '@material-ui/icons/Storage';
import HelpOutlineIcon from '@material-ui/icons/HelpOutline';
import FolderSpecialIcon from '@material-ui/icons/FolderSpecial';
import AccountBoxIcon from '@material-ui/icons/AccountBox';
import GavelIcon from '@material-ui/icons/Gavel';
import LinkIcon from '@material-ui/icons/Link';
import SecurityIcon from '@material-ui/icons/Security';
import VpnKeyIcon from '@material-ui/icons/VpnKey';
import ShowChartIcon from '@material-ui/icons/ShowChart';
import { fontMono, useHangarTokens } from '../../brand/tokens.esm.js';
import { preventFocusScroll } from '../../preventFocusScroll.esm.js';
import { YamlView } from './YamlView.esm.js';
import { RbacDetailView, RBAC_KINDS } from './RbacDetailView.esm.js';
import { resourceKey } from '../../ResourceInspector.esm.js';
import { StatusChip } from '../../ui/index.esm.js';
import { argoTone } from '../../argoTone.esm.js';

const KIND_ICON = {
  ConfigMap: /* @__PURE__ */ jsx(DescriptionIcon, { fontSize: "inherit" }),
  Secret: /* @__PURE__ */ jsx(LockIcon, { fontSize: "inherit" }),
  HorizontalPodAutoscaler: /* @__PURE__ */ jsx(TrendingUpIcon, { fontSize: "inherit" }),
  PodDisruptionBudget: /* @__PURE__ */ jsx(SettingsIcon, { fontSize: "inherit" }),
  ReplicaSet: /* @__PURE__ */ jsx(LayersIcon, { fontSize: "inherit" }),
  Deployment: /* @__PURE__ */ jsx(LayersIcon, { fontSize: "inherit" }),
  Rollout: /* @__PURE__ */ jsx(LayersIcon, { fontSize: "inherit" }),
  StatefulSet: /* @__PURE__ */ jsx(LayersIcon, { fontSize: "inherit" }),
  DaemonSet: /* @__PURE__ */ jsx(LayersIcon, { fontSize: "inherit" }),
  Service: /* @__PURE__ */ jsx(DeviceHubIcon, { fontSize: "inherit" }),
  Ingress: /* @__PURE__ */ jsx(RouterIcon, { fontSize: "inherit" }),
  HTTPRoute: /* @__PURE__ */ jsx(RouterIcon, { fontSize: "inherit" }),
  Pod: /* @__PURE__ */ jsx(AppsIcon, { fontSize: "inherit" }),
  Job: /* @__PURE__ */ jsx(ScheduleIcon, { fontSize: "inherit" }),
  CronJob: /* @__PURE__ */ jsx(ScheduleIcon, { fontSize: "inherit" }),
  PersistentVolumeClaim: /* @__PURE__ */ jsx(StorageIcon, { fontSize: "inherit" }),
  PersistentVolume: /* @__PURE__ */ jsx(StorageIcon, { fontSize: "inherit" }),
  Namespace: /* @__PURE__ */ jsx(FolderSpecialIcon, { fontSize: "inherit" }),
  ServiceAccount: /* @__PURE__ */ jsx(AccountBoxIcon, { fontSize: "inherit" }),
  Role: /* @__PURE__ */ jsx(GavelIcon, { fontSize: "inherit" }),
  RoleBinding: /* @__PURE__ */ jsx(GavelIcon, { fontSize: "inherit" }),
  NetworkPolicy: /* @__PURE__ */ jsx(SecurityIcon, { fontSize: "inherit" }),
  Endpoints: /* @__PURE__ */ jsx(LinkIcon, { fontSize: "inherit" }),
  ExternalSecret: /* @__PURE__ */ jsx(VpnKeyIcon, { fontSize: "inherit" }),
  ServiceMonitor: /* @__PURE__ */ jsx(ShowChartIcon, { fontSize: "inherit" })
};
function iconFor(kind) {
  return KIND_ICON[kind] ?? /* @__PURE__ */ jsx(HelpOutlineIcon, { fontSize: "inherit" });
}
function argoStatusFor(ref, argoResources) {
  return argoResources?.find((r) => r.kind === ref.kind && r.name === ref.name);
}
const useStyles = makeStyles(() => ({
  toolbar: { display: "flex", alignItems: "center", gap: 10, marginBottom: 4, flexWrap: "wrap" },
  search: {
    fontFamily: fontMono,
    fontSize: 11,
    padding: "5px 9px",
    borderRadius: 4,
    border: ({ t }) => `1px solid ${t.line}`,
    backgroundColor: ({ t }) => t.panel,
    color: ({ t }) => t.textHi,
    flex: "0 1 220px"
  },
  count: { fontFamily: fontMono, fontSize: 10.5, color: ({ t }) => t.textFaint },
  kindGroup: { marginBottom: 12 },
  kindHead: { display: "flex", alignItems: "center", gap: 6, marginBottom: 6, color: ({ t }) => t.textFaint },
  kindIcon: { display: "flex", fontSize: 14 },
  kindLabel: { fontFamily: fontMono, fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.05em" },
  kindCount: { fontFamily: fontMono, fontSize: 10, opacity: 0.7 },
  // auto-fit, not auto-fill - see StageDetail.tsx's serviceGrid comment for
  // why auto-fill leaves a lone item stranded in a narrow column instead of
  // stretching to fill the row.
  cardGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 8 },
  card: {
    textAlign: "left",
    borderRadius: 7,
    border: ({ t }) => `1px solid ${t.lineSoft}`,
    backgroundColor: ({ t }) => t.panelAlt,
    padding: "8px 10px",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    gap: 4,
    "&:hover": { backgroundColor: ({ t }) => t.bg }
  },
  cardSelected: { borderColor: ({ t }) => t.skyLine, backgroundColor: ({ t }) => t.skySoft },
  cardName: { fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.textHi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  cardBadges: { display: "flex", gap: 4, flexWrap: "wrap" },
  detail: { marginTop: 10, padding: "10px 12px", borderRadius: 8, border: ({ t }) => `1px dashed ${t.line}`, backgroundColor: ({ t }) => t.panel },
  none: { fontSize: 12, fontStyle: "italic", color: ({ t }) => t.textFaint },
  detailModeRow: { display: "flex", gap: 6, marginBottom: 10 },
  detailModeBtn: {
    fontFamily: fontMono,
    fontSize: 10.5,
    padding: "3px 9px",
    borderRadius: 3,
    border: ({ t }) => `1px solid ${t.line}`,
    background: "none",
    color: ({ t }) => t.textFaint,
    cursor: "pointer"
  },
  detailModeBtnActive: { color: ({ t }) => t.sky, borderColor: ({ t }) => t.skyLine, backgroundColor: ({ t }) => t.skySoft }
}));
function isRbacKind(kind) {
  return RBAC_KINDS.includes(kind);
}
function ResourceGallery({ resources, argoResources }) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState(null);
  const filtered = resources.filter((r) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return r.name.toLowerCase().includes(q) || r.kind.toLowerCase().includes(q);
  });
  const byKind = /* @__PURE__ */ new Map();
  filtered.forEach((r) => {
    const list = byKind.get(r.kind) ?? [];
    list.push(r);
    byKind.set(r.kind, list);
  });
  const kinds = [...byKind.keys()].sort();
  const selected = selectedKey ? resources.find((r) => resourceKey(r) === selectedKey) : void 0;
  const [detailMode, setDetailMode] = useState("friendly");
  useEffect(() => {
    setDetailMode("friendly");
  }, [selectedKey]);
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsxs("div", { className: classes.toolbar, children: [
      /* @__PURE__ */ jsx("input", { className: classes.search, placeholder: "filter by name or kind\u2026", value: query, onChange: (e) => setQuery(e.target.value) }),
      /* @__PURE__ */ jsxs("span", { className: classes.count, children: [
        filtered.length,
        " of ",
        resources.length,
        " resources"
      ] })
    ] }),
    kinds.length === 0 && /* @__PURE__ */ jsxs(Typography, { className: classes.none, children: [
      'No resources match "',
      query,
      '".'
    ] }),
    kinds.map((kind) => {
      const items = byKind.get(kind) ?? [];
      return /* @__PURE__ */ jsxs("div", { className: classes.kindGroup, children: [
        /* @__PURE__ */ jsxs("div", { className: classes.kindHead, children: [
          /* @__PURE__ */ jsx("span", { className: classes.kindIcon, children: iconFor(kind) }),
          /* @__PURE__ */ jsx("span", { className: classes.kindLabel, children: kind }),
          /* @__PURE__ */ jsxs("span", { className: classes.kindCount, children: [
            "(",
            items.length,
            ")"
          ] })
        ] }),
        /* @__PURE__ */ jsx("div", { className: classes.cardGrid, children: items.map((r) => {
          const key = resourceKey(r);
          const argo = argoStatusFor(r, argoResources);
          const isSelected = selectedKey === key;
          return /* @__PURE__ */ jsxs(
            "button",
            {
              type: "button",
              className: `${classes.card} ${isSelected ? classes.cardSelected : ""}`,
              onMouseDown: preventFocusScroll,
              onClick: () => setSelectedKey(isSelected ? null : key),
              children: [
                /* @__PURE__ */ jsx("span", { className: classes.cardName, title: r.name, children: r.name }),
                argo && /* @__PURE__ */ jsxs("span", { className: classes.cardBadges, children: [
                  argo.syncStatus && /* @__PURE__ */ jsx(StatusChip, { tone: argoTone(argo.syncStatus), children: argo.syncStatus }),
                  argo.health && /* @__PURE__ */ jsx(StatusChip, { tone: argoTone(argo.health), children: argo.health })
                ] })
              ]
            },
            key
          );
        }) })
      ] }, kind);
    }),
    /* @__PURE__ */ jsx(Collapse, { in: Boolean(selected), unmountOnExit: true, children: selected && /* @__PURE__ */ jsx("div", { className: classes.detail, children: isRbacKind(selected.kind) ? /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("div", { className: classes.detailModeRow, children: [
        /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            className: `${classes.detailModeBtn} ${detailMode === "friendly" ? classes.detailModeBtnActive : ""}`,
            onMouseDown: preventFocusScroll,
            onClick: () => setDetailMode("friendly"),
            children: "Overview"
          }
        ),
        /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            className: `${classes.detailModeBtn} ${detailMode === "yaml" ? classes.detailModeBtnActive : ""}`,
            onMouseDown: preventFocusScroll,
            onClick: () => setDetailMode("yaml"),
            children: "YAML"
          }
        )
      ] }),
      detailMode === "friendly" ? /* @__PURE__ */ jsx(RbacDetailView, { resource: selected, related: resources.filter((r) => isRbacKind(r.kind)) }) : /* @__PURE__ */ jsx(YamlView, { resource: selected })
    ] }) : /* @__PURE__ */ jsx(YamlView, { resource: selected }) }) })
  ] });
}

export { ResourceGallery };
//# sourceMappingURL=ResourceGallery.esm.js.map
