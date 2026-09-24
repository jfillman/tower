import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import { formatDateTime } from '../shared/format';
import { formatDuration } from './TimelinePanel';
import { fontDisplay, fontMono, useHangarTokens, type HangarTokens } from '../brand/tokens';
import { confidenceColor, statusPill } from './ReleaseRecordList';
import { NicknameChip } from './tabs/deployments/ImageTagPill';
import type { ReleaseRecord } from './useReleaseRecords';

// Board 4 of the mockup (HANDOFF-tower-release-record.md /
// idp_session_tower_release_record_spec) - "Compare two records." Records
// are discrete, already-fetched structured objects, so a diff is pure
// client-side computation over fields both already carry - no new data
// source, matching this handoff's own reasoning for deferring this view to
// "needs no new data" rather than Phase 2's backend work.
//
// Two real deviations from the mockup, forced by real data (same reasoning
// useReleaseRecords.ts's own header comment gives for the record shape
// itself): no "test pass rate" / "security findings" rows - nothing in this
// codebase produces that shape (see that file's header comment) - the real
// equivalent, release-guardrail checks, is used instead; and "lead time" is
// defined identically to TimelinePanel's own "merge → deploy" number
// (LeadTimePanel), applied to this record's own last real promotion rather
// than a new invented metric.

// Mirrors LeadTimeCard's "merge → deploy" (TimelinePanel.tsx) applied to
// this record's own most-downstream promotion with real merge data, i.e.
// "merge → prod" for a record that by definition already reached Flight.
function leadTimeMs(record: ReleaseRecord): number | undefined {
  const promo = [...record.promotionChain].reverse().find(p => p.mergedAt);
  if (!promo?.mergedAt) return undefined;
  return new Date(promo.at).getTime() - new Date(promo.mergedAt).getTime();
}

function guardrailPassRatio(record: ReleaseRecord): number | undefined {
  if (!record.guardrails || record.guardrails.totalChecks === 0) return undefined;
  return record.guardrails.passedChecks / record.guardrails.totalChecks;
}

// formatDuration (TimelinePanel.tsx) has no negative-duration support (by
// design - a duration is never negative), so a delta that can go either way
// needs its own sign handling around it rather than a second formatter.
function formatSignedDuration(deltaMs: number): string {
  if (deltaMs === 0) return '±0m';
  return deltaMs < 0 ? `−${formatDuration(-deltaMs)}` : `+${formatDuration(deltaMs)}`;
}

function formatSignedInt(n: number): string {
  if (n === 0) return '±0';
  return n > 0 ? `+${n}` : `−${Math.abs(n)}`;
}

function formatSignedPercentPoints(delta: number): string {
  const pts = Math.round(delta * 100);
  if (pts === 0) return '±0%';
  return pts > 0 ? `+${pts}%` : `−${Math.abs(pts)}%`;
}

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  backBtn: {
    fontFamily: fontDisplay,
    fontWeight: 600,
    fontSize: 12,
    color: ({ t }) => t.textLo,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '4px 0 14px',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
  },
  title: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 15, color: ({ t }) => t.textHi, marginBottom: 14 },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr auto 1fr',
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 8,
    overflow: 'hidden',
    '@media (max-width: 760px)': { gridTemplateColumns: '1fr' },
  },
  col: { padding: '18px 20px', backgroundColor: ({ t }) => t.panel },
  colLeft: { borderRight: ({ t }) => `1px solid ${t.line}`, '@media (max-width: 760px)': { borderRight: 'none', borderBottom: ({ t }) => `1px solid ${t.line}` } },
  colHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: 14 },
  ver: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 16, color: ({ t }) => t.textHi },
  pill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontFamily: fontDisplay,
    fontWeight: 600,
    fontSize: 11,
    letterSpacing: '0.03em',
    padding: '4px 10px',
    borderRadius: 99,
    whiteSpace: 'nowrap',
  },
  pillDot: { width: 6, height: 6, borderRadius: '50%' },
  kv: { display: 'flex', flexDirection: 'column', gap: 8 },
  kvRow: { display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12.5 },
  kvK: { color: ({ t }) => t.textFaint },
  kvV: { color: ({ t }) => t.textHi, fontFamily: fontMono, fontSize: 11.5 },
  mid: {
    width: 150,
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    padding: '18px 10px',
    alignItems: 'center',
    backgroundColor: ({ t }) => t.panelAlt,
    '@media (max-width: 760px)': { flexDirection: 'row', flexWrap: 'wrap', width: '100%', justifyContent: 'space-around' },
  },
  metric: { width: '100%', textAlign: 'center' },
  metricLbl: { fontSize: 9.5, color: ({ t }) => t.textFaint, textTransform: 'uppercase', letterSpacing: '0.06em' },
  metricDelta: { fontFamily: fontMono, fontSize: 13, fontWeight: 600, marginTop: 2 },
}));

function toneColor(t: HangarTokens, tone: 'good' | 'bad' | undefined): string {
  if (tone === 'good') return t.good;
  if (tone === 'bad') return t.bad;
  return t.textLo;
}

// Simpler-is-better metrics (lead time) - lower is an improvement.
function toneForLowerIsBetter(delta: number | undefined): 'good' | 'bad' | undefined {
  if (delta === undefined) return undefined;
  return delta <= 0 ? 'good' : 'bad';
}

