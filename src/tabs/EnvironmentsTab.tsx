import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import Dialog from '@material-ui/core/Dialog';
import DialogTitle from '@material-ui/core/DialogTitle';
import DialogContent from '@material-ui/core/DialogContent';
import DialogActions from '@material-ui/core/DialogActions';
import Button from '@material-ui/core/Button';
import Checkbox from '@material-ui/core/Checkbox';
import Radio from '@material-ui/core/Radio';
import RadioGroup from '@material-ui/core/RadioGroup';
import FormControlLabel from '@material-ui/core/FormControlLabel';
import DialogContentText from '@material-ui/core/DialogContentText';
import Link from '@material-ui/core/Link';
import TextField from '@material-ui/core/TextField';
import { Progress, ResponseErrorPanel } from '@backstage/core-components';
import { fontDisplay, fontMono, useHangarTokens, type HangarTokens } from '../brand/tokens';
import { buildEnvironmentRows, type EnvironmentRow } from '../environmentRows';
import { useLaunchApplicationEnvironment } from '../environments/applicationEnvironment';
import {
  addedFlightEnvs,
  applyStaged,
  buildDeploy,
  deleteFilesFor,
  envFilePaths,
  describeChanges,
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
import { DEPLOY_TARGETS } from '../serviceClass';
import { PlatformFileEditor } from '../PlatformFileEditor';
import { preventFocusScroll } from '../preventFocusScroll';
import { formatDateTime, relativeTime } from '../shared/format';
import { useCicdConfig, useSubmitCicdConfigChange } from '../useConfigData';
import { useReleaseContext } from '../useReleaseContext';
import type { Health } from '../types';

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

const HEALTH_LABEL: Record<Health, string> = {
  healthy: 'Healthy',
  progressing: 'Progressing',
  paused: 'Paused',
  degraded: 'Degraded',
  unknown: 'Unknown',
};

// The fields of each cloud block an environment may override (glidepath schemas/cicd.schema.json).
const BLOCK_FIELDS: Record<CloudBlock, string[]> = {
  lambda: ['functionName', 'region'],
  ecs: ['cluster', 'service', 'containerName', 'region', 'taskDefinitionFamily'],
  azureContainerApps: ['resourceGroup', 'appName'],
};
// The one field a new environment most often needs its own value for.
const MAIN_FIELD: Record<CloudBlock, string> = { lambda: 'functionName', ecs: 'service', azureContainerApps: 'appName' };
const TARGET_BLOCK: Record<string, CloudBlock> = {
  'aws-ecs': 'ecs',
  'aws-lambda': 'lambda',
  'azure-container-apps': 'azureContainerApps',
};

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  wrap: { padding: '20px 24px 40px', maxWidth: 1380 },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' },
  title: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 20, color: ({ t }) => t.textHi },
  sub: { fontSize: 13, color: ({ t }) => t.textLo, marginTop: 2, marginBottom: 12 },
  note: {
    fontSize: 12.5,
    color: ({ t }) => t.textLo,
    border: ({ t }) => `1px solid ${t.lineSoft}`,
    borderRadius: 6,
    padding: '9px 12px',
    marginBottom: 14,
  },
  layout: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 340px', gap: 18, alignItems: 'start' },
  empty: {
    border: ({ t }) => `1px dashed ${t.line}`,
    borderRadius: 6,
    padding: 24,
    color: ({ t }) => t.textLo,
    textAlign: 'center',
  },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13.5 },
  th: {
    fontFamily: fontMono,
    fontSize: 10.5,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: ({ t }) => t.textFaint,
    textAlign: 'left',
    padding: '8px 10px',
    borderBottom: ({ t }) => `1px solid ${t.line}`,
  },
  td: {
    padding: '11px 10px',
    borderBottom: ({ t }) => `1px solid ${t.lineSoft}`,
    color: ({ t }) => t.textHi,
    verticalAlign: 'middle',
  },
  name: { fontFamily: fontDisplay, fontWeight: 600, fontSize: 15 },
  mono: { fontFamily: fontMono, fontSize: 12, color: ({ t }) => t.textLo },
  muted: { color: ({ t }) => t.textFaint },
  chip: {
    display: 'inline-block',
    fontFamily: fontMono,
    fontSize: 11,
    padding: '3px 7px',
    borderRadius: 4,
    border: '1px solid',
  },
  ground: { color: ({ t }) => t.sky, borderColor: ({ t }) => t.skyLine },
  flight: { color: ({ t }) => t.amber, borderColor: ({ t }) => t.amberLine },
  staged: { color: ({ t }) => t.good, borderColor: ({ t }) => t.good, marginLeft: 8 },
  health: { display: 'inline-flex', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, display: 'inline-block' },
  rowBtn: {
    border: ({ t }) => `1px solid ${t.line}`,
    background: 'transparent',
    color: ({ t }) => t.textLo,
    borderRadius: 4,
    width: 26,
    height: 26,
    cursor: 'pointer',
    fontFamily: fontMono,
    marginLeft: 4,
    '&:disabled': { opacity: 0.35, cursor: 'default' },
  },
  clickable: { cursor: 'pointer', '&:hover': { background: ({ t }) => t.panelAlt } },
  expanded: {
    background: ({ t }) => t.panelAlt,
    padding: '14px 16px 16px 24px',
    borderBottom: ({ t }) => `1px solid ${t.lineSoft}`,
  },
  fields: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, maxWidth: 640 },
  panel: {
    border: ({ t }) => `1px solid ${t.amberLine}`,
    borderRadius: 6,
    padding: 16,
    background: ({ t }) => t.panel,
  },
  panelHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  label: {
    fontFamily: fontMono,
    fontSize: 11,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: ({ t }) => t.textFaint,
  },
  line: { marginBottom: 10 },
  lineTitle: { fontSize: 13, fontWeight: 600, color: ({ t }) => t.textHi },
  lineDetail: { fontFamily: fontMono, fontSize: 11.5, color: ({ t }) => t.textLo },
  problem: { fontSize: 12.5, color: ({ t }) => t.bad, marginBottom: 6 },
  followUp: { fontSize: 12.5, color: ({ t }) => t.textLo, marginTop: 8 },
  buttons: { display: 'flex', gap: 8, marginTop: 14 },
  primary: { flex: 1, backgroundColor: ({ t }) => t.amber, color: ({ t }) => t.amberInk, '&:hover': { backgroundColor: ({ t }) => t.amber } },
  dialogPaper: { backgroundColor: ({ t }) => t.panel, backgroundImage: 'none', border: ({ t }) => `1px solid ${t.line}`, minWidth: 440 },
  dialogNote: { fontSize: 12.5, color: ({ t }) => t.textLo, marginTop: 8 },
}));

