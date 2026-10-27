import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import { formatDateTime } from './shared/format';
import { useHangarTokens, type HangarTokens } from './brand/tokens';
import { RecordColumn } from './RecordColumn';
import { OUTCOME_LABEL, type OutcomeResult, type RecordOutcome } from './releaseFlow';
import { EmptyNote, Fact, FactGrid, Hint, StatusChip, TextLink, type StatusTone } from './ui';

// What happened after a release shipped (Release Record R3). Tower's backend writes it back into the
// record once it is final (backstage releaseOutcome.ts), from Glidepath's release-tracking records:
// clean, rolled back, replaced before it went healthy, or stopped before production. Until then the
// release is still rolling out or baking (7 days healthy in production).

const DAY = 86_400_000;

export const OUTCOME_TONE: Record<OutcomeResult, StatusTone> = {
  clean: 'ok',
  'rolled-back': 'bad',
  'replaced-before-healthy': 'warn',
  'stopped-before-production': 'neutral',
};

/** A short chip label for a record's outcome, or undefined when there is nothing recorded yet. */
export function outcomeChip(outcome: RecordOutcome | undefined, now = Date.now()): { label: string; tone: StatusTone } | undefined {
  if (!outcome) return undefined;
  if (outcome.result) return { label: OUTCOME_LABEL[outcome.result], tone: OUTCOME_TONE[outcome.result] };
  if (outcome.healthyAt && outcome.state === 'healthy') {
    const day = Math.min(outcome.bakeDays, Math.floor((now - Date.parse(outcome.healthyAt)) / DAY) + 1);
    return { label: `baking · day ${day} of ${outcome.bakeDays}`, tone: 'info' };
  }
  return { label: outcome.state.replace(/-/g, ' '), tone: 'info' };
}

// The strip says how it ended: green clean, red rolled back, amber replaced before healthy, blue still baking.
function toneColour(t: HangarTokens, tone: StatusTone): string {
  if (tone === 'ok') return t.good;
  if (tone === 'bad') return t.bad;
  if (tone === 'warn') return t.amber;
  if (tone === 'info') return t.sky;
  return t.textFaint;
}

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  line: { display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 10, fontSize: 12 },
}));

export function ReleaseOutcomePanel({
  outcome,
  names,
  githubRelease,
}: {
  outcome?: RecordOutcome;
  /** imageTag -> release name, to name the release that replaced or rolled back this one. */
  names?: Map<string, string>;
  githubRelease?: { tag?: string; url?: string; skipped?: string };
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const chip = outcomeChip(outcome);
  const label = (tag?: string) => (tag ? `${names?.get(tag) ? `${names.get(tag)} · ` : ''}${tag}` : undefined);

  let closedBy: string | undefined;
  if (outcome?.closedBy === 'superseded') closedBy = `Replaced by ${label(outcome.supersededBy) ?? 'a newer release'}`;
  else if (outcome?.closedBy === 'rolled-back') closedBy = `Rolled back to ${label(outcome.rolledBackBy) ?? 'an earlier release'}`;
  else if (outcome?.closedBy === 'bake-complete') closedBy = `Healthy for the whole ${outcome.bakeDays}-day bake window`;
  else if (outcome?.closedBy === 'moved-on') closedBy = `Never reached production; ${outcome.env ?? 'its last environment'} moved on`;

  return (
    <RecordColumn
      title="Outcome"
      strip={chip ? toneColour(t, chip.tone) : t.line}
      meta={chip ? <StatusChip tone={chip.tone} dot>{chip.label}</StatusChip> : undefined}
    >
      {!outcome && (
        <EmptyNote>
          No outcome recorded. Tower writes it back once a release is final; releases older than Glidepath's
          14-day tracking window, and cloud targets, have none.
        </EmptyNote>
      )}
      {outcome && (
        <FactGrid>
          {closedBy && <Fact label="What happened">{closedBy}</Fact>}
          {outcome.rollbackReason && <Fact label="Rollback reason">{outcome.rollbackReason}</Fact>}
          {outcome.env && <Fact label="Decided in">{outcome.env}</Fact>}
          {outcome.healthyAt && <Fact label="Healthy since">{formatDateTime(outcome.healthyAt)}</Fact>}
          {outcome.closedAt && <Fact label="Closed">{formatDateTime(outcome.closedAt)}</Fact>}
        </FactGrid>
      )}
      {githubRelease?.url && (
        <div className={classes.line}>
          GitHub Release <TextLink href={githubRelease.url}>{`${githubRelease.tag ?? 'release'} ↗`}</TextLink>
        </div>
      )}
      {githubRelease?.skipped && <Hint>{`GitHub Release not published: ${githubRelease.skipped}.`}</Hint>}
      {outcome && (
        <Hint>
          SLO burn during the bake window is not read yet. The production cluster's Prometheus is on and canary analysis uses it,
          but the outcome is still decided from the rollout alone.
        </Hint>
      )}
    </RecordColumn>
  );
}
