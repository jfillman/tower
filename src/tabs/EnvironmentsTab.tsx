import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import Menu from '@material-ui/core/Menu';
import MenuItem from '@material-ui/core/MenuItem';
import { Progress, ResponseErrorPanel } from '@backstage/core-components';
import { fontDisplay, fontMono, useHangarTokens, type HangarTokens } from '../brand/tokens';
import { buildEnvironmentRows, type EnvironmentRow } from '../environmentRows';
import {
  addedFlightEnvs,
  applyStaged,
  buildDeploy,
  deleteFilesFor,
  describeChanges,
  envFilePaths,
  followUps,
  pipelinesNamingEnv,
  planReleaseSteps,
  readEnvironments,
  releaseStepEnvs,
  stageSetBlock,
  validateAddedFlight,
  validateEnvironments,
  validateRemovals,
  type CloudBlock,
  type Deploy,
  type EnvDef,
  type Staged,
} from '../environments/stagedChanges';
import { useLaunchApplicationEnvironment } from '../environments/applicationEnvironment';
import { DEPLOY_TARGETS } from '../serviceClass';
import { formatDateTime, relativeTime } from '../shared/format';
import { useCicdConfig, useSubmitCicdConfigChange } from '../useConfigData';
import { useReleaseContext } from '../useReleaseContext';
import { Button, Chip, ColumnLabel, HEALTH_LABEL, IconButton, PageHeader, Panel, Segmented, StatusDot, TierChip } from '../ui';
import { AddEnvironmentDialog, ChangeResultDialog, RemoveEnvironmentDialog } from './environments/dialogs';
import { PendingChanges } from './environments/PendingChanges';
import { RowDetail, type RowDetailContext } from './environments/RowDetail';
import { same, TARGET_BLOCK, type DisplayRow } from './environments/shared';

// The Environments tab: every environment of the service in promotion order, whichever way its
// cicd.yaml declares them and whether it runs on Kubernetes or a cloud target. Edits are STAGED (not
// submitted one by one): the Pending changes panel lists them all, and "Open pull request" turns them
// into one change to cicd.yaml. See glidepath docs/admin/envs-overhaul-requirements.md, section 4.
//
// What can be edited here so far: add a Ground or a Flight environment, reorder Ground environments, and set a
// cloud environment's own function / service / Container App, and remove a Ground environment (its files go in
// the same pull request). A Kubernetes Ground environment's values (platform/envs/<env>.yaml) are edited in its
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
  wrap: { padding: '20px 24px 40px', maxWidth: 1380 },
  layout: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 350px', gap: 18, alignItems: 'start' },
  main: { display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 },
  toolbar: { display: 'flex', gap: 10, alignItems: 'center' },
  hint: { color: ({ t }) => t.textLo, fontSize: 12.5 },
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
  health: { display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5 },
  empty: { padding: 24, color: ({ t }) => t.textLo, textAlign: 'center', fontSize: 13 },
}));

const STATE_CLASS = { new: 'rowNew', edited: 'rowEdited', removed: 'rowRemoved' } as const;
const STATE_TONE = { new: 'ok', edited: 'flight', removed: 'bad' } as const;
const STATE_LABEL = { new: 'new', edited: 'edit', removed: 'remove' } as const;

