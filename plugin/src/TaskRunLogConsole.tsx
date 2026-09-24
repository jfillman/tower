import { useEffect, useRef } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import { fontMono, useHangarTokens, type HangarTokens } from '../brand/tokens';
import { useTaskRunLogs } from './tekton/useTaskRunLogs';
import type { TaskStepSummary } from './tekton/types';
import { renderAnsi, type AnsiState } from './ansi';

// Consolidated multi-step log view for one TaskRun (2026-09-11: "consolidate
// the logs so all step logs appear in the same window, no container
// selection needed" - unlike PodLogsView's per-container <select>, every
// step's log lines appear together in real chronological order, each
// prefixed with its own real timestamp, under a header naming the step and
// (2026-09-11 follow-up) its real duration).

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  log: {
    margin: 0,
    padding: '12px 14px',
    borderRadius: 4,
    border: ({ t }) => `1px solid ${t.lineSoft}`,
    backgroundColor: ({ t }) => t.bg,
    color: ({ t }) => t.textHi,
    fontFamily: fontMono,
    fontSize: 11.5,
    lineHeight: 1.6,
    maxHeight: 420,
    overflow: 'auto',
    whiteSpace: 'pre-wrap',
  },
  stepHeader: {
    color: ({ t }) => t.amberInk,
    marginTop: 10,
    marginBottom: 2,
    '&:first-child': { marginTop: 0 },
  },
  at: { color: ({ t }) => t.textFaint },
  step: { color: ({ t }) => t.sky },
  line: { wordBreak: 'break-word' },
  note: { fontSize: 12.5, fontStyle: 'italic', color: ({ t }) => t.textLo },
  liveBadge: { color: ({ t }) => t.amberInk },
}));

function formatLineTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function stepDuration(step: TaskStepSummary): string | undefined {
  if (!step.startedAt) return undefined;
  const start = new Date(step.startedAt).getTime();
  const end = step.finishedAt ? new Date(step.finishedAt).getTime() : Date.now();
  const secs = Math.max(0, Math.round((end - start) / 1000));
  const mins = Math.floor(secs / 60);
  const text = mins > 0 ? `${mins}m ${secs % 60}s` : `${secs}s`;
  return step.finishedAt ? text : `${text} so far`;
}

export function TaskRunLogConsole({
  cluster,
  namespace,
  podName,
  steps,
}: {
  cluster: string;
  namespace: string;
  podName: string;
  steps: TaskStepSummary[];
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const { loading, blocks } = useTaskRunLogs({ cluster, namespace, podName, steps });

  // Follows new lines to the bottom as they stream in (2026-09-12 bug:
  // "watching live CI logs doesn't keep the screen scrolled to the bottom").
  // Only auto-scrolls while already at (or near) the bottom - stuckToBottom
  // is read/written from the same onScroll handler that fires from OUR OWN
  // scrollTop writes below, so a user who scrolls up to read earlier output
  // stays put instead of being yanked back down on the next poll.
  const logRef = useRef<HTMLPreElement>(null);
  const stuckToBottom = useRef(true);
  useEffect(() => {
    const el = logRef.current;
    if (el && stuckToBottom.current) el.scrollTop = el.scrollHeight;
  }, [blocks]);

  if (loading) return <Typography className={classes.note}>Loading logs&hellip;</Typography>;

  return (
    <pre
      ref={logRef}
      className={classes.log}
      onScroll={() => {
        const el = logRef.current;
        if (!el) return;
        stuckToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
      }}
    >
      {blocks.map(block => {
        const step = steps.find(s => s.container === block.container);
        const duration = step ? stepDuration(step) : undefined;
        return (
          <div key={block.container}>
            <div className={classes.stepHeader}>
              ── <span className={classes.step}>{block.step}</span>
              {block.state === 'waiting' && ' (queued - not started yet)'}
              {duration && ` · ${duration}`}
              {block.state === 'running' && <span className={classes.liveBadge}> · live</span>}
              {' '}──
            </div>
            {block.error && <div className={classes.line}>(log unavailable: {block.error})</div>}
            {block.lines.length === 0 && !block.error && block.state !== 'waiting' && (
              <div className={classes.line}>(no output yet)</div>
            )}
            {(() => {
              // Colour state carries from line to line within a step (a tool often
              // opens a colour on one line and resets it on a later one).
              let ansi: AnsiState = {};
              return block.lines.map((line, i) => {
                const rendered = renderAnsi(line.text, ansi);
                ansi = rendered.state;
                return (
                  <div key={i} className={classes.line}>
                    {line.at && <span className={classes.at}>[{formatLineTime(line.at)}] </span>}
                    {rendered.nodes}
                  </div>
                );
              });
            })()}
          </div>
        );
      })}
    </pre>
  );
}
