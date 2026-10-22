import { jsxs, jsx } from 'react/jsx-runtime';
import { useState, useEffect } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import { useApi } from '@backstage/core-plugin-api';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { relativeTime } from './shared/format.esm.js';
import { fontMono, useHangarTokens } from './brand/tokens.esm.js';
import { useTableKit, SectionTitle, EmptyNote } from './ui/index.esm.js';

function useNamespaceEvents(cluster, namespace) {
  const kubernetesApi = useApi(kubernetesApiRef);
  const [state, setState] = useState({
    loading: true
  });
  useEffect(() => {
    let cancelled = false;
    setState({ loading: true });
    (async () => {
      try {
        const res = await kubernetesApi.proxy({
          clusterName: cluster,
          path: `/api/v1/namespaces/${namespace}/events?limit=200`
        });
        if (!res.ok) throw new Error(`request failed with ${res.status}`);
        const body = await res.json();
        if (!cancelled) setState({ loading: false, events: body.items ?? [] });
      } catch (e) {
        if (!cancelled) setState({ loading: false, error: String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cluster, namespace, kubernetesApi]);
  return state;
}
const useStyles = makeStyles(() => ({
  mono: { fontFamily: fontMono, fontSize: 11 },
  dot: { width: 7, height: 7, borderRadius: "50%", display: "inline-block", marginRight: 6 },
  faint: { color: ({ t }) => t.textFaint },
  titleGap: { marginBottom: 8 }
}));
function NamespaceEvents({ cluster, namespace }) {
  const tc = useTableKit();
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const { loading, error, events } = useNamespaceEvents(cluster, namespace);
  const sorted = [...events ?? []].sort((a, b) => {
    const at = new Date(a.lastTimestamp ?? a.metadata?.creationTimestamp ?? 0).getTime();
    const bt = new Date(b.lastTimestamp ?? b.metadata?.creationTimestamp ?? 0).getTime();
    return bt - at;
  });
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsx("div", { className: classes.titleGap, children: /* @__PURE__ */ jsxs(SectionTitle, { level: 2, children: [
      "Events in ",
      namespace
    ] }) }),
    loading && /* @__PURE__ */ jsx(EmptyNote, { children: "Loading events\u2026" }),
    error && /* @__PURE__ */ jsxs(EmptyNote, { children: [
      "Couldn't load events: ",
      error
    ] }),
    !loading && !error && sorted.length === 0 && /* @__PURE__ */ jsx(EmptyNote, { children: "No events recorded in this namespace." }),
    !loading && !error && sorted.length > 0 && /* @__PURE__ */ jsxs("table", { className: `${tc.table} ${tc.dense}`, children: [
      /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { children: [
        /* @__PURE__ */ jsx("th", { className: tc.th, children: "Type" }),
        /* @__PURE__ */ jsx("th", { className: tc.th, children: "Object" }),
        /* @__PURE__ */ jsx("th", { className: tc.th, children: "Reason" }),
        /* @__PURE__ */ jsx("th", { className: tc.th, children: "Message" }),
        /* @__PURE__ */ jsx("th", { className: tc.th, children: "Count" }),
        /* @__PURE__ */ jsx("th", { className: tc.th, children: "Last seen" })
      ] }) }),
      /* @__PURE__ */ jsx("tbody", { children: sorted.map((e, i) => {
        const isWarning = e.type === "Warning";
        return /* @__PURE__ */ jsxs("tr", { children: [
          /* @__PURE__ */ jsxs("td", { className: tc.td, children: [
            /* @__PURE__ */ jsx("span", { className: classes.dot, style: { backgroundColor: isWarning ? t.bad : t.good } }),
            /* @__PURE__ */ jsx("span", { className: classes.mono, children: e.type ?? "\u2014" })
          ] }),
          /* @__PURE__ */ jsxs("td", { className: `${tc.td} ${classes.mono}`, children: [
            e.involvedObject?.kind ?? "\u2014",
            "/",
            e.involvedObject?.name ?? "\u2014"
          ] }),
          /* @__PURE__ */ jsx("td", { className: `${tc.td} ${classes.mono}`, children: e.reason ?? "\u2014" }),
          /* @__PURE__ */ jsx("td", { className: tc.td, children: e.message ?? "\u2014" }),
          /* @__PURE__ */ jsx("td", { className: `${tc.td} ${classes.mono} ${classes.faint}`, children: e.count ?? 1 }),
          /* @__PURE__ */ jsx("td", { className: `${tc.td} ${classes.mono} ${classes.faint}`, children: relativeTime(e.lastTimestamp ?? e.metadata?.creationTimestamp) })
        ] }, i);
      }) })
    ] })
  ] });
}

export { NamespaceEvents };
//# sourceMappingURL=NamespaceEvents.esm.js.map
