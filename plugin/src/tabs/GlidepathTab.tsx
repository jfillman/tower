import { useEffect, useMemo, useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import Switch from '@material-ui/core/Switch';
import TextField from '@material-ui/core/TextField';
import Select from '@material-ui/core/Select';
import MenuItem from '@material-ui/core/MenuItem';
import Link from '@material-ui/core/Link';
import IconButton from '@material-ui/core/IconButton';
import DeleteIcon from '@material-ui/icons/Delete';
import AddIcon from '@material-ui/icons/Add';
import { dump as dumpYaml, load as loadYaml } from 'js-yaml';
import { Progress, ResponseErrorPanel } from '@backstage/core-components';
import { fontDisplay, fontMono, useHangarTokens, type HangarTokens } from '../../brand/tokens';
import { HangarMark } from '../../brand/HangarMark';
import { TowerEmptyState } from '../TowerEmptyState';
import { useReleaseContext } from '../useReleaseContext';
import {
  useCicdConfig,
  usePlatformEnvs,
  usePlatformFile,
  useSubmitCicdConfigChange,
  useSubmitPlatformFileChange,
} from '../useConfigData';
import { RefreshButton } from '../RefreshButton';
import { YamlBlockEditor, validateYamlBlock } from '../YamlBlockEditor';
import { deepEqual } from '../deepEqual';
import { CICD_TOP_LEVEL_FIELDS, CONFIG_TOP_LEVEL_FIELDS, type CicdTopLevelField, type ConfigTopLevelField, type PlatformEnvSelector } from '../types';

// Tower's Glidepath tab (2026-09-16): full management of an app's own
// cicd.yaml (the file that configures the Glidepath CI/CD engine itself)
// and the platform/ folder in that same source repo (pr-env.yaml's
// preview-env template, platform/envs/<env>.yaml per lower env). Mirrors
// ConfigTab's own posture (fetch -> curated form + raw-YAML fallback ->
// real GitOps PR, never a direct commit) - see glidepathCicdConfig.ts and
// glidepathPlatformConfig.ts for the backend half.
//
// Unlike Config, there's no per-env picker gating access here: cicd.yaml is
// one file per app (not per env), and platform/ files are addressed
// directly by env name via their own picker below.
//
// Curated fields cover build/test/deploy/ephemeralEnvironments/governance/
// notifications/secrets - every field cicd.schema.json defines for these
// sections is a real control here, 2026-09-17. deploy.upperEnvironments/
// pipelines and both platform/ files stay on the raw-YAML editor: their real
// shapes are either open-ended (pipelines' trigger/steps, including a legacy
// list form) or belong to a chart schema this tab doesn't curate
// field-by-field yet (platform/'s airframe-application values).
// Full-fidelity curated widgets for those are a reasonable follow-up, not a
// gap introduced carelessly.
//
// Governance copy is deliberately explicit that these four booleans only
// gate a build-time pre-flight copy of each check - the real release-
// blocking GitHub-required-check on the gitops-<app> release PR runs
// unconditionally regardless of this setting (see cicd.schema.json's own
// inline comment; docs/user/features.md implies otherwise and isn't the
// source of truth here).

// Mirrors glidepath/schemas/cicd.schema.json's build.agent enum and the
// cache/sourceVolume t-shirt sizes exactly - kept in sync by hand, same
// posture as every other cross-repo type mirror in this file.
const BUILD_AGENTS = ['nodejs-18', 'nodejs-20', 'nodejs-22', 'openjdk-17', 'openjdk-21', 'python-3.11', 'go-1.22'] as const;
type BuildAgent = (typeof BUILD_AGENTS)[number];
const VOLUME_SIZES = ['small', 'medium', 'large', 'xlarge'] as const;
type VolumeSize = (typeof VOLUME_SIZES)[number];

function splitCsv(text: string): string[] {
  return text.split(',').map(s => s.trim()).filter(Boolean);
}

function joinCsv(arr: unknown): string {
  return Array.isArray(arr) ? arr.map(String).join(', ') : '';
}

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

interface CicdFormState {
  lowerEnvironments: string;
  upperEnvironmentsRaw: string;
  promotionOrder: string;
  strategy: 'deployment' | 'rollout';
  buildAgent: BuildAgent;
  buildScriptEnabled: boolean;
  buildScript: string;
  buildDockerfile: string;
  buildUnitTestEnabled: boolean;
  buildUnitTestCommand: string;
  buildSonar: boolean;
  buildCacheEnabled: boolean;
  buildCacheSize: VolumeSize;
  buildSourceVolumeSize: VolumeSize;
  testEnabled: boolean;
  testName: string;
  branchEnabled: boolean;
  branchPatterns: string;
  prEnabled: boolean;
  prLabels: string;
  ttl: string;
  sast: boolean;
  imageScan: boolean;
  policyCheck: boolean;
  sbom: boolean;
  allowedCommitSigners: string;
  slackEnabled: boolean;
  slackChannel: string;
  slackScanResults: boolean;
  backstageEnabled: boolean;
  secrets: Array<{ name: string; key: string }>;
  pipelinesRaw: string;
}

function buildFormFromValues(values: Partial<Record<CicdTopLevelField, unknown>>): CicdFormState {
  const deploy = (values.deploy ?? {}) as Record<string, unknown>;
  const build = (values.build ?? {}) as Record<string, unknown>;
  const unitTest = (build.unitTest ?? {}) as Record<string, unknown>;
  const cache = (build.cache ?? {}) as Record<string, unknown>;
  const sourceVolume = (build.sourceVolume ?? {}) as Record<string, unknown>;
  const test = (values.test ?? {}) as Record<string, unknown>;
  const eph = (values.ephemeralEnvironments ?? {}) as Record<string, unknown>;
  const branch = (eph.branch ?? {}) as Record<string, unknown>;
  const pullRequest = (eph.pullRequest ?? {}) as Record<string, unknown>;
  const gov = (values.governance ?? {}) as Record<string, unknown>;
  const notif = (values.notifications ?? {}) as Record<string, unknown>;
  const slack = (notif.slack ?? {}) as Record<string, unknown>;
  const backstageNotif = (notif.backstage ?? {}) as Record<string, unknown>;
  const secrets = Array.isArray(values.secrets) ? (values.secrets as Array<{ name?: string; key?: string }>) : [];

  return {
    lowerEnvironments: joinCsv(deploy.lowerEnvironments ?? ['dev']),
    upperEnvironmentsRaw: safeYamlDump(deploy.upperEnvironments ?? []),
    promotionOrder: joinCsv(deploy.promotionOrder ?? []),
    strategy: deploy.strategy === 'deployment' ? 'deployment' : 'rollout',
    buildAgent: (BUILD_AGENTS as readonly string[]).includes(build.agent as string)
      ? (build.agent as BuildAgent)
      : 'nodejs-20',
    buildScriptEnabled: typeof build.script === 'string',
    buildScript: typeof build.script === 'string' ? build.script : '',
    buildDockerfile: typeof build.dockerfile === 'string' ? build.dockerfile : './Dockerfile',
    buildUnitTestEnabled: unitTest.enabled !== false,
    buildUnitTestCommand: typeof unitTest.command === 'string' ? unitTest.command : './test.sh',
    buildSonar: Boolean(build.sonar),
    buildCacheEnabled: Boolean(cache.enabled),
    buildCacheSize: (VOLUME_SIZES as readonly string[]).includes(cache.size as string) ? (cache.size as VolumeSize) : 'small',
    buildSourceVolumeSize: (VOLUME_SIZES as readonly string[]).includes(sourceVolume.size as string)
      ? (sourceVolume.size as VolumeSize)
      : 'small',
    testEnabled: test.enabled !== false,
    testName: typeof test.name === 'string' ? test.name : '',
    branchEnabled: Boolean(branch.enabled),
    branchPatterns: joinCsv(branch.patterns ?? ['preview/*']),
    prEnabled: Boolean(pullRequest.enabled),
    prLabels: joinCsv(pullRequest.labels ?? ['preview']),
    ttl: typeof eph.ttl === 'string' ? eph.ttl : '5d',
    sast: Boolean(gov.sast),
    imageScan: Boolean(gov.imageScan),
    policyCheck: Boolean(gov.policyCheck),
    sbom: Boolean(gov.sbom),
    allowedCommitSigners: joinCsv(gov.allowedCommitSigners ?? []),
    slackEnabled: Boolean(slack.enabled),
    slackChannel: typeof slack.channel === 'string' ? slack.channel : '',
    slackScanResults: Boolean(slack.scanResults),
    backstageEnabled: Boolean(backstageNotif.enabled),
    secrets: secrets.map(s => ({ name: s.name ?? '', key: s.key ?? '' })),
    pipelinesRaw: safeYamlDump(values.pipelines ?? {}),
  };
}

// Schema-documented defaults (cicd.schema.json) - a section absent from the
// committed file means "this default applies", not "explicitly empty".
// Comparing a freshly-derived candidate value against these (rather than
// against a bare `undefined`) is what keeps an untouched section from
// reading as dirty just because the file never mentioned it.
function emptyDefaultFor(key: CicdTopLevelField): unknown {
  switch (key) {
    case 'build':
      // No default here for `agent` (schema-required, no schema default) or
      // `script` (presence/absence is itself the signal) - buildCicdPatch
      // always prefers the real originalValues.build over this fallback, and
      // a valid cicd.yaml always has a real `build.agent` already, so this
      // branch only matters for the pathological "no build section at all"
      // case (a brand-new/never-onboarded cicd.yaml).
      return {
        dockerfile: './Dockerfile',
        unitTest: { enabled: true, command: './test.sh' },
        sonar: false,
        cache: { enabled: false, size: 'small' },
        sourceVolume: { size: 'small' },
      };
    case 'test':
      return { enabled: true };
    case 'deploy':
      return { lowerEnvironments: ['dev'], upperEnvironments: [], strategy: 'rollout', promotionOrder: [] };
    case 'ephemeralEnvironments':
      return {
        branch: { enabled: false, patterns: ['preview/*'] },
        pullRequest: { enabled: false, labels: ['preview'] },
        ttl: '5d',
      };
    case 'governance':
      return { sast: false, imageScan: false, policyCheck: false, sbom: false, allowedCommitSigners: [] };
    case 'notifications':
      return { slack: { enabled: false, channel: '', scanResults: false }, backstage: { enabled: false } };
    case 'secrets':
      return [];
    case 'pipelines':
      return {};
    default:
      // Unreachable - CicdTopLevelField enumerates every case above.
      return {};
  }
}

function buildCandidateValues(form: CicdFormState): Partial<Record<CicdTopLevelField, unknown>> {
  return {
    build: {
      agent: form.buildAgent,
      ...(form.buildScriptEnabled ? { script: form.buildScript } : {}),
      dockerfile: form.buildDockerfile,
      unitTest: { enabled: form.buildUnitTestEnabled, command: form.buildUnitTestCommand },
      sonar: form.buildSonar,
      cache: { enabled: form.buildCacheEnabled, size: form.buildCacheSize },
      sourceVolume: { size: form.buildSourceVolumeSize },
    },
    test: { enabled: form.testEnabled, ...(form.testName.trim() ? { name: form.testName.trim() } : {}) },
    deploy: {
      lowerEnvironments: splitCsv(form.lowerEnvironments),
      upperEnvironments: safeYamlLoad(form.upperEnvironmentsRaw) ?? [],
      strategy: form.strategy,
      promotionOrder: splitCsv(form.promotionOrder),
    },
    ephemeralEnvironments: {
      branch: { enabled: form.branchEnabled, patterns: splitCsv(form.branchPatterns) },
      pullRequest: { enabled: form.prEnabled, labels: splitCsv(form.prLabels) },
      ttl: form.ttl,
    },
    governance: {
      sast: form.sast,
      imageScan: form.imageScan,
      policyCheck: form.policyCheck,
      sbom: form.sbom,
      allowedCommitSigners: splitCsv(form.allowedCommitSigners),
    },
    notifications: {
      slack: { enabled: form.slackEnabled, channel: form.slackChannel, scanResults: form.slackScanResults },
      backstage: { enabled: form.backstageEnabled },
    },
    secrets: form.secrets
      .filter(s => s.name.trim().length > 0)
      .map(s => (s.key.trim() ? { name: s.name.trim(), key: s.key.trim() } : { name: s.name.trim() })),
    pipelines: safeYamlLoad(form.pipelinesRaw) ?? {},
  };
}

function buildCicdPatch(
  form: CicdFormState,
  originalValues: Partial<Record<CicdTopLevelField, unknown>>,
): Partial<Record<CicdTopLevelField, unknown>> {
  const candidate = buildCandidateValues(form);
  const patch: Partial<Record<CicdTopLevelField, unknown>> = {};
  for (const key of CICD_TOP_LEVEL_FIELDS) {
    const baseline = originalValues[key] ?? emptyDefaultFor(key);
    if (!deepEqual(candidate[key], baseline)) {
      patch[key] = candidate[key];
    }
  }
  return patch;
}

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  root: { padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 },
  headerRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  headerTitle: { display: 'flex', alignItems: 'center', gap: 10 },
  title: {
    fontFamily: fontDisplay,
    fontSize: 20,
    fontWeight: 600,
    color: ({ t }) => t.textHi,
  },
  section: {
    border: ({ t }) => `1px solid ${t.lineSoft}`,
    borderRadius: 6,
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    backgroundColor: ({ t }) => t.panel,
  },
  sectionTitle: {
    fontFamily: fontDisplay,
    fontSize: 14,
    fontWeight: 600,
    color: ({ t }) => t.textHi,
  },
  sectionHint: { fontSize: 12, color: ({ t }) => t.textLo },
  row: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  switchRow: { display: 'flex', alignItems: 'center', gap: 8 },
  switchLabel: { fontSize: 13, color: ({ t }) => t.textHi },
  govCaption: { fontSize: 11, color: ({ t }) => t.textLo, fontStyle: 'italic' },
  secretRow: { display: 'flex', alignItems: 'center', gap: 8 },
  submitBar: { display: 'flex', alignItems: 'center', gap: 12 },
  submitBtn: {
    fontFamily: fontDisplay,
    fontSize: 13,
    fontWeight: 600,
    padding: '8px 18px',
    borderRadius: 4,
    border: 'none',
    cursor: 'pointer',
    backgroundColor: ({ t }) => t.amber,
    color: '#1a1200',
    '&:disabled': { opacity: 0.5, cursor: 'default' },
  },
  resultLink: { fontFamily: fontMono, fontSize: 12 },
  rawView: {
    fontFamily: fontMono,
    fontSize: 11,
    whiteSpace: 'pre-wrap',
    color: ({ t }) => t.textLo,
    maxHeight: 320,
    overflow: 'auto',
    padding: 10,
    border: ({ t }) => `1px solid ${t.lineSoft}`,
    borderRadius: 4,
  },
}));

