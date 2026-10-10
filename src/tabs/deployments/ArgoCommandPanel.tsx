import { useEffect, useRef, useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import { relativeTime, formatDateTime } from '../../shared/format';
import { fontDisplay, fontMono, useHangarTokens, type HangarTokens } from '../../brand/tokens';
import { ImageTagPill } from './ImageTagPill';
import type { ArgoResourceNode, EnvironmentSummary, K8sResourceRef } from '../../types';
import { useArgoCapabilities, type useArgoActions } from '../../useReleaseData';
import { Button, StatusChip, TextLink } from '../../ui';
import { argoTone } from '../../argoTone';

// ArgoCD stamps the sync-wave a resource applied at as a live annotation on
// the resource itself (argocd.argoproj.io/sync-wave) - it's never part of
// the Application object's own status (neither status.resources nor
// operationState.syncResult carries it, see ArgoResourceNode's own
// comment), so the only honest way to show it is a best-effort cross-
// reference against Tower's own separately-fetched live K8s resource list
// (env.resources, a direct Kubernetes read - see useTowerEnvironments.ts),
// matched by kind+name. Undefined whenever no match is found (a cluster-
// scoped resource ArgoCD manages but Tower's own namespace-scoped read
// never fetched, most commonly) rather than a guessed default of "0".
function syncWaveFor(node: ArgoResourceNode, k8sResources: K8sResourceRef[]): string | undefined {
  return k8sResources.find(r => r.kind === node.kind && r.name === node.name)?.annotations?.[
    'argocd.argoproj.io/sync-wave'
  ];
}

// Ground Control's ArgoCD "command panel" (2026-09-16 feedback round 2 -
// "smaller command center like panel that can expand to show the lesser
// interesting info like the resource tree... move the sync buttons into
// the command panel and provide all the sync options as well"). Replaces
// the original ArgoAppPanel: same real facts (HANDOFF-tower-cicd-
// redesign.md's "all important ArgoCD app info must be surfaced"), but a
// compact always-visible header (status + actions) with the kv-grid/
// resource-tree detail behind a disclosure, and the Refresh/Sync action
// group (previously in DeploymentsTab's own topbar) now lives here.
//
// Deliberately does NOT link out to ArgoCD's own UI for a diff view - Tower
// has no configured ArgoCD server base URL anywhere in its frontend today,
// and guessing one would be a broken link on some real fraction of
// clusters. The out-of-sync resource count itself is real; only the deep
// link is the thing not yet wired up.

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  panel: {
    backgroundColor: ({ t }) => t.panel,
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 10,
    padding: '14px 18px',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  headRow: { display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' },
  title: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 14, color: ({ t }) => t.textHi, flexShrink: 0 },
  statusChips: { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' },
  revision: { fontFamily: fontMono, fontSize: 10.5, color: ({ t }) => t.textFaint },
  actions: { display: 'flex', gap: 6, marginLeft: 'auto', flexWrap: 'wrap', alignItems: 'center' },
  argoErr: { fontSize: 11.5, fontStyle: 'italic', color: ({ t }) => t.bad },
  // Real Application-level facts ArgoCD's own UI shows as standing banners
  // (2026-09-16: "the argocd info panel is missing vital info - there was
  // a sync result message" - operationState.message and status.conditions
  // weren't surfaced anywhere outside the collapsed disclosure before).
  // Always visible, not gated behind "show details" - these are exactly
  // the kind of thing that banner exists to hide by default (routine
  // sync/revision facts), not this.
  opBanner: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    padding: '8px 10px',
    borderRadius: 6,
    backgroundColor: ({ t }) => t.skySoft,
    border: ({ t }) => `1px solid ${t.skyLine}`,
  },
  opBannerBadge: { fontFamily: fontMono, fontSize: 9.5, fontWeight: 700, color: ({ t }) => t.sky, flexShrink: 0, marginTop: 1 },
  opBannerText: { fontSize: 12, color: ({ t }) => t.textHi, lineHeight: 1.5 },
  opBannerMeta: { fontFamily: fontMono, fontSize: 10, color: ({ t }) => t.textFaint, marginTop: 2 },
  condition: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    padding: '8px 10px',
    borderRadius: 6,
    backgroundColor: ({ t }) => t.badSoft,
    border: ({ t }) => `1px solid ${t.bad}`,
  },
  conditionType: { fontFamily: fontMono, fontSize: 9.5, fontWeight: 700, color: ({ t }) => t.bad, flexShrink: 0, marginTop: 1 },
  conditionText: { fontSize: 12, color: ({ t }) => t.textHi, lineHeight: 1.5, wordBreak: 'break-word' },
  // The per-action explainer table (2026-09-16: "easy to understand
  // explainers on which sync option to enable depending on the argocd
  // state and what its possible errors are") - a short, always-the-same
  // reference, not a dynamic recommendation engine (TroubleshootBanner
  // already reads live state and tells you what's actually wrong/what to
  // do about THIS environment right now; this panel's guide is the
  // general "what does each button do" reference alongside it).
  guide: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    padding: '10px 12px',
    backgroundColor: ({ t }) => t.panelAlt,
    borderRadius: 8,
    border: ({ t }) => `1px solid ${t.lineSoft}`,
  },
  guideRow: { display: 'flex', gap: 10, fontSize: 11.5 },
  guideName: { fontFamily: fontMono, fontWeight: 700, color: ({ t }) => t.textHi, flex: '0 0 132px' },
  guideBody: { color: ({ t }) => t.textLo, lineHeight: 1.5 },
  guideRoadmapTag: { fontFamily: fontMono, fontSize: 9, color: ({ t }) => t.textFaint, fontStyle: 'italic' },
  detail: { display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 4, borderTop: ({ t }) => `1px solid ${t.lineSoft}` },
  kvGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px' },
  kv: { display: 'flex', flexDirection: 'column', gap: 2, padding: '7px 9px', backgroundColor: ({ t }) => t.panelAlt, borderRadius: 6 },
  kvFull: { gridColumn: '1 / -1' },
  k: { fontFamily: fontMono, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.05em', color: ({ t }) => t.textFaint, fontWeight: 700 },
  v: { fontFamily: fontMono, fontSize: 11.5, color: ({ t }) => t.textHi, wordBreak: 'break-word' },
  flags: { display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 3 },
  flag: { fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 5, backgroundColor: ({ t }) => t.goodSoft, color: ({ t }) => t.good },
  flagOff: { backgroundColor: ({ t }) => t.lineSoft, color: ({ t }) => t.textFaint },
  subTitle: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 12.5, color: ({ t }) => t.textHi, marginBottom: 2 },
  // The full ArgoCD "Sync Status" panel column set (2026-09-16: "I would
  // like the argocd resource tree section to contain the same info as
  // argocd's UI does in the sync status page... sync wave, status, health,
  // hook, message") - a real table, not the prior flat pill list, since
  // that's the shape this much real per-resource data actually needs.
  treeScroll: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontFamily: fontMono, fontSize: 11 },
  headCell: {
    textAlign: 'left',
    padding: '5px 8px',
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    fontWeight: 700,
    color: ({ t }) => t.textFaint,
    whiteSpace: 'nowrap',
  },
  bodyRow: { borderTop: ({ t }) => `1px solid ${t.lineSoft}` },
  bodyRowHook: { backgroundColor: ({ t }) => t.panelAlt },
  cell: { padding: '6px 8px', color: ({ t }) => t.textHi, verticalAlign: 'top' },
  cellMuted: { padding: '6px 8px', color: ({ t }) => t.textFaint, verticalAlign: 'top' },
  cellKind: { padding: '6px 8px', color: ({ t }) => t.sky, fontWeight: 600, verticalAlign: 'top', whiteSpace: 'nowrap' },
  cellName: { padding: '6px 8px', color: ({ t }) => t.textHi, verticalAlign: 'top', wordBreak: 'break-word' },
  cellMessage: { padding: '6px 8px', color: ({ t }) => t.textFaint, verticalAlign: 'top', wordBreak: 'break-word', maxWidth: 260 },
  hookBadge: {
    display: 'inline-block',
    fontSize: 9.5,
    fontWeight: 700,
    padding: '2px 7px',
    borderRadius: 10,
    whiteSpace: 'nowrap',
    backgroundColor: ({ t }) => t.skySoft,
    color: ({ t }) => t.sky,
  },
  diffNote: { fontSize: 11, color: ({ t }) => t.textFaint, paddingTop: 6 },
  note: { fontSize: 12, fontStyle: 'italic', color: ({ t }) => t.textLo, padding: '2px 0' },
}));