export function EnvironmentsTab() {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const { environments, pipelineOrder, loading, error, owner, appName } = useReleaseContext();
  const [searchParams] = useSearchParams();
  const [nonce, setNonce] = useState(0);
  const cicd = useCicdConfig(owner && appName ? { owner, appName } : undefined, nonce);
  const submit = useSubmitCicdConfigChange();
  const launcher = useLaunchApplicationEnvironment();
  const [phase, setPhase] = useState<'idle' | 'launching' | 'submitting'>('idle');
  // env name -> the ApplicationEnvironment request PR already opened for it. Kept so a retry after a later
  // failure does not open a second request for an environment that already has one.
  const [launched, setLaunched] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | undefined>();
  const [staged, setStaged] = useState<Staged[]>([]);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<string | undefined>();
  const [removing, setRemoving] = useState<string | undefined>();
  const [filter, setFilter] = useState<Filter>('all');
  const [menu, setMenu] = useState<{ name: string; el: HTMLElement } | undefined>();
  const [dragging, setDragging] = useState<string | undefined>();
  const [dragOver, setDragOver] = useState<string | undefined>();

  const liveRows: EnvironmentRow[] = useMemo(
    () => buildEnvironmentRows(environments, { lower: pipelineOrder.lower, upper: pipelineOrder.upper }),
    [environments, pipelineOrder.lower, pipelineOrder.upper],
  );

  const deploy = cicd.data?.values.deploy as Deploy | undefined;
  const pipelines = (cicd.data?.values as Record<string, unknown> | undefined)?.pipelines;
  const canEdit = Boolean(cicd.data && owner && appName);
  const targetId = (typeof deploy?.target === 'string' && deploy.target) || 'k8s-rollout';
  const cloudBlock = TARGET_BLOCK[targetId];
  const targetLabel = DEPLOY_TARGETS[targetId]?.label ?? targetId;

  const { shape, envs: before } = useMemo(() => readEnvironments(deploy), [deploy]);
  const after = useMemo(() => applyStaged(before, staged), [before, staged]);
  const envChanges = useMemo(() => describeChanges(before, after, shape), [before, after, shape]);
  const flightAdds = useMemo(() => addedFlightEnvs(before, after), [before, after]);
  const problems = useMemo(
    () => [
      ...validateEnvironments(after, targetId),
      ...validateAddedFlight(before, after, targetId),
      ...validateRemovals(before, after, pipelines),
    ],
    [before, after, targetId, pipelines],
  );
  const releasePlan = useMemo(() => planReleaseSteps(pipelines, after, releaseStepEnvs(staged, after)), [pipelines, after, staged]);
  const releaseLines = useMemo(
    () =>
      releasePlan.added.map(a => ({
        kind: 'edit' as const,
        title: `Add a release step for ${a.env}`,
        detail: `pipeline ${a.pipeline}${a.after ? `, after the step for ${a.after}` : ', at the end'}`,
      })),
    [releasePlan],
  );
  const changes = useMemo(() => [...envChanges, ...releaseLines], [envChanges, releaseLines]);
  const notes = useMemo(
    () => [
      ...followUps(before, after, targetId, appName),
      ...releasePlan.skipped.map(k => `No release step added for ${k.env}: ${k.reason}.`),
    ],
    [before, after, targetId, appName, releasePlan],
  );
  const deleteFiles = useMemo(() => deleteFilesFor(before, after, targetId), [before, after, targetId]);

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
      return toRow(def, state);
    });
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
  }, [canEdit, liveRows, before, after, targetLabel]);

  if (loading && rows.length === 0) return <Progress />;
  if (error && rows.length === 0) return <ResponseErrorPanel error={new Error(String(error))} />;

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
    canEditRow(r) && r.def?.tier === 'ground' && r.state !== 'removed' && (canMove(r.name, 'up') || canMove(r.name, 'down'));

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
    // The ApplicationEnvironment request first, so the environment exists when cicd.yaml names it.
    const done = { ...launched };
    for (const e of flightAdds) {
      if (done[e.name]) continue;
      setPhase('launching');
      const r = await launcher.launch({ appName, env: e.name, cluster: e.cluster as string });
      if (r.status !== 'done') {
        setLaunched(done);
        setPhase('idle');
        setFailure(
          `Creating ${e.name} failed: ${r.status === 'failed' ? r.error : 'the request did not finish'}. Nothing was changed in cicd.yaml.`,
        );
        return;
      }
      done[e.name] = r.prUrl;
    }
    setLaunched(done);
    setPhase('submitting');
    await submit.submit({
      owner,
      appName,
      patch: { deploy: buildDeploy(deploy, after), ...(releasePlan.added.length > 0 ? { pipelines: releasePlan.pipelines } : {}) },
      summary: changes.map(l => l.title),
      ...(deleteFiles.length > 0 ? { deleteFiles } : {}),
    });
    setPhase('idle');
  };

  // Closing after a success clears everything staged. Closing after a failure keeps it, so the user can fix
  // the cause and try again (requests already opened are remembered and not repeated).
  const closeResult = () => {
    const succeeded = Boolean(submit.result);
    submit.reset();
    setFailure(undefined);
    if (succeeded) {
      setStaged([]);
      setLaunched({});
      setNonce(n => n + 1);
    }
  };

  const detailCtx: RowDetailContext = {
    owner,
    appName,
    entity: searchParams.get('entity') ?? '',
    deploy,
    pipelines,
    targetLabel,
    cloudBlock,
    onSetField: setField,
    onRemove: setRemoving,
    onUndoRemove: undoRemove,
  };

  const menuRow = menu ? rows.find(r => r.name === menu.name) : undefined;
  const closeMenu = () => setMenu(undefined);
  const menuGround = menuRow?.def?.tier === 'ground' && menuRow.state !== 'removed';

  return (
    <div className={c.wrap}>
      <PageHeader
        title="Environments"
        subtitle={canEdit ? 'Edit in the table. Changes stage on the right, then open together.' : 'Every environment of this service, in promotion order.'}
        actions={
          canEdit && (
            <Button variant="primary" onClick={() => setAdding(true)}>
              Add environment
            </Button>
          )
        }
      />
      {!canEdit && (
        <div className={c.hint} style={{ marginBottom: 12 }}>
          Read-only: this service has no cicd.yaml Tower can edit. Change the list and its order in the Glidepath tab; Flight environment
          values are in App Configuration.
        </div>
      )}
      <div className={canEdit ? c.layout : undefined}>
        <div className={c.main}>
          <div className={c.toolbar}>
            <Segmented<Filter>
              label="Filter environments"
              value={filter}
              onChange={setFilter}
              options={[
                { id: 'all', label: 'All', count: counts.all },
                { id: 'ground', label: 'Ground', count: counts.ground },
                { id: 'flight', label: 'Flight', count: counts.flight },
                { id: 'cloud', label: 'Cloud', count: counts.cloud },
              ]}
            />
            <div style={{ flex: 1 }} />
            {canEdit && <span className={c.hint}>Drag the handle to reorder</span>}
          </div>
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
                              <Chip tone={STATE_TONE[r.state]}>staged: {STATE_LABEL[r.state]}</Chip>
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
                            {editable && (
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
        {menuGround && (
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
        {menuGround && (
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
        open={adding}
        onClose={() => setAdding(false)}
        current={after}
        problems={problems}
        targetId={targetId}
        targetLabel={targetLabel}
        cloudBlock={cloudBlock}
        onStage={(env, releaseStep) => {
          setStaged(s => [...s, { kind: 'add', env, releaseStep }]);
          setAdding(false);
        }}
      />
      {removing && (
        <RemoveEnvironmentDialog
          name={removing}
          appName={appName}
          cloud={Boolean(cloudBlock)}
          files={envFilePaths(removing)}
          blockedBy={pipelinesNamingEnv(pipelines, removing)}
          onCancel={() => setRemoving(undefined)}
          onConfirm={() => stageRemove(removing)}
        />
      )}
      {(submit.result || submit.error || failure) && (
        <ChangeResultDialog
          requests={flightAdds.filter(e => launched[e.name]).map(e => ({ env: e.name, url: launched[e.name] }))}
          cicdPrUrl={submit.result?.prUrl}
          error={failure ?? submit.error}
          onClose={closeResult}
        />
      )}
    </div>
  );
}
