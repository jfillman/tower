import type { ReactNode } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import { fontDisplay, fontMono, useHangarTokens, type HangarTokens } from './brand/tokens';
import { Button, Callout, EmptyNote, Stat, StatusChip, TextLink, Tile, type StatusTone } from './ui';
import { outcomeChip } from './ReleaseOutcome';
import { statusPill } from './ReleaseRecordList';
import { bakeProgress, readinessCount, type PathStep } from './releaseCards';
import type { NextRelease } from './nextRelease';
import { displayScore, type ReleaseRecord } from './useReleaseRecords';
import { commitProofChip, commitProofLine, commitProofOf, type CommitProof } from './commitProof';

// The top of the Releases tab (2026-10-14, mockup E): three cards, so the releases themselves are the first thing on
// the page. Next release (the draft), the release live in production, and the last one with an outcome. Each opens
// its record in the Releases sub-tab below; nothing here acts on its own.

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  cards: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1.35fr) minmax(0, 1.15fr) minmax(0, 0.85fr)',
    gap: 14,
    marginBottom: 18,
    '@media (max-width: 1100px)': { gridTemplateColumns: 'minmax(0, 1fr)' },
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: ({ t }) => t.panel,
    border: ({ t }) => `1px solid ${t.line}`,
  },
  body: { padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 11, flex: 1, minWidth: 0 },
  head: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  eyebrow: { fontFamily: fontMono, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase' },
  push: { marginLeft: 'auto' },
  nameRow: { display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', minWidth: 0 },
  name: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 26, letterSpacing: '0.04em', color: ({ t }) => t.textHi, lineHeight: 1.1 },
  nameSmall: { fontSize: 22 },
  mono: { fontFamily: fontMono, fontSize: 12, color: ({ t }) => t.textLo, overflowWrap: 'anywhere' },
  path: { display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  arrow: { color: ({ t }) => t.textFaint, fontSize: 12 },
  minis: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 },
  line: { fontSize: 12.5, color: ({ t }) => t.textLo },
  bad: { color: ({ t }) => t.bad },
  bake: { display: 'grid', gap: 4 },
  bakeSeg: { height: 7, borderRadius: 3 },
  actions: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 'auto', alignItems: 'center' },
}));

const STEP_TONE: Record<Extract<PathStep, { kind: 'flight' }>['state'], StatusTone> = {
  live: 'ok',
  pr: 'info',
  blocked: 'bad',
  waiting: 'neutral',
};

type StatTone = 'ok' | 'warn' | 'bad';

/** A number on a card: the kit's Stat in a Tile. */
// How the release's commit was proven (provenance phase 3), as one short line on a card. Nothing when it isn't known.
function CommitLine({ proof, className }: { proof: CommitProof; className: string }) {
  const chip = commitProofChip(proof);
  if (!chip || proof.state === 'not-recorded') return null;
  let who = '';
  if (proof.evidence?.mergedBy) who = ` by ${proof.evidence.mergedBy}`;
  else if (proof.evidence?.signer) who = `, ${proof.evidence.signer}`;
  return (
    <span className={className} title={commitProofLine(proof)}>
      Commit: {chip}
      {who}
    </span>
  );
}

function Mini({ label, value, caption, tone }: { label: string; value: ReactNode; caption?: ReactNode; tone?: StatTone }) {
  return (
    <Tile>
      <Stat label={label} value={value} caption={caption} tone={tone} />
    </Tile>
  );
}

function scoreTone(score: number): StatTone {
  if (score >= 80) return 'ok';
  if (score >= 50) return 'warn';
  return 'bad';
}

function groundTone(step: PathStep): StatusTone {
  if (step.kind === 'flight') return STEP_TONE[step.state];
  return step.env ? 'ok' : 'neutral';
}

function signoffCaption(signoffs: number | undefined): string | undefined {
  if (signoffs === undefined) return 'not recorded yet';
  return signoffs > 0 ? 'counted' : 'none counted';
}

function HeroCard({ strip, highlight, children }: { strip: string; highlight?: boolean; children: ReactNode }) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  return (
    <section className={classes.card} style={{ borderTop: `4px solid ${strip}`, ...(highlight ? { borderColor: t.amberLine, borderTopColor: strip } : {}) }}>
      <div className={classes.body}>{children}</div>
    </section>
  );
}


