import { useMemo, useState, type ReactNode } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import { fontMono, useHangarTokens, type HangarTokens } from './brand/tokens';
import { StatusChip, TextLink, Tooltip } from './ui';
import { ReleaseRecordList } from './ReleaseRecordList';
import { ReleaseRecordDetail } from './ReleaseRecordDetail';
import { ReleaseRecordCompare } from './ReleaseRecordCompare';
import { NextReleaseCard } from './NextReleaseCard';
import { AutolandEligibility } from './AutolandEligibility';
import type { NextRelease, NextReleaseCandidate } from './nextRelease';
import type { PullRequestSummary } from './pullRequests/usePullRequests';
import { withRecordedEvidence, type ReleaseRecord } from './useReleaseRecords';
import type { ReleaseNames } from './useReleaseNames';
import { useRepoMarks } from './mounts';
import { repoSlugOfUrl } from './fleetMarks';

// The Releases sub-tab: list<->detail<->compare. Which record is open can be controlled by the tab (openId /
// onOpenIdChange), since the cards above it open records too (2026-10-14, mockup E); left uncontrolled, it keeps its
// own. `compareId` only ever applies on top of an open record (Compare starts from the record's action bar), so
// opening another record clears it. A row of release chips above every view picks the draft or a recent record.

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  picker: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  pickerLabel: { fontFamily: fontMono, fontSize: 11, letterSpacing: '0.12em', color: ({ t }) => t.textLo },
  chipOn: { fontWeight: 600, boxShadow: ({ t }) => `inset 0 0 0 1px ${t.amber}` },
}));

const PICKER_RECENT = 5;

export function ReleaseRecordPanel({
  records: liveRecords,
  totalKnown,
  appName,
  owner,
  gitopsPrs,
  next,
  names,
  flightEnvs,
  promoteTo,
  onPromote,
  modeBar,
  draftEditor,
  modeLabel,
  signoffEnv,
  openId: controlledOpenId,
  onOpenIdChange,
  onChangelog,
}: {
  records: ReleaseRecord[];
  totalKnown: number;
  appName?: string;
  owner?: string;
  gitopsPrs?: PullRequestSummary[];
  /** The release in progress (R1 draft), shown above the records. */
  next?: NextRelease;
  names?: ReleaseNames;
  /** Flight environments in promotion order, for each record's progress through them. */
  flightEnvs?: string[];
  promoteTo?: string;
  onPromote?: (candidate: NextReleaseCandidate) => void;
  /** R2: the release-mode bar above the draft, and the draft editor inside it. */
  modeBar?: ReactNode;
  draftEditor?: ReactNode;
  modeLabel?: string;
  /** The environment whose release PR carries the sign-off. */
  signoffEnv?: string;
  /** The open record, when the tab controls it (null: the list and the draft). */
  openId?: string | null;
  onOpenIdChange?: (id: string | null) => void;
  /** Opens the app's changelog. */
  onChangelog?: () => void;
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  // Every view of a record (row, Compare, the open record) scores it from the same data: live, plus what its
  // committed file adds (frozen guardrails, counted sign-offs).
  const records = useMemo(() => {
    const byTag = new Map((names?.index ?? []).map(e => [e.imageTag, e]));
    return liveRecords.map(r => withRecordedEvidence(r, byTag.get(r.imageTag)));
  }, [liveRecords, names]);
  // The PRs agents opened through Clearance on the repos these records' PRs live in (mounts.tsx), for the marks.
  const marks = useRepoMarks(useMemo(() => records.flatMap(r => r.pullRequests.map(pr => repoSlugOfUrl(pr.url))), [records]));
  const [ownOpenId, setOwnOpenId] = useState<string | null>(null);
  const openId = controlledOpenId !== undefined ? controlledOpenId : ownOpenId;
  const [compareId, setCompareId] = useState<string | null>(null);
  const setOpenId = (id: string | null) => {
    setCompareId(null);
    if (onOpenIdChange) onOpenIdChange(id);
    else setOwnOpenId(id);
  };
  const open = openId ? records.find(r => r.id === openId) : undefined;
  const compareTarget = compareId ? records.find(r => r.id === compareId) : undefined;
  const nameOf = (r: ReleaseRecord) => names?.byTag.get(r.imageTag) ?? r.version ?? r.imageTag;

  const recent = records.slice(0, PICKER_RECENT);
  const picker = (
    <div className={classes.picker} aria-label="Pick a release">
      <span className={classes.pickerLabel}>RELEASE</span>
      {next && (
        <StatusChip tone="warn" onClick={() => setOpenId(null)} className={!open ? classes.chipOn : undefined}>
          {names?.next ?? 'Next'} · draft
        </StatusChip>
      )}
      {recent.map(r => (
        <StatusChip key={r.id} tone="neutral" onClick={() => setOpenId(r.id)} className={open?.id === r.id ? classes.chipOn : undefined}>
          {nameOf(r)}
        </StatusChip>
      ))}
      {records.length > PICKER_RECENT && (
        <Tooltip title="Every record is in the list below the draft">
          <TextLink onClick={() => setOpenId(null)}>
            + {records.length - PICKER_RECENT} older
          </TextLink>
        </Tooltip>
      )}
    </div>
  );

  if (open && compareTarget) {
    return (
      <>
        {picker}
        <ReleaseRecordCompare left={compareTarget} right={open} onBack={() => setCompareId(null)} />
      </>
    );
  }
  if (open) {
    return (
      <>
        {picker}
        <ReleaseRecordDetail
        record={open}
        name={names?.byTag.get(open.imageTag)}
        allNames={names?.byTag}
        signoffEnv={signoffEnv}
        appName={appName}
        owner={owner}
        gitopsPrs={gitopsPrs}
        otherRecords={records.filter(r => r.id !== open.id)}
        onCompare={setCompareId}
        onBack={() => setOpenId(null)}
      />
      </>
    );
  }
  return (
    <>
      {picker}
      {modeBar}
      {modeBar && records.length > 0 && <AutolandEligibility records={records} signoffEnv={signoffEnv} />}
      {next && (
        <NextReleaseCard
          next={next}
          name={names?.next}
          previousName={next.previous ? names?.byTag.get(next.previous.imageTag) : undefined}
          promoteTo={promoteTo}
          onPromote={onPromote}
          modeLabel={modeLabel}
        >
          {draftEditor}
        </NextReleaseCard>
      )}
      <ReleaseRecordList
        records={records}
        totalKnown={totalKnown}
        names={names?.byTag}
        flightEnvs={flightEnvs}
        marks={marks}
        onChangelog={names ? onChangelog : undefined}
        onOpen={setOpenId}
      />
    </>
  );
}
