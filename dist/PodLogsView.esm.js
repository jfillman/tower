import { jsxs, jsx } from 'react/jsx-runtime';
import { useState, useEffect } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import { useApi } from '@backstage/core-plugin-api';
import { kubernetesProxyApiRef } from '@backstage/plugin-kubernetes-react';
import { fontMono, fontDisplay, useHangarTokens } from './brand/tokens.esm.js';
import { preventFocusScroll } from './preventFocusScroll.esm.js';
import { FilterSelect, FilterChip } from './ui/index.esm.js';

const useStyles = makeStyles(() => ({
  head: { display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" },
  title: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 13, color: ({ t }) => t.textHi },
  refresh: {
    fontFamily: fontMono,
    fontSize: 11,
    color: ({ t }) => t.sky,
    background: "none",
    border: "none",
    cursor: "pointer",
    marginLeft: "auto"
  },
  liveBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontFamily: fontMono,
    fontSize: 10.5,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: ({ t }) => t.amberInk,
    marginLeft: "auto"
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    backgroundColor: ({ t }) => t.amber,
    animation: "$pulse 1.6s ease-in-out infinite"
  },
  "@keyframes pulse": {
    "0%, 100%": { opacity: 1 },
    "50%": { opacity: 0.4 }
  },
  log: {
    margin: 0,
    padding: "12px 14px",
    borderRadius: 4,
    border: ({ t }) => `1px solid ${t.lineSoft}`,
    backgroundColor: ({ t }) => t.bg,
    color: ({ t }) => t.textHi,
    fontFamily: fontMono,
    fontSize: 11.5,
    lineHeight: 1.5,
    maxHeight: 420,
    overflow: "auto",
    whiteSpace: "pre-wrap"
  },
  note: { fontSize: 12.5, fontStyle: "italic", color: ({ t }) => t.textLo }
}));
function PodLogsView({
  cluster,
  namespace,
  podName,
  containers,
  live = false
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const proxyApi = useApi(kubernetesProxyApiRef);
  const [container, setContainer] = useState(containers[0] ?? "");
  const [previous, setPrevious] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState({
    loading: true
  });
  useEffect(() => {
    setContainer(containers[0] ?? "");
    setPrevious(false);
  }, [podName]);
  useEffect(() => {
    if (!container) return void 0;
    let cancelled = false;
    setState((prev) => ({ loading: prev.text === void 0, text: prev.text }));
    proxyApi.getPodLogs({ podName, namespace, clusterName: cluster, containerName: container, previous }).then((res) => {
      if (!cancelled) setState({ loading: false, text: res.text });
    }).catch((e) => {
      if (!cancelled) setState({ loading: false, error: String(e) });
    });
    return () => {
      cancelled = true;
    };
  }, [cluster, namespace, podName, container, previous, nonce, proxyApi]);
  useEffect(() => {
    if (!live) return void 0;
    const interval = setInterval(() => setNonce((n) => n + 1), 3e3);
    return () => clearInterval(interval);
  }, [live, container, previous]);
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsxs("div", { className: classes.head, children: [
      /* @__PURE__ */ jsxs(Typography, { className: classes.title, children: [
        "Logs \u2014 ",
        podName
      ] }),
      containers.length > 1 && /* @__PURE__ */ jsx(FilterSelect, { label: "Container", value: container, onChange: setContainer, options: containers.map((c) => ({ value: c, label: c })) }),
      /* @__PURE__ */ jsx(FilterChip, { on: previous, title: "The container's previous run (before its last restart)", onClick: () => setPrevious((v) => !v), children: "Previous run" }),
      live ? /* @__PURE__ */ jsxs("span", { className: classes.liveBadge, children: [
        /* @__PURE__ */ jsx("span", { className: classes.liveDot }),
        "live"
      ] }) : /* @__PURE__ */ jsx("button", { type: "button", className: classes.refresh, onMouseDown: preventFocusScroll, onClick: () => setNonce((n) => n + 1), children: "\u21BB refresh" })
    ] }),
    state.loading && /* @__PURE__ */ jsx(Typography, { className: classes.note, children: "Loading logs\u2026" }),
    state.error && /* @__PURE__ */ jsxs(Typography, { className: classes.note, children: [
      "Couldn't load logs",
      previous ? " (no previous terminated container found?)" : "",
      ": ",
      state.error
    ] }),
    !state.loading && !state.error && /* @__PURE__ */ jsx("pre", { className: classes.log, children: state.text || "(empty)" })
  ] });
}

export { PodLogsView };
//# sourceMappingURL=PodLogsView.esm.js.map
