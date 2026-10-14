import { useState } from 'react';
import { ReleaseRecordList } from './ReleaseRecordList';
import { ReleaseRecordDetail } from './ReleaseRecordDetail';
import { ReleaseRecordCompare } from './ReleaseRecordCompare';
import { NextReleaseCard } from './NextReleaseCard';
import type { NextRelease, NextReleaseCandidate } from './nextRelease';
import type { PullRequestSummary } from './pullRequests/usePullRequests';
import type { ReleaseRecord } from './useReleaseRecords';
import type { ReleaseNames } from './useReleaseNames';

// The Record sub-tab's own list<->detail<->compare state (ReleasesTab.tsx
// just renders this for `activeTab === 'record'`, same as every other
// sub-tab panel) - kept local rather than lifted into ReleasesTab's own
// state since nothing else on that tab needs to know which record is open.
// `compareId` only ever applies on top of an open detail record (Compare is
// triggered from the detail view's own action bar) - clearing `openId`
// without also clearing `compareId` would leave compare state pointing at a
// record no longer open, so `onBack` on the list is the only place that
// needs to reset both.
export function ReleaseRecordPanel({
  records,
  totalKnown,
  appName,
  owner,
  gitopsPrs,
  next,
  names,
  flightEnvs,
  promoteTo,
  onPromote,
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
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [compareId, setCompareId] = useState<string | null>(null);
  const open = openId ? records.find(r => r.id === openId) : undefined;
  const compareTarget = compareId ? records.find(r => r.id === compareId) : undefined;

  if (open && compareTarget) {
    return <ReleaseRecordCompare left={compareTarget} right={open} onBack={() => setCompareId(null)} />;
  }
  if (open) {
    return (
      <ReleaseRecordDetail
        record={open}
        name={names?.byTag.get(open.imageTag)}
        appName={appName}
        owner={owner}
        gitopsPrs={gitopsPrs}
        otherRecords={records.filter(r => r.id !== open.id)}
        onCompare={setCompareId}
        onBack={() => setOpenId(null)}
      />
    );
  }
  return (
    <>
      {next && (
        <NextReleaseCard
          next={next}
          name={names?.next}
          previousName={next.previous ? names?.byTag.get(next.previous.imageTag) : undefined}
          promoteTo={promoteTo}
          onPromote={onPromote}
        />
      )}
      <ReleaseRecordList
        records={records}
        totalKnown={totalKnown}
        names={names?.byTag}
        flightEnvs={flightEnvs}
        onOpen={id => {
          setCompareId(null);
          setOpenId(id);
        }}
      />
    </>
  );
}
