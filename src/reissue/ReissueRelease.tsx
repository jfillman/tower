import { useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import { discoveryApiRef, fetchApiRef, useApi } from '@backstage/core-plugin-api';
import { fontMono, useHangarTokens, type HangarTokens } from '../brand/tokens';
import { ActionReason, Button, Callout, Chip, Hint, StatusChip } from '../ui';
import { PrRef } from '../ui/PrRef';
import { reissueDisabledReason, postReissue, tagOf, type ReissuableRelease, type ReissueStarted } from './reissue';

// "Reissue release PR" (docs/design-system.md, controls): an ACTION on a release whose PR was closed without merging. It opens a
// FRESH release PR for the same image and commit, cut from the current default branch of the gitops repo; the closed PR is not
// reopened. The confirm step is a row in the page, not a browser dialog. Disabled with its reason on screen, never only in a
// tooltip: the caller may not reissue (not an owner), or glidepath-api would refuse (the reason is the API's own words).

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  stack: { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 },
  entryBox: { display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 12px', borderRadius: 6, border: ({ t }) => `1px solid ${t.line}`, backgroundColor: ({ t }) => t.panel },
  head: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  grow: { flex: 1, minWidth: 0 },
  mono: { fontFamily: fontMono, fontSize: 11 },
  confirm: { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' },
}));

/** The confirm step and the request: shown for one entry after its button is pressed. */
export function ReissueConfirm({
  owner,
  appName,
  entry,
  onDone,
  onCancel,
}: {
  owner: string;
  appName: string;
  entry: ReissuableRelease;
  /** The run started (or the same key replayed): the caller follows it. */
  onDone: (started: ReissueStarted) => void;
  onCancel: () => void;
}) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const submit = async () => {
    setBusy(true);
    setError(undefined);
    try {
      onDone(await postReissue(discoveryApi, fetchApi, owner, appName, entry.chainId));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div data-testid="reissue-confirm">
      <div className={c.confirm}>
        <Hint>
          Open a fresh release PR for <span className={c.mono}>{tagOf(entry.image)}</span> on {entry.env}? It is cut from the gitops
          repository&apos;s current default branch with the same image and commit; the closed PR is not reopened, and every check runs
          again.
        </Hint>
        <Button small variant="primary" disabled={busy} onClick={submit}>
          {busy ? 'Reissuing…' : 'Open fresh release PR'}
        </Button>
        <Button small disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
      {error && <Callout tone="bad">{error}</Callout>}
    </div>
  );
}

/**
 * The Releases tab's list of closed release PRs: one row per release (the newest per environment and cluster), each with the
 * action. `onStarted` hands the run to the tab's ReleaseRunTracker, which follows it to the new PR.
 */
export function ReissuePanel({
  owner,
  appName,
  releases,
  allowed,
  onStarted,
}: {
  owner: string;
  appName: string;
  releases: ReissuableRelease[];
  allowed: boolean;
  onStarted: (entry: ReissuableRelease, started: ReissueStarted) => void;
}) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const [asking, setAsking] = useState<string | undefined>();
  if (releases.length === 0) return null;
  return (
    <div className={c.stack} aria-label="Release PRs closed without merging">
      {releases.map(entry => {
        const reason = reissueDisabledReason(entry, allowed);
        const reasonId = `reissue-reason-${entry.chainId}`;
        return (
          <div key={entry.chainId} className={c.entryBox} data-testid="reissue-row">
            <div className={c.head}>
              <StatusChip tone="warn">PR closed, not merged</StatusChip>
              <Chip tone="flight">{entry.env}</Chip>
              <span className={`${c.grow} ${c.mono}`}>{tagOf(entry.image)}</span>
              <PrRef pr={{ url: entry.prUrl, state: 'closed' }} size="inline" />
              <Button small disabled={Boolean(reason)} aria-describedby={reason ? reasonId : undefined} onClick={() => setAsking(entry.chainId)}>
                Reissue release PR
              </Button>
            </div>
            {reason && <ActionReason id={reasonId}>{reason}</ActionReason>}
            {!reason && asking === entry.chainId && (
              <ReissueConfirm
                owner={owner}
                appName={appName}
                entry={entry}
                onCancel={() => setAsking(undefined)}
                onDone={started => {
                  setAsking(undefined);
                  onStarted(entry, started);
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
