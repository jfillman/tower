import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { useState, useEffect } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import { useApi, fetchApiRef, discoveryApiRef } from '@backstage/core-plugin-api';
import { fontMono, useHangarTokens } from '../../brand/tokens.esm.js';
import { relativeTime, formatDateTime } from '../../shared/format.esm.js';
import { EmptyNote, Hint, Panel, StatusChip, TextLink } from '../../ui/index.esm.js';
import { fetchTestReport, parseJUnitFailures, downloadTestReport } from '../../useTestRuns.esm.js';
import { PanelSkeleton } from '../../ui/LoadState.esm.js';
import { Tooltip } from '../../ui/Tooltip.esm.js';

const useStyles = makeStyles(() => ({
  list: { display: "flex", flexDirection: "column", gap: 8 },
  run: { padding: "10px 14px", display: "flex", flexDirection: "column", gap: 6 },
  head: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
  workflow: { fontWeight: 600, color: ({ t }) => t.textHi, fontSize: 13 },
  role: {
    fontFamily: fontMono,
    fontSize: 11,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: ({ t }) => t.textLo
  },
  when: { marginLeft: "auto", fontSize: 12, color: ({ t }) => t.textFaint },
  facts: { display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, color: ({ t }) => t.textLo },
  fact: { display: "flex", gap: 4, minWidth: 0 },
  factLabel: { color: ({ t }) => t.textFaint },
  factValue: { fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.textHi, overflowWrap: "anywhere" },
  steps: { display: "flex", gap: 6, flexWrap: "wrap", marginTop: 2 },
  step: {
    fontSize: 11,
    padding: "1px 8px",
    borderRadius: 10,
    border: ({ t }) => `1px solid ${t.line}`,
    color: ({ t }) => t.textLo
  },
  stepFailed: { borderColor: ({ t }) => t.bad, color: ({ t }) => t.bad },
  actions: { display: "flex", gap: 14, alignItems: "baseline", flexWrap: "wrap" },
  failures: { display: "flex", flexDirection: "column", gap: 8, margin: 0, padding: 0, listStyle: "none" },
  failure: {
    borderLeft: ({ t }) => `2px solid ${t.bad}`,
    paddingLeft: 10,
    display: "flex",
    flexDirection: "column",
    gap: 3,
    minWidth: 0
  },
  failureName: { fontSize: 12, fontWeight: 600, color: ({ t }) => t.textHi },
  failureClass: { fontWeight: 400, color: ({ t }) => t.textFaint, marginLeft: 6 },
  failureMessage: {
    margin: 0,
    fontFamily: fontMono,
    fontSize: 11,
    color: ({ t }) => t.bad,
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere"
  },
  failureWhere: { fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.textLo, overflowWrap: "anywhere" },
  failureDetail: {
    margin: 0,
    fontFamily: fontMono,
    fontSize: 11,
    color: ({ t }) => t.textLo,
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    maxHeight: 260,
    overflow: "auto"
  }
}));
function FailedTests({ appName, run, classes }) {
  const fetchApi = useApi(fetchApiRef);
  const discoveryApi = useApi(discoveryApiRef);
  const [state, setState] = useState({ loading: true });
  const [open, setOpen] = useState({});
  const id = run.id;
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const xml = await fetchTestReport(fetchApi, await discoveryApi.getBaseUrl("glidepath"), appName, { id });
        const parsed = parseJUnitFailures(xml);
        if (!cancelled) setState(parsed ?? { error: "the report is not JUnit XML" });
      } catch (e) {
        if (!cancelled) setState({ error: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [appName, id, fetchApi, discoveryApi]);
  if ("loading" in state) return /* @__PURE__ */ jsx(Hint, { style: { margin: 0 }, children: "Reading the JUnit report\u2026" });
  if ("error" in state) return /* @__PURE__ */ jsxs(Hint, { style: { margin: 0 }, children: [
    "Couldn't read the failed tests: ",
    state.error
  ] });
  if (state.failures.length === 0) {
    return /* @__PURE__ */ jsxs(Hint, { style: { margin: 0 }, children: [
      "No failed test case in the report (",
      state.total,
      " ran): a step failed outside the tests. Its output is at the end of the test stage's log."
    ] });
  }
  return /* @__PURE__ */ jsx("ul", { className: classes.failures, "data-testid": "test-failures", children: state.failures.map((f, i) => /* @__PURE__ */ jsxs("li", { className: classes.failure, children: [
    /* @__PURE__ */ jsxs("span", { className: classes.failureName, children: [
      "\u2716 ",
      f.name,
      f.classname && /* @__PURE__ */ jsx("span", { className: classes.failureClass, children: f.classname })
    ] }),
    /* @__PURE__ */ jsx("pre", { className: classes.failureMessage, children: f.message }),
    f.location && /* @__PURE__ */ jsx("span", { className: classes.failureWhere, children: f.location }),
    f.detail && f.detail !== f.message && /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("span", { children: /* @__PURE__ */ jsx(TextLink, { expanded: Boolean(open[i]), onClick: () => setOpen((o) => ({ ...o, [i]: !o[i] })), children: "full output" }) }),
      open[i] && /* @__PURE__ */ jsx("pre", { className: classes.failureDetail, children: f.detail })
    ] })
  ] }, `${f.name}-${i}`)) });
}
function statusTone(status) {
  if (status === "passed") return "ok";
  if (status === "failed" || status === "aborted" || status === "timeout") return "bad";
  if (status === "running" || status === "queued" || status === "pending" || status === "assigned") return "warn";
  return "neutral";
}
function roleLabel(run) {
  if (run.role === "check-ride") return "check ride";
  if (run.role === "execute") return "action";
  return "team's test";
}
function imageTagOf(image) {
  if (!image) return void 0;
  const noDigest = image.split("@")[0];
  const i = noDigest.lastIndexOf(":");
  return i > noDigest.lastIndexOf("/") ? noDigest.slice(i + 1) : void 0;
}
function duration(ms) {
  if (ms === void 0) return void 0;
  if (ms < 1e3) return `${ms} ms`;
  const s = Math.round(ms / 1e3);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}
