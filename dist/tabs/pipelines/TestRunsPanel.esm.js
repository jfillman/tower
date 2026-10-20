import { jsx, jsxs } from 'react/jsx-runtime';
import { useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import { Progress } from '@backstage/core-components';
import { useApi, fetchApiRef, discoveryApiRef } from '@backstage/core-plugin-api';
import { fontMono, useHangarTokens } from '../../brand/tokens.esm.js';
import { relativeTime, formatDateTime } from '../../shared/format.esm.js';
import { EmptyNote, Hint, Panel, StatusChip, TextLink } from '../../ui/index.esm.js';
import { downloadTestReport } from '../../useTestRuns.esm.js';

const useStyles = makeStyles(() => ({
  list: { display: "flex", flexDirection: "column", gap: 8 },
  run: { padding: "10px 14px", display: "flex", flexDirection: "column", gap: 6 },
  head: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
  workflow: { fontWeight: 600, color: ({ t }) => t.textHi, fontSize: 13 },
  role: {
    fontFamily: fontMono,
    fontSize: 10.5,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: ({ t }) => t.textLo
  },
  when: { marginLeft: "auto", fontSize: 12, color: ({ t }) => t.textFaint },
  facts: { display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, color: ({ t }) => t.textLo },
  fact: { display: "flex", gap: 4, minWidth: 0 },
  factLabel: { color: ({ t }) => t.textFaint },
  factValue: { fontFamily: fontMono, fontSize: 11.5, color: ({ t }) => t.textHi, overflowWrap: "anywhere" },
  steps: { display: "flex", gap: 6, flexWrap: "wrap", marginTop: 2 },
  step: {
    fontSize: 11.5,
    padding: "1px 8px",
    borderRadius: 10,
    border: ({ t }) => `1px solid ${t.line}`,
    color: ({ t }) => t.textLo
  },
  stepFailed: { borderColor: ({ t }) => t.bad, color: ({ t }) => t.bad },
  actions: { display: "flex", gap: 14, alignItems: "baseline", flexWrap: "wrap" }
}));
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
function TestRunsPanel({ state }) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const fetchApi = useApi(fetchApiRef);
  const discoveryApi = useApi(discoveryApiRef);
  const [downloadError, setDownloadError] = useState();
  if (state.loading && state.runs.length === 0) return /* @__PURE__ */ jsx(Progress, {});
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
      await downloadTestReport(fetchApi, baseUrl, run);
    } catch (e) {
      setDownloadError(`${run.workflow}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  return /* @__PURE__ */ jsxs("div", { className: classes.list, "data-testid": "test-runs", children: [
    downloadError && /* @__PURE__ */ jsx(Hint, { inset: true, children: downloadError }),
    state.runs.map((run) => {
      const tag = imageTagOf(run.image);
      const passed = run.steps.filter((s) => s.status === "passed").length;
      return /* @__PURE__ */ jsxs(Panel, { className: classes.run, "data-testid": "test-run", children: [
        /* @__PURE__ */ jsxs("div", { className: classes.head, children: [
          /* @__PURE__ */ jsx("span", { className: classes.workflow, children: run.workflow }),
          /* @__PURE__ */ jsx("span", { className: classes.role, children: roleLabel(run) }),
          /* @__PURE__ */ jsx(StatusChip, { tone: statusTone(run.status), dot: true, children: run.status }),
          run.statusNote && /* @__PURE__ */ jsx(Hint, { title: run.statusNote, children: "agent said aborted" }),
          /* @__PURE__ */ jsxs("span", { className: classes.when, title: run.startedAt ? formatDateTime(run.startedAt) : void 0, children: [
            run.startedAt ? relativeTime(run.startedAt) : "",
            duration(run.durationMs) ? ` \xB7 ${duration(run.durationMs)}` : ""
          ] })
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
        run.steps.length > 0 && /* @__PURE__ */ jsx("div", { className: classes.steps, title: `${passed} of ${run.steps.length} steps passed`, children: run.steps.map((s, i) => /* @__PURE__ */ jsxs("span", { className: `${classes.step} ${s.status === "passed" ? "" : classes.stepFailed}`, children: [
          s.name,
          " \xB7 ",
          s.status
        ] }, `${s.name}-${i}`)) }),
        /* @__PURE__ */ jsxs("div", { className: classes.actions, children: [
          run.hasReport && /* @__PURE__ */ jsx(TextLink, { onClick: () => onDownload(run), children: "\u2B73 Download JUnit report" }),
          /* @__PURE__ */ jsx(Hint, { style: { margin: 0 }, children: run.role === "check-ride" ? "The run the qa release gate reads; its attestation is on the image (Images tab)." : "The team's own run; attested on the image, not read by the release gate." })
        ] })
      ] }, run.id);
    })
  ] });
}

export { TestRunsPanel };
//# sourceMappingURL=TestRunsPanel.esm.js.map
