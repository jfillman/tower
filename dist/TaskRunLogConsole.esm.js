import { jsx, jsxs } from 'react/jsx-runtime';
import { useRef, useEffect } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import { fontMono, useHangarTokens } from './brand/tokens.esm.js';
import { useTaskRunLogs } from './tekton/useTaskRunLogs.esm.js';
import { useArchivedTaskRunLogs } from './tekton/pipelineHistoryApi.esm.js';
import { renderAnsi } from './ansi.esm.js';

const useStyles = makeStyles(() => ({
  log: {
    margin: 0,
    padding: "12px 14px",
    borderRadius: 4,
    border: ({ t }) => `1px solid ${t.lineSoft}`,
    backgroundColor: ({ t }) => t.bg,
    color: ({ t }) => t.textHi,
    fontFamily: fontMono,
    fontSize: 11.5,
    lineHeight: 1.6,
    maxHeight: 420,
    overflow: "auto",
    whiteSpace: "pre-wrap"
  },
  stepHeader: {
    color: ({ t }) => t.amberInk,
    marginTop: 10,
    marginBottom: 2,
    "&:first-child": { marginTop: 0 }
  },
  at: { color: ({ t }) => t.textFaint },
  step: { color: ({ t }) => t.sky },
  line: { wordBreak: "break-word" },
  note: { fontSize: 12.5, fontStyle: "italic", color: ({ t }) => t.textLo },
  liveBadge: { color: ({ t }) => t.amberInk }
}));
function formatLineTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function stepDuration(step) {
  if (!step.startedAt) return void 0;
  const start = new Date(step.startedAt).getTime();
  const end = step.finishedAt ? new Date(step.finishedAt).getTime() : Date.now();
  const secs = Math.max(0, Math.round((end - start) / 1e3));
  const mins = Math.floor(secs / 60);
  const text = mins > 0 ? `${mins}m ${secs % 60}s` : `${secs}s`;
  return step.finishedAt ? text : `${text} so far`;
}
function TaskRunLogConsole({
  cluster,
  namespace,
  podName,
  steps,
  archive
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const live = useTaskRunLogs(archive ? void 0 : { cluster, namespace, podName, steps });
  const archived = useArchivedTaskRunLogs(archive ? { ...archive, steps } : void 0);
  const { loading, blocks } = archive ? archived : live;
  const logRef = useRef(null);
  const stuckToBottom = useRef(true);
  useEffect(() => {
    const el = logRef.current;
    if (el && stuckToBottom.current) el.scrollTop = el.scrollHeight;
  }, [blocks]);
  if (loading) return /* @__PURE__ */ jsx(Typography, { className: classes.note, children: "Loading logs\u2026" });
  if (archive && archived.error) return /* @__PURE__ */ jsx(Typography, { className: classes.note, children: archived.error });
  return /* @__PURE__ */ jsx(
    "pre",
    {
      ref: logRef,
      className: classes.log,
      onScroll: () => {
        const el = logRef.current;
        if (!el) return;
        stuckToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
      },
      children: blocks.map((block) => {
        const step = steps.find((s) => s.container === block.container);
        const duration = step ? stepDuration(step) : void 0;
        return /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsxs("div", { className: classes.stepHeader, children: [
            "\u2500\u2500 ",
            /* @__PURE__ */ jsx("span", { className: classes.step, children: block.step }),
            block.state === "waiting" && " (queued - not started yet)",
            duration && ` \xB7 ${duration}`,
            block.state === "running" && /* @__PURE__ */ jsx("span", { className: classes.liveBadge, children: " \xB7 live" }),
            " ",
            "\u2500\u2500"
          ] }),
          block.error && /* @__PURE__ */ jsxs("div", { className: classes.line, children: [
            "(log unavailable: ",
            block.error,
            ")"
          ] }),
          block.lines.length === 0 && !block.error && block.state !== "waiting" && /* @__PURE__ */ jsx("div", { className: classes.line, children: "(no output yet)" }),
          (() => {
            let ansi = {};
            return block.lines.map((line, i) => {
              const rendered = renderAnsi(line.text, ansi);
              ansi = rendered.state;
              return /* @__PURE__ */ jsxs("div", { className: classes.line, children: [
                line.at && /* @__PURE__ */ jsxs("span", { className: classes.at, children: [
                  "[",
                  formatLineTime(line.at),
                  "] "
                ] }),
                rendered.nodes
              ] }, i);
            });
          })()
        ] }, block.container);
      })
    }
  );
}

export { TaskRunLogConsole, stepDuration };
//# sourceMappingURL=TaskRunLogConsole.esm.js.map