function dotColor(h: Health, t: HangarTokens): string {
  switch (h) {
    case 'healthy':
      return t.good;
    case 'degraded':
      return t.bad;
    case 'progressing':
      return t.sky;
    case 'paused':
      return t.amber;
    default:
      return t.textFaint;
  }
}

interface DisplayRow {
  name: string;
  tier: 'ground' | 'flight';
  target: string;
  where: string;
  health: Health;
  deployed: boolean;
  image?: string;
  deployedAt?: string;
  def?: EnvDef;
  state?: 'new' | 'edited';
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function EnvironmentsTab() {
  const t = useHangarTokens();
  const classes = useStyles({ t });
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
  const releasePlan = useMemo(
    () => planReleaseSteps(pipelines, after, releaseStepEnvs(staged, after)),
    [pipelines, after, staged],
  );
  const releaseLines = useMemo(
    () => [
      ...releasePlan.added.map(a => ({
        kind: 'edit' as const,
        title: `Add a release step for ${a.env}`,
        detail: `pipeline ${a.pipeline}${a.after ? `, after the step for ${a.after}` : ', at the end'}`,
      })),
    ],
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
    const out: DisplayRow[] = after.map(def => {
      const l = live.get(def.name);
      const prior = beforeBy.get(def.name);
      const state = !prior ? ('new' as const) : same(prior, def) ? undefined : ('edited' as const);
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
    });
    // Live environments cicd.yaml does not declare: shown, but nothing here can edit them.
    for (const r of liveRows) if (!after.some(e => e.name === r.name)) out.push({ ...r });
    return out;
  }, [canEdit, liveRows, before, after, targetLabel]);