// Higher-is-better metrics (guardrail pass rate, confidence) - a real
// improvement colors green, a real regression red, no change stays neutral.
function toneForHigherIsBetter(delta: number | undefined): 'good' | 'bad' | undefined {
  if (delta === undefined || delta === 0) return undefined;
  return delta > 0 ? 'good' : 'bad';
}

function Metric({
  label,
  value,
  tone,
  t,
  classes,
}: {
  label: string;
  value: string;
  tone?: 'good' | 'bad';
  t: HangarTokens;
  classes: ReturnType<typeof useStyles>;
}) {
  const color = toneColor(t, tone);
  return (
    <div className={classes.metric}>
      <div className={classes.metricLbl}>{label}</div>
      <div className={classes.metricDelta} style={{ color }}>
        {value}
      </div>
    </div>
  );
}

function RecordColumn({
  record,
  pill,
  side,
  t,
  classes,
}: {
  record: ReleaseRecord;
  pill: { label: string; bg: string; border: string; fg: string };
  side: 'left' | 'right';
  t: HangarTokens;
  classes: ReturnType<typeof useStyles>;
}) {
  const lead = leadTimeMs(record);
  return (
    <div className={`${classes.col} ${side === 'left' ? classes.colLeft : ''}`}>
      <div className={classes.colHead}>
        <span className={classes.ver}>
          {record.version ?? record.imageTag}
          {record.nickname && (
            <span style={{ marginLeft: 8 }}>
              <NicknameChip nickname={record.nickname} />
            </span>
          )}
        </span>
        <span className={classes.pill} style={{ backgroundColor: pill.bg, borderColor: pill.border, color: pill.fg }}>
          <span className={classes.pillDot} style={{ backgroundColor: pill.fg }} />
          {pill.label}
        </span>
      </div>
      <div className={classes.kv}>
        <div className={classes.kvRow}>
          <span className={classes.kvK}>Deployed</span>
          <span className={classes.kvV}>{formatDateTime(record.createdAt)}</span>
        </div>
        <div className={classes.kvRow}>
          <span className={classes.kvK}>PRs</span>
          <span className={classes.kvV}>{record.pullRequests.length}</span>
        </div>
        <div className={classes.kvRow}>
          <span className={classes.kvK}>Lead time (merge→prod)</span>
          <span className={classes.kvV}>{lead === undefined ? '—' : formatDuration(lead)}</span>
        </div>
        <div className={classes.kvRow}>
          <span className={classes.kvK}>Guardrail checks</span>
          <span className={classes.kvV}>{record.guardrails ? `${record.guardrails.passedChecks}/${record.guardrails.totalChecks}` : '—'}</span>
        </div>
        <div className={classes.kvRow}>
          <span className={classes.kvK}>Confidence</span>
          <span className={classes.kvV} style={{ color: confidenceColor(t, record.confidence) }}>
            {record.confidence}
          </span>
        </div>
      </div>
    </div>
  );
}

// `left` is always the comparison target picked from the dropdown; `right`
// is the record the user opened Compare from (ReleaseRecordPanel.tsx wires
// this directionality, not this component) - deltas read as "how did the
// record I'm looking at differ from the one I picked."
export function ReleaseRecordCompare({
  left,
  right,
  onBack,
}: {
  left: ReleaseRecord;
  right: ReleaseRecord;
  onBack: () => void;
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });

  const leftLead = leadTimeMs(left);
  const rightLead = leadTimeMs(right);
  const leftRatio = guardrailPassRatio(left);
  const rightRatio = guardrailPassRatio(right);

  const prDelta = right.pullRequests.length - left.pullRequests.length;
  const leadDelta = leftLead !== undefined && rightLead !== undefined ? rightLead - leftLead : undefined;
  const ratioDelta = leftRatio !== undefined && rightRatio !== undefined ? rightRatio - leftRatio : undefined;
  const confidenceDelta = right.confidence - left.confidence;

  const leftPill = { label: 'BASELINE', bg: t.panelAlt, border: t.line, fg: t.textLo };
  const rightPill = statusPill(t, right);

  return (
    <div>
      <button type="button" className={classes.backBtn} onClick={onBack}>
        ← Back to record
      </button>
      <Typography className={classes.title}>Compare releases</Typography>
      <div className={classes.grid}>
        <RecordColumn record={left} pill={leftPill} side="left" t={t} classes={classes} />
        <div className={classes.mid}>
          <Metric label="PRs" value={formatSignedInt(prDelta)} t={t} classes={classes} />
          <Metric
            label="Lead time"
            value={leadDelta === undefined ? '—' : formatSignedDuration(leadDelta)}
            tone={toneForLowerIsBetter(leadDelta)}
            t={t}
            classes={classes}
          />
          <Metric
            label="Guardrail pass rate"
            value={ratioDelta === undefined ? '—' : formatSignedPercentPoints(ratioDelta)}
            tone={toneForHigherIsBetter(ratioDelta)}
            t={t}
            classes={classes}
          />
          <Metric
            label="Confidence"
            value={formatSignedInt(confidenceDelta)}
            tone={toneForHigherIsBetter(confidenceDelta)}
            t={t}
            classes={classes}
          />
        </div>
        <RecordColumn record={right} pill={rightPill} side="right" t={t} classes={classes} />
      </div>
    </div>
  );
}
