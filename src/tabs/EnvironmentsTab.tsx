import { useMemo, useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import Dialog from '@material-ui/core/Dialog';
import DialogTitle from '@material-ui/core/DialogTitle';
import DialogContent from '@material-ui/core/DialogContent';
import DialogActions from '@material-ui/core/DialogActions';
import Button from '@material-ui/core/Button';
import TextField from '@material-ui/core/TextField';
import { Progress, ResponseErrorPanel } from '@backstage/core-components';
import { fontDisplay, fontMono, useHangarTokens, type HangarTokens } from '../brand/tokens';
import { buildEnvironmentRows, type EnvironmentRow } from '../environmentRows';
import {
  applyStaged,
  buildDeploy,
  describeChanges,
  followUps,
  readEnvironments,
  stageSetBlock,
  validateEnvironments,
  type CloudBlock,
  type Deploy,
  type EnvDef,
  type Staged,
} from '../environments/stagedChanges';
import { DEPLOY_TARGETS } from '../serviceClass';
import { PrResultDialog } from '../PrResultDialog';
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
// What can be edited here so far: add a Ground environment, reorder Ground environments, and set a cloud
// environment's own function / service / Container App. Flight environments, deleting, and the values of a
// Kubernetes environment are still done elsewhere (they come next).

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
  const [nonce, setNonce] = useState(0);
  const cicd = useCicdConfig(owner && appName ? { owner, appName } : undefined, nonce);
  const submit = useSubmitCicdConfigChange();
  const [staged, setStaged] = useState<Staged[]>([]);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<string | undefined>();

  const liveRows: EnvironmentRow[] = useMemo(
    () => buildEnvironmentRows(environments, { lower: pipelineOrder.lower, upper: pipelineOrder.upper }),
    [environments, pipelineOrder.lower, pipelineOrder.upper],
  );

  const deploy = cicd.data?.values.deploy as Deploy | undefined;
  const canEdit = Boolean(cicd.data && owner && appName);
  const targetId = (typeof deploy?.target === 'string' && deploy.target) || 'k8s-rollout';
  const cloudBlock = TARGET_BLOCK[targetId];
  const targetLabel = DEPLOY_TARGETS[targetId]?.label ?? targetId;

  const { shape, envs: before } = useMemo(() => readEnvironments(deploy), [deploy]);
  const after = useMemo(() => applyStaged(before, staged), [before, staged]);
  const changes = useMemo(() => describeChanges(before, after, shape), [before, after, shape]);
  const problems = useMemo(() => validateEnvironments(after, targetId), [after, targetId]);
  const notes = useMemo(() => followUps(before, after, targetId), [before, after, targetId]);

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

  const setField = (env: EnvDef, block: CloudBlock, field: string, value: string) => {
    const current = { ...(env[block] ?? {}) } as Record<string, unknown>;
    if (value.trim()) current[field] = value;
    else delete current[field];
    setStaged(s => stageSetBlock(s, env.name, block, current));
  };

  const openPr = () => {
    if (!owner || !appName) return;
    submit.submit({ owner, appName, patch: { deploy: buildDeploy(deploy, after) }, summary: changes.map(c => c.title) });
  };

  const closeResult = () => {
    submit.reset();
    setStaged([]);
    setNonce(n => n + 1);
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
          ? 'Changes here are staged: nothing is submitted until you open the pull request from the Pending changes panel. Flight environments, deleting, and the values of a Kubernetes environment are still done elsewhere.'
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
                        </td>
                      )}
                    </tr>,
                    isOpen && r.def && (
                      <tr key={`${r.name}-edit`}>
                        <td colSpan={8} className={classes.expanded}>
                          {cloudBlock ? (
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
                          ) : (
                            <div className={classes.dialogNote}>
                              This environment&apos;s values live in <span className={classes.mono}>platform/envs/{r.name}.yaml</span> (Ground)
                              or the gitops repo (Flight). Edit them in the Glidepath tab or App Configuration for now.
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
                  Pull request this opens
                </div>
                <div className={classes.lineDetail} style={{ marginTop: 4 }}>
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
                    disabled={problems.length > 0 || submit.loading}
                    onMouseDown={preventFocusScroll}
                    onClick={openPr}
                  >
                    {submit.loading ? 'Opening…' : 'Open pull request'}
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
        onStage={env => {
          setStaged(s => [...s, { kind: 'add', env }]);
          setAdding(false);
        }}
        classes={classes}
      />
      {(submit.result || submit.error) && (
        <PrResultDialog result={submit.result} error={submit.error} onClose={closeResult} />
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
  onStage: (env: EnvDef) => void;
  classes: ReturnType<typeof useStyles>;
}) {
  const [name, setName] = useState('');
  const [override, setOverride] = useState('');
  const mainField = cloudBlock ? MAIN_FIELD[cloudBlock] : undefined;

  const candidate: EnvDef = { name: name.trim(), tier: 'ground' };
  if (cloudBlock && mainField && override.trim()) candidate[cloudBlock] = { [mainField]: override.trim() };
  const fresh = name.trim()
    ? validateEnvironments(applyStaged(current, [{ kind: 'add', env: candidate }]), targetId).filter(p => !problems.includes(p))
    : [];
  const ok = Boolean(name.trim()) && fresh.length === 0;

  const close = () => {
    setName('');
    setOverride('');
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
        <div className={classes.dialogNote}>
          <b>Ground</b>: deploys on every push. Flight environments (deployed through an approved release) are created
          another way for now and arrive here in a later release.
        </div>
        {cloudBlock && mainField && (
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
        <Button disabled={!ok} onClick={() => { onStage(candidate); setName(''); setOverride(''); }}>
          Stage environment
        </Button>
      </DialogActions>
    </Dialog>
  );
}
