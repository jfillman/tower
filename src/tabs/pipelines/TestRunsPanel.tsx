import { useEffect, useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import { discoveryApiRef, fetchApiRef, useApi } from '@backstage/core-plugin-api';
import { fontMono, useHangarTokens, type HangarTokens } from '../../brand/tokens';
import { formatDateTime, relativeTime } from '../../shared/format';
import { EmptyNote, Hint, Panel, PanelSkeleton, StatusChip, type StatusTone, TextLink, Tooltip } from '../../ui';
import { downloadTestReport, fetchTestReport, parseJUnitFailures, type TestFailure, type TestRun, type TestRunsState } from '../../useTestRuns';

// The Tests view under Pipelines (Glidepath test framework, phase 4): every test run Glidepath started for this
// app, as Testkube recorded it, newest first. A row says what ran (the check ride or the team's own workflow),
// against which environment and image, what the agent concluded and what each step did, with the JUnit report
// to download, and for a failed run the test cases that failed and why. The Images tab shows the same runs as attested evidence on the image; this is the run log.

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  list: { display: 'flex', flexDirection: 'column', gap: 8 },
  run: { padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6 },
  head: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  workflow: { fontWeight: 600, color: ({ t }) => t.textHi, fontSize: 13 },
  role: {
    fontFamily: fontMono,
    fontSize: 11,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: ({ t }) => t.textLo,
  },
  when: { marginLeft: 'auto', fontSize: 12, color: ({ t }) => t.textFaint },
  facts: { display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: ({ t }) => t.textLo },
  fact: { display: 'flex', gap: 4, minWidth: 0 },
  factLabel: { color: ({ t }) => t.textFaint },
  factValue: { fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.textHi, overflowWrap: 'anywhere' },
  steps: { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 },
  step: {
    fontSize: 11,
    padding: '1px 8px',
    borderRadius: 10,
    border: ({ t }) => `1px solid ${t.line}`,
    color: ({ t }) => t.textLo,
  },
  stepFailed: { borderColor: ({ t }) => t.bad, color: ({ t }) => t.bad },
  actions: { display: 'flex', gap: 14, alignItems: 'baseline', flexWrap: 'wrap' },
  failures: { display: 'flex', flexDirection: 'column', gap: 8, margin: 0, padding: 0, listStyle: 'none' },
  failure: {
    borderLeft: ({ t }) => `2px solid ${t.bad}`,
    paddingLeft: 10,
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
    minWidth: 0,
  },
  failureName: { fontSize: 12, fontWeight: 600, color: ({ t }) => t.textHi },
  failureClass: { fontWeight: 400, color: ({ t }) => t.textFaint, marginLeft: 6 },
  failureMessage: {
    margin: 0,
    fontFamily: fontMono,
    fontSize: 11,
    color: ({ t }) => t.bad,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
  },
  failureWhere: { fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.textLo, overflowWrap: 'anywhere' },
  failureDetail: {
    margin: 0,
    fontFamily: fontMono,
    fontSize: 11,
    color: ({ t }) => t.textLo,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    maxHeight: 260,
    overflow: 'auto',
  },
}));

type FailuresState = { loading: true } | { error: string } | { total: number; failures: TestFailure[] };

