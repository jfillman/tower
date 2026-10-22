import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import Menu from '@material-ui/core/Menu';
import MenuItem from '@material-ui/core/MenuItem';
import { fontDisplay, fontMono, useHangarTokens, type HangarTokens } from '../brand/tokens';
import { buildEnvironmentRows, type EnvironmentRow } from '../environmentRows';
import {
  addedFlightEnvs,
  applyStaged,
  buildDeploy,
  cloudFlightFilePaths,
  copiedEnvs,
  deleteFilesFor,
  describeChanges,
  envFilePaths,
  followUps,
  leftoverGroundEnvs,
  pipelinesNamingEnv,
  planPipelineSteps,
  readEnvironments,
  pipelineStepEnvs,
  purgedEnvs,
  stageSetBlock,
  validateAddedFlight,
  validateEnvironments,
  validateRemovals,
  type CloudBlock,
  type Deploy,
  type EnvDef,
  type Staged,
  uncopiedGroundAdds,
  infraStarterValues,
} from '../environments/stagedChanges';
import { appTypeOf, envNamespace } from '../appRepos';
import { useLaunchApplicationEnvironment } from '../environments/applicationEnvironment';
import { unlistedProvisioned, useProvisionedEnvs } from '../environments/provisionedEnvs';
import { dump as dumpYaml } from 'js-yaml';
import { useEnvValuesLoader } from '../values/sources';
import { loadSubmitted, pendingFrom, saveSubmitted, type SubmittedChange } from '../environments/submitted';
import { RefreshButton } from '../RefreshButton';
import { DEPLOY_TARGETS } from '../serviceClass';
import { formatDateTime, relativeTime } from '../shared/format';
import { useCicdConfig, useSubmitCicdConfigChange } from '../useConfigData';
import { useReleaseContext } from '../useReleaseContext';
import { appKindOf } from '../workloadType';
import { usePlatformConfig } from '../platformConfig';
import { Button, Callout, Chip, ColumnLabel, FilterBar, FilterChips, HEALTH_LABEL, Hint, IconButton, PageHeader, Panel, StatusDot, TabError, TabSkeleton, TierChip } from '../ui';
import { AddEnvironmentDialog, ChangeResultDialog, RemoveEnvironmentDialog } from './environments/dialogs';
import { PendingChanges } from './environments/PendingChanges';
import { RowDetail, type RowDetailContext } from './environments/RowDetail';
import { SubmittedPanel } from './environments/SubmittedPanel';
import { same, TARGET_BLOCK, type DisplayRow } from './environments/shared';
import { ENVS_ROOT } from '../types';

// The Environments tab: every environment of the service in promotion order, whichever way its
// cicd.yaml declares them and whether it runs on Kubernetes or a cloud target. Edits are STAGED (not
// submitted one by one): the Pending changes panel lists them all, and "Open pull request" turns them
// into one change to cicd.yaml. See glidepath docs/admin/envs-overhaul-requirements.md, section 4.
//
// What can be edited here so far: add a Ground or a Flight environment, reorder Ground environments, and set a
// cloud environment's own function / service / Container App, and remove a Ground environment (its files go in
// the same pull request). A Kubernetes Ground environment's values (glidepath/envs/<env>.yaml) are edited in its
// row as YAML, with their own pull request; a Flight environment's link to App Configuration. Removing a Flight
// environment is still done by hand.
//
// A Flight environment is created by Airframe's ApplicationEnvironment XR, requested through an existing
// Backstage template. Opening the pull request therefore launches that template first (it opens a request PR on
// the tenants repo) and then submits the cicd.yaml change, and says which to merge first.


// Columns as in the Environments mockup (design canvas, board F).
const COLUMNS = '20px 120px 80px 110px 100px 90px minmax(0, 1fr) 36px';