const SYNC_GUIDE: Array<{ name: string; roadmap?: boolean; body: string }> = [
  {
    name: 'Refresh',
    body: 'Re-compares live cluster state against git and recomputes the diff. Applies nothing. Safe to click anytime - use it when you just want to confirm the status above is current.',
  },
  {
    name: 'Hard refresh',
    body: "Same as Refresh, but also bypasses ArgoCD's cached manifest render (Helm/Kustomize output). Use this instead of a plain Refresh when you changed something that affects manifest generation itself - a Helm values file, a referenced ConfigMap - and the diff still looks stale.",
  },
  {
    name: 'Sync',
    body: "Applies git's declared state to the cluster, following the Application's own sync policy: environment Applications prune, so anything git no longer declares is deleted too, as the next automatic sync would (there is no separate Sync with prune). Use when Sync status above reads OutOfSync and you don't want to wait for automated sync. Possible error: a sync can fail if a resource change conflicts with one made directly in the cluster.",
  },
  {
    name: 'Force sync',
    body: "Deletes and recreates a resource instead of patching it (Argo CD's --force). Use to recover from a resource stuck by an immutable-field conflict that a normal Sync can't apply, such as a changed Service selector or Job template. Risk: whatever gets replaced is briefly down. Ground: the app's owners. Flight: admins only.",
  },
  {
    name: 'Terminate',
    body: 'Stops the sync operation that is running now, as Argo CD\'s own Terminate does. Use when a sync is stuck (a hook that never finishes, a resource that never gets healthy) and blocking the next one. What was already applied stays applied; run Sync again once the cause is fixed.',
  },
  // ArgoCD's own Sync dialog "Advanced" section (2026-09-16: "consider adding additional argocd sync options").
  // Guide-only, no buttons: real sync-request modifiers this platform does not offer. Apply only went 2026-10-10:
  // it skips resource hooks, and Glidepath's environments have none since ADR-0021 phase 3.
  {
    name: 'Replace',
    roadmap: true,
    body: "Uses kubectl replace instead of a normal apply - fully overwrites a resource with what's in git, dropping any field a normal apply left alone (e.g. one a different controller set directly). Use when a resource has drifted in a way a normal patch-based apply can't reconcile. Risk: can drop real fields a normal apply would have preserved.",
  },
  {
    name: 'Server-side apply',
    roadmap: true,
    body: "Uses the Kubernetes API server's own server-side apply instead of ArgoCD's client-side apply, for correct field-ownership tracking when another controller also legitimately writes to the same resource (e.g. an HPA managing replicas). Use when client-side apply keeps fighting that other controller. Possible error: a real field-manager conflict if two managers both claim the same field without one yielding.",
  },
];