  if (loading && rows.length === 0) return <Progress />;
  if (error && rows.length === 0) return <ResponseErrorPanel error={new Error(String(error))} />;

  const move = (name: string, direction: 'up' | 'down') => setStaged(s => [...s, { kind: 'move', name, direction }]);
  const canMove = (name: string, direction: 'up' | 'down') => {
    const i = after.findIndex(e => e.name === name);
    const j = i + (direction === 'up' ? -1 : 1);
    return i !== -1 && Boolean(after[j]) && after[j].tier === after[i].tier;
  };

  // Removing an environment that exists only as a staged add just un-stages it; removing a real one stages a remove.
  const stageRemove = (name: string) => {
    if (before.some(e => e.name === name)) setStaged(s => [...s, { kind: 'remove', name }]);
    else setStaged(s => s.filter(x => !('env' in x && x.env.name === name) && !('name' in x && x.name === name)));
    setRemoving(undefined);
    setOpen(undefined);
  };

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
    await submit.submit({ owner, appName, patch: { deploy: buildDeploy(deploy, after), ...(releasePlan.added.length > 0 ? { pipelines: releasePlan.pipelines } : {}) },
      summary: changes.map(c => c.title),
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

  // What a row's expansion shows: the cloud resource fields, a Ground environment's values file, or where a
  // Flight environment's values live.
  const valuesPanel = (r: DisplayRow & { def: EnvDef }) => {
    if (cloudBlock) {
      return (
        <>
                    <div className={classes.label}>This environment&apos;s {targetLabel} resource</div>
                    <div className={classes.dialogNote}>
                      Leave a field empty to use the app-level value shown as its hint.
                    </div>
                    <div className={classes.fields} style={{ marginTop: 10 }}>
                      {BLOCK_FIELDS[cloudBlock].map(f => (
                        <TextField
                          key={f}
                          id={`env-${r.name}-${f}`}
                          size="small"
                          label={f}
                          value={String((r.def?.[cloudBlock] as Record<string, unknown> | undefined)?.[f] ?? '')}
                          placeholder={String((deploy?.[cloudBlock] as Record<string, unknown> | undefined)?.[f] ?? '')}
                          InputLabelProps={{ shrink: true }}
                          onChange={e => setField(r.def as EnvDef, cloudBlock, f, e.target.value)}
                        />
                      ))}
                    </div>
                  </>
      );
    }
    if (r.def.tier === 'ground' && r.state === 'new') {
      return (
        <div className={classes.dialogNote}>
              Its values file, <span className={classes.mono}>platform/envs/{r.name}.yaml</span>, is created by a
              second pull request after the cicd.yaml change merges. Edit its values here once that is merged.
            </div>
      );
    }
    if (r.def.tier === 'ground') {
      return (
        <>
              <div className={classes.label}>Values: platform/envs/{r.name}.yaml</div>
              <div className={classes.dialogNote} style={{ marginBottom: 8 }}>
                The same chart values as App Configuration, minus rollout.image (set by deploy automation). This file
                has its own pull request: it is not part of the pending changes.
              </div>
              <PlatformFileEditor owner={owner as string} appName={appName as string} selector={{ kind: 'env', env: r.name }} />
            </>
      );
    }
    return (
      <div className={classes.dialogNote}>
          This Flight environment&apos;s values live in{' '}
          <span className={classes.mono}>gitops-{appName}/{r.def.cluster ?? '<cluster>'}/{r.name}/values.yaml</span>.{' '}
          <Link href={`?${new URLSearchParams({ entity: searchParams.get('entity') ?? '', tab: 'config', env: r.name })}`}>
            Edit them in App Configuration
          </Link>
          , which keeps its own pull-request flow and prod warnings.
        </div>
    );
  };

  return (
    <div className={classes.wrap}>
      <div className={classes.head}>
        <div>
          <Typography className={classes.title}>Environments</Typography>
          <div className={classes.sub}>Every environment of this service, in promotion order.</div>
        </div>
        {canEdit && (
          <Button variant="outlined" size="small" onMouseDown={preventFocusScroll} onClick={() => setAdding(true)}>
            Add environment
          </Button>
        )}
      </div>
      <div className={classes.note}>
        {canEdit
          ? 'Changes here are staged: nothing is submitted until you open the pull request from the Pending changes panel. Removing a Ground environment is staged the same way. Removing a Flight environment is still done by hand. The values of a Ground environment are edited in its row, with their own pull request.'
          : 'Read-only: this service has no cicd.yaml Tower can edit. Change the list and its order in the Glidepath tab; Flight environment values are in App Configuration.'}
      </div>
      <div className={canEdit ? classes.layout : undefined}>
        <div>
          {rows.length === 0 ? (
            <div className={classes.empty}>No environments yet. They appear here once the service declares or deploys to one.</div>
          ) : (
            <table className={classes.table}>
              <thead>
                <tr>
                  {['Environment', 'Tier', 'Target', 'Where', 'Health', 'Live image', 'Deployed', canEdit ? 'Order' : ''].map(h => (
                    <th key={h || 'x'} className={classes.th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const editable = canEdit && Boolean(r.def);
                  const isOpen = open === r.name;
                  return [
                    <tr
                      key={r.name}
                      className={editable ? classes.clickable : undefined}
                      onClick={editable ? () => setOpen(isOpen ? undefined : r.name) : undefined}
                    >
                      <td className={`${classes.td} ${classes.name}`}>
                        {r.name}
                        {r.state && <span className={`${classes.chip} ${classes.staged}`}>staged: {r.state}</span>}
                      </td>
                      <td className={classes.td}>
                        <span className={`${classes.chip} ${r.tier === 'flight' ? classes.flight : classes.ground}`}>
                          {r.tier === 'flight' ? 'Flight' : 'Ground'}
                        </span>
                      </td>
                      <td className={classes.td}>{r.target}</td>
                      <td className={`${classes.td} ${classes.mono}`}>{r.where}</td>
                      <td className={classes.td}>
                        <span className={classes.health}>
                          <i className={classes.dot} style={{ backgroundColor: dotColor(r.health, t) }} aria-hidden="true" />
                          {HEALTH_LABEL[r.health]}
                        </span>
                      </td>
                      <td className={`${classes.td} ${classes.mono}`}>
                        {r.deployed ? r.image : <span className={classes.muted}>not deployed yet</span>}
                      </td>
                      <td className={classes.td} title={r.deployedAt ? formatDateTime(r.deployedAt) : undefined}>
                        {r.deployedAt ? relativeTime(r.deployedAt) : <span className={classes.muted}>—</span>}
                      </td>
                      {canEdit && (
                        <td className={classes.td} onClick={e => e.stopPropagation()}>
                          {editable && r.def?.tier === 'ground' && (
                            <>
                              <button
                                type="button"
                                className={classes.rowBtn}
                                aria-label={`Move ${r.name} earlier`}
                                disabled={!canMove(r.name, 'up')}
                                onMouseDown={preventFocusScroll}
                                onClick={() => move(r.name, 'up')}
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                className={classes.rowBtn}
                                aria-label={`Move ${r.name} later`}
                                disabled={!canMove(r.name, 'down')}
                                onMouseDown={preventFocusScroll}
                                onClick={() => move(r.name, 'down')}
                              >
                                ↓
                              </button>
                            </>
                          )}
                          {editable && r.def?.tier === 'ground' && (
                            <button
                              type="button"
                              className={classes.rowBtn}
                              aria-label={`Remove ${r.name}`}
                              onMouseDown={preventFocusScroll}
                              onClick={() => setRemoving(r.name)}
                            >
                              ✕
                            </button>
                          )}
                        </td>
                      )}
                    </tr>,
                    isOpen && r.def && (
                      <tr key={`${r.name}-edit`}>
                        <td colSpan={8} className={classes.expanded}>
                          {valuesPanel(r as DisplayRow & { def: EnvDef })}
                          {r.def.tier === 'flight' && (
                            <div className={classes.problem} style={{ marginTop: 14 }}>
                              <div className={classes.label}>Danger zone: removing a Flight environment</div>
                              <div className={classes.dialogNote}>
                                Tower does not remove Flight environments. Deleting the ApplicationEnvironment does not delete the files it
                                wrote, so a partial removal would leave an Application still deploying. By hand, in this order:
                                <ol>
                                  <li>Remove the pipeline step that releases to {r.name} (Glidepath tab).</li>
                                  <li>
                                    In the tenants repo, delete <span className={classes.mono}>tenants/{appName}/{r.name}/</span> so the Application is no longer generated.
                                  </li>
                                  <li>
                                    In <span className={classes.mono}>gitops-{appName}</span>, delete <span className={classes.mono}>{r.def.cluster ?? '<cluster>'}/{r.name}/</span>.
                                  </li>
                                  <li>Delete the ApplicationEnvironment request, then remove {r.name} from cicd.yaml.</li>
                                </ol>
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    ),
                  ];
                })}
              </tbody>
            </table>
          )}
        </div>
        {canEdit && (
          <div className={classes.panel} aria-label="Pending changes">
            <div className={classes.panelHead}>
              <span className={classes.label}>Pending changes</span>
              <span className={`${classes.chip} ${classes.flight}`}>{changes.length} staged</span>
            </div>
            {changes.length === 0 ? (
              <div className={classes.dialogNote}>
                Nothing staged. Add an environment, reorder, or set a cloud environment&apos;s resource, then review here.
              </div>
            ) : (
              <>
                {changes.map((c, i) => (
                  <div key={`${c.kind}-${c.title}-${i}`} className={classes.line}>
                    <div className={classes.lineTitle}>{c.title}</div>
                    {c.detail && <div className={classes.lineDetail}>{c.detail}</div>}
                  </div>
                ))}
                {problems.map(p => (
                  <div key={p} className={classes.problem}>
                    {p}
                  </div>
                ))}
                <div className={classes.label} style={{ marginTop: 12 }}>
                  {flightAdds.length > 0 ? 'Pull requests this opens, in this order' : 'Pull request this opens'}
                </div>
                {flightAdds.map(e => (
                  <div key={e.name} className={classes.lineDetail} style={{ marginTop: 4 }}>
                    1. tenants repo: ApplicationEnvironment request for {e.name}
                    {launched[e.name] ? ' (already opened)' : ''}
                  </div>
                ))}
                <div className={classes.lineDetail} style={{ marginTop: 4 }}>
                  {flightAdds.length > 0 ? '2. ' : ''}
                  {owner}/{appName}: cicd.yaml
                </div>
                {notes.map(n => (
                  <div key={n} className={classes.followUp}>
                    {n}
                  </div>
                ))}
                <div className={classes.buttons}>
                  <Button size="small" variant="outlined" onMouseDown={preventFocusScroll} onClick={() => setStaged([])}>
                    Discard all
                  </Button>
                  <Button
                    size="small"
                    variant="contained"
                    className={classes.primary}
                    disabled={problems.length > 0 || phase !== 'idle'}
                    onMouseDown={preventFocusScroll}
                    onClick={openPr}
                  >
                    {phase === 'launching' ? 'Requesting environment…' : phase === 'submitting' ? 'Opening…' : flightAdds.length > 0 ? 'Open pull requests' : 'Open pull request'}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
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
        classes={classes}
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
          classes={classes}
        />
      )}
      {(submit.result || submit.error || failure) && (
        <ChangeResultDialog
          requests={flightAdds.filter(e => launched[e.name]).map(e => ({ env: e.name, url: launched[e.name] }))}
          cicdPrUrl={submit.result?.prUrl}
          error={failure ?? submit.error}
          onClose={closeResult}
          classes={classes}
        />
      )}
    </div>
  );
}

function AddEnvironmentDialog({
  open,
  onClose,
  current,
  problems,
  targetId,
  targetLabel,
  cloudBlock,
  onStage,
  classes,
}: {
  open: boolean;
  onClose: () => void;
  current: EnvDef[];
  problems: string[];
  targetId: string;
  targetLabel: string;
  cloudBlock?: CloudBlock;
  onStage: (env: EnvDef, releaseStep: boolean) => void;
  classes: ReturnType<typeof useStyles>;
}) {
  const [name, setName] = useState('');
  const [tier, setTier] = useState<'ground' | 'flight'>('ground');
  const [cluster, setCluster] = useState('');
  const [override, setOverride] = useState('');
  const [releaseStep, setReleaseStep] = useState(true);
  const mainField = cloudBlock ? MAIN_FIELD[cloudBlock] : undefined;
  // Flight needs a Kubernetes app: a cloud target has no approval path for it yet.
  const flightAllowed = !cloudBlock;
  // Clusters this app's Flight environments already run on, as suggestions (any registered upper cluster works).
  const knownClusters = [...new Set(current.filter(e => e.tier === 'flight' && e.cluster).map(e => e.cluster as string))];

  const candidate: EnvDef = { name: name.trim(), tier };
  if (tier === 'flight' && cluster.trim()) candidate.cluster = cluster.trim();
  if (tier === 'ground' && cloudBlock && mainField && override.trim()) candidate[cloudBlock] = { [mainField]: override.trim() };
  const withCandidate = applyStaged(current, [{ kind: 'add', env: candidate }]);
  const fresh = name.trim()
    ? [...validateEnvironments(withCandidate, targetId), ...validateAddedFlight(current, withCandidate, targetId)].filter(
        p => !problems.includes(p),
      )
    : [];
  const ok = Boolean(name.trim()) && fresh.length === 0;

  const reset = () => {
    setName('');
    setTier('ground');
    setCluster('');
    setOverride('');
    setReleaseStep(true);
  };
  const close = () => {
    reset();
    onClose();
  };

  return (
    <Dialog open={open} onClose={close} PaperProps={{ className: classes.dialogPaper }}>
      <DialogTitle>Add environment</DialogTitle>
      <DialogContent>
        <TextField
          id="add-env-name"
          autoFocus
          fullWidth
          size="small"
          label="Name"
          value={name}
          onChange={e => setName(e.target.value)}
          helperText="Lowercase letters, digits and '-', for example qa."
        />
        <RadioGroup
          aria-label="Tier"
          value={tier}
          onChange={e => setTier(e.target.value as 'ground' | 'flight')}
          style={{ marginTop: 10 }}
        >
          <FormControlLabel value="ground" control={<Radio size="small" />} label="Ground: deploys on every push" />
          <FormControlLabel
            value="flight"
            disabled={!flightAllowed}
            control={<Radio size="small" />}
            label="Flight: deploys only through an approved release"
          />
        </RadioGroup>
        {!flightAllowed && (
          <div className={classes.dialogNote}>
            Flight environments are not available for {targetLabel} yet: a cloud target has no approval path for them.
          </div>
        )}
        {tier === 'flight' && (
          <>
            <TextField
              id="add-env-cluster"
              fullWidth
              size="small"
              style={{ marginTop: 12 }}
              label="Cluster"
              value={cluster}
              onChange={e => setCluster(e.target.value)}
              inputProps={{ list: 'flight-clusters' }}
              helperText="The registered upper cluster it runs on, for example kind-prod."
              InputLabelProps={{ shrink: true }}
            />
            <datalist id="flight-clusters">
              {knownClusters.map(c => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <div className={classes.dialogNote}>
              Creating a Flight environment opens two pull requests: an ApplicationEnvironment request on the tenants repo,
              then the cicd.yaml change. Merge the request first.
            </div>
            <FormControlLabel
              control={<Checkbox size="small" checked={releaseStep} onChange={e => setReleaseStep(e.target.checked)} />}
              label="Also add a release step for it to the pipeline"
            />
            <div className={classes.dialogNote}>
              Without a release step nothing in CI releases to this environment. It goes right after the step for the
              environment before it. Untick to edit the pipeline yourself in the Glidepath tab.
            </div>
          </>
        )}
        {tier === 'ground' && cloudBlock && mainField && (
          <TextField
            id="add-env-override"
            fullWidth
            size="small"
            style={{ marginTop: 14 }}
            label={`${targetLabel} ${mainField} (optional)`}
            value={override}
            onChange={e => setOverride(e.target.value)}
            helperText="Leave empty to use the app-level value."
            InputLabelProps={{ shrink: true }}
          />
        )}
        {fresh.map(p => (
          <div key={p} className={classes.problem} style={{ marginTop: 10 }}>
            {p}
          </div>
        ))}
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>Cancel</Button>
        <Button
          disabled={!ok}
          onClick={() => {
            onStage(candidate, tier === 'flight' && releaseStep);
            reset();
          }}
        >
          Stage environment
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function RemoveEnvironmentDialog({
  name,
  appName,
  cloud,
  files,
  blockedBy,
  onCancel,
  onConfirm,
  classes,
}: {
  name: string;
  appName?: string;
  cloud: boolean;
  files: string[];
  blockedBy: string[];
  onCancel: () => void;
  onConfirm: () => void;
  classes: ReturnType<typeof useStyles>;
}) {
  const [typed, setTyped] = useState('');
  const blocked = blockedBy.length > 0;
  return (
    <Dialog open onClose={onCancel} PaperProps={{ className: classes.dialogPaper }}>
      <DialogTitle>Remove {name}</DialogTitle>
      <DialogContent>
        {blocked ? (
          <DialogContentText className={classes.problem}>
            {blockedBy.map(p => `Pipeline "${p}"`).join(', ')} still {blockedBy.length > 1 ? 'have' : 'has'} a step for {name}. Remove
            the step in the Glidepath tab first, then come back.
          </DialogContentText>
        ) : (
          <>
            <DialogContentText component="div">
              Staging this removes {name} from cicd.yaml. Nothing happens until you open the pull request and merge it.
              {cloud ? (
                <div className={classes.dialogNote}>
                  The cloud resource this environment deployed to is not deleted. Remove it in your cloud account.
                </div>
              ) : (
                <>
                  <div className={classes.dialogNote}>The same pull request deletes, where they exist:</div>
                  <ul className={classes.mono}>
                    {files.map(f => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                  <div className={classes.dialogNote}>
                    After it merges, Argo CD prunes the Application <span className={classes.mono}>{appName}-{name}</span> and the
                    namespace <span className={classes.mono}>app-{appName}-{name}</span>, deleting everything running in it.
                  </div>
                </>
              )}
            </DialogContentText>
            <TextField
              id="remove-env-confirm"
              autoFocus
              fullWidth
              size="small"
              style={{ marginTop: 14 }}
              label={`Type ${name} to confirm`}
              value={typed}
              onChange={e => setTyped(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button disabled={blocked || typed !== name} onClick={onConfirm}>
          Stage removal
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function ChangeResultDialog({
  requests,
  cicdPrUrl,
  error,
  onClose,
  classes,
}: {
  requests: Array<{ env: string; url: string }>;
  cicdPrUrl?: string;
  error?: string;
  onClose: () => void;
  classes: ReturnType<typeof useStyles>;
}) {
  return (
    <Dialog open onClose={onClose} PaperProps={{ className: classes.dialogPaper }}>
      <DialogTitle>{error ? 'Something needs attention' : 'Pull requests opened'}</DialogTitle>
      <DialogContent>
        {error && <DialogContentText className={classes.problem}>{error}</DialogContentText>}
        {requests.length > 0 && (
          <DialogContentText component="div">
            {requests.map((r, i) => (
              <div key={r.env}>
                {i + 1}. ApplicationEnvironment request for {r.env}:{' '}
                <Link href={r.url} target="_blank" rel="noopener noreferrer">
                  {r.url}
                </Link>
              </div>
            ))}
          </DialogContentText>
        )}
        {cicdPrUrl && (
          <DialogContentText component="div">
            {requests.length > 0 ? `${requests.length + 1}. ` : ''}cicd.yaml change:{' '}
            <Link href={cicdPrUrl} target="_blank" rel="noopener noreferrer">
              {cicdPrUrl}
            </Link>
          </DialogContentText>
        )}
        {requests.length > 0 && cicdPrUrl && (
          <DialogContentText>Merge the ApplicationEnvironment request first, then the cicd.yaml change.</DialogContentText>
        )}
        {error && requests.length > 0 && !cicdPrUrl && (
          <DialogContentText>
            The request(s) above are already open and will not be opened again if you try again.
          </DialogContentText>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
