import { useEffect, useRef, useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import { relativeTime, formatDateTime } from '../../../shared/format';
import { fontDisplay, fontMono, useHangarTokens, type HangarTokens } from '../../../brand/tokens';
import { ImageTagPill } from './ImageTagPill';
import type { ArgoResourceNode, EnvironmentSummary, K8sResourceRef } from '../../types';
import type { useArgoActions } from '../../useReleaseData';

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
  chip: { fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 12 },
  chipOk: { backgroundColor: ({ t }) => t.goodSoft, color: ({ t }) => t.good },
  chipProg: { backgroundColor: ({ t }) => t.amberSoft, color: ({ t }) => t.amberInk },
  chipBad: { backgroundColor: ({ t }) => t.badSoft, color: ({ t }) => t.bad },
  chipUnknown: { backgroundColor: ({ t }) => t.lineSoft, color: ({ t }) => t.textFaint },
  revision: { fontFamily: fontMono, fontSize: 10.5, color: ({ t }) => t.textFaint },
  actions: { display: 'flex', gap: 6, marginLeft: 'auto', flexWrap: 'wrap', alignItems: 'center' },
  btn: {
    fontFamily: fontMono,
    fontSize: 11,
    fontWeight: 600,
    padding: '5px 11px',
    borderRadius: 7,
    border: ({ t }) => `1px solid ${t.line}`,
    backgroundColor: ({ t }) => t.panelAlt,
    color: ({ t }) => t.textHi,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    '&:disabled': { opacity: 0.5, cursor: 'default' },
  },
  btnPrimary: { backgroundColor: ({ t }) => t.skySoft, color: ({ t }) => t.sky, borderColor: ({ t }) => t.skyLine },
  btnRoadmap: { opacity: 0.45, borderStyle: 'dashed', cursor: 'default' },
  helpToggle: {
    fontFamily: fontMono,
    fontSize: 10.5,
    color: ({ t }) => t.sky,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '5px 4px',
    whiteSpace: 'nowrap',
  },
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
  disclosureToggle: {
    fontFamily: fontMono,
    fontSize: 10.5,
    color: ({ t }) => t.textFaint,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    alignSelf: 'flex-start',
    '&:hover': { color: ({ t }) => t.sky },
  },
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
  statusBadge: { display: 'inline-block', fontSize: 9.5, fontWeight: 700, padding: '2px 7px', borderRadius: 10, whiteSpace: 'nowrap' },
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

function statusChipClass(classes: ReturnType<typeof useStyles>, status: string | undefined): string {
  if (status === 'Healthy' || status === 'Synced') return classes.chipOk;
  if (status === 'Progressing' || status === 'Suspended' || status === 'OutOfSync') return classes.chipProg;
  if (status === 'Degraded' || status === 'Missing') return classes.chipBad;
  return classes.chipUnknown;
}

const SYNC_GUIDE: Array<{ name: string; roadmap?: boolean; body: string }> = [
  {
    name: 'Refresh',
    body: 'Re-compares live cluster state against git and recomputes the diff. Applies nothing. Safe to click anytime - use it when you just want to confirm the status above is current.',
  },
  {
    name: 'Hard Refresh',
    body: "Same as Refresh, but also bypasses ArgoCD's cached manifest render (Helm/Kustomize output). Use this instead of a plain Refresh when you changed something that affects manifest generation itself - a Helm values file, a referenced ConfigMap - and the diff still looks stale.",
  },
  {
    name: 'Sync',
    body: "Applies git's declared state to the cluster. Use when Sync status above reads OutOfSync and automated sync is off (or is enabled but hasn't caught up yet). Possible error: a sync can fail outright if a resource change conflicts with one made directly in the cluster (someone/something edited live state git doesn't know about).",
  },
  {
    name: 'Sync w/ Prune',
    roadmap: true,
    body: 'Also deletes any resource that exists live but is no longer declared in git. Use to clean up after removing something from git. Risk: can delete real resources unexpectedly if git state is wrong - not yet available (needs the authorization model from HANDOFF-tower-write-actions.md).',
  },
  {
    name: 'Force Sync',
    roadmap: true,
    body: "Deletes and recreates a resource instead of patching it. Use to recover from a resource stuck by an immutable-field conflict that a normal Sync can't apply. Risk: causes brief downtime for whatever gets replaced - not yet available, same reason as Sync w/ Prune.",
  },
  // ArgoCD's own Sync dialog "Advanced" section (2026-09-16: "consider
  // adding additional argocd sync options, see screenshot" - Apply only/
  // Force/Replace/Server-side apply; Force itself is already covered as
  // "Force Sync" above). Guide-only, no button of their own - these are
  // real sync-request modifiers, not standalone actions, the same way
  // ArgoCD's own UI keeps them collapsed under "Advanced" rather than as
  // primary buttons; adding 3 more always-visible disabled buttons here
  // would clutter the action row for options this platform doesn't yet
  // have an authorization model to actually offer.
  {
    name: 'Apply only',
    roadmap: true,
    body: "Skips this app's PreSync/PostSync/SyncFail resource hooks (platform-outcome-presync/postsync included) and applies the plain manifests only. Use to get git's declared state onto the cluster without re-triggering release-outcome hooks - e.g. when the hook itself is what's broken, not the actual application resources. Effect: no release-outcome event gets reported for a sync run this way.",
  },
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
          <span className={`${classes.chip} ${statusChipClass(classes, env.argoSyncStatus)}`}>
            {env.argoSyncStatus ?? 'unknown'}
          </span>
          <span className={`${classes.chip} ${statusChipClass(classes, env.argoHealthStatus)}`}>
            {env.argoHealthStatus ?? 'unknown'}
          </span>
          {env.argoRevision && <span className={classes.revision}>@ {env.argoRevision.slice(0, 9)}</span>}
        </div>
        <div className={classes.actions}>
          <button
            type="button"
            className={classes.btn}
            title={SYNC_GUIDE[0].body}
            disabled={!canAct || Boolean(argoActions.pending)}
            onClick={() => act(argoActions.refresh)}
          >
            {argoActions.pending === 'refresh' ? 'refreshing…' : '⟳ Refresh'}
          </button>
          <button
            type="button"
            className={classes.btn}
            title={SYNC_GUIDE[1].body}
            disabled={!canAct || Boolean(argoActions.pending)}
            onClick={() => act(argoActions.hardRefresh)}
          >
            {argoActions.pending === 'hardRefresh' ? 'refreshing…' : '⟳ Hard refresh'}
          </button>
          <button
            type="button"
            className={`${classes.btn} ${classes.btnPrimary}`}
            title={SYNC_GUIDE[2].body}
            disabled={!canAct || Boolean(argoActions.pending)}
            onClick={() => act(argoActions.sync)}
          >
            {argoActions.pending === 'sync' ? 'syncing…' : '⇄ Sync'}
          </button>
          <button type="button" className={`${classes.btn} ${classes.btnRoadmap}`} title={SYNC_GUIDE[3].body} disabled>
            Sync w/ prune
          </button>
          <button type="button" className={`${classes.btn} ${classes.btnRoadmap}`} title={SYNC_GUIDE[4].body} disabled>
            Force sync
          </button>
          <button type="button" className={classes.helpToggle} onClick={() => setGuideOpen(v => !v)}>
            {guideOpen ? 'hide guide' : 'which one? ▾'}
          </button>
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

      <button type="button" className={classes.disclosureToggle} onClick={() => setDetailOpen(v => !v)}>
        {detailOpen ? '▾ hide details' : '▸ show sync policy, revision + resource tree'}
      </button>

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
                          <span className={`${classes.statusBadge} ${statusChipClass(classes, r.syncStatus)}`}>
                            {r.syncStatus ?? '—'}
                          </span>
                        </td>
                        <td className={classes.cell}>
                          {r.health ? (
                            <span className={`${classes.statusBadge} ${statusChipClass(classes, r.health)}`}>{r.health}</span>
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
