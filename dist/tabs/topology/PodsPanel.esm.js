import { jsxs, jsx } from 'react/jsx-runtime';
import { useState, useEffect } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import FileCopyOutlinedIcon from '@material-ui/icons/FileCopyOutlined';
import { relativeTime, formatDateTime } from '../../shared/format.esm.js';
import { fontMono, fontDisplay, useHangarTokens } from '../../brand/tokens.esm.js';
import { PodLogsView } from '../../PodLogsView.esm.js';
import { preventFocusScroll, keepAnchored } from '../../preventFocusScroll.esm.js';
import { MetricsPanel } from './MetricsPanel.esm.js';
import { PodRestartControl } from './PodRestartControl.esm.js';
import { YamlView } from './YamlView.esm.js';
import { BreakglassPanel } from './BreakglassPanel.esm.js';
import { StatusChip } from '../../ui/index.esm.js';

function findPodResource(resources, name) {
  return resources.find((r) => r.kind === "Pod" && r.name === name);
}
function podColor(t, pod) {
  if (pod.phase === "Running" && pod.ready) return t.good;
  if (pod.phase === "Running" || pod.phase === "Pending") return t.amber;
  return t.bad;
}
function containerStateLabel(cs) {
  if (!cs) return { label: "unknown", ok: false };
  if (cs.state?.running) return { label: "running", ok: true };
  if (cs.state?.waiting) return { label: cs.state.waiting.reason ?? "waiting", ok: false };
  if (cs.state?.terminated) return { label: `${cs.state.terminated.reason ?? "terminated"} (${cs.state.terminated.exitCode ?? "?"})`, ok: cs.state.terminated.exitCode === 0 };
  return { label: "unknown", ok: false };
}
const useStyles = makeStyles(() => ({
  // auto-fit, not auto-fill - see StageDetail.tsx's serviceGrid comment.
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8 },
  card: {
    textAlign: "left",
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "9px 12px",
    borderRadius: 8,
    border: ({ t }) => `1px solid ${t.lineSoft}`,
    backgroundColor: ({ t }) => t.panelAlt,
    cursor: "pointer",
    "&:hover": { backgroundColor: ({ t }) => t.bg }
  },
  cardSelected: { borderColor: ({ t }) => t.skyLine, backgroundColor: ({ t }) => t.skySoft },
  dot: { width: 9, height: 9, borderRadius: "50%", flexShrink: 0 },
  cardMeta: { display: "flex", flexDirection: "column", gap: 1, minWidth: 0, flex: 1 },
  cardName: { fontFamily: fontMono, fontSize: 11.5, color: ({ t }) => t.textHi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  cardSub: { fontFamily: fontMono, fontSize: 10, color: ({ t }) => t.textFaint },
  restartBadge: { fontFamily: fontMono, fontSize: 10, fontWeight: 700, color: ({ t }) => t.amberInk, flexShrink: 0 },
  detail: {
    marginTop: 12,
    padding: "14px 16px",
    borderRadius: 8,
    border: ({ t }) => `1px solid ${t.line}`,
    backgroundColor: ({ t }) => t.panel,
    display: "flex",
    flexDirection: "column",
    gap: 12
  },
  detailHead: { display: "flex", alignItems: "center", gap: 8 },
  detailName: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 14, color: ({ t }) => t.textHi },
  kvGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "8px 12px" },
  kv: { display: "flex", flexDirection: "column", gap: 2, minWidth: 0 },
  k: { fontFamily: fontMono, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.05em", color: ({ t }) => t.textFaint, fontWeight: 700 },
  v: { fontFamily: fontMono, fontSize: 11.5, color: ({ t }) => t.textHi, wordBreak: "break-word" },
  sectionTitle: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 12, color: ({ t }) => t.textHi },
  containerRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "6px 10px",
    borderRadius: 6,
    backgroundColor: ({ t }) => t.panelAlt,
    fontFamily: fontMono,
    fontSize: 11,
    flexWrap: "wrap"
  },
  containerName: { color: ({ t }) => t.textHi, fontWeight: 600, minWidth: 90 },
  containerRes: { color: ({ t }) => t.textFaint, fontSize: 10 },
  conditionRow: { display: "flex", gap: 8, fontSize: 11, alignItems: "baseline" },
  conditionType: { fontFamily: fontMono, fontWeight: 700, color: ({ t }) => t.textHi, minWidth: 90 },
  conditionOk: { color: ({ t }) => t.good },
  conditionBad: { color: ({ t }) => t.bad },
  actionsRow: { display: "flex", gap: 6, flexWrap: "wrap", paddingTop: 4, borderTop: ({ t }) => `1px dashed ${t.lineSoft}` },
  actionBtn: {
    fontFamily: fontMono,
    fontSize: 10.5,
    padding: "4px 10px",
    borderRadius: 5,
    border: ({ t }) => `1px solid ${t.line}`,
    background: "none",
    color: ({ t }) => t.textFaint,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    "&:hover": { color: ({ t }) => t.sky }
  },
  actionBtnActive: { color: ({ t }) => t.sky, borderColor: ({ t }) => t.skyLine, backgroundColor: ({ t }) => t.skySoft },
  // The active action's own content (logs/metrics/YAML) always gets its own
  // full-width row below the action buttons, one at a time - never squeezed
  // next to the summary grid or another pod's panel.
  panelBody: { marginTop: 2 },
  none: { fontSize: 11.5, fontStyle: "italic", color: ({ t }) => t.textFaint }
}));
function PodSummaryCard({
  pod,
  raw,
  selected,
  onClick,
  classes,
  t
}) {
  return /* @__PURE__ */ jsxs("button", { type: "button", className: `${classes.card} ${selected ? classes.cardSelected : ""}`, onMouseDown: preventFocusScroll, onClick, children: [
    /* @__PURE__ */ jsx("span", { className: classes.dot, style: { backgroundColor: podColor(t, pod) } }),
    /* @__PURE__ */ jsxs("span", { className: classes.cardMeta, children: [
      /* @__PURE__ */ jsx("span", { className: classes.cardName, title: pod.name, children: pod.name }),
      /* @__PURE__ */ jsxs("span", { className: classes.cardSub, children: [
        pod.phase ?? "\u2014",
        " \xB7 ",
        pod.startTime ? relativeTime(pod.startTime) : "\u2014",
        raw?.status?.podIP ? ` \xB7 ${raw.status.podIP}` : ""
      ] })
    ] }),
    pod.restarts > 0 && /* @__PURE__ */ jsxs("span", { className: classes.restartBadge, children: [
      pod.restarts,
      " restart",
      pod.restarts === 1 ? "" : "s"
    ] })
  ] });
}
function PodDetail({
  pod,
  raw,
  env,
  tier,
  classes
}) {
  const [panel, setPanel] = useState(null);
  const [copied, setCopied] = useState(null);
  const resource = findPodResource(env.resources, pod.name);
  useEffect(() => {
    setPanel(null);
  }, [pod.name]);
  const copy = async (text, id) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(null), 1500);
    } catch {
    }
  };
  return /* @__PURE__ */ jsxs("div", { className: classes.detail, children: [
    /* @__PURE__ */ jsx("div", { className: classes.detailHead, children: /* @__PURE__ */ jsx(Typography, { className: classes.detailName, children: pod.name }) }),
    /* @__PURE__ */ jsxs("div", { className: classes.kvGrid, children: [
      /* @__PURE__ */ jsxs("div", { className: classes.kv, children: [
        /* @__PURE__ */ jsx("span", { className: classes.k, children: "Node" }),
        /* @__PURE__ */ jsx("span", { className: classes.v, children: raw?.spec?.nodeName ?? "\u2014" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: classes.kv, children: [
        /* @__PURE__ */ jsx("span", { className: classes.k, children: "Pod IP" }),
        /* @__PURE__ */ jsx("span", { className: classes.v, children: raw?.status?.podIP ?? "\u2014" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: classes.kv, children: [
        /* @__PURE__ */ jsx("span", { className: classes.k, children: "Host IP" }),
        /* @__PURE__ */ jsx("span", { className: classes.v, children: raw?.status?.hostIP ?? "\u2014" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: classes.kv, children: [
        /* @__PURE__ */ jsx("span", { className: classes.k, children: "QoS class" }),
        /* @__PURE__ */ jsx("span", { className: classes.v, children: raw?.status?.qosClass ?? "\u2014" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: classes.kv, children: [
        /* @__PURE__ */ jsx("span", { className: classes.k, children: "Created" }),
        /* @__PURE__ */ jsx("span", { className: classes.v, title: raw?.metadata?.creationTimestamp ? formatDateTime(raw.metadata.creationTimestamp) : void 0, children: raw?.metadata?.creationTimestamp ? relativeTime(raw.metadata.creationTimestamp) : "\u2014" })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsx(Typography, { className: classes.sectionTitle, style: { marginBottom: 6 }, children: "Containers" }),
      (raw?.spec?.containers ?? []).length === 0 ? /* @__PURE__ */ jsx(Typography, { className: classes.none, children: "No container spec recorded." }) : /* @__PURE__ */ jsx("div", { style: { display: "flex", flexDirection: "column", gap: 5 }, children: (raw?.spec?.containers ?? []).map((c) => {
        const cs = raw?.status?.containerStatuses?.find((s) => s.name === c.name);
        const state = containerStateLabel(cs);
        return /* @__PURE__ */ jsxs("div", { className: classes.containerRow, children: [
          /* @__PURE__ */ jsx("span", { className: classes.containerName, children: c.name }),
          /* @__PURE__ */ jsx(StatusChip, { tone: state.ok ? "ok" : "bad", children: state.label }),
          cs?.restartCount ? /* @__PURE__ */ jsxs("span", { className: classes.containerRes, children: [
            cs.restartCount,
            " restarts"
          ] }) : null,
          /* @__PURE__ */ jsxs("span", { className: classes.containerRes, children: [
            "req ",
            c.resources?.requests?.cpu ?? "\u2014",
            "/",
            c.resources?.requests?.memory ?? "\u2014",
            " \xB7 lim",
            " ",
            c.resources?.limits?.cpu ?? "\u2014",
            "/",
            c.resources?.limits?.memory ?? "\u2014"
          ] })
        ] }, c.name);
      }) })
    ] }),
    (raw?.status?.conditions ?? []).length > 0 && /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsx(Typography, { className: classes.sectionTitle, style: { marginBottom: 6 }, children: "Conditions" }),
      /* @__PURE__ */ jsx("div", { style: { display: "flex", flexDirection: "column", gap: 3 }, children: raw.status.conditions.map((c) => /* @__PURE__ */ jsxs("div", { className: classes.conditionRow, children: [
        /* @__PURE__ */ jsx("span", { className: classes.conditionType, children: c.type }),
        /* @__PURE__ */ jsx("span", { className: c.status === "True" ? classes.conditionOk : classes.conditionBad, children: c.status }),
        c.message && /* @__PURE__ */ jsx("span", { className: classes.cardSub, children: c.message })
      ] }, c.type)) })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: classes.actionsRow, children: [
      /* @__PURE__ */ jsx("button", { type: "button", className: `${classes.actionBtn} ${panel === "logs" ? classes.actionBtnActive : ""}`, onMouseDown: preventFocusScroll, onClick: (e) => keepAnchored(e.currentTarget, () => setPanel((p) => p === "logs" ? null : "logs")), children: "Logs" }),
      /* @__PURE__ */ jsx("button", { type: "button", className: `${classes.actionBtn} ${panel === "metrics" ? classes.actionBtnActive : ""}`, onMouseDown: preventFocusScroll, onClick: (e) => keepAnchored(e.currentTarget, () => setPanel((p) => p === "metrics" ? null : "metrics")), children: "Metrics" }),
      resource && /* @__PURE__ */ jsx("button", { type: "button", className: `${classes.actionBtn} ${panel === "yaml" ? classes.actionBtnActive : ""}`, onMouseDown: preventFocusScroll, onClick: (e) => keepAnchored(e.currentTarget, () => setPanel((p) => p === "yaml" ? null : "yaml")), children: "YAML" }),
      /* @__PURE__ */ jsxs(
        "button",
        {
          type: "button",
          className: classes.actionBtn,
          onMouseDown: preventFocusScroll,
          onClick: () => copy(`kubectl logs -n ${env.namespace} ${pod.name} --context ${env.cluster}`, "kubectl-logs"),
          children: [
            /* @__PURE__ */ jsx(FileCopyOutlinedIcon, { style: { fontSize: 12 } }),
            copied === "kubectl-logs" ? "copied" : "copy kubectl logs"
          ]
        }
      ),
      /* @__PURE__ */ jsxs(
        "button",
        {
          type: "button",
          className: classes.actionBtn,
          onMouseDown: preventFocusScroll,
          onClick: () => copy(`kubectl exec -it -n ${env.namespace} ${pod.name} --context ${env.cluster} -- sh`, "kubectl-exec"),
          children: [
            /* @__PURE__ */ jsx(FileCopyOutlinedIcon, { style: { fontSize: 12 } }),
            copied === "kubectl-exec" ? "copied" : "copy kubectl exec"
          ]
        }
      ),
      /* @__PURE__ */ jsx(PodRestartControl, { env, podName: pod.name, buttonClass: classes.actionBtn, noteClass: classes.cardSub, badClass: classes.conditionBad }),
      /* @__PURE__ */ jsx(
        "button",
        {
          type: "button",
          className: `${classes.actionBtn} ${panel === "debug" ? classes.actionBtnActive : ""}`,
          title: tier === "lower" ? "Open a recorded, time-boxed debug shell on this pod (break-glass)." : "Ground environments only for now: Flight needs approval, not built yet.",
          onMouseDown: preventFocusScroll,
          onClick: (e) => keepAnchored(e.currentTarget, () => setPanel((p) => p === "debug" ? null : "debug")),
          children: "Debug"
        }
      )
    ] }),
    panel === "logs" && /* @__PURE__ */ jsx("div", { className: classes.panelBody, children: /* @__PURE__ */ jsx(PodLogsView, { cluster: env.cluster, namespace: env.namespace, podName: pod.name, containers: pod.containers, live: true }) }),
    panel === "metrics" && /* @__PURE__ */ jsx("div", { className: classes.panelBody, children: /* @__PURE__ */ jsx(MetricsPanel, { cluster: env.cluster, namespace: env.namespace, podNames: [pod.name], title: "Pod performance" }) }),
    panel === "debug" && /* @__PURE__ */ jsx("div", { className: classes.panelBody, children: /* @__PURE__ */ jsx(BreakglassPanel, { env, podName: pod.name, containers: (raw?.spec?.containers ?? []).map((c) => c.name), tier }) }),
    panel === "yaml" && resource && /* @__PURE__ */ jsx("div", { className: classes.panelBody, children: /* @__PURE__ */ jsx(YamlView, { resource }) })
  ] });
}
function PodsPanel({ env, tier }) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const [selected, setSelected] = useState(env.pods[0]?.name);
  useEffect(() => {
    if (selected && env.pods.some((p) => p.name === selected)) return;
    setSelected(env.pods[0]?.name);
  }, [env.pods]);
  if (env.pods.length === 0) {
    return /* @__PURE__ */ jsxs(Typography, { className: classes.none, children: [
      "No pods running in ",
      env.namespace,
      " right now."
    ] });
  }
  const selectedPod = env.pods.find((p) => p.name === selected);
  const selectedRaw = selectedPod ? findPodResource(env.resources, selectedPod.name)?.raw : void 0;
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsx("div", { className: classes.grid, children: env.pods.map((pod) => {
      const resource = findPodResource(env.resources, pod.name);
      return /* @__PURE__ */ jsx(
        PodSummaryCard,
        {
          pod,
          raw: resource?.raw,
          selected: pod.name === selected,
          onClick: () => setSelected(pod.name),
          classes,
          t
        },
        pod.name
      );
    }) }),
    selectedPod && /* @__PURE__ */ jsx(PodDetail, { pod: selectedPod, raw: selectedRaw, env, tier, classes })
  ] });
}

export { PodsPanel };
//# sourceMappingURL=PodsPanel.esm.js.map