/** What a Force sync would replace: the resources Argo CD reports out of sync. */
export function forceSyncTargets(resources: Array<{ kind: string; name: string; syncStatus?: string }>): string[] {
  return resources.filter(r => r.syncStatus && r.syncStatus !== 'Synced').map(r => `${r.kind}/${r.name}`);
}

export function ArgoCommandPanel({
  env,
  argoActions,
  currentImage,
  incomingImage,
}: {
  env: EnvironmentSummary;
  argoActions: ReturnType<typeof useArgoActions>;
  // The env's own live image tag+slug (2026-09-16: "find a better place to
  // put the current image tag" - it used to sit under a redundant heading
  // in DeploymentsTab's own topbar, stacked on top of this panel's own
  // identical app-name subtitle). This panel is the natural home: it's the
  // one place already answering "what is this environment's ArgoCD app
  // currently doing," and the image is exactly that same kind of fact.
  currentImage?: { tag?: string; nickname?: string };
  // The release being deployed right now, when one is in flight (2026-09-24:
  // "when a new deployment begins, the current image details should be still
  // visible somewhere until the deployment successfully completes" - so
  // `currentImage` above stays the image that's live until this one finishes,
  // and this shows what's replacing it, side by side, rather than the new tag
  // silently taking the old one's place).
  incomingImage?: { tag?: string; nickname?: string };
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const [detailOpen, setDetailOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [confirmForce, setConfirmForce] = useState(false);
  const caps = useArgoCapabilities(env.argoAppName ? env.cluster : undefined, env.argoAppName);

  // Auto-clears a stale action error once ArgoCD's own live state has
  // genuinely moved on from it (2026-09-17 bug: a 503 from a transient
  // "no available server" sync attempt kept showing here indefinitely even
  // after a later sync - triggered by ArgoCD's own automated self-heal, not
  // another click through this panel - had already succeeded; `error` only
  // ever reset at the START of the next call through useArgoActions, which
  // never happened here). Tracks a signature of the real signals a new
  // operation would change; skips clearing on mount (ref starts undefined)
  // so a genuinely fresh error from this very panel's own action still
  // shows immediately. Also means an error doesn't bleed across environments
  // when the picker switches - argoActions is one shared hook instance for
  // the whole tab (see DeploymentsTab.tsx), not one per env.
  const errorSignatureRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const signature = `${env.argoAppName ?? ''}|${env.argoOperationStartedAt ?? ''}|${env.argoOperationFinishedAt ?? ''}|${env.argoSyncStatus ?? ''}`;
    if (argoActions.error && errorSignatureRef.current !== undefined && errorSignatureRef.current !== signature) {
      argoActions.clearError();
    }
    errorSignatureRef.current = signature;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [env.argoAppName, env.argoOperationStartedAt, env.argoOperationFinishedAt, env.argoSyncStatus]);

  if (!env.argoAppName) {
    return (
      <div className={classes.panel}>
        <Typography className={classes.title}>ArgoCD application</Typography>
        <Typography className={classes.note}>This environment has no ArgoCD Application resolved yet.</Typography>
      </div>
    );
  }

  const canAct = Boolean(env.cluster);
  const reached = env.argoHealthStatus !== undefined || env.argoSyncStatus !== undefined;
  const resources = env.argoResources ?? [];
  const outOfSync = resources.filter(r => r.syncStatus && r.syncStatus !== 'Synced').length;

  const act = (fn: (cluster: string, appName: string) => void) => {
    if (canAct) fn(env.cluster, env.argoAppName!);
  };
  // Until the capabilities answer, offer what was offered before (refresh, sync); the routes decide either way.
  const may = (a: 'refresh' | 'sync' | 'force' | 'terminate') => (caps.data ? caps.data[a] : a === 'refresh' || a === 'sync');
  const notAllowed = (a: 'sync' | 'force' | 'terminate') =>
    caps.data?.tier === 'flight' && (a === 'sync' || a === 'force')
      ? 'On a Flight environment only an admin may do this.'
      : "Only the app's owning team (or an admin) may do this.";
  const running = env.argoOperationPhase === 'Running';
  const replaced = forceSyncTargets(resources);

  return (
    <div className={classes.panel}>
      <div className={classes.headRow}>
        <div>
          <Typography className={classes.title}>{env.argoAppName}</Typography>
        </div>
        {currentImage?.tag && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {incomingImage?.tag && <span style={{ fontSize: 10, color: t.textFaint, fontFamily: fontMono }}>LIVE</span>}
            <ImageTagPill tag={currentImage.tag} nickname={currentImage.nickname} size="small" />
          </span>
        )}
        {incomingImage?.tag && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10, color: t.amberInk, fontFamily: fontMono, fontWeight: 700 }}>⇢ DEPLOYING</span>
            <ImageTagPill tag={incomingImage.tag} nickname={incomingImage.nickname} size="small" />
          </span>
        )}
        <div className={classes.statusChips}>
          <StatusChip tone={argoTone(env.argoSyncStatus)}>{env.argoSyncStatus ?? 'unknown'}</StatusChip>
          <StatusChip tone={argoTone(env.argoHealthStatus)}>{env.argoHealthStatus ?? 'unknown'}</StatusChip>
          {env.argoRevision && <span className={classes.revision}>@ {env.argoRevision.slice(0, 9)}</span>}
        </div>
        <div className={classes.actions}>
          <Button small title={SYNC_GUIDE[0].body} disabled={!canAct || Boolean(argoActions.pending)} onClick={() => act(argoActions.refresh)}>
            {argoActions.pending === 'refresh' ? 'Refreshing…' : 'Refresh'}
          </Button>
          <Button
            small
            title={SYNC_GUIDE[1].body}
            disabled={!canAct || Boolean(argoActions.pending)}
            onClick={() => act(argoActions.hardRefresh)}
          >
            {argoActions.pending === 'hardRefresh' ? 'Refreshing…' : 'Hard refresh'}
          </Button>
          <Button
            small
            variant="primary"
            title={may('sync') ? SYNC_GUIDE[2].body : notAllowed('sync')}
            disabled={!canAct || Boolean(argoActions.pending) || !may('sync')}
            onClick={() => act(argoActions.sync)}
          >
            {argoActions.pending === 'sync' ? 'Syncing…' : 'Sync'}
          </Button>
          <Button
            small
            variant="danger"
            title={may('force') ? SYNC_GUIDE[3].body : notAllowed('force')}
            disabled={!canAct || Boolean(argoActions.pending) || !may('force')}
            onClick={() => setConfirmForce(true)}
          >
            {argoActions.pending === 'force' ? 'Forcing…' : 'Force sync'}
          </Button>
          {running && (
            <Button
              small
              variant="danger"
              title={may('terminate') ? SYNC_GUIDE[4].body : notAllowed('terminate')}
              disabled={!canAct || Boolean(argoActions.pending) || !may('terminate')}
              onClick={() => act(argoActions.terminate)}
            >
              {argoActions.pending === 'terminate' ? 'Terminating…' : 'Terminate sync'}
            </Button>
          )}
          <TextLink expanded={guideOpen} onClick={() => setGuideOpen(v => !v)}>
            Which one?
          </TextLink>
        </div>
      </div>

      {(env.argoOperationMessage || env.argoOperationPhase) && (
        <div className={classes.opBanner}>
          <span className={classes.opBannerBadge}>{env.argoOperationPhase ?? 'OPERATION'}</span>
          <div>
            {env.argoOperationMessage && <Typography className={classes.opBannerText}>{env.argoOperationMessage}</Typography>}
            {env.argoReconciledAt && (
              <Typography className={classes.opBannerMeta} title={formatDateTime(env.argoReconciledAt)}>
                Last reconcile: {relativeTime(env.argoReconciledAt)}
              </Typography>
            )}
          </div>
        </div>
      )}

      {(env.argoConditions ?? []).map((c, i) => (
        <div key={`${c.type}-${i}`} className={classes.condition}>
          <span className={classes.conditionType}>{c.type}</span>
          <Typography className={classes.conditionText}>{c.message}</Typography>
        </div>
      ))}

      {confirmForce && (
        <div className={classes.condition} data-testid="force-sync-confirm">
          <span className={classes.conditionType}>Force sync</span>
          <div>
            <Typography className={classes.conditionText}>
              {replaced.length > 0
                ? `Delete and recreate what is out of sync in ${env.argoAppName}: ${replaced.join(', ')}. Each is down until it is recreated.`
                : `Nothing in ${env.argoAppName} is out of sync right now, so a force sync has nothing to replace.`}
            </Typography>
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <Button
                small
                variant="danger"
                disabled={replaced.length === 0}
                onClick={() => {
                  setConfirmForce(false);
                  act(argoActions.forceSync);
                }}
              >
                Force sync
              </Button>
              <Button small onClick={() => setConfirmForce(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {argoActions.error && <Typography className={classes.argoErr}>{argoActions.error}</Typography>}
      {!reached && (
        <Typography className={classes.note}>
          Couldn't reach ArgoCD for {env.argoAppName} - the facts here may be stale, not actually wrong.
        </Typography>
      )}

      {guideOpen && (
        <div className={classes.guide}>
          {SYNC_GUIDE.map(g => (
            <div key={g.name} className={classes.guideRow}>
              <span className={classes.guideName}>
                {g.name}
                {g.roadmap && <div className={classes.guideRoadmapTag}>not yet available</div>}
              </span>
              <span className={classes.guideBody}>{g.body}</span>
            </div>
          ))}
        </div>
      )}

      <div>
        <TextLink expanded={detailOpen} onClick={() => setDetailOpen(v => !v)}>
          Sync policy, revision and resource tree
        </TextLink>
      </div>

      {detailOpen && (
        <div className={classes.detail}>
          <div className={classes.kvGrid}>
            <div className={classes.kv}>
              <span className={classes.k}>Application</span>
              <span className={classes.v}>{env.argoAppName}</span>
            </div>
            <div className={classes.kv}>
              <span className={classes.k}>Target revision</span>
              <span className={classes.v}>{env.argoSource?.targetRevision ?? '—'}</span>
            </div>
            <div className={classes.kv}>
              <span className={classes.k}>Last sync</span>
              <span
                className={classes.v}
                title={env.argoOperationStartedAt ? formatDateTime(env.argoOperationStartedAt) : undefined}
              >
                {env.argoOperationStartedAt ? relativeTime(env.argoOperationStartedAt) : '—'}
              </span>
            </div>
            <div className={classes.kv}>
              <span className={classes.k}>Last operation</span>
              <span className={classes.v}>{env.argoOperationPhase ?? '—'}</span>
            </div>
            <div className={classes.kv}>
              <span className={classes.k}>Out of sync</span>
              <span className={classes.v}>{resources.length > 0 ? `${outOfSync} resource${outOfSync === 1 ? '' : 's'}` : '—'}</span>
            </div>
            {env.argoOperationMessage && (
              <div className={`${classes.kv} ${classes.kvFull}`}>
                <span className={classes.k}>Last operation message</span>
                <span className={classes.v}>{env.argoOperationMessage}</span>
              </div>
            )}
            <div className={`${classes.kv} ${classes.kvFull}`}>
              <span className={classes.k}>Sync policy</span>
              <div className={classes.flags}>
                <span className={`${classes.flag} ${env.argoSyncPolicy?.automated ? '' : classes.flagOff}`}>automated</span>
                <span className={`${classes.flag} ${env.argoSyncPolicy?.selfHeal ? '' : classes.flagOff}`}>self-heal</span>
                <span className={`${classes.flag} ${env.argoSyncPolicy?.prune ? '' : classes.flagOff}`}>prune</span>
              </div>
            </div>
            {env.argoSource?.repoUrl && (
              <div className={`${classes.kv} ${classes.kvFull}`}>
                <span className={classes.k}>Source</span>
                <span className={classes.v}>
                  {env.argoSource.repoUrl.replace(/^https?:\/\//, '')}
                  {env.argoSource.path ? ` · ${env.argoSource.path}` : ''}
                </span>
              </div>
            )}
          </div>

          <div>
            <Typography className={classes.subTitle}>Resource tree</Typography>
            {resources.length === 0 ? (
              <Typography className={classes.note}>
                No resource tree reported yet{reached ? '' : ' (ArgoCD unreachable)'}.
              </Typography>
            ) : (
              <div className={classes.treeScroll}>
                <table className={classes.table}>
                  <thead>
                    <tr>
                      <th className={classes.headCell}>Sync wave</th>
                      <th className={classes.headCell}>Kind</th>
                      <th className={classes.headCell}>Name</th>
                      <th className={classes.headCell}>Status</th>
                      <th className={classes.headCell}>Health</th>
                      <th className={classes.headCell}>Hook</th>
                      <th className={classes.headCell}>Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resources.map((r, i) => (
                      <tr key={`${r.kind}-${r.name}-${i}`} className={`${classes.bodyRow} ${r.hookType ? classes.bodyRowHook : ''}`}>
                        <td className={classes.cellMuted}>{syncWaveFor(r, env.resources) ?? '—'}</td>
                        <td className={classes.cellKind}>{r.kind}</td>
                        <td className={classes.cellName}>{r.name}</td>
                        <td className={classes.cell}>
                          {r.syncStatus ? <StatusChip tone={argoTone(r.syncStatus)}>{r.syncStatus}</StatusChip> : '—'}
                        </td>
                        <td className={classes.cell}>
                          {r.health ? (
                            <StatusChip tone={argoTone(r.health)}>{r.health}</StatusChip>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className={classes.cell}>{r.hookType && <span className={classes.hookBadge}>{r.hookType}</span>}</td>
                        <td className={classes.cellMessage}>{r.message ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {resources.length > 0 && (
              <Typography className={classes.diffNote}>
                {outOfSync === 0 ? 'All resources in sync.' : `${outOfSync} resource${outOfSync === 1 ? '' : 's'} out of sync.`}
              </Typography>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
