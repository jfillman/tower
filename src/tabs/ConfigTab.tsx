import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Typography from '@material-ui/core/Typography';
import Switch from '@material-ui/core/Switch';
import Link from '@material-ui/core/Link';
import WarningRoundedIcon from '@material-ui/icons/WarningRounded';
import { Progress, ResponseErrorPanel } from '@backstage/core-components';
import { useHangarTokens } from '../brand/tokens';
import { TowerEmptyState } from '../TowerEmptyState';
import { useReleaseContext } from '../useReleaseContext';
import {
  useConfigMapFiles,
  useEnvXr,
  useSubmitConfigMapFiles,
  useSubmitEnvXrChange,
} from '../useConfigData';
import { deepEqual } from '../deepEqual';
import { RefreshButton } from '../RefreshButton';
import { PrResultDialog } from '../PrResultDialog';
import { preventFocusScroll } from '../preventFocusScroll';
import { ConfigEditor } from '../values/ValuesForm';
import { useStyles, type Cls } from '../values/styles';

// Tower's Config tab (2026-09-12, revised 2026-09-13). See glidepathConfig.
// ts's own top comment for the backend half of this design; the summary
// that matters here:
//
//  1. Everything renders/edits gitops-<app>/<cluster>/<env>/values.yaml -
//     this platform's real GitOps source of truth - never a live cluster
//     object. Every save is a real PR (never a direct commit, no exception
//     for any tier - unlike Promote, which does direct-commit lower envs).
//  2. Flight (upper) envs only (item 7) - the env picker below is built
//     from useReleaseContext's pipelineOrder.data.upper, not the full env
//     list Topology/Releases show. Which env is active is deliberately the
//     single most visually prominent thing on this tab (see EnvBanner) -
//     2026-09-13 feedback: "editing the wrong config by accident, despite
//     the PR gate, is problematic."
//  3. Common fields get real form controls, including (as of 2026-09-13)
//     liveness/readiness probes, the service account, and canary steps -
//     the fields that are genuinely open-ended k8s-resource shapes
//     (canaryAnalysis, blueGreen, custom AnalysisTemplates, configMaps/
//     secrets/volumes/jobs, extraManifests, ...) get a YamlBlockEditor with
//     live syntax checking and (for the trickier ones) a real example to
//     start from, instead of a hand-built form for every nested shape.
//  4. Nothing is submitted until every YAML block currently on screen
//     parses, a handful of the chart's own documented invariants hold, AND
//     (as of 2026-09-13) the assembled patch validates against the chart's
//     own real values.schema.json - see validateBeforeSubmit and
//     schemaValidate.ts. The hand-written invariant checks stay alongside
//     the schema check rather than being replaced by it: they exist to give
//     the *specific*, easy-to-fix message that the hand-rolled schema
//     validator doesn't always word as clearly (e.g. schema catches
//     "ingress.host must be at least 1 character" - the hand check catches
//     the same thing but phrases it as "Ingress is enabled but has no host
//     set", which is the message worth showing first).
//  5. The "Catalog resource" panel is this feature's answer to item 5's ask
//     to investigate editing a catalog XR's own spec, not just the Helm
//     values it bootstraps - ApplicationEnvironment's spec has exactly one
//     real (non-identity) field, configMapGenerator, so that's what's
//     wired up. NodeJSApplication (the other example item 5 named) is
//     deliberately NOT here: its spec (devCluster/nodeVersion/
//     packageManager/port/visibility) is app-onboarding state scoped to the
//     dev cluster, not to any one flight environment - out of item 7's
//     flight-only scope, not a gap in this pass.
//  6. Canary steps get a structured builder (Weight/Pause/Analysis rows,
//     reordering, the standard canary-hash args boilerplate generated
//     automatically) whenever the existing steps fit one of those three
//     plain shapes - see parseStepsSimple. A step using anything else
//     (setCanaryScale, experiment, custom args, ...) falls back to the raw
//     YAML editor instead of silently mangling something the builder can't
//     represent; either way is still just `rollout.steps` underneath.

function isProdEnv(env: string): boolean {
  return /^(prod|production)$/i.test(env);
}