/** A failed run's failed test cases, read from its JUnit report when first opened. */
function FailedTests({ appName, run, classes }: { appName: string | undefined; run: TestRun; classes: ReturnType<typeof useStyles> }) {
  const fetchApi = useApi(fetchApiRef);
  const discoveryApi = useApi(discoveryApiRef);
  const [state, setState] = useState<FailuresState>({ loading: true });
  const [open, setOpen] = useState<Record<number, boolean>>({});
  // By id, not the run object: the list re-polls with new objects and the report does not change.
  const id = run.id;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const xml = await fetchTestReport(fetchApi, await discoveryApi.getBaseUrl('glidepath'), appName, { id });
        const parsed = parseJUnitFailures(xml);
        if (!cancelled) setState(parsed ?? { error: 'the report is not JUnit XML' });
      } catch (e) {
        if (!cancelled) setState({ error: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [appName, id, fetchApi, discoveryApi]);

  if ('loading' in state) return <Hint style={{ margin: 0 }}>Reading the JUnit report…</Hint>;
  if ('error' in state) return <Hint style={{ margin: 0 }}>Couldn't read the failed tests: {state.error}</Hint>;
  if (state.failures.length === 0) {
    return (
      <Hint style={{ margin: 0 }}>
        No failed test case in the report ({state.total} ran): a step failed outside the tests. Its output is at the end of the test
        stage's log.
      </Hint>
    );
  }
  return (
    <ul className={classes.failures} data-testid="test-failures">
      {state.failures.map((f, i) => (
        <li key={`${f.name}-${i}`} className={classes.failure}>
          <span className={classes.failureName}>
            ✖ {f.name}
            {f.classname && <span className={classes.failureClass}>{f.classname}</span>}
          </span>
          <pre className={classes.failureMessage}>{f.message}</pre>
          {f.location && <span className={classes.failureWhere}>{f.location}</span>}
          {f.detail && f.detail !== f.message && (
            <>
              <span>
                <TextLink expanded={Boolean(open[i])} onClick={() => setOpen(o => ({ ...o, [i]: !o[i] }))}>
                  full output
                </TextLink>
              </span>
              {open[i] && <pre className={classes.failureDetail}>{f.detail}</pre>}
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

function statusTone(status: string): StatusTone {
  if (status === 'passed') return 'ok';
  if (status === 'failed' || status === 'aborted' || status === 'timeout') return 'bad';
  if (status === 'running' || status === 'queued' || status === 'pending' || status === 'assigned') return 'warn';
  return 'neutral';
}

function roleLabel(run: TestRun): string {
  if (run.role === 'check-ride') return 'check ride';
  if (run.role === 'execute') return 'action';
  return "team's test";
}

function imageTagOf(image: string | undefined): string | undefined {
  if (!image) return undefined;
  const noDigest = image.split('@')[0];
  const i = noDigest.lastIndexOf(':');
  return i > noDigest.lastIndexOf('/') ? noDigest.slice(i + 1) : undefined;
}

function duration(ms: number | undefined): string | undefined {
  if (ms === undefined) return undefined;
  if (ms < 1000) return `${ms} ms`;
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

export function TestRunsPanel({ appName, state }: { appName: string | undefined; state: TestRunsState }) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const fetchApi = useApi(fetchApiRef);
  const discoveryApi = useApi(discoveryApiRef);
  const [downloadError, setDownloadError] = useState<string | undefined>();
  // Which failed runs show their failed tests. The newest run opens by itself when it failed; any other on request.
  const [shown, setShown] = useState<Record<string, boolean>>({});

  if (state.loading && state.runs.length === 0) return <PanelSkeleton />;
  if (state.error) return <EmptyNote inset>Couldn't read the test runs: {state.error}</EmptyNote>;
  if (state.runs.length === 0) {
    return (
      <EmptyNote inset>
        No test runs yet. A <code>test</code> step in cicd.yaml runs the app's own workflow; a <code>role: check-ride</code> step runs the shared
        check ride the release gate reads.
      </EmptyNote>
    );
  }

  const onDownload = async (run: TestRun) => {
    setDownloadError(undefined);
    try {
      const baseUrl = await discoveryApi.getBaseUrl('glidepath');
      await downloadTestReport(fetchApi, baseUrl, appName, run);
    } catch (e) {
      setDownloadError(`${run.workflow}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div className={classes.list} data-testid="test-runs">
      {downloadError && <Hint inset>{downloadError}</Hint>}
      {state.runs.map((run, index) => {
        const tag = imageTagOf(run.image);
        const failed = statusTone(run.status) === 'bad';
        const showFailures = failed && run.hasReport && (shown[run.id] ?? index === 0);
        const passed = run.steps.filter(s => s.status === 'passed').length;
        return (
          <Panel key={run.id} className={classes.run} data-testid="test-run">
            <div className={classes.head}>
              <span className={classes.workflow}>{run.workflow}</span>
              <span className={classes.role}>{roleLabel(run)}</span>
              <StatusChip tone={statusTone(run.status)} dot>
                {run.status}
              </StatusChip>
              {run.statusNote && <Tooltip title={run.statusNote}>
                <Hint>agent said aborted</Hint>
              </Tooltip>}
              <Tooltip title={run.startedAt ? formatDateTime(run.startedAt) : undefined}>
                <span className={classes.when}>
                  {run.startedAt ? relativeTime(run.startedAt) : ''}
                  {duration(run.durationMs) ? ` · ${duration(run.durationMs)}` : ''}
                </span>
              </Tooltip>
            </div>
            <div className={classes.facts}>
              {run.env && (
                <span className={classes.fact}>
                  <span className={classes.factLabel}>env</span>
                  <span className={classes.factValue}>{run.env}</span>
                </span>
              )}
              {tag && (
                <span className={classes.fact}>
                  <span className={classes.factLabel}>image</span>
                  <span className={classes.factValue}>{tag}</span>
                </span>
              )}
              {run.revision && (
                <span className={classes.fact}>
                  <span className={classes.factLabel}>commit</span>
                  <span className={classes.factValue}>{run.revision.slice(0, 7)}</span>
                </span>
              )}
              <span className={classes.fact}>
                <span className={classes.factLabel}>execution</span>
                <span className={classes.factValue}>{run.id}</span>
              </span>
            </div>
            {run.steps.length > 0 && (
              <Tooltip title={`${passed} of ${run.steps.length} steps passed`}>
                <div className={classes.steps}>
                  {run.steps.map((s, i) => (
                    <span key={`${s.name}-${i}`} className={`${classes.step} ${s.status === 'passed' ? '' : classes.stepFailed}`}>
                      {s.name} · {s.status}
                    </span>
                  ))}
                </div>
              </Tooltip>
            )}
            {showFailures && <FailedTests appName={appName} run={run} classes={classes} />}
            {failed && !run.hasReport && (
              <Hint style={{ margin: 0 }}>No JUnit report from this run: why it failed is at the end of the test stage's log.</Hint>
            )}
            <div className={classes.actions}>
              {failed && run.hasReport && (
                <TextLink expanded={showFailures} onClick={() => setShown(m => ({ ...m, [run.id]: !showFailures }))}>
                  failed tests
                </TextLink>
              )}
              {run.hasReport && (
                <TextLink onClick={() => onDownload(run)}>⭳ Download JUnit report</TextLink>
              )}
              <Hint style={{ margin: 0 }}>
                {run.role === 'check-ride' ? 'The run the qa release gate reads; its attestation is on the image (Images tab).' : "The team's own run; attested on the image, not read by the release gate."}
              </Hint>
            </div>
          </Panel>
        );
      })}
    </div>
  );
}