function stepLabel(step: PathStep): string {
  if (step.kind === 'ground') return step.env ? `${step.env} ✓` : 'not on Ground';
  if (step.state === 'live') return `${step.env} ✓`;
  if (step.pr) return `${step.env} · PR #${step.pr.number}`;
  return step.env;
}

export interface HeroNext {
  next: NextRelease;
  name?: string;
  path: PathStep[];
  notes: number;
  owner?: string;
  /** An open release PR whose checks failed: the card says the release is blocked there. */
  blocked?: Extract<PathStep, { kind: 'flight' }>;
  /** The open release PR furthest along, to review. */
  openPr?: Extract<PathStep, { kind: 'flight' }>;
}

export function ReleaseHeroes({
  next,
  live,
  liveName,
  liveEnvCount,
  flightEnvCount,
  signoffEnv,
  last,
  lastName,
  nameOf,
  onOpenDraft,
  onOpenRecord,
}: {
  next?: HeroNext;
  live?: ReleaseRecord;
  liveName?: string;
  /** How many Flight environments run the live release. */
  liveEnvCount: number;
  flightEnvCount: number;
  signoffEnv?: string;
  last?: ReleaseRecord;
  lastName?: string;
  /** imageTag -> release name, for "replaced by". */
  nameOf: (tag?: string) => string | undefined;
  onOpenDraft: () => void;
  onOpenRecord: (id: string) => void;
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });

  const nextCard = (
    <HeroCard strip={t.amber} highlight>
      <div className={classes.head}>
        <span className={classes.eyebrow} style={{ color: t.amberInk }}>
          Next release
        </span>
        <StatusChip tone="warn" className={classes.push}>
          draft
        </StatusChip>
      </div>
      {next ? (
        <>
          <div className={classes.nameRow}>
            <span className={classes.name}>{next.name ?? 'Next release'}</span>
            <span className={classes.mono}>
              {next.next.suggestedVersion ? `v${next.next.suggestedVersion} suggested` : 'no new version yet'}
              {next.next.leading ? ` · ${next.next.leading.imageTag}` : ''}
            </span>
          </div>
          <div className={classes.path} aria-label="Where it is">
            {next.path.map((step, i) => (
              <span key={step.kind === 'ground' ? 'ground' : step.env} style={{ display: 'contents' }}>
                {i > 0 && <span className={classes.arrow}>→</span>}
                <StatusChip tone={groundTone(step)}>{stepLabel(step)}</StatusChip>
              </span>
            ))}
          </div>
          <div className={classes.minis}>
            <Mini
              label="Readiness"
              value={(() => {
                const { ok, total } = readinessCount(next.next.readiness);
                return `${ok} of ${total}`;
              })()}
            />
            <Mini
              label="Scope"
              value={`${next.next.scope.length} PR${next.next.scope.length === 1 ? '' : 's'}`}
              caption={`${next.next.issues.length} issue${next.next.issues.length === 1 ? '' : 's'}`}
            />
            <Mini label="Notes" value={next.notes} caption={next.owner ? `owner ${next.owner}` : 'no owner yet'} />
          </div>
          {next.openPr?.pr && (
            <CommitLine proof={commitProofOf({ guardrails: next.openPr.pr.ci, guardrailsPrUrl: next.openPr.pr.url })} className={classes.line} />
          )}
          {next.blocked?.pr && (
            <Callout tone="bad" title={`Blocked on ${next.blocked.env}`}>
              Release PR #{next.blocked.pr.number} has failing checks.
            </Callout>
          )}
          <div className={classes.actions}>
            <Button variant="primary" small onClick={onOpenDraft}>
              Open {next.name ?? 'the draft'}
            </Button>
            {next.openPr?.pr && (
              <TextLink href={next.openPr.pr.url}>Review PR #{next.openPr.pr.number}</TextLink>
            )}
          </div>
        </>
      ) : (
        <EmptyNote>Nothing to release yet.</EmptyNote>
      )}
    </HeroCard>
  );

  const bake = bakeProgress(live?.outcome);
  const liveChip = live ? outcomeChip(live.outcome) ?? statusPill(live) : undefined;
  const liveCard = (
    <HeroCard strip={t.sky}>
      <div className={classes.head}>
        <span className={classes.eyebrow} style={{ color: t.sky }}>
          Live in {signoffEnv ?? 'production'}
        </span>
        {liveChip && (
          <StatusChip tone={liveChip.tone} dot className={classes.push}>
            {liveChip.label}
          </StatusChip>
        )}
      </div>
      {live ? (
        <>
          <div className={classes.nameRow}>
            <span className={classes.name}>{liveName ?? live.version ?? live.imageTag}</span>
            <span className={classes.mono}>{live.imageTag}</span>
          </div>
          {bake && (
            <div className={classes.bake} style={{ gridTemplateColumns: `repeat(${bake.of}, minmax(0, 1fr))` }} aria-label={`Baking, day ${bake.day} of ${bake.of}`}>
              {Array.from({ length: bake.of }, (_, i) => (
                <div key={i} className={classes.bakeSeg} style={{ backgroundColor: i < bake.day ? t.sky : t.lineSoft }} />
              ))}
            </div>
          )}
          <div className={classes.minis}>
            <Mini label="Score" value={displayScore(live)} caption="readiness" tone={scoreTone(displayScore(live))} />
            <Mini label="Sign-off" value={live.signoffs ?? '—'} caption={signoffCaption(live.signoffs)} tone={live.signoffs === 0 ? 'bad' : undefined} />
            <Mini label="Live in" value={`${liveEnvCount} of ${flightEnvCount}`} caption="Flight environments" />
          </div>
          <CommitLine proof={commitProofOf(live)} className={classes.line} />
          <div className={classes.actions}>
            <Button small onClick={() => onOpenRecord(live.id)}>
              Open record
            </Button>
          </div>
        </>
      ) : (
        <EmptyNote>No release is live in {signoffEnv ?? 'production'} yet.</EmptyNote>
      )}
    </HeroCard>
  );

  const lastChip = last ? outcomeChip(last.outcome) : undefined;
  const lastCard = (
    <HeroCard strip={last?.outcome?.result === 'rolled-back' ? t.bad : t.good}>
      <div className={classes.head}>
        <span className={classes.eyebrow} style={{ color: t.good }}>
          Last outcome
        </span>
      </div>
      {last ? (
        <>
          <div className={classes.nameRow}>
            <span className={`${classes.name} ${classes.nameSmall}`}>{lastName ?? last.version ?? last.imageTag}</span>
            {lastChip && <StatusChip tone={lastChip.tone}>{lastChip.label}</StatusChip>}
          </div>
          <span className={classes.mono}>{last.imageTag}</span>
          <span className={classes.line}>{howItEnded(last, nameOf)}</span>
          {last.signoffs === 0 && <span className={`${classes.line} ${classes.bad}`}>Shipped without a sign-off.</span>}
          <div className={classes.actions}>
            <Button small onClick={() => onOpenRecord(last.id)}>
              Open record
            </Button>
          </div>
        </>
      ) : (
        <EmptyNote>No release has a final outcome yet.</EmptyNote>
      )}
    </HeroCard>
  );

  return (
    <div className={classes.cards}>
      {nextCard}
      {liveCard}
      {lastCard}
    </div>
  );
}

function howItEnded(record: ReleaseRecord, nameOf: (tag?: string) => string | undefined): string {
  const o = record.outcome;
  if (!o) return '';
  const by = (tag?: string) => nameOf(tag) ?? tag;
  if (o.result === 'rolled-back') return `Rolled back to ${by(o.rolledBackBy) ?? 'an earlier release'}${o.rollbackReason ? `: ${o.rollbackReason}` : '.'}`;
  if (o.closedBy === 'bake-complete') return `Healthy through the ${o.bakeDays}-day bake.`;
  if (o.result === 'replaced-before-healthy') return `Replaced${o.supersededBy ? ` by ${by(o.supersededBy)}` : ''} before it was healthy.`;
  if (o.result === 'stopped-before-production') return 'Never reached production.';
  return `Healthy, then replaced${o.supersededBy ? ` by ${by(o.supersededBy)}` : ''}.`;
}