export function ConfigTab() {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const { owner, appName, pipelineOrder, loading, error } = useReleaseContext();

  // Built directly from cicd.yaml's own declared upper environments
  // (pipelineOrder.upper/upperClusters), NOT by cross-referencing live
  // Kubernetes-discovered `environments` - Config's whole point is editing
  // gitops-<app>/<cluster>/<env>/values.yaml BEFORE anything is necessarily
  // deployed there (2026-09-16 bug: a freshly-declared upper env with
  // `rollout: null` - "I might not want to deploy a container, I might
  // just want to create a job" - has no live workload for Tower to
  // discover yet, so it silently never appeared in this picker at all).
  const flightEnvs = useMemo(() => {
    if (!pipelineOrder.upper) return [];
    return pipelineOrder.upper.map(name => ({
      env: name,
      cluster: pipelineOrder.upperClusters?.[name] ?? '',
    }));
  }, [pipelineOrder.upper, pipelineOrder.upperClusters]);

  // ?env=<name> (the Environments tab links here) preselects that environment.
  const [searchParams] = useSearchParams();
  const [selectedEnv, setSelectedEnv] = useState<string | undefined>(searchParams.get('env') ?? undefined);
  useEffect(() => {
    if (!selectedEnv && flightEnvs.length > 0) setSelectedEnv(flightEnvs[0].env);
  }, [flightEnvs, selectedEnv]);

  if (loading) return <Progress />;
  if (error) return <ResponseErrorPanel error={new Error(error)} />;
  if (!owner || !appName) {
    return (
      <TowerEmptyState
        title="Can't resolve this app's source repo"
        description="App Configuration needs a resolved GitHub owner/repo (from a promoted environment's provenance) to know which gitops-<app> repo to read."
      />
    );
  }
  // 2026-09-16 bug: "there seems to be a refresh/loading issue... it waits
  // a second or two, then reports no configs, then eventually presents all
  // the env's config". Root cause: usePipelineOrder only starts its fetch
  // once owner/appName resolve (both come from useReleaseContext's own
  // provenance-driven repoRef, which itself only settles after
  // `environments` finishes loading) - the render where `loading` above
  // first flips false and owner/appName first become truthy is the SAME
  // render pipelineOrder's effect gets its real (owner, repo) argument for
  // the first time, but React doesn't run that effect until AFTER this
  // paint - so for that one tick, pipelineOrder.loading reads false with no
  // data yet (its state object is still the stale `{loading:false}` from
  // when its argument was undefined). flightEnvs then briefly, wrongly
  // computed as empty before the real fetch had even started. Waiting for
  // pipelineOrder to have EITHER real data OR a real error (checked only
  // once owner/appName are confirmed resolved above, so this can't spin
  // forever if they never do) closes that gap.
  if (pipelineOrder.loading || (!pipelineOrder.data && !pipelineOrder.error)) return <Progress />;
  if (pipelineOrder.error) return <ResponseErrorPanel error={new Error(pipelineOrder.error)} />;
  if (flightEnvs.length === 0) {
    return (
      <TowerEmptyState
        title="No flight environments yet"
        description={`App Configuration only supports flight (upper) environments, and ${appName}'s cicd.yaml doesn't declare any yet. This is expected until CI/CD is set up for this app - it's not an error.`}
      />
    );
  }

  const active = flightEnvs.find(e => e.env === selectedEnv) ?? flightEnvs[0];
  const prod = isProdEnv(active.env);

  return (
    <div>
      {/* 2026-09-13: "it's not clear enough which env's config we're
          editing... editing the wrong config by accident, despite the PR
          gate, is problematic" - this banner (not a small toolbar row) is
          the single most prominent thing on the tab, red for anything named
          prod/production, amber for every other flight env, and the env
          picker itself lives inside it rather than off to the side. */}
      <div className={`${classes.envBanner} ${prod ? classes.envBannerProd : classes.envBannerOther}`}>
        <div className={classes.envBannerLeft}>
          {prod && <WarningRoundedIcon style={{ color: t.bad }} />}
          <Typography className={`${classes.envBannerTitle} ${prod ? classes.envBannerTitleProd : classes.envBannerTitleOther}`}>
            Editing {active.env.toUpperCase()}
          </Typography>
          <select className={classes.select} value={active.env} onChange={e => setSelectedEnv(e.target.value)}>
            {flightEnvs.map(e => (
              <option key={e.env} value={e.env}>
                {e.env} ({e.cluster})
              </option>
            ))}
          </select>
        </div>
        <Typography className={classes.envBannerPath}>
          gitops-{appName}/{active.cluster}/{active.env}/values.yaml
        </Typography>
      </div>
      <EnvXrPanel owner={owner} appName={appName} env={active.env} classes={classes} />
      <ConfigMapFilesPanel owner={owner} appName={appName} cluster={active.cluster} env={active.env} classes={classes} />
      <ConfigEditor owner={owner} appName={appName} cluster={active.cluster} env={active.env} prod={prod} classes={classes} />
    </div>
  );
}

