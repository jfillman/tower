import { useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import { fontDisplay, fontMono, useHangarTokens, type HangarTokens } from '../brand/tokens';
import type { ProvisioningStep } from './deriveProvisioning';
import { preventFocusScroll } from '../preventFocusScroll';
import { SegmentBar } from './ProvisioningStrip';
import { buildEvents } from './events';
import type { HistoryRun } from './provisioningHistory';
import { relativeTime } from '../shared/format';
import { fmtDuration, type ProvisioningItem } from './shared';

// Bar scale: the longest typical step (the first build) fits with headroom.
const SCALE_SEC = 180;

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  root: { display: 'flex', flexDirection: 'column', gap: 14 },
  pills: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  pill: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    padding: '5px 12px',
    borderRadius: 16,
    fontSize: 13,
    cursor: 'pointer',
    backgroundColor: ({ t }) => t.panel,
    color: ({ t }) => t.textHi,
    border: ({ t }) => `1px solid ${t.line}`,
  },
  pillOn: { borderColor: ({ t }) => t.amber },
  mono: {
    fontFamily: fontMono,
    fontSize: 12,
    fontVariantNumeric: 'tabular-nums',
  },
  panel: {
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 5,
    backgroundColor: ({ t }) => t.panel,
    padding: 16,
    minWidth: 0,
  },
  title: {
    fontFamily: fontDisplay,
    fontWeight: 700,
    fontSize: 22,
    color: ({ t }) => t.textHi,
  },
  crumb: { fontFamily: fontMono, fontSize: 12, color: ({ t }) => t.textFaint },
  kv: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
    gap: 14,
    margin: '14px 0',
  },
  k: {
    fontFamily: fontMono,
    fontSize: 10.5,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: ({ t }) => t.textFaint,
  },
  v: {
    fontFamily: fontDisplay,
    fontWeight: 500,
    fontSize: 20,
    color: ({ t }) => t.textHi,
    fontVariantNumeric: 'tabular-nums',
  },
  head: {
    fontFamily: fontMono,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    color: ({ t }) => t.textFaint,
    marginBottom: 12,
  },
  segs: { display: 'flex', gap: 4, height: 10 },
  seg: {
    flex: 1,
    borderRadius: 1,
    overflow: 'hidden',
    backgroundColor: ({ t }) => t.line,
  },
  list: { listStyle: 'none', margin: 0, padding: 0 },
  li: {
    display: 'grid',
    gridTemplateColumns: '22px minmax(0, 1fr) 150px 112px',
    columnGap: 12,
    position: 'relative',
    paddingBottom: 14,
    alignItems: 'start',
    '&::before': {
      content: '""',
      position: 'absolute',
      left: 10,
      top: 22,
      bottom: 0,
      width: 2,
      backgroundColor: ({ t }) => t.line,
    },
    '&:last-child::before': { display: 'none' },
    '@media (max-width: 700px)': {
      gridTemplateColumns: '22px minmax(0, 1fr) auto',
    },
  },
  liDone: { '&::before': { backgroundColor: ({ t }) => t.good } },
  name: {
    fontWeight: 600,
    fontSize: 14,
    lineHeight: '22px',
    color: ({ t }) => t.textHi,
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  nameMuted: { color: ({ t }) => t.textFaint, fontWeight: 500 },
  nameRun: { color: ({ t }) => t.sky },
  nameFail: { color: ({ t }) => t.bad },
  desc: { fontSize: 12.5, color: ({ t }) => t.textLo, lineHeight: 1.4 },
  detail: { fontSize: 12.5, color: ({ t }) => t.amber, marginTop: 2 },
  links: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 },
  action: {
    marginTop: 6,
    fontFamily: fontMono,
    fontSize: 11,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    color: ({ t }) => t.sky,
    background: 'none',
    border: '1px solid currentColor',
    borderRadius: 3,
    padding: '2px 8px',
    cursor: 'pointer',
    '&:disabled': { opacity: 0.6, cursor: 'default' },
  },
  link: {
    fontFamily: fontMono,
    fontSize: 11.5,
    color: ({ t }) => t.sky,
    textDecoration: 'none',
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 3,
    padding: '2px 7px',
    '&:hover': { borderColor: ({ t }) => t.sky },
  },
  events: {
    fontFamily: fontMono,
    fontSize: 12,
    lineHeight: 1.7,
    color: ({ t }) => t.textLo,
    display: 'flex',
    flexDirection: 'column',
    overflowWrap: 'anywhere',
  },
  eventDone: { color: ({ t }) => t.good },
  eventStart: { color: ({ t }) => t.sky },
  eventFail: { color: ({ t }) => t.bad },
  created: { width: '100%', borderCollapse: 'collapse', fontSize: 12.5 },
  createdRow: {
    borderTop: ({ t }) => `1px solid ${t.line}`,
    '& td': { padding: '5px 8px 5px 0', color: ({ t }) => t.textLo, verticalAlign: 'middle' },
    '& td:first-child': { fontFamily: fontMono, fontSize: 11.5, whiteSpace: 'nowrap', color: ({ t }) => t.textFaint },
  },
  dot: { display: 'inline-block', width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  linkState: { color: ({ t }) => t.textFaint, marginLeft: 6 },
  tag: {
    fontFamily: fontMono,
    fontSize: 10,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: ({ t }) => t.textFaint,
    border: ({ t }) => `1px solid ${t.line}`,
    padding: '2px 5px',
    borderRadius: 3,
  },
  bars: {
    position: 'relative',
    height: 20,
    marginTop: 2,
    '@media (max-width: 700px)': { gridColumn: '2 / 4', order: 5 },
  },
  typical: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    height: 6,
    border: ({ t }) => `1px dashed ${t.textFaint}`,
    borderRadius: 1,
  },
  actual: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: 11,
    borderRadius: 2,
  },
  time: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    lineHeight: 1.3,
    paddingTop: 2,
    fontFamily: fontMono,
    fontSize: 12,
    color: ({ t }) => t.textLo,
    fontVariantNumeric: 'tabular-nums',
  },
  timeSub: { fontSize: 11, color: ({ t }) => t.textFaint },
  timeSlow: { color: ({ t }) => t.amber },
  legend: {
    display: 'flex',
    gap: 16,
    flexWrap: 'wrap',
    fontSize: 12,
    color: ({ t }) => t.textFaint,
    marginTop: 14,
  },
  swatch: {
    display: 'inline-block',
    width: 18,
    height: 8,
    borderRadius: 2,
    marginRight: 6,
    verticalAlign: 'middle',
  },
  empty: {
    border: ({ t }) => `1px dashed ${t.line}`,
    borderRadius: 5,
    padding: 24,
    textAlign: 'center',
    color: ({ t }) => t.textLo,
    fontSize: 13,
  },
}));