function TestRunsPanel({ appName, state }) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const fetchApi = useApi(fetchApiRef);
  const discoveryApi = useApi(discoveryApiRef);
  const [downloadError, setDownloadError] = useState();
  const [shown, setShown] = useState({});
  if (state.loading && state.runs.length === 0) return /* @__PURE__ */ jsx(PanelSkeleton, {});
  if (state.error) return /* @__PURE__ */ jsxs(EmptyNote, { inset: true, children: [
    "Couldn't read the test runs: ",
    state.error
  ] });
  if (state.runs.length === 0) {
    return /* @__PURE__ */ jsxs(EmptyNote, { inset: true, children: [
      "No test runs yet. A ",
      /* @__PURE__ */ jsx("code", { children: "test" }),
      " step in cicd.yaml runs the app's own workflow; a ",
      /* @__PURE__ */ jsx("code", { children: "role: check-ride" }),
      " step runs the shared check ride the release gate reads."
    ] });
  }
  const onDownload = async (run) => {
    setDownloadError(void 0);
    try {
      const baseUrl = await discoveryApi.getBaseUrl("glidepath");
      await downloadTestReport(fetchApi, baseUrl, appName, run);
    } catch (e) {
      setDownloadError(`${run.workflow}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  return /* @__PURE__ */ jsxs("div", { className: classes.list, "data-testid": "test-runs", children: [
    downloadError && /* @__PURE__ */ jsx(Hint, { inset: true, children: downloadError }),
    state.runs.map((run, index) => {
      const tag = imageTagOf(run.image);
      const failed = statusTone(run.status) === "bad";
      const showFailures = failed && run.hasReport && (shown[run.id] ?? index === 0);
      const passed = run.steps.filter((s) => s.status === "passed").length;
      return /* @__PURE__ */ jsxs(Panel, { className: classes.run, "data-testid": "test-run", children: [
        /* @__PURE__ */ jsxs("div", { className: classes.head, children: [
          /* @__PURE__ */ jsx("span", { className: classes.workflow, children: run.workflow }),
          /* @__PURE__ */ jsx("span", { className: classes.role, children: roleLabel(run) }),
          /* @__PURE__ */ jsx(StatusChip, { tone: statusTone(run.status), dot: true, children: run.status }),
          run.statusNote && /* @__PURE__ */ jsx(Tooltip, { title: run.statusNote, children: /* @__PURE__ */ jsx(Hint, { children: "agent said aborted" }) }),
          /* @__PURE__ */ jsx(Tooltip, { title: run.startedAt ? formatDateTime(run.startedAt) : void 0, children: /* @__PURE__ */ jsxs("span", { className: classes.when, children: [
            run.startedAt ? relativeTime(run.startedAt) : "",
            duration(run.durationMs) ? ` \xB7 ${duration(run.durationMs)}` : ""
          ] }) })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: classes.facts, children: [
          run.env && /* @__PURE__ */ jsxs("span", { className: classes.fact, children: [
            /* @__PURE__ */ jsx("span", { className: classes.factLabel, children: "env" }),
            /* @__PURE__ */ jsx("span", { className: classes.factValue, children: run.env })
          ] }),
          tag && /* @__PURE__ */ jsxs("span", { className: classes.fact, children: [
            /* @__PURE__ */ jsx("span", { className: classes.factLabel, children: "image" }),
            /* @__PURE__ */ jsx("span", { className: classes.factValue, children: tag })
          ] }),
          run.revision && /* @__PURE__ */ jsxs("span", { className: classes.fact, children: [
            /* @__PURE__ */ jsx("span", { className: classes.factLabel, children: "commit" }),
            /* @__PURE__ */ jsx("span", { className: classes.factValue, children: run.revision.slice(0, 7) })
          ] }),
          /* @__PURE__ */ jsxs("span", { className: classes.fact, children: [
            /* @__PURE__ */ jsx("span", { className: classes.factLabel, children: "execution" }),
            /* @__PURE__ */ jsx("span", { className: classes.factValue, children: run.id })
          ] })
        ] }),
        run.steps.length > 0 && /* @__PURE__ */ jsx(Tooltip, { title: `${passed} of ${run.steps.length} steps passed`, children: /* @__PURE__ */ jsx("div", { className: classes.steps, children: run.steps.map((s, i) => /* @__PURE__ */ jsxs("span", { className: `${classes.step} ${s.status === "passed" ? "" : classes.stepFailed}`, children: [
          s.name,
          " \xB7 ",
          s.status
        ] }, `${s.name}-${i}`)) }) }),
        showFailures && /* @__PURE__ */ jsx(FailedTests, { appName, run, classes }),
        failed && !run.hasReport && /* @__PURE__ */ jsx(Hint, { style: { margin: 0 }, children: "No JUnit report from this run: why it failed is at the end of the test stage's log." }),
        /* @__PURE__ */ jsxs("div", { className: classes.actions, children: [
          failed && run.hasReport && /* @__PURE__ */ jsx(TextLink, { expanded: showFailures, onClick: () => setShown((m) => ({ ...m, [run.id]: !showFailures })), children: "failed tests" }),
          run.hasReport && /* @__PURE__ */ jsx(TextLink, { onClick: () => onDownload(run), children: "\u2B73 Download JUnit report" }),
          /* @__PURE__ */ jsx(Hint, { style: { margin: 0 }, children: run.role === "check-ride" ? "The run the qa release gate reads; its attestation is on the image (Images tab)." : "The team's own run; attested on the image, not read by the release gate." })
        ] })
      ] }, run.id);
    })
  ] });
}

export { TestRunsPanel };
//# sourceMappingURL=TestRunsPanel.esm.js.map