function EnvXrPanel({ owner, appName, env, classes }: { owner: string; appName: string; env: string; classes: Cls }) {
  const [refreshNonce, setRefreshNonce] = useState(0);
  const xr = useEnvXr({ owner, appName, env }, refreshNonce);
  const submitXr = useSubmitEnvXrChange();
  const [draft, setDraft] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    if (xr.data) setDraft(xr.data.configMapGenerator);
  }, [xr.data]);

  if (xr.loading) return <Progress />;
  if (xr.error) {
    return (
      <div className={classes.section} style={{ marginBottom: 16 }}>
        <Typography className={classes.note}>Couldn't load this env's ApplicationEnvironment resource: {xr.error}</Typography>
      </div>
    );
  }
  if (!xr.data || draft === undefined) return null;

  const dirty = draft !== xr.data.configMapGenerator;

  return (
    <div className={`${classes.section} ${dirty ? classes.sectionDirty : ''}`} style={{ marginBottom: 16 }}>
      <div className={classes.sectionTitleRow}>
        <Typography className={classes.sectionTitle}>
          Catalog resource · ApplicationEnvironment
          {dirty && <span className={classes.dirtyDot} />}
        </Typography>
        <RefreshButton label="" onClick={() => setRefreshNonce(n => n + 1)} />
      </div>
      <Typography className={classes.envBannerPath} style={{ marginBottom: 10 }}>
        {xr.data.path}
      </Typography>
      <div className={classes.switchRow}>
        <Switch checked={draft} onChange={e => setDraft(e.target.checked)} disabled={submitXr.loading} />
        <Typography className={classes.switchLabel}>configMapGenerator</Typography>
      </div>
      <Typography className={classes.hint}>
        The only editable field on this XR - appName/cluster/env are this resource's own identity, not a setting.
      </Typography>
      <PrResultDialog result={submitXr.result} error={submitXr.error} onClose={() => submitXr.reset()} />
      {submitXr.result && (
        <Typography className={classes.note} style={{ marginTop: 10 }}>
          {submitXr.result.alreadyOpen ? 'A PR for this change is already open: ' : 'PR opened: '}
          <Link className={classes.resultLink} href={submitXr.result.prUrl} target="_blank" rel="noopener noreferrer">
            {submitXr.result.prUrl}
          </Link>
        </Typography>
      )}
      {submitXr.error && (
        <Typography className={classes.errorList} style={{ marginTop: 10, listStyle: 'none', paddingLeft: 0 }}>
          Couldn't open PR: {submitXr.error}
        </Typography>
      )}
      {dirty && !submitXr.result && (
        <button
          type="button"
          className={classes.btn}
          style={{ marginTop: 12 }}
          disabled={submitXr.loading}
          onMouseDown={preventFocusScroll}
          onClick={() => submitXr.submit({ owner, appName, env, configMapGenerator: draft })}
        >
          {submitXr.loading ? 'Opening PR…' : 'Open PR for this change'}
        </button>
      )}
    </div>
  );
}

interface ConfigMapFileRow {
  // undefined = a genuinely new file, not yet on GitHub - see submit's
  // rename handling (originalName present + name changed = delete old,
  // create new).
  originalName?: string;
  name: string;
  content: string;
}

function toFileRows(files: { name: string; content: string }[]): ConfigMapFileRow[] {
  return files.map(f => ({ originalName: f.name, name: f.name, content: f.content }));
}