type Filter = 'all' | 'ground' | 'flight' | 'cloud';

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  wrap: { paddingBottom: 40, maxWidth: 1380 },
  layout: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 350px', gap: 18, alignItems: 'start' },
  main: { display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 },
  side: { display: 'flex', flexDirection: 'column', gap: 12, alignSelf: 'start' },
  headRow: { display: 'grid', gridTemplateColumns: COLUMNS, gap: 10, padding: '9px 14px', borderLeft: '3px solid transparent' },
  row: {
    display: 'grid',
    gridTemplateColumns: COLUMNS,
    gap: 10,
    alignItems: 'center',
    padding: '11px 14px',
    borderTop: ({ t }) => `1px solid ${t.line}`,
    borderLeft: '3px solid transparent',
  },
  rowClickable: { cursor: 'pointer', '&:hover': { backgroundColor: ({ t }) => t.panelAlt } },
  rowOpen: { backgroundColor: ({ t }) => t.panelAlt },
  rowNew: { backgroundColor: ({ t }) => t.panelAlt, borderLeftColor: ({ t }) => t.good },
  rowEdited: { backgroundColor: ({ t }) => t.panelAlt, borderLeftColor: ({ t }) => t.amber },
  rowRemoved: { borderLeftColor: ({ t }) => t.bad },
  rowPending: { backgroundColor: ({ t }) => t.panelAlt, borderLeftColor: ({ t }) => t.sky },
  rowDragOver: { boxShadow: ({ t }) => `inset 0 2px 0 ${t.amber}` },
  grip: {
    color: ({ t }) => t.textLo,
    letterSpacing: '-2px',
    fontFamily: fontMono,
    fontWeight: 700,
    fontSize: 12,
    cursor: 'grab',
    userSelect: 'none',
  },
  nameCell: { display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' },
  name: { fontFamily: fontDisplay, fontWeight: 600, fontSize: 15, color: ({ t }) => t.textHi },
  nameRemoved: { textDecoration: 'line-through', color: ({ t }) => t.textLo },
  mono: { fontFamily: fontMono, fontSize: 12, color: ({ t }) => t.textLo },
  health: { display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 },
  empty: { padding: 24, color: ({ t }) => t.textLo, textAlign: 'center', fontSize: 13 },
  unlisted: { marginBottom: 12 },
}));

const STATE_CLASS = { new: 'rowNew', edited: 'rowEdited', removed: 'rowRemoved', 'pr-open': 'rowPending', 'removal-pr': 'rowRemoved' } as const;
const STATE_TONE = { new: 'ok', edited: 'flight', removed: 'bad', 'pr-open': 'ground', 'removal-pr': 'bad' } as const;
const STATE_LABEL = { new: 'staged: new', edited: 'staged: edit', removed: 'staged: remove', 'pr-open': 'PR open', 'removal-pr': 'removal PR open' } as const;

