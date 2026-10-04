import { useEffect, useMemo, useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import Link from '@material-ui/core/Link';
import { dump as dumpYaml, load as loadYaml } from 'js-yaml';
import { Progress, ResponseErrorPanel } from '@backstage/core-components';
import { fontMono, useHangarTokens, type HangarTokens } from './brand/tokens';
import { usePlatformFile, useSubmitPlatformFileChange } from './useConfigData';
import { YamlBlockEditor, validateYamlBlock } from './YamlBlockEditor';
import { deepEqual } from './deepEqual';
import { CONFIG_TOP_LEVEL_FIELDS, type ConfigTopLevelField, type PlatformEnvSelector } from './types';

// One platform file (platform/pr-env.yaml or platform/envs/<env>.yaml) as YAML, with its own "Open PR for this
// file" button. Shared by the Glidepath tab (any file) and the Environments tab (one Ground environment's row).

function safeYamlDump(value: unknown): string {
  try {
    return dumpYaml(value ?? {}, { lineWidth: -1 });
  } catch {
    return '';
  }
}

function safeYamlLoad(text: string): unknown {
  try {
    const parsed = loadYaml(text.trim().length === 0 ? '{}' : text);
    return parsed ?? {};
  } catch {
    return undefined;
  }
}

const useStyles = makeStyles<Theme, { t: HangarTokens }>({
  submitBar: { display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 },
  submitBtn: {
    fontFamily: 'inherit',
    fontSize: 13,
    fontWeight: 600,
    padding: '6px 14px',
    borderRadius: 4,
    border: 'none',
    cursor: 'pointer',
    backgroundColor: ({ t }) => t.amber,
    color: ({ t }) => t.amberInk,
    '&:disabled': { opacity: 0.45, cursor: 'default' },
  },
  resultLink: { fontFamily: fontMono, fontSize: 12 },
});

export function PlatformFileEditor({
  owner,
  appName,
  selector,
  refreshNonce = 0,
  onSubmitted,
}: {
  owner: string;
  appName: string;
  selector: PlatformEnvSelector;
  refreshNonce?: number;
  onSubmitted?: () => void;
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const [localNonce, setLocalNonce] = useState(0);
  const file = usePlatformFile({ owner, appName, selector }, refreshNonce + localNonce);
  const submit = useSubmitPlatformFileChange();
  const [raw, setRaw] = useState('');

  useEffect(() => {
    if (!file.data) return;
    // Brand-new env (nothing committed yet): seed the minimal bootstrap stub this platform documents as the safe
    // starting point (platform/envs/dev.yaml: "rollout: null" renders the clean namespace-only stub; leaving the
    // key out rendered a Rollout with two InvalidImageName pods). Not for pr-env.yaml, which must already have
    // real content and has no envName of its own.
    if (Object.keys(file.data.values).length === 0 && selector.kind === 'env') {
      setRaw(`envName: ${selector.env}\nrollout: null\n`);
    } else {
      setRaw(safeYamlDump(file.data.values));
    }
  }, [file.data, selector]);

  const valid = validateYamlBlock(raw).valid;
  const patch = useMemo(() => {
    if (!file.data || !valid) return {} as Partial<Record<ConfigTopLevelField, unknown>>;
    const parsed = (safeYamlLoad(raw) ?? {}) as Record<string, unknown>;
    const result: Partial<Record<ConfigTopLevelField, unknown>> = {};
    for (const key of CONFIG_TOP_LEVEL_FIELDS) {
      if (!deepEqual(parsed[key], file.data.values[key])) result[key] = parsed[key];
    }
    return result;
  }, [raw, valid, file.data]);
  const dirty = Object.keys(patch).length > 0;

  async function handleSubmit() {
    if (!dirty || !valid) return;
    await submit.submit({
      owner,
      appName,
      selector,
      patch,
      summary: Object.keys(patch).map(k => `updated \`${k}\``),
    });
    setLocalNonce(n => n + 1);
    onSubmitted?.();
  }

  if (file.loading) return <Progress />;
  if (file.error) return <ResponseErrorPanel error={new Error(file.error)} />;
  return (
    <>
      <YamlBlockEditor label={file.data?.path ?? 'platform file'} value={raw} onChange={setRaw} rows={12} />
      <div className={classes.submitBar}>
        <button type="button" className={classes.submitBtn} disabled={!dirty || !valid || submit.loading} onClick={handleSubmit}>
          {submit.loading ? 'Opening PR…' : 'Open PR for this file'}
        </button>
      </div>
      {submit.result && (
        <Typography>
          {submit.result.alreadyOpen ? 'A PR for this exact change is already open: ' : 'PR opened: '}
          <Link className={classes.resultLink} href={submit.result.prUrl} target="_blank" rel="noopener noreferrer">
            {submit.result.prUrl}
          </Link>
        </Typography>
      )}
      {submit.error && <ResponseErrorPanel error={new Error(submit.error)} />}
    </>
  );
}
