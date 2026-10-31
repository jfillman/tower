import { jsxs, jsx, Fragment } from 'react/jsx-runtime';
import { useRef, useEffect } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import { fontMono, useHangarTokens } from './brand/tokens.esm.js';
import { PrReceipt } from './ui/PrRef.esm.js';
import { useReleaseRunStatus } from './useReleaseData.esm.js';
import { Callout, IconButton, TextLink } from './ui/index.esm.js';
import { Tooltip } from './ui/Tooltip.esm.js';

function runningStep(data) {
  return data?.tasks.find((t) => t.state === "running")?.name;
}
const useStyles = makeStyles(() => ({
  steps: { display: "grid", gridAutoFlow: "column", gridAutoColumns: "minmax(0, 1fr)", gap: 6, marginTop: 10 },
  step: { display: "flex", flexDirection: "column", gap: 5, minWidth: 0 },
  bar: { height: 4, borderRadius: 2 },
  stepName: { fontFamily: fontMono, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  receiptRow: { display: "flex", alignItems: "flex-start", gap: 8 },
  receipt: { flex: 1, minWidth: 0 }
}));
function barColour(t, s) {
  if (s === "done") return t.good;
  if (s === "running") return t.sky;
  if (s === "failed") return t.bad;
  return t.line;
}
function ReleaseRunTracker({
  appName,
  release,
  onPr,
  onDismiss,
  onOpenRun
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const status = useReleaseRunStatus(appName, release.run);
  const data = status.data;
  const told = useRef(false);
  useEffect(() => {
    if (data?.state === "pr" && !told.current) {
      told.current = true;
      onPr();
    }
  }, [data?.state, onPr]);
  const runLink = /* @__PURE__ */ jsx(TextLink, { onClick: () => onOpenRun(release.run), children: "Pipelines \u2192" });
  const dismiss = /* @__PURE__ */ jsx(IconButton, { "aria-label": "Dismiss", title: "Dismiss", onClick: onDismiss, children: "\xD7" });
  if (data?.state === "pr" && data.prUrl) {
    return /* @__PURE__ */ jsxs("div", { className: classes.receiptRow, "data-testid": "release-run-tracker", children: [
      /* @__PURE__ */ jsx(
        PrReceipt,
        {
          className: classes.receipt,
          prUrl: data.prUrl,
          title: `${release.kind === "rollback" ? "Rollback" : "Release"}: ${appName} to ${release.env} \xB7 ${release.label}`,
          next: `${data.changeRequest ? `change ${data.changeRequest} is approved, ` : ""}checks finish and, where the release mode asks for it, someone signs off; then merge it.`
        }
      ),
      dismiss
    ] });
  }
  if (data?.state === "failed") {
    return /* @__PURE__ */ jsx(
      Callout,
      {
        tone: "bad",
        label: "Release run",
        title: `${release.label} \u2192 ${release.env}: no PR`,
        actions: /* @__PURE__ */ jsxs(Fragment, { children: [
          runLink,
          dismiss
        ] }),
        children: data.reason
      }
    );
  }
  return /* @__PURE__ */ jsxs(
    Callout,
    {
      tone: "info",
      label: "Release run",
      title: `${release.kind === "rollback" ? "Rollback" : "Release"} PR for ${release.label} \u2192 ${release.env} on its way`,
      actions: /* @__PURE__ */ jsxs(Fragment, { children: [
        runLink,
        status.gaveUp && dismiss
      ] }),
      children: [
        /* @__PURE__ */ jsxs("span", { "data-testid": "release-run-tracker", children: [
          status.gaveUp ? "Still no PR after 15 minutes; the Pipelines tab has the run." : `${runningStep(data) ? `Now: ${runningStep(data)}. ` : ""}You can leave this page: the PR also shows in Pull requests when it opens.`,
          status.error && !data ? ` Couldn't read the run yet (${status.error}); trying again.` : ""
        ] }),
        data && data.tasks.length > 0 && /* @__PURE__ */ jsx("div", { className: classes.steps, "aria-label": "Release run progress", children: data.tasks.map((task) => /* @__PURE__ */ jsx(Tooltip, { title: `${task.name}: ${task.state}`, children: /* @__PURE__ */ jsxs("div", { className: classes.step, children: [
          /* @__PURE__ */ jsx("span", { className: classes.bar, style: { backgroundColor: barColour(t, task.state) } }),
          /* @__PURE__ */ jsx("span", { className: classes.stepName, style: { color: task.state === "pending" ? t.textFaint : t.textHi }, children: task.name })
        ] }) }, task.name)) })
      ]
    }
  );
}

export { ReleaseRunTracker };
//# sourceMappingURL=ReleaseRunTracker.esm.js.map