// 2026-09-13 item 2: "I'd like to be able to create the 'Existing
// ConfigMaps' as well... it would be nice to edit those files and create
// new ones." A genuinely different git target from values.yaml - a whole
// directory of arbitrary files rendered through Kustomize's
// configMapGenerator, gated by the configMapGenerator toggle in the
// Catalog resource panel above - so this gets its own fetch/PR flow rather
// than folding into ConfigEditor's values.yaml patch mechanism.
function ConfigMapFilesPanel({ owner, appName, cluster, env, classes }: { owner: string; appName: string; cluster: string; env: string; classes: Cls }) {
  const [refreshNonce, setRefreshNonce] = useState(0);
  const filesData = useConfigMapFiles({ owner, appName, cluster, env }, refreshNonce);
  const xr = useEnvXr({ owner, appName, env });
  const submitFiles = useSubmitConfigMapFiles();

  const [rows, setRows] = useState<ConfigMapFileRow[] | undefined>(undefined);
  const [originalRows, setOriginalRows] = useState<ConfigMapFileRow[] | undefined>(undefined);

  useEffect(() => {
    if (filesData.data) {
      const built = toFileRows(filesData.data.files);
      setRows(built);
      setOriginalRows(built);
      submitFiles.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filesData.data]);

  if (filesData.loading || !rows || !originalRows) return <Progress />;
  if (filesData.error) {
    return (
      <div className={classes.section} style={{ marginBottom: 16 }}>
        <Typography className={classes.note}>Couldn't load configmap files: {filesData.error}</Typography>
      </div>
    );
  }

  const dirty = !deepEqual(rows, originalRows);
  const names = rows.map(r => r.name.trim());
  const errors: string[] = [];
  if (names.some(n => !n)) errors.push('Every file needs a name.');
  if (names.some(n => n === 'kustomization.yaml')) errors.push('kustomization.yaml is managed automatically and can\'t be used as a file name.');
  if (new Set(names).size !== names.length) errors.push('File names must be unique.');

  const update = (i: number, patch: Partial<ConfigMapFileRow>) => {
    const next = [...rows];
    next[i] = { ...next[i], ...patch };
    setRows(next);
  };
  const remove = (i: number) => setRows(rows.filter((_, j) => j !== i));
  const add = () => setRows([...rows, { name: '', content: '' }]);
  const discard = () => {
    setRows(originalRows);
    submitFiles.reset();
  };
  const onSubmit = () => {
    const deletedFiles = originalRows.filter(o => !rows.some(r => r.originalName === o.originalName)).map(o => o.originalName!);
    const renameDeletes = rows.filter(r => r.originalName && r.originalName !== r.name.trim()).map(r => r.originalName!);
    const files = rows.filter(r => r.name.trim()).map(r => ({ name: r.name.trim(), content: r.content }));
    submitFiles.submit({ owner, appName, cluster, env, files, deletedFiles: [...deletedFiles, ...renameDeletes] });
  };

  return (
    <div className={`${classes.section} ${dirty ? classes.sectionDirty : ''}`} style={{ marginBottom: 16 }}>
      <div className={classes.sectionTitleRow}>
        <Typography className={classes.sectionTitle}>
          ConfigMap generator files
          {dirty && <span className={classes.dirtyDot} />}
        </Typography>
        <RefreshButton label="" onClick={() => setRefreshNonce(n => n + 1)} />
      </div>
      <Typography className={classes.envBannerPath} style={{ marginBottom: 6 }}>
        {filesData.data?.path ?? `${cluster}/${env}/configmap`}
      </Typography>
      {filesData.data?.configMapName && (
        <Typography className={classes.hint} style={{ marginTop: 0 }}>
          Generates ConfigMap <code>{filesData.data.configMapName}</code> - reference it from a "Config maps" row above via
          "Existing ConfigMap" → <code>{filesData.data.configMapName}</code>.
        </Typography>
      )}
      {!xr.data?.configMapGenerator && (
        <Typography className={classes.hint} style={{ marginTop: 0 }}>
          configMapGenerator is currently off for this env (see Catalog resource above) - these files can still be prepared here, but won't be rendered into a ConfigMap until it's enabled.
        </Typography>
      )}
      <div className={classes.rowList} style={{ marginTop: 10 }}>
        {rows.length === 0 && <Typography className={classes.hint} style={{ marginTop: 0 }}>No files yet.</Typography>}
        {rows.map((row, i) => (
          <div key={i} className={classes.rowCard}>
            <div className={classes.rowCardHead}>
              <input className={classes.input} style={{ flex: 1 }} placeholder="app-settings.yaml" value={row.name} onChange={e => update(i, { name: e.target.value })} />
              <button type="button" className={classes.removeBtn} onClick={() => remove(i)}>Remove</button>
            </div>
            <textarea className={classes.textarea} rows={6} value={row.content} onChange={e => update(i, { content: e.target.value })} placeholder="file contents" />
          </div>
        ))}
        <button type="button" className={classes.addBtn} onClick={add}>+ Add file</button>
      </div>
      {dirty && (
        <>
          {errors.length > 0 && (
            <ul className={classes.errorList} style={{ marginTop: 10 }}>
              {errors.map(e => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            {submitFiles.result ? (
              <button type="button" className={classes.discardBtn} onClick={() => submitFiles.reset()}>Close</button>
            ) : (
              <button type="button" className={classes.discardBtn} onClick={discard} disabled={submitFiles.loading}>Discard</button>
            )}
            <button type="button" className={classes.btn} disabled={errors.length > 0 || submitFiles.loading} onMouseDown={preventFocusScroll} onClick={onSubmit}>
              {submitFiles.loading ? 'Opening PR…' : 'Open PR for these files'}
            </button>
          </div>
        </>
      )}
      <PrResultDialog result={submitFiles.result} error={submitFiles.error} onClose={() => submitFiles.reset()} />
      {submitFiles.result && (
        <Typography className={classes.note} style={{ marginTop: 10 }}>
          {submitFiles.result.alreadyOpen ? 'A PR for this exact change is already open: ' : 'PR opened: '}
          <Link className={classes.resultLink} href={submitFiles.result.prUrl} target="_blank" rel="noopener noreferrer">
            {submitFiles.result.prUrl}
          </Link>
        </Typography>
      )}
      {submitFiles.error && (
        <Typography className={classes.errorList} style={{ marginTop: 10, listStyle: 'none', paddingLeft: 0 }}>
          Couldn't open PR: {submitFiles.error}
        </Typography>
      )}
    </div>
  );
}

