import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import { formatDateTime } from './shared/format';
import { useHangarTokens, type HangarTokens } from './brand/tokens';
import { RecordColumn } from './RecordColumn';
import {
  NOTE_CATEGORIES,
  NOTE_LABEL,
  RELEASE_MODE_LABEL,
  SIGNOFF_LABEL,
  type ReleaseDraft,
  type ReleaseMode,
  type SignoffEvaluation,
} from './releaseFlow';
import { EmptyNote, Fact, FactGrid, Hint, SectionTitle, StatusChip, Tile, type StatusTone } from './ui';
import { PrRef } from './ui/PrRef';

// A record's release notes and sign-off (Release Record R2). The notes are what the team wrote in
// the draft before the release shipped, copied in when the record was written. The sign-off is
// the approving reviews on the release PR to the sign-off environment: from the record when it
// was sealed after that PR merged, else read live from GitHub.

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  grid: {
    display: 'grid',
    gridTemplateColumns: '1.3fr 1fr',
    gap: 12,
    '@media (max-width: 900px)': { gridTemplateColumns: '1fr' },
  },
  column: { minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 },
  section: { fontSize: 12.5, color: ({ t }) => t.textHi },
  list: { margin: '2px 0 0', paddingLeft: 18 },
  line: { display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 8, fontSize: 12.5 },
  faint: { color: ({ t }) => t.textFaint, fontSize: 12 },
}));

const SIGNOFF_TONE: Record<SignoffEvaluation['status'], StatusTone> = {
  awaiting: 'warn',
  approved: 'ok',
  signed: 'ok',
  'self-approved': 'bad',
  'shipped-without': 'bad',
};

function approvalNote(a: SignoffEvaluation['approvals'][number], mergedBy?: string): string {
  if (!a.beforeMerge) return ' · after the merge';
  if (a.by === mergedBy) return ' · the merger';
  if (a.notApprover) return " · not one of this app's owners or an admin, so it doesn't count";
  if (a.approverUnknown) return " · couldn't check that this reviewer may sign off, so it doesn't count";
  return '';
}

export interface SealedRelease extends ReleaseDraft {
  mode?: ReleaseMode;
  signoff?: SignoffEvaluation;
}

export function ReleaseSignoffPanel({
  release,
  signoff,
  signoffEnv,
  mode,
  loading,
  live,
  addedAfter,
}: {
  /** The release block of a v2 record; absent on records written before R2. */
  release?: SealedRelease;
  signoff?: SignoffEvaluation;
  signoffEnv?: string;
  /** The mode the release shipped under (from the record), else the app's mode now. */
  mode?: ReleaseMode;
  loading: boolean;
  /** Read live from the PR rather than from the record: shown, but not part of the score. */
  live?: boolean;
  /**
   * A summary or risk written into the record's human context after it shipped, before the draft carried them.
   * Shown here, beside the release's own, so a record has one place for what the release was.
   */
  addedAfter?: { summary?: string; risk?: string; riskNotes?: string };
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const notes = NOTE_CATEGORIES.filter(c => (release?.notes?.[c]?.length ?? 0) > 0);
  const requiresSignoff = mode === 'hand-flown';
  const missing = signoff && (signoff.status === 'shipped-without' || signoff.status === 'self-approved');

  return (
    <RecordColumn
      title="Release notes and sign-off"
      strip={t.amber}
      meta={
        mode ? (
          <StatusChip tone={requiresSignoff ? 'warn' : 'info'} dot>
            {RELEASE_MODE_LABEL[mode]}
          </StatusChip>
        ) : undefined
      }
    >
      <div className={classes.grid}>
        <Tile className={classes.column}>
          <SectionTitle level={2}>Release notes</SectionTitle>
          {release?.summary && <div className={classes.section}>{release.summary}</div>}
          {!release && !addedAfter?.summary && <EmptyNote>Written before release notes were part of the record.</EmptyNote>}
          {release && notes.length === 0 && !release.summary && <EmptyNote>No notes were written for this release.</EmptyNote>}
          {notes.map(c => (
            <div key={c} className={classes.section}>
              <b>{NOTE_LABEL[c]}</b>
              <ul className={classes.list}>
                {release!.notes![c]!.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
          ))}
          {(release?.knownIssues?.length ?? 0) > 0 && (
            <div className={classes.section}>
              <b>Known issues</b>
              <ul className={classes.list}>
                {release!.knownIssues!.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
          )}
          {(addedAfter?.summary || addedAfter?.risk || addedAfter?.riskNotes) && (
            <FactGrid>
              {addedAfter.summary && <Fact label="Summary (added after release)">{addedAfter.summary}</Fact>}
              {addedAfter.risk && <Fact label="Risk (added after release)">{addedAfter.risk}</Fact>}
              {addedAfter.riskNotes && <Fact label="Risk notes (added after release)">{addedAfter.riskNotes}</Fact>}
            </FactGrid>
          )}
          {release && (release.owner || release.risk) && (
            <FactGrid>
              {release.owner && <Fact label="Owner">{release.owner}</Fact>}
              {release.risk?.level && <Fact label="Risk">{release.risk.level}</Fact>}
              {release.risk?.notes && <Fact label="Risk notes">{release.risk.notes}</Fact>}
              {release.risk?.rollback && <Fact label="Rollback notes">{release.risk.rollback}</Fact>}
            </FactGrid>
          )}
        </Tile>

        <Tile className={classes.column}>
          <SectionTitle level={2}>{`Sign-off${signoffEnv ? ` · ${signoffEnv}` : ''}`}</SectionTitle>
          {loading && !signoff && <EmptyNote>Reading the release PR…</EmptyNote>}
          {!loading && !signoff && (
            <EmptyNote>
              {signoffEnv
                ? `This image has no release PR to ${signoffEnv} yet.`
                : 'This app has no Flight environment to sign off.'}
            </EmptyNote>
          )}
          {signoff && (
            <>
              <div className={classes.line}>
                <StatusChip tone={missing && !requiresSignoff ? 'neutral' : SIGNOFF_TONE[signoff.status]} dot>
                  {SIGNOFF_LABEL[signoff.status]}
                </StatusChip>
                <PrRef pr={{ url: signoff.prUrl, number: signoff.prNumber, state: signoff.mergedBy ? 'merged' : 'open' }} size="inline" />
                {signoff.mergedBy && (
                  <span className={classes.faint}>
                    merged by {signoff.mergedBy}
                    {signoff.mergedAt ? ` · ${formatDateTime(signoff.mergedAt)}` : ''}
                  </span>
                )}
              </div>
              {signoff.approvals.length === 0 && <EmptyNote>No approving reviews.</EmptyNote>}
              {signoff.approvals.map(a => (
                <div key={a.by} className={classes.line}>
                  <span>{a.counts ? '✓' : '·'}</span>
                  <span>{a.by}</span>
                  <span className={classes.faint}>
                    {formatDateTime(a.at)}
                    {approvalNote(a, signoff.mergedBy)}
                  </span>
                </div>
              ))}
              {missing && requiresSignoff && (
                <Hint>
                  Hand-flown: this release reached {signoff.env} without an approval from someone other than the person who
                  merged it.
                </Hint>
              )}
              {missing && !requiresSignoff && <Hint>Assisted: a sign-off is recorded, not required.</Hint>}
              {live && signoff.approvals.some(a => a.counts) && (
                <Hint>Read live from the PR. It counts toward the score once the record carries it.</Hint>
              )}
            </>
          )}
        </Tile>
      </div>
    </RecordColumn>
  );
}