export function EnvironmentsTab() {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const { environments, pipelineOrder, loading, error, owner, appName, entity: appEntity } = useReleaseContext();
  const [searchParams] = useSearchParams();
  const [nonce, setNonce] = useState(0);
  const cicd = useCicdConfig(owner && appName ? { owner, appName } : undefined, nonce);
  // The page's entity is this app's Component (useReleaseContext), so its kind tag says whether it is an InfraService.
  const appType = appTypeOf(appEntity);
  const submit = useSubmitCicdConfigChange();
  const launcher = useLaunchApplicationEnvironment();
  const loadValues = useEnvValuesLoader();
  const [duplicating, setDuplicating] = useState<EnvDef | undefined>();
  const [phase, setPhase] = useState<'idle' | 'launching' | 'submitting'>('idle');
  // env name -> the ApplicationEnvironment request PR already opened for it. Kept so a retry after a later
  // failure does not open a second request for an environment that already has one.
  const [launched, setLaunched] = useState<Record<string, string>>({});
  // env name -> how a request that was reused (not opened now) exists: already on main, or already an open PR.
  const [reused, setReused] = useState<Record<string, 'merged' | 'open'>>({});
  const [failure, setFailure] = useState<string | undefined>();
  const [staged, setStaged] = useState<Staged[]>([]);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<string | undefined>();
  const [removing, setRemoving] = useState<string | undefined>();
  const [filter, setFilter] = useState<Filter>('all');
  const [menu, setMenu] = useState<{ name: string; el: HTMLElement } | undefined>();
  const [dragging, setDragging] = useState<string | undefined>();
  const [dragOver, setDragOver] = useState<string | undefined>();
  const [submitted, setSubmitted] = useState<SubmittedChange[]>([]);

  const liveRows: EnvironmentRow[] = useMemo(
    () => buildEnvironmentRows(environments, { lower: pipelineOrder.lower, upper: pipelineOrder.upper }),
    [environments, pipelineOrder.lower, pipelineOrder.upper],
  );

  // Changes submitted earlier whose pull request is not merged yet are remembered in the browser, so they survive
  // leaving the tab. Loaded once the service is known.
  useEffect(() => {
    if (owner && appName) setSubmitted(loadSubmitted(owner, appName));
  }, [owner, appName]);

  const deploy = cicd.data?.values.deploy as Deploy | undefined;
  const pipelines = (cicd.data?.values as Record<string, unknown> | undefined)?.pipelines;
  const canEdit = Boolean(cicd.data && owner && appName);
  const targetId = (typeof deploy?.target === 'string' && deploy.target) || 'k8s-rollout';
  const cloudBlock = TARGET_BLOCK[targetId];
  const targetLabel = DEPLOY_TARGETS[targetId]?.label ?? targetId;

  const { shape, envs: before } = useMemo(() => readEnvironments(deploy), [deploy]);
  const after = useMemo(() => applyStaged(before, staged), [before, staged]);
  // Flight environments already provisioned (their ApplicationEnvironment exists) that cicd.yaml, staged changes
  // included, does not name: created with the Backstage template, which stops before cicd.yaml.
  const provisioned = useProvisionedEnvs(appName, canEdit && !cloudBlock, nonce);
  const pending = useMemo(() => (canEdit ? pendingFrom(submitted, before) : { records: [], adds: [], removals: [] }), [canEdit, submitted, before]);
  // An environment whose cicd.yaml pull request is already open is not "missing" either.
  const unlisted = unlistedProvisioned(provisioned, [...after.map(e => e.name), ...pending.adds.map(a => a.env.name)]);
  // Ground environments still running on the control-plane cluster after cicd.yaml stopped naming them: their values
  // files were left behind, so Argo CD keeps them. Deleting the files is staged like any other change.
  const controlPlane = usePlatformConfig().controlPlaneCluster;
  const purged = useMemo(() => purgedEnvs(staged), [staged]);
  const leftovers = useMemo(
    () =>
      canEdit && !cloudBlock
        ? leftoverGroundEnvs(liveRows, {
            declared: [...before.map(e => e.name), ...after.map(e => e.name)],
            controlPlane,
            provisioned: provisioned.map(p => p.env),
            inFlight: [...pending.adds.map(a => a.env.name), ...pending.removals, ...purged],
          })
        : [],
    [canEdit, cloudBlock, liveRows, before, after, controlPlane, provisioned, pending, purged],
  );
  // A merged pull request ends its record. Drop finished ones, and ask again every half minute while any is open.
  useEffect(() => {
    if (!canEdit || !owner || !appName) return;
    if (pending.records.length !== submitted.length) {
      setSubmitted(pending.records);
      saveSubmitted(owner, appName, pending.records);
    }
  }, [canEdit, owner, appName, pending.records, submitted.length]);
  useEffect(() => {
    if (pending.records.length === 0) return undefined;
    const id = setInterval(() => setNonce(n => n + 1), 30000);
    return () => clearInterval(id);
  }, [pending.records.length]);
  const envChanges = useMemo(() => describeChanges(before, after, shape), [before, after, shape]);
  // Added Flight environments that need an ApplicationEnvironment request on the tenants repo. A cloud target's Flight
  // environment is a release pin (glidepath ADR-0020) with no cluster resources, so it needs none.
  const flightAdds = useMemo(() => (cloudBlock ? [] : addedFlightEnvs(before, after)), [before, after, cloudBlock]);
  const problems = useMemo(
    () => [
      ...validateEnvironments(after, targetId),
      ...validateAddedFlight(before, after, targetId),
      ...validateRemovals(before, after, pipelines, targetId),
    ],
    [before, after, targetId, pipelines],
  );
  const releasePlan = useMemo(() => planPipelineSteps(pipelines, after, pipelineStepEnvs(staged, after)), [pipelines, after, staged]);
  const releaseLines = useMemo(
    () =>
      releasePlan.added.map(a => ({
        kind: 'edit' as const,
        title: `Add a ${a.stage} step for ${a.env}`,
        detail: `pipeline ${a.pipeline}${a.after ? `, after the step for ${a.after}` : ', at the end'}`,
      })),
    [releasePlan],
  );
  const purgeLines = useMemo(
    () =>
      purged.map(name => ({
        kind: 'remove' as const,
        title: `Delete the leftover files of ${name}`,
        detail: `${envFilePaths(name).join(', ')} (cicd.yaml already leaves it out)`,
      })),
    [purged],
  );
  const changes = useMemo(() => [...envChanges, ...releaseLines, ...purgeLines], [envChanges, releaseLines, purgeLines]);
  // What the remove dialog says the pull request deletes: a Kubernetes app's values files, a cloud app's Flight pin and flow.
  const removalFiles = (name: string): string[] => {
    if (!cloudBlock) return envFilePaths(name);
    return before.find(e => e.name === name)?.tier === 'flight' ? cloudFlightFilePaths(name) : [];
  };
  const flightOrderChanged = useMemo(() => {
    // Only Flight environments that exist on both sides: a removal or an addition is not a reorder.
    const names = (envs: EnvDef[]) =>
      envs.filter(e => e.tier === 'flight' && before.some(b => b.name === e.name) && after.some(a => a.name === e.name)).map(e => e.name);
    return !same(names(before), names(after));
  }, [before, after]);
  const notes = useMemo(
    () => [
      ...followUps(before, after, targetId, appName, appType),
      ...purged.map(
        name =>
          `After it merges Argo CD removes ${appName ? `${appName}-${name}` : `the ${name} Application`} and everything running in the ${appName ? envNamespace(appName, appType, name) : name} namespace.`,
      ),
      ...copiedEnvs(staged, after)
        .filter(x => x.env.tier === 'flight')
        .map(x => `${x.env.name} is a copy of ${x.from}: once its values file exists (Crossplane writes it after the request merges), use "Copy values from" in its Values tab.`),
      ...(flightOrderChanged
        ? ['This changes the declared promotion order only. The pipeline releases to Flight environments in the order of its own release steps: edit those in Configure › Pipeline if they should change too.']
        : []),
      ...releasePlan.skipped.map(k => `No ${k.stage} step added for ${k.env}: ${k.reason}.`),
    ],
    [before, after, targetId, appName, appType, releasePlan, flightOrderChanged, staged, purged],
  );
  const deleteFiles = useMemo(() => deleteFilesFor(before, after, targetId, purged), [before, after, targetId, purged]);

  const rows: DisplayRow[] = useMemo(() => {
    const live = new Map(liveRows.map(r => [r.name, r]));
    if (!canEdit) return liveRows.map(r => ({ ...r }));
    const beforeBy = new Map(before.map(e => [e.name, e]));
    const toRow = (def: EnvDef, state: DisplayRow['state']): DisplayRow => {
      const l = live.get(def.name);
      return {
        name: def.name,
        tier: def.tier,
        target: l?.target ?? targetLabel,
        where: l?.where ?? '—',
        health: l?.health ?? 'unknown',
        deployed: l?.deployed ?? false,
        image: l?.image,
        deployedAt: l?.deployedAt,
        def,
        state,
      };
    };
    const out: DisplayRow[] = after.map(def => {
      const prior = beforeBy.get(def.name);
      let state: DisplayRow['state'];
      if (!prior) state = 'new';
      else if (!same(prior, def)) state = 'edited';
      else if (pending.removals.includes(def.name)) state = 'removal-pr';
      return toRow(def, state);
    });
    // An environment whose pull request is open stays in the table, marked, until cicd.yaml shows it.
    for (const { env } of pending.adds) {
      if (out.some(r => r.name === env.name)) continue;
      const ghost = toRow(env, 'pr-open');
      const firstFlight = out.findIndex(r => r.tier === 'flight');
      if (env.tier === 'ground' && firstFlight !== -1) out.splice(firstFlight, 0, ghost);
      else out.push(ghost);
    }
    // An environment staged for removal stays listed, struck through, where it was, until the change is opened.
    before.forEach((def, i) => {
      if (after.some(e => e.name === def.name)) return;
      let at = 0;
      for (let k = i - 1; k >= 0; k--) {
        const idx = out.findIndex(r => r.name === before[k].name);
        if (idx !== -1) {
          at = idx + 1;
          break;
        }
      }
      out.splice(at, 0, toRow(def, 'removed'));
    });
    // Live environments cicd.yaml does not declare: shown, but nothing here can edit them.
    for (const r of liveRows) if (!out.some(o => o.name === r.name)) out.push({ ...r });
    return out;
  }, [canEdit, liveRows, before, after, targetLabel, pending]);

  if (loading && rows.length === 0) return <TabSkeleton />;
  if (error && rows.length === 0) return <TabError error={String(error)} what="environments" />;

  const isCloudRow = (r: DisplayRow) => r.target !== 'Kubernetes' || Boolean(cloudBlock);
  const counts = {
    all: rows.length,
    ground: rows.filter(r => r.tier === 'ground').length,
    flight: rows.filter(r => r.tier === 'flight').length,
    cloud: rows.filter(isCloudRow).length,
  };
  const shown = rows.filter(r => filter === 'all' || (filter === 'cloud' ? isCloudRow(r) : r.tier === filter));

  const move = (name: string, direction: 'up' | 'down') => setStaged(s => [...s, { kind: 'move', name, direction }]);
  const canMove = (name: string, direction: 'up' | 'down') => {
    const i = after.findIndex(e => e.name === name);
    const j = i + (direction === 'up' ? -1 : 1);
    return i !== -1 && Boolean(after[j]) && after[j].tier === after[i].tier;
  };
  const canEditRow = (r: DisplayRow) => canEdit && Boolean(r.def);
  const movable = (r: DisplayRow) =>
    canEditRow(r) && r.state !== 'removed' && r.state !== 'removal-pr' && r.state !== 'pr-open' && (canMove(r.name, 'up') || canMove(r.name, 'down'));

  // Dropping a row on another row of the same tier is the same as moving it one step at a time.
  const dropOn = (target: string) => {
    const from = dragging;
    setDragging(undefined);
    setDragOver(undefined);
    if (!from || from === target) return;
    const i = after.findIndex(e => e.name === from);
    const j = after.findIndex(e => e.name === target);
    if (i === -1 || j === -1 || after[i].tier !== after[j].tier) return;
    const direction = j > i ? ('down' as const) : ('up' as const);
    setStaged(s => [...s, ...Array.from({ length: Math.abs(j - i) }, () => ({ kind: 'move' as const, name: from, direction }))]);
  };

  // Removing an environment that exists only as a staged add just un-stages it; removing a real one stages a remove.
  const stageRemove = (name: string) => {
    if (before.some(e => e.name === name)) setStaged(s => [...s, { kind: 'remove', name }]);
    else setStaged(s => s.filter(x => !('env' in x && x.env.name === name) && !('name' in x && x.name === name)));
    setRemoving(undefined);
    setOpen(undefined);
  };
  const undoRemove = (name: string) => setStaged(s => s.filter(x => !(x.kind === 'remove' && x.name === name)));

  const setField = (env: EnvDef, block: CloudBlock, field: string, value: string) => {
    const current = { ...(env[block] ?? {}) } as Record<string, unknown>;
    if (value.trim()) current[field] = value;
    else delete current[field];
    setStaged(s => stageSetBlock(s, env.name, block, current));
  };

  const openPr = async () => {
    if (!owner || !appName) return;
    setFailure(undefined);
    // An InfraService's environment is its values file and nothing else makes one: a new Ground one that copies no
    // values gets a starter file in the same pull request (it used to be refused, with no way left but a hand edit).
    const uncopied = appType === 'infra' && !cloudBlock ? uncopiedGroundAdds(staged, before, after) : [];
    // The ApplicationEnvironment request first, so the environment exists when cicd.yaml names it.
    const done = { ...launched };
    const reusedNow = { ...reused };
    for (const e of flightAdds) {
      if (done[e.name]) continue;
      setPhase('launching');
      const r = await launcher.launch({ appName, env: e.name, cluster: e.cluster as string, owner });
      if (r.status !== 'done') {
        setLaunched(done);
        setPhase('idle');
        setFailure(
          `Creating ${e.name} failed: ${r.status === 'failed' ? r.error : 'the request did not finish'}. Nothing was changed in cicd.yaml.`,
        );
        return;
      }
      done[e.name] = r.prUrl;
      if (r.existing) reusedNow[e.name] = r.existing;
      setReused(reusedNow);
    }
    setLaunched(done);
    // A Ground environment staged as a copy gets its values file in the same pull request: read the source's values now.
    const createFiles: Array<{ path: string; content: string }> = uncopied.map(name => ({
      path: `${ENVS_ROOT}/envs/${name}.yaml`,
      content: infraStarterValues(name),
    }));
    if (!cloudBlock) {
      for (const { env, from } of copiedEnvs(staged, after)) {
        if (env.tier !== 'ground') continue;
        const source = before.find(b => b.name === from);
        if (!source) continue;
        try {
          const values = await loadValues({ owner, appName, env: from, tier: source.tier, cluster: source.cluster });
          createFiles.push({ path: `${ENVS_ROOT}/envs/${env.name}.yaml`, content: dumpYaml({ envName: env.name, ...values }, { lineWidth: -1 }) });
        } catch (e) {
          setPhase('idle');
          setFailure(`Could not read the values of ${from} to copy them to ${env.name}: ${String(e)}. Nothing was changed in cicd.yaml.`);
          return;
        }
      }
    }
    setPhase('submitting');
    await submit.submit({
      owner,
      appName,
      patch: { deploy: buildDeploy(deploy, after), ...(releasePlan.added.length > 0 ? { pipelines: releasePlan.pipelines } : {}) },
      summary: changes.map(l => l.title),
      via: 'Configure › Environments',
      ...(deleteFiles.length > 0 ? { deleteFiles } : {}),
      ...(createFiles.length > 0 ? { createFiles } : {}),
    });
    setPhase('idle');
  };

  // Closing after a success clears everything staged. Closing after a failure keeps it, so the user can fix
  // the cause and try again (requests already opened are remembered and not repeated).
  const closeResult = () => {
    const succeeded = Boolean(submit.result);
    submit.reset();
    setFailure(undefined);
    if (succeeded && submit.result && owner && appName) {
      const record: SubmittedChange = {
        id: `${Date.now()}`,
        at: Date.now(),
        prUrl: submit.result.prUrl,
        requests: { ...launched },
        added: after.filter(e => !before.some(b => b.name === e.name)),
        removed: before.filter(b => !after.some(e => e.name === b.name)).map(b => b.name),
        summary: changes.map(l => l.title),
      };
      const next = [record, ...submitted];
      setSubmitted(next);
      saveSubmitted(owner, appName, next);
    }
    if (succeeded) {
      setStaged([]);
      setLaunched({});
      setReused({});
      setNonce(n => n + 1);
    }
  };

  const detailCtx: RowDetailContext = {
    owner,
    appName,
    entity: searchParams.get('entity') ?? '',
    appKind: appKindOf(appEntity),
    appType,
    deploy,
    pipelines,
    targetLabel,
    cloudBlock,
    onSetField: setField,
    onRemove: setRemoving,
    onUndoRemove: undoRemove,
    siblings: before,
    pendingFor: name => {
      const record = pending.records.find(r => r.added.some(e => e.name === name) || r.removed.includes(name));
      return record && { prUrl: record.prUrl, requestUrl: record.requests[name] };
    },
  };

  const menuRow = menu ? rows.find(r => r.name === menu.name) : undefined;
  const closeMenu = () => setMenu(undefined);
  const menuGround = menuRow?.def?.tier === 'ground' && menuRow.state !== 'removed' && menuRow.state !== 'removal-pr';
  const menuMovable = Boolean(menuRow?.def) && menuRow?.state !== 'removed' && menuRow?.state !== 'removal-pr';

  return (
    <div className={c.wrap}>
      <PageHeader
        title="Environments"
        subtitle={canEdit ? 'Edit in the table. Changes stage on the right, then open together.' : 'Every environment of this service, in promotion order.'}
        actions={
          <>
            <RefreshButton onClick={() => setNonce(n => n + 1)} />
            {canEdit && (
              <Button variant="primary" onClick={() => setAdding(true)}>
                Add environment
              </Button>
            )}
          </>
        }
      />
      {!canEdit && (
        <Hint style={{ marginBottom: 12 }}>
          Read-only: this service has no cicd.yaml Tower can edit. Change the list and its order in Configure › Pipeline; Flight environment
          values are in Configure › Shared values.
        </Hint>
      )}
      <div className={canEdit ? c.layout : undefined}>
        <div className={c.main}>
          {unlisted.map(p => (
            <Callout
              key={p.env}
              tone="warn"
              label="Not in cicd.yaml"
              title={`${p.env} is provisioned on ${p.cluster}, but cicd.yaml does not name it`}
              actions={
                <Button
                  onClick={() => setStaged(s => [...s, { kind: 'add', env: { name: p.env, tier: 'flight', cluster: p.cluster }, pipelineStep: true }])}
                >
                  Add to cicd.yaml
                </Button>
              }
              className={c.unlisted}
            >
              Its ApplicationEnvironment ({p.xrName}) {p.ready ? 'is ready' : 'is not ready yet'}, but nothing releases to it until
              cicd.yaml lists it. Adding it stages the entry and a release step; the pull request reuses the existing request, so
              only the cicd.yaml change opens.
            </Callout>
          ))}
          {leftovers.map(name => (
            <Callout
              key={name}
              tone="warn"
              label="Not in cicd.yaml"
              title={`${name} is still running, but cicd.yaml does not name it`}
              actions={<Button onClick={() => setStaged(s => [...s, { kind: 'purge', name }])}>Delete its files</Button>}
              className={c.unlisted}
            >
              It was taken out of cicd.yaml without Remove, so {envFilePaths(name)[0]} is still in the repo and Argo CD keeps
              the environment. Deleting its files stages a pull request that removes them; once it merges Argo CD deletes the
              environment and everything running in it.
            </Callout>
          ))}
          <FilterBar end={canEdit && <Hint>Drag the handle to reorder</Hint>}>
            <FilterChips<Filter>
              label="Tier"
              value={filter}
              onChange={setFilter}
              options={[
                { id: 'all', label: 'All', count: counts.all },
                { id: 'ground', label: 'Ground', count: counts.ground },
                { id: 'flight', label: 'Flight', count: counts.flight },
                { id: 'cloud', label: 'Cloud', count: counts.cloud },
              ]}
            />
          </FilterBar>
          <Panel>
            {shown.length === 0 ? (
              <div className={c.empty}>
                {rows.length === 0
                  ? 'No environments yet. They appear here once the service declares or deploys to one.'
                  : 'No environments match this filter.'}
              </div>
            ) : (
              <div>
                <div role="table" aria-label="Environments">
                  <div className={c.headRow} role="row">
                    <span role="presentation" />
                    {['Environment', 'Tier', 'Target', 'Where', 'Health', 'Live image'].map(h => (
                      <span key={h} role="columnheader">
                        <ColumnLabel>{h}</ColumnLabel>
                      </span>
                    ))}
                    <span role="presentation" />
                  </div>
                  {shown.map(r => {
                    const editable = canEditRow(r);
                    const isOpen = open === r.name;
                    const stateClass = r.state ? c[STATE_CLASS[r.state]] : '';
                    const rowClass = [c.row, editable && c.rowClickable, isOpen && c.rowOpen, stateClass, dragOver === r.name && c.rowDragOver]
                      .filter(Boolean)
                      .join(' ');
                    return (
                      <div key={r.name}>
                        <div
                          role="row"
                          className={rowClass}
                          onClick={editable ? () => setOpen(isOpen ? undefined : r.name) : undefined}
                          onDragOver={
                            dragging && dragging !== r.name
                              ? e => {
                                  e.preventDefault();
                                  setDragOver(r.name);
                                }
                              : undefined
                          }
                          onDrop={
                            dragging
                              ? e => {
                                  e.preventDefault();
                                  dropOn(r.name);
                                }
                              : undefined
                          }
                        >
                          <span role="cell">
                            {movable(r) && (
                              <span
                                className={c.grip}
                                role="img"
                                aria-label={`Drag ${r.name} to reorder`}
                                draggable
                                onClick={e => e.stopPropagation()}
                                onDragStart={e => {
                                  e.dataTransfer?.setData('text/plain', r.name);
                                  setDragging(r.name);
                                }}
                                onDragEnd={() => {
                                  setDragging(undefined);
                                  setDragOver(undefined);
                                }}
                              >
                                ::
                              </span>
                            )}
                          </span>
                          <span role="cell" className={c.nameCell}>
                            <b className={`${c.name} ${r.state === 'removed' ? c.nameRemoved : ''}`}>{r.name}</b>
                            {r.state && (
                              <Chip tone={STATE_TONE[r.state]}>{STATE_LABEL[r.state]}</Chip>
                            )}
                          </span>
                          <span role="cell">
                            <TierChip tier={r.tier} />
                          </span>
                          <span role="cell">{r.target}</span>
                          <span role="cell" className={c.mono}>
                            {r.where}
                          </span>
                          <span role="cell" className={c.health}>
                            <StatusDot health={r.health} />
                            {HEALTH_LABEL[r.health]}
                          </span>
                          <span role="cell" className={c.mono}>
                            {r.deployed ? r.image : 'not deployed yet'}
                            {r.deployedAt && (
                              <>
                                {'  '}
                                <span title={formatDateTime(r.deployedAt)}>{relativeTime(r.deployedAt)}</span>
                              </>
                            )}
                          </span>
                          <span role="cell" onClick={e => e.stopPropagation()}>
                            {editable && r.state !== 'pr-open' && (
                              <IconButton
                                aria-label={`Actions for ${r.name}`}
                                aria-haspopup="menu"
                                onClick={e => setMenu({ name: r.name, el: e.currentTarget })}
                              >
                                {isOpen ? 'v' : '...'}
                              </IconButton>
                            )}
                          </span>
                        </div>
                        {isOpen && r.def && <RowDetail row={r as DisplayRow & { def: EnvDef }} ctx={detailCtx} />}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </Panel>
        </div>
        {canEdit && (
          <div className={c.side}>
            <PendingChanges
              changes={changes}
              problems={problems}
              notes={notes}
              flightAdds={flightAdds}
              launched={launched}
              owner={owner}
              appName={appName}
              deleteFiles={deleteFiles}
              phase={phase}
              onDiscard={() => setStaged([])}
              onOpen={openPr}
            />
            <SubmittedPanel
              records={pending.records}
              onCheck={() => setNonce(n => n + 1)}
              onDismiss={id => {
                const next = submitted.filter(r => r.id !== id);
                setSubmitted(next);
                if (owner && appName) saveSubmitted(owner, appName, next);
              }}
            />
          </div>
        )}
      </div>
      <Menu anchorEl={menu?.el} open={Boolean(menu && menuRow)} onClose={closeMenu}>
        <MenuItem
          onClick={() => {
            if (menuRow) setOpen(open === menuRow.name ? undefined : menuRow.name);
            closeMenu();
          }}
        >
          {menuRow && open === menuRow.name ? 'Close details' : 'Edit details'}
        </MenuItem>
        {menuMovable && (
          <MenuItem
            disabled={!menuRow || !canMove(menuRow.name, 'up')}
            onClick={() => {
              if (menuRow) move(menuRow.name, 'up');
              closeMenu();
            }}
          >
            Move earlier
          </MenuItem>
        )}
        {menuMovable && (
          <MenuItem
            disabled={!menuRow || !canMove(menuRow.name, 'down')}
            onClick={() => {
              if (menuRow) move(menuRow.name, 'down');
              closeMenu();
            }}
          >
            Move later
          </MenuItem>
        )}
        {menuMovable && menuRow?.state !== 'pr-open' && (
          <MenuItem
            onClick={() => {
              if (menuRow?.def) setDuplicating(menuRow.def);
              closeMenu();
            }}
          >
            Duplicate…
          </MenuItem>
        )}
        {menuRow?.state === 'removed' && (
          <MenuItem
            onClick={() => {
              undoRemove(menuRow.name);
              closeMenu();
            }}
          >
            Undo removal
          </MenuItem>
        )}
        {menuGround && (
          <MenuItem
            onClick={() => {
              if (menuRow) setRemoving(menuRow.name);
              closeMenu();
            }}
          >
            Remove…
          </MenuItem>
        )}
      </Menu>
      <AddEnvironmentDialog
        key={duplicating?.name ?? 'new'}
        open={adding || Boolean(duplicating)}
        duplicateOf={duplicating}
        onClose={() => {
          setAdding(false);
          setDuplicating(undefined);
        }}
        current={after}
        problems={problems}
        targetId={targetId}
        targetLabel={targetLabel}
        cloudBlock={cloudBlock}
        onStage={(env, pipelineStep, copyValuesFrom) => {
          setStaged(s => [...s, { kind: 'add', env, pipelineStep, ...(copyValuesFrom ? { copyValuesFrom } : {}) }]);
          setAdding(false);
          setDuplicating(undefined);
        }}
      />
      {removing && (
        <RemoveEnvironmentDialog
          name={removing}
          appName={appName}
          cloud={Boolean(cloudBlock)}
          files={removalFiles(removing)}
          blockedBy={pipelinesNamingEnv(pipelines, removing)}
          onCancel={() => setRemoving(undefined)}
          onConfirm={() => stageRemove(removing)}
        />
      )}
      {(submit.result || submit.error || failure) && (
        <ChangeResultDialog
          requests={flightAdds.filter(e => launched[e.name]).map(e => ({ env: e.name, url: launched[e.name], existing: reused[e.name] }))}
          cicdPrUrl={submit.result?.prUrl}
          error={failure ?? submit.error}
          onClose={closeResult}
        />
      )}
    </div>
  );
}
