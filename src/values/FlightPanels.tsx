import { useEffect, useState } from 'react';
import Typography from '@material-ui/core/Typography';
import Switch from '@material-ui/core/Switch';
import Link from '@material-ui/core/Link';
import { Progress } from '@backstage/core-components';
import { deepEqual } from '../deepEqual';
import { RefreshButton } from '../RefreshButton';
import { PrResultDialog } from '../PrResultDialog';
import { preventFocusScroll } from '../preventFocusScroll';
import { useConfigMapFiles, useEnvXr, useSubmitConfigMapFiles, useSubmitEnvXrChange } from '../useConfigData';
import type { Cls } from './styles';

// The two Flight-only panels of an environment: the catalog resource (ApplicationEnvironment's configMapGenerator)
// and the configmap source files. Shown in a Flight environment's Settings sub-tab. Moved unchanged from ConfigTab.tsx.

export function EnvXrPanel({ owner, appName, env, classes }: { owner: string; appName: string; env: string; classes: Cls }) {
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
export function ConfigMapFilesPanel({ owner, appName, cluster, env, classes }: { owner: string; appName: string; cluster: string; env: string; classes: Cls }) {
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