export function GlidepathTab() {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const { owner, appName, loading: contextLoading, error: contextError } = useReleaseContext();
  const [refreshNonce, setRefreshNonce] = useState(0);

  const target = owner && appName ? { owner, appName } : undefined;
  const cicd = useCicdConfig(target, refreshNonce);
  const submitCicd = useSubmitCicdConfigChange();

  const [form, setForm] = useState<CicdFormState | undefined>(undefined);
  const [showRaw, setShowRaw] = useState(false);
  const [platformSelector, setPlatformSelector] = useState<PlatformEnvSelector>({ kind: 'pr-env' });

  useEffect(() => {
    if (cicd.data) setForm(buildFormFromValues(cicd.data.values));
  }, [cicd.data]);

  const patch = useMemo(
    () => (form && cicd.data ? buildCicdPatch(form, cicd.data.values) : {}),
    [form, cicd.data],
  );
  const dirty = Object.keys(patch).length > 0;

  const yamlBlocksValid = useMemo(() => {
    if (!form) return true;
    return [form.upperEnvironmentsRaw, form.pipelinesRaw].every(
      text => validateYamlBlock(text).valid,
    );
  }, [form]);

  if (contextLoading) return <Progress />;
  if (contextError) return <ResponseErrorPanel error={new Error(contextError)} />;
  if (!owner || !appName) {
    return (
      <TowerEmptyState
        title="Can't resolve this app's source repo"
        description="Glidepath needs a resolved GitHub owner/repo (from a promoted environment's provenance) to know which repo's cicd.yaml to read."
      />
    );
  }
  if (cicd.loading || !form) return <Progress />;
  if (cicd.error) return <ResponseErrorPanel error={new Error(cicd.error)} />;

  const summary: string[] = [];
  for (const key of Object.keys(patch)) summary.push(`updated \`${key}\``);

  async function handleSubmit() {
    if (!owner || !appName || !yamlBlocksValid || !dirty) return;
    await submitCicd.submit({ owner, appName, patch, summary });
    setRefreshNonce(n => n + 1);
  }

  function updateSecret(i: number, field: 'name' | 'key', value: string) {
    setForm(f => {
      if (!f) return f;
      const secrets = f.secrets.slice();
      secrets[i] = { ...secrets[i], [field]: value };
      return { ...f, secrets };
    });
  }

  return (
    <div className={classes.root}>
      <div className={classes.headerRow}>
        <div className={classes.headerTitle}>
          <HangarMark glyph="glidepath" size={28} />
          <Typography className={classes.title}>Glidepath</Typography>
        </div>
        <RefreshButton onClick={() => setRefreshNonce(n => n + 1)} label="Refresh" />
      </div>
      <Typography className={classes.sectionHint}>
        Full management of {appName}'s cicd.yaml (the Glidepath CI/CD engine's own config) and its platform/
        folder. Every change here opens a real PR against {appName} - nothing is committed directly.
      </Typography>

      {/* --- Build --------------------------------------------------------*/}
      <div className={classes.section}>
        <Typography className={classes.sectionTitle}>Build</Typography>
        <div className={classes.row}>
          <Select value={form.buildAgent} onChange={e => setForm(f => (f ? { ...f, buildAgent: e.target.value as BuildAgent } : f))}>
            {BUILD_AGENTS.map(a => (
              <MenuItem key={a} value={a}>
                {a}
              </MenuItem>
            ))}
          </Select>
          <TextField
            label="Dockerfile path"
            value={form.buildDockerfile}
            onChange={e => setForm(f => (f ? { ...f, buildDockerfile: e.target.value } : f))}
            size="small"
          />
        </div>
        <div className={classes.switchRow}>
          <Switch
            checked={form.buildScriptEnabled}
            onChange={e => setForm(f => (f ? { ...f, buildScriptEnabled: e.target.checked } : f))}
          />
          <Typography className={classes.switchLabel}>Run a build script before packaging</Typography>
        </div>
        {form.buildScriptEnabled ? (
          <TextField
            label="Build script (bash)"
            value={form.buildScript}
            onChange={e => setForm(f => (f ? { ...f, buildScript: e.target.value } : f))}
            fullWidth
            multiline
            minRows={3}
            size="small"
          />
        ) : (
          <Typography className={classes.sectionHint}>
            Off - the whole build happens inside {form.buildDockerfile} (kaniko builds it directly).
          </Typography>
        )}
        <div className={classes.switchRow}>
          <Switch
            checked={form.buildUnitTestEnabled}
            onChange={e => setForm(f => (f ? { ...f, buildUnitTestEnabled: e.target.checked } : f))}
          />
          <Typography className={classes.switchLabel}>Unit tests</Typography>
          {form.buildUnitTestEnabled && (
            <TextField
              label="Command"
              value={form.buildUnitTestCommand}
              onChange={e => setForm(f => (f ? { ...f, buildUnitTestCommand: e.target.value } : f))}
              size="small"
            />
          )}
        </div>
        <div className={classes.switchRow}>
          <Switch checked={form.buildSonar} onChange={e => setForm(f => (f ? { ...f, buildSonar: e.target.checked } : f))} />
          <Typography className={classes.switchLabel}>Sonar</Typography>
          <Typography className={classes.govCaption}>Reserved - no effect yet.</Typography>
        </div>
        <div className={classes.switchRow}>
          <Switch
            checked={form.buildCacheEnabled}
            onChange={e => setForm(f => (f ? { ...f, buildCacheEnabled: e.target.checked } : f))}
          />
          <Typography className={classes.switchLabel}>Persistent dependency cache</Typography>
          {form.buildCacheEnabled && (
            <Select
              value={form.buildCacheSize}
              onChange={e => setForm(f => (f ? { ...f, buildCacheSize: e.target.value as VolumeSize } : f))}
            >
              {VOLUME_SIZES.map(s => (
                <MenuItem key={s} value={s}>
                  {s}
                </MenuItem>
              ))}
            </Select>
          )}
        </div>
        <div className={classes.row}>
          <Typography className={classes.switchLabel}>Source workspace size</Typography>
          <Select
            value={form.buildSourceVolumeSize}
            onChange={e => setForm(f => (f ? { ...f, buildSourceVolumeSize: e.target.value as VolumeSize } : f))}
          >
            {VOLUME_SIZES.map(s => (
              <MenuItem key={s} value={s}>
                {s}
              </MenuItem>
            ))}
          </Select>
        </div>
      </div>

      {/* --- Test -----------------------------------------------------------*/}
      <div className={classes.section}>
        <Typography className={classes.sectionTitle}>Test</Typography>
        <div className={classes.switchRow}>
          <Switch checked={form.testEnabled} onChange={e => setForm(f => (f ? { ...f, testEnabled: e.target.checked } : f))} />
          <Typography className={classes.switchLabel}>Enabled</Typography>
        </div>
        {form.testEnabled && (
          <TextField
            label="TestWorkflow name (platform/<name>.yaml)"
            value={form.testName}
            onChange={e => setForm(f => (f ? { ...f, testName: e.target.value } : f))}
            size="small"
          />
        )}
      </div>

      <div className={classes.section}>
        <Typography className={classes.sectionTitle}>Deploy</Typography>
        <div className={classes.row}>
          <TextField
            label="Lower environments (comma-separated)"
            value={form.lowerEnvironments}
            onChange={e => setForm(f => (f ? { ...f, lowerEnvironments: e.target.value } : f))}
            fullWidth
            size="small"
          />
        </div>
        <div className={classes.row}>
          <TextField
            label="Promotion order (comma-separated, in order)"
            helperText="Pure metadata - Tower's own Release Matrix reads this back; no Glidepath Task enforces it."
            value={form.promotionOrder}
            onChange={e => setForm(f => (f ? { ...f, promotionOrder: e.target.value } : f))}
            fullWidth
            size="small"
          />
        </div>
        <div className={classes.row}>
          <Select
            value={form.strategy}
            onChange={e => setForm(f => (f ? { ...f, strategy: e.target.value as 'deployment' | 'rollout' } : f))}
          >
            <MenuItem value="deployment">deployment</MenuItem>
            <MenuItem value="rollout">rollout</MenuItem>
          </Select>
          {form.strategy === 'deployment' && (
            <Typography className={classes.govCaption}>
              Every deploy actually provisions an Argo Rollout today, regardless of this setting.
            </Typography>
          )}
        </div>
        <YamlBlockEditor
          label="upperEnvironments (name, or {name, cluster})"
          value={form.upperEnvironmentsRaw}
          onChange={text => setForm(f => (f ? { ...f, upperEnvironmentsRaw: text } : f))}
          rows={4}
        />
      </div>

      {/* --- Ephemeral Environments ------------------------------------- */}
      <div className={classes.section}>
        <Typography className={classes.sectionTitle}>Ephemeral Environments</Typography>
        <div className={classes.switchRow}>
          <Switch
            checked={form.branchEnabled}
            onChange={e => setForm(f => (f ? { ...f, branchEnabled: e.target.checked } : f))}
          />
          <Typography className={classes.switchLabel}>Branch-triggered preview envs</Typography>
        </div>
        {form.branchEnabled && (
          <TextField
            label="Branch patterns (comma-separated)"
            value={form.branchPatterns}
            onChange={e => setForm(f => (f ? { ...f, branchPatterns: e.target.value } : f))}
            fullWidth
            size="small"
          />
        )}
        <div className={classes.switchRow}>
          <Switch
            checked={form.prEnabled}
            onChange={e => setForm(f => (f ? { ...f, prEnabled: e.target.checked } : f))}
          />
          <Typography className={classes.switchLabel}>PR-label-triggered preview envs</Typography>
        </div>
        {form.prEnabled && (
          <TextField
            label="PR labels (comma-separated)"
            value={form.prLabels}
            onChange={e => setForm(f => (f ? { ...f, prLabels: e.target.value } : f))}
            fullWidth
            size="small"
          />
        )}
        <TextField
          label="TTL (e.g. 5d, 12h)"
          value={form.ttl}
          onChange={e => setForm(f => (f ? { ...f, ttl: e.target.value } : f))}
          size="small"
        />
      </div>

      {/* --- Governance --------------------------------------------------*/}
      <div className={classes.section}>
        <Typography className={classes.sectionTitle}>Governance</Typography>
        <Typography className={classes.govCaption}>
          Pre-flight checks only. The release-blocking gate on {appName}'s release PR always runs regardless of
          these settings.
        </Typography>
        {(
          [
            ['sast', 'SAST (Semgrep)'],
            ['imageScan', 'Image scan (Trivy)'],
            ['policyCheck', 'Commit-signature policy check'],
            ['sbom', 'SBOM attestation'],
          ] as const
        ).map(([key, label]) => (
          <div key={key} className={classes.switchRow}>
            <Switch
              checked={form[key]}
              onChange={e => setForm(f => (f ? { ...f, [key]: e.target.checked } : f))}
            />
            <Typography className={classes.switchLabel}>{label}</Typography>
          </div>
        ))}
        <TextField
          label="Allowed commit signers (comma-separated emails)"
          value={form.allowedCommitSigners}
          onChange={e => setForm(f => (f ? { ...f, allowedCommitSigners: e.target.value } : f))}
          fullWidth
          size="small"
        />
      </div>

      {/* --- Notifications ------------------------------------------------*/}
      <div className={classes.section}>
        <Typography className={classes.sectionTitle}>Notifications</Typography>
        <div className={classes.switchRow}>
          <Switch
            checked={form.slackEnabled}
            onChange={e => setForm(f => (f ? { ...f, slackEnabled: e.target.checked } : f))}
          />
          <Typography className={classes.switchLabel}>Slack</Typography>
        </div>
        {form.slackEnabled && (
          <div className={classes.row}>
            <TextField
              label="Slack channel"
              value={form.slackChannel}
              onChange={e => setForm(f => (f ? { ...f, slackChannel: e.target.value } : f))}
              size="small"
            />
            <div className={classes.switchRow}>
              <Switch
                checked={form.slackScanResults}
                onChange={e => setForm(f => (f ? { ...f, slackScanResults: e.target.checked } : f))}
              />
              <Typography className={classes.switchLabel}>Include scan results</Typography>
            </div>
          </div>
        )}
        <div className={classes.switchRow}>
          <Switch
            checked={form.backstageEnabled}
            onChange={e => setForm(f => (f ? { ...f, backstageEnabled: e.target.checked } : f))}
          />
          <Typography className={classes.switchLabel}>Backstage notifications</Typography>
        </div>
      </div>

      {/* --- Secrets ------------------------------------------------------*/}
      <div className={classes.section}>
        <Typography className={classes.sectionTitle}>Secrets</Typography>
        {form.secrets.map((s, i) => (
          <div key={i} className={classes.secretRow}>
            <TextField
              label="name"
              value={s.name}
              onChange={e => updateSecret(i, 'name', e.target.value)}
              size="small"
            />
            <TextField
              label="key (optional)"
              value={s.key}
              onChange={e => updateSecret(i, 'key', e.target.value)}
              size="small"
            />
            <IconButton
              size="small"
              onClick={() => setForm(f => (f ? { ...f, secrets: f.secrets.filter((_, j) => j !== i) } : f))}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </div>
        ))}
        <IconButton
          size="small"
          onClick={() => setForm(f => (f ? { ...f, secrets: [...f.secrets, { name: '', key: '' }] } : f))}
        >
          <AddIcon fontSize="small" />
        </IconButton>
      </div>

      {/* --- Pipelines (named flows) ---------------------------------------*/}
      <div className={classes.section}>
        <Typography className={classes.sectionTitle}>Pipelines</Typography>
        <Typography className={classes.sectionHint}>
          Raw YAML - named-flow map (trigger + steps, or the legacy list form).
        </Typography>
        <YamlBlockEditor
          label="pipelines"
          value={form.pipelinesRaw}
          onChange={text => setForm(f => (f ? { ...f, pipelinesRaw: text } : f))}
          rows={10}
        />
      </div>

      <div className={classes.submitBar}>
        <button
          type="button"
          className={classes.submitBtn}
          disabled={!dirty || !yamlBlocksValid || submitCicd.loading}
          onClick={handleSubmit}
        >
          {submitCicd.loading ? 'Opening PR…' : 'Open PR for cicd.yaml'}
        </button>
        {!yamlBlocksValid && <Typography className={classes.govCaption}>Fix invalid YAML above before submitting.</Typography>}
      </div>
      {submitCicd.result && (
        <Typography>
          {submitCicd.result.alreadyOpen ? 'A PR for this exact change is already open: ' : 'PR opened: '}
          <Link className={classes.resultLink} href={submitCicd.result.prUrl} target="_blank" rel="noopener noreferrer">
            {submitCicd.result.prUrl}
          </Link>
        </Typography>
      )}
      {submitCicd.error && <ResponseErrorPanel error={new Error(submitCicd.error)} />}

      <div className={classes.section}>
        <div className={classes.row} style={{ justifyContent: 'space-between' }}>
          <Typography className={classes.sectionTitle}>View full committed cicd.yaml</Typography>
          <Link component="button" onClick={() => setShowRaw(v => !v)} className={classes.resultLink}>
            {showRaw ? 'hide' : 'show'}
          </Link>
        </div>
        {showRaw && <pre className={classes.rawView}>{cicd.data?.raw || '(no cicd.yaml committed yet)'}</pre>}
      </div>

      {/* --- platform/ folder ---------------------------------------------*/}
      <PlatformFilesSection owner={owner} appName={appName} selector={platformSelector} onSelectorChange={setPlatformSelector} />
    </div>
  );
}