const createdLabel = (ready?: boolean) => {
  if (ready === undefined) return 'not tracked';
  return ready ? 'ready' : 'waiting';
};
const createdColor = (ready: boolean | undefined, t: HangarTokens) => {
  if (ready === undefined) return t.line;
  return ready ? t.good : t.sky;
};

function StepIcon({ state, t }: { state: ProvisioningStep['state']; t: HangarTokens }) {
  if (state === 'done') {
    return (
      <svg width="20" height="20" viewBox="0 0 20 20" role="img" aria-label="done">
        <circle cx="10" cy="10" r="9" fill={t.good} />
        <path
          d="M6 10.3l2.8 2.7L14 7.6"
          stroke={t.panel}
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (state === 'fail') {
    return (
      <svg width="20" height="20" viewBox="0 0 20 20" role="img" aria-label="failed">
        <circle cx="10" cy="10" r="9" fill={t.bad} />
        <path d="M7 7l6 6M13 7l-6 6" stroke={t.panel} strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  if (state === 'run') {
    return (
      <svg width="20" height="20" viewBox="0 0 20 20" role="img" aria-label="in progress">
        <circle cx="10" cy="10" r="8" fill="none" stroke={t.line} strokeWidth="2.5" />
        <circle
          cx="10"
          cy="10"
          r="8"
          fill="none"
          stroke={t.sky}
          strokeWidth="2.5"
          strokeDasharray="14 40"
          strokeLinecap="round"
        >
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0 10 10"
            to="360 10 10"
            dur="1s"
            repeatCount="indefinite"
          />
        </circle>
      </svg>
    );
  }
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" role="img" aria-label="waiting">
      <circle cx="10" cy="10" r="8" fill="none" stroke={t.line} strokeWidth="2" />
    </svg>
  );
}

// Asks the catalog ingestor to run now instead of at its next scheduled sync.
function RefreshCatalogAction({
  onRefresh,
  className,
}: {
  onRefresh: () => Promise<void> | void;
  className: string;
}) {
  const [state, setState] = useState<'idle' | 'busy' | 'sent' | 'error'>('idle');
  const label = { idle: 'Refresh catalog now', busy: 'Asking…', sent: 'Requested, checking…', error: 'Could not refresh' }[state];
  return (
    <button
      type="button"
      className={className}
      disabled={state === 'busy' || state === 'sent'}
      onMouseDown={preventFocusScroll}
      onClick={async () => {
        setState('busy');
        try {
          await onRefresh();
          setState('sent');
          // The step turns done by itself when the service shows up; allow another try if not.
          setTimeout(() => setState('idle'), 20000);
        } catch {
          setState('error');
          setTimeout(() => setState('idle'), 5000);
        }
      }}
    >
      {label}
    </button>
  );
}

function Step({
  step,
  classes,
  t,
  onRefreshCatalog,
}: {
  step: ProvisioningStep;
  classes: ReturnType<typeof useStyles>;
  t: HangarTokens;
  onRefreshCatalog?: () => Promise<void> | void;
}) {
  const pct = (sec: number) => `${Math.min(100, (sec / SCALE_SEC) * 100).toFixed(1)}%`;
  const slow = step.state === 'done' && step.seconds !== undefined && step.seconds > step.typicalSec * 1.1 + 1;
  let fill = t.good;
  if (step.state === 'run') fill = t.sky;
  else if (step.state === 'fail') fill = t.bad;
  else if (slow) fill = t.amber;
  const delta = step.seconds !== undefined ? Math.round(step.seconds - step.typicalSec) : 0;
  let nameCls = classes.name;
  if (step.state === 'pend') nameCls += ` ${classes.nameMuted}`;
  else if (step.state === 'run') nameCls += ` ${classes.nameRun}`;
  else if (step.state === 'fail') nameCls += ` ${classes.nameFail}`;
  return (
    <li className={`${classes.li} ${step.state === 'done' ? classes.liDone : ''}`}>
      <span>
        <StepIcon state={step.state} t={t} />
      </span>
      <div style={{ minWidth: 0 }}>
        <div className={nameCls}>
          {step.title}
          {step.parallel && <span className={classes.tag}>parallel</span>}
        </div>
        <div className={classes.desc}>{step.desc}</div>
        {step.detail && <div className={classes.detail}>{step.detail}</div>}
        {step.id === 'catalog' && step.state === 'run' && onRefreshCatalog && (
          <RefreshCatalogAction onRefresh={onRefreshCatalog} className={classes.action} />
        )}
        {step.links && step.links.length > 0 && (
          <div className={classes.links}>
            {step.links.map(l => (
              <a key={l.url} className={classes.link} href={l.url} target="_blank" rel="noopener noreferrer">
                {l.label}
                {l.state && <span className={classes.linkState}>{l.state}</span>}
              </a>
            ))}
          </div>
        )}
      </div>
      <div
        className={classes.bars}
        role="img"
        aria-label={`This run ${step.seconds ?? 0} seconds, typical ${step.typicalSec} seconds`}
      >
        <i className={classes.typical} style={{ width: pct(step.typicalSec) }} />
        {step.seconds !== undefined && step.seconds > 0 && step.state !== 'pend' && (
          <b className={classes.actual} style={{ width: pct(step.seconds), backgroundColor: fill }} />
        )}
      </div>
      <div className={classes.time}>
        <span>
          {step.seconds !== undefined && step.state !== 'pend'
            ? fmtDuration(step.seconds)
            : `~${fmtDuration(step.typicalSec)}`}
        </span>
        {step.state === 'done' && step.seconds !== undefined && (
          <span className={`${classes.timeSub} ${slow ? classes.timeSlow : ''}`}>
            typical {fmtDuration(step.typicalSec)} · {delta > 0 ? '+' : '−'}
            {fmtDuration(Math.abs(delta))}
          </span>
        )}
        {step.state === 'run' && <span className={classes.timeSub}>typical {fmtDuration(step.typicalSec)}</span>}
      </div>
    </li>
  );
}

const EVENT_LINES = 14;

/** The most recent things that happened, each stamped with the time since the first one. */
function LiveEvents({
  steps,
  classes,
}: {
  steps: ProvisioningItem['derived']['steps'];
  classes: ReturnType<typeof useStyles>;
}) {
  const events = buildEvents(steps, Date.now());
  const origin = events[0]?.at ?? 0;
  const shown = events.slice(-EVENT_LINES);
  const mark = { start: '▸', done: '✓', fail: '✗' } as const;
  const tone = { start: classes.eventStart, done: classes.eventDone, fail: classes.eventFail } as const;
  return (
    <div className={classes.panel}>
      <div className={classes.head}>Live events</div>
      {shown.length === 0 ? (
        <div className={classes.desc}>Nothing has happened yet.</div>
      ) : (
        <div className={classes.events} aria-label="Live events">
          {shown.map((e, i) => (
            <span key={`${e.stepId}-${e.kind}-${i}`}>
              [{fmtDuration((e.at - origin) / 1000)}] <span className={tone[e.kind]}>{mark[e.kind]}</span> {e.text}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Finished provisions the backend remembers, newest first. */
function RecentlyProvisioned({
  runs,
  classes,
}: {
  runs: HistoryRun[];
  classes: ReturnType<typeof useStyles>;
}) {
  if (runs.length === 0) return null;
  return (
    <div className={classes.panel}>
      <div className={classes.head}>Recently provisioned</div>
      <table className={classes.created}>
        <thead>
          <tr className={classes.createdRow}>
            <td>Service</td>
            <td>Type</td>
            <td>Took</td>
            <td>Finished</td>
          </tr>
        </thead>
        <tbody>
          {runs.map(r => (
            <tr key={`${r.service}-${r.startedAt}`} className={classes.createdRow}>
              <td>{r.service}</td>
              <td>{r.kind}</td>
              <td>{fmtDuration(r.totalSeconds)}</td>
              <td>{relativeTime(new Date(r.completedAt))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ProvisioningView({
  items,
  selected,
  onSelect,
  error,
  loading,
  onRefreshCatalog,
  runs = [],
  typicalMeasured = false,
}: {
  items: ProvisioningItem[];
  selected?: string;
  onSelect: (name: string) => void;
  error?: string;
  loading: boolean;
  /** Runs the catalog ingestor now. The catalog step offers a button for it while it waits. */
  onRefreshCatalog?: () => Promise<void> | void;
  /** Finished provisions from the backend's history, newest first. */
  runs?: HistoryRun[];
  /** The typical bars come from real recent provisions rather than the built-in estimates. */
  typicalMeasured?: boolean;
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  if (error) {
    return <div className={classes.empty}>Provisioning status could not be read from the dev cluster: {error}</div>;
  }
  if (items.length === 0) {
    return (
      <div className={classes.root}>
        <div className={classes.empty}>
          {loading
            ? 'Reading provisioning status…'
            : 'Nothing is provisioning. A new service appears here as soon as you create it.'}
        </div>
        <RecentlyProvisioned runs={runs} classes={classes} />
      </div>
    );
  }
  const inFlight = items.filter(i => !i.derived.stalled);
  const stalled = items.filter(i => i.derived.stalled);
  const item = items.find(i => i.inputs.xr.name === selected) ?? inFlight[0] ?? items[0];
  const { derived, inputs } = item;
  const pill = (i: ProvisioningItem) => (
    <button
      key={i.inputs.xr.name}
      type="button"
      aria-pressed={i === item}
      className={`${classes.pill} ${i === item ? classes.pillOn : ''}`}
      onClick={() => onSelect(i.inputs.xr.name)}
    >
      <b>{i.inputs.xr.name}</b>
      <span className={classes.mono}>{i.derived.percent}%</span>
    </button>
  );
  return (
    <div className={classes.root}>
      <div className={classes.pills}>{inFlight.map(i => pill(i))}</div>
      {stalled.length > 0 && (
        <div>
          <div className={classes.head}>
            Stalled · built hours ago but not deployed: no rollout on the dev cluster, or a cloud deploy that never ran
            or never finished. It either deploys elsewhere or the deploy is stuck
          </div>
          <div className={classes.pills}>{stalled.map(i => pill(i))}</div>
        </div>
      )}
      <div className={classes.panel}>
        <div className={classes.title}>{inputs.xr.name}</div>
        <div className={classes.crumb}>
          {inputs.xr.kind} · {inputs.xr.cluster}
        </div>
        <div className={classes.kv}>
          <div>
            <div className={classes.k}>Progress</div>
            <div className={classes.v}>{derived.percent}%</div>
          </div>
          <div>
            <div className={classes.k}>Elapsed</div>
            <div className={classes.v}>{fmtDuration(derived.elapsedSec)}</div>
          </div>
          <div>
            <div className={classes.k}>Remaining</div>
            <div className={classes.v}>{derived.complete ? 'Ready' : fmtDuration(derived.etaSec)}</div>
          </div>
        </div>
        <SegmentBar item={item} classes={classes} t={t} />
      </div>
      <div className={classes.panel}>
        <div className={classes.head}>Steps</div>
        <ol className={classes.list}>
          {derived.steps.map(s => (
            <Step key={s.id} step={s} classes={classes} t={t} onRefreshCatalog={onRefreshCatalog} />
          ))}
        </ol>
        <div className={classes.legend}>
          <span>
            <i className={classes.swatch} style={{ backgroundColor: t.good }} />
            This run
          </span>
          <span>
            <i className={classes.swatch} style={{ backgroundColor: t.amber }} />
            Over typical
          </span>
          <span>
            <i className={classes.swatch} style={{ border: `1px dashed ${t.textFaint}`, height: 5 }} />
            {typicalMeasured ? 'Typical (median of recent provisions)' : 'Typical (estimate)'}
          </span>
        </div>
      </div>
      <LiveEvents steps={derived.steps} classes={classes} />
      {inputs.created && inputs.created.length > 0 && (
        <div className={classes.panel}>
          <div className={classes.head}>
            What gets created · {inputs.created.filter(c => c.ready).length} of {inputs.created.length} ready
          </div>
          <table className={classes.created}>
            <tbody>
              {inputs.created.map(c => (
                <tr key={`${c.kind}/${c.name}`} className={classes.createdRow}>
                  <td>{c.kind}</td>
                  <td>{c.name}</td>
                  <td>
                    <i
                      className={classes.dot}
                      style={{ backgroundColor: createdColor(c.ready, t) }}
                      role="img"
                      aria-label={createdLabel(c.ready)}
                    />
                    {createdLabel(c.ready)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <RecentlyProvisioned runs={runs} classes={classes} />
    </div>
  );
}