function PlatformFilesSection({
  owner,
  appName,
  selector,
  onSelectorChange,
}: {
  owner: string;
  appName: string;
  selector: PlatformEnvSelector;
  onSelectorChange: (s: PlatformEnvSelector) => void;
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const [refreshNonce, setRefreshNonce] = useState(0);
  const envs = usePlatformEnvs({ owner, appName }, refreshNonce);
  const file = usePlatformFile({ owner, appName, selector }, refreshNonce);
  const submit = useSubmitPlatformFileChange();
  const [raw, setRaw] = useState('');
  const [newEnvName, setNewEnvName] = useState('');
  const [newEnvError, setNewEnvError] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!file.data) return;
    // Brand-new env (nothing committed yet, real 404-tolerant "not
    // configured" state) - seed the same minimal bootstrap stub this
    // platform's own lower-env convention documents as the safe starting
    // point (platform/envs/dev.yaml's own comment: "rollout: null - ...
    // leaving this key out entirely rendered a real Rollout with two
    // InvalidImageName pods instead of the clean namespace-only stub"),
    // rather than leaving the editor on an empty/near-empty document that
    // would produce a real broken env if submitted as-is. Not needed for
    // pr-env.yaml - the ApplicationSet requires that file to already have
    // real content (ports at minimum), and it has no envName of its own to
    // seed.
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
    setRefreshNonce(n => n + 1);
  }

  return (
    <div className={classes.section}>
      <Typography className={classes.sectionTitle}>Platform files</Typography>
      <Typography className={classes.sectionHint}>
        platform/pr-env.yaml (the PR-preview environment template) and platform/envs/&lt;env&gt;.yaml (one per
        lower/dev environment) - the same airframe-application chart values as App Configuration, minus
        rollout.image (owned by the ArgoCD ApplicationSet / deploy automation). platform/envs/&lt;env&gt;.yaml's
        own envName is set automatically to match whichever env is selected - never edited by hand.
      </Typography>
      <div className={classes.row}>
        <TextField
          label="New environment name"
          value={newEnvName}
          onChange={e => {
            setNewEnvName(e.target.value);
            setNewEnvError(undefined);
          }}
          size="small"
        />
        <button
          type="button"
          className={classes.submitBtn}
          onClick={() => {
            const name = newEnvName.trim();
            if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
              setNewEnvError('Lowercase letters, digits, hyphens only.');
              return;
            }
            if ((envs.data?.envs ?? []).includes(name)) {
              setNewEnvError(`${name} already exists - select it below to edit it.`);
              return;
            }
            onSelectorChange({ kind: 'env', env: name });
            setNewEnvName('');
          }}
        >
          Create
        </button>
        {newEnvError && <Typography className={classes.govCaption}>{newEnvError}</Typography>}
      </div>
      <div className={classes.row}>
        <Select value={selector.kind === 'pr-env' ? '__pr-env__' : selector.env} onChange={e => {
          const v = e.target.value as string;
          onSelectorChange(v === '__pr-env__' ? { kind: 'pr-env' } : { kind: 'env', env: v });
        }}>
          <MenuItem value="__pr-env__">Preview env template (pr-env.yaml)</MenuItem>
          {(envs.data?.envs ?? []).map(env => (
            <MenuItem key={env} value={env}>
              {env}
            </MenuItem>
          ))}
          {/* The env just typed into "New environment" above, before its first
          PR has ever merged - not yet in envs.data.envs (that's a real
          directory listing), but the Select needs a matching option or React
          silently shows nothing selected. */}
          {selector.kind === 'env' && !(envs.data?.envs ?? []).includes(selector.env) && (
            <MenuItem value={selector.env}>{selector.env} (new)</MenuItem>
          )}
        </Select>
        <RefreshButton onClick={() => setRefreshNonce(n => n + 1)} label="Refresh" />
      </div>
      {file.loading && <Progress />}
      {file.error && <ResponseErrorPanel error={new Error(file.error)} />}
      {!file.loading && !file.error && (
        <>
          <YamlBlockEditor label={file.data?.path ?? 'platform file'} value={raw} onChange={setRaw} rows={12} />
          <div className={classes.submitBar}>
            <button
              type="button"
              className={classes.submitBtn}
              disabled={!dirty || !valid || submit.loading}
              onClick={handleSubmit}
            >
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
      )}
    </div>
  );
}
