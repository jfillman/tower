import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import { load as loadYaml } from 'js-yaml';
import { fontDisplay, fontMono, useHangarTokens, type HangarTokens } from './brand/tokens';
import { HangarMark } from './brand/HangarMark';
import { useCicdConfig, usePlatformEnvs, usePlatformFile } from './useConfigData';
import { PipelineFlowPreview } from './PipelineFlowPreview';
import { pipelinesNamingEnv, readEnvironments, type Deploy } from './environments/stagedChanges';
import { DEPLOY_TARGETS } from './serviceClass';
import { ColumnLabel, TextLink, TierChip } from './ui';
import { ENVS_ROOT } from './types';

// Read-only "what's configured" companion to the Glidepath tab's own editor
// (GlidepathTab.tsx) - fed by the exact same hooks/routes, just rendered
// without any form state, so there's one source of truth for what cicd.yaml
// actually says rather than a second, drifting summary.
//
// The environment chain (every environment in promotion order, Ground and Flight, either way cicd.yaml
// declares them) is always visible; the rest sits behind "Show details".

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  panel: {
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 6,
    padding: '14px 18px',
    marginBottom: 20,
    backgroundColor: ({ t }) => t.panel,
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' },
  headLeft: { display: 'flex', alignItems: 'center', gap: 8 },
  headRight: { display: 'flex', gap: 18, alignItems: 'center' },
  title: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 14, color: ({ t }) => t.textHi },
  chain: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  chainItem: { display: 'inline-flex', alignItems: 'center', gap: 6 },
  chainName: { fontFamily: fontDisplay, fontWeight: 600, fontSize: 14, color: ({ t }) => t.textHi },
  arrow: { color: ({ t }) => t.textFaint, fontFamily: fontMono, fontSize: 12 },
  grid: { display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'flex-start' },
  col: { display: 'flex', flexDirection: 'column', gap: 6, minWidth: 200 },
  value: { fontSize: 12.5, color: ({ t }) => t.textHi },
  muted: { fontSize: 12, color: ({ t }) => t.textLo },
  envRows: { display: 'flex', flexDirection: 'column', gap: 6 },
  envRow: { display: 'grid', gridTemplateColumns: '90px 70px 1fr', gap: 10, alignItems: 'center', fontSize: 12.5 },
  mono: { fontFamily: fontMono, fontSize: 12, color: ({ t }) => t.textLo },
  pipelinesList: { display: 'flex', flexDirection: 'column', gap: 10 },
  strategyWarn: { fontSize: 11, fontStyle: 'italic', color: ({ t }) => t.amberInk },
  // A visible stand-in for loading/error/no-data, replacing what used to be
  // a silent `return null` (2026-09-18 bug report: "the new glidepath panel
  // on the pipelines tab disappeared" - a transient cicd.yaml fetch hiccup
  // made the whole panel, including its own "Configure in Glidepath" escape
  // hatch, vanish with zero indication anything was wrong; it always came
  // back on the next successful fetch, but looked exactly like a
  // regression). fontStyle italic matches this platform's other "nothing to
  // show yet" captions (e.g. ArgoCommandPanel's `note`).
  statusNote: { fontSize: 11.5, fontStyle: 'italic', color: ({ t }) => t.textFaint },
  statusNoteError: { fontSize: 11.5, fontStyle: 'italic', color: ({ t }) => t.bad },
}));

export function GlidepathSummaryPanel({ owner, appName }: { owner: string; appName: string }) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const [, setSearchParams] = useSearchParams();
  const [expanded, setExpanded] = useState(false);

  const cicd = useCicdConfig({ owner, appName });
  const envs = usePlatformEnvs({ owner, appName });
  const prEnv = usePlatformFile({ owner, appName, selector: { kind: 'pr-env' } });

  const goToGlidepath = () =>
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('tab', 'glidepath');
      return next;
    });

  // Visible in place of what used to be a silent `return null` for each of
  // these three states - see the `statusNote` style's own comment. The
  // header (including the "Configure in Glidepath" escape hatch) always
  // renders regardless; only the expandable detail body below depends on
  // cicd.data actually being loaded.
  let statusNote: string | undefined;
  if (cicd.loading) statusNote = 'loading…';
  else if (cicd.error) statusNote = `couldn't load cicd.yaml: ${cicd.error}`;
  else if (!cicd.data) statusNote = 'no cicd.yaml found yet for this app';

  const deploy = (cicd.data?.values.deploy ?? {}) as Record<string, unknown>;
  const { envs: environments } = readEnvironments(deploy as Deploy);
  const targetId = typeof deploy.target === 'string' ? deploy.target : 'k8s-rollout';
  const targetLabel = DEPLOY_TARGETS[targetId]?.label ?? targetId;
  const strategy = deploy.strategy === 'rollout' ? 'rollout' : 'deployment';
  const configuredEnvs = new Set(envs.data?.envs ?? []);
  const pipelines = (cicd.data?.values.pipelines ?? {}) as Record<string, unknown>;
  const pipelineEntries = Object.entries(pipelines);
  const eph = (cicd.data?.values.ephemeralEnvironments ?? {}) as Record<string, unknown>;
  const ephBranch = (eph.branch ?? {}) as Record<string, unknown>;
  const ephPr = (eph.pullRequest ?? {}) as Record<string, unknown>;

  // Read-only peek at the preview-env template's raw committed file for
  // display only (ports/probes) - fetchPlatformFile strips rollout.image
  // from the editable `values` on purpose (it's owned by the ArgoCD
  // ApplicationSet, never editable here, and genuinely absent from a real
  // committed pr-env.yaml - see that file's own comment), so this never has
  // a real image to show; only the unfiltered `raw` field's ports are.
  let previewPorts: string | undefined;
  if (prEnv.data?.raw) {
    try {
      const parsed = loadYaml(prEnv.data.raw) as Record<string, unknown> | undefined;
      const rollout = (parsed?.rollout ?? {}) as Record<string, unknown>;
      if (Array.isArray(rollout.ports)) {
        previewPorts = (rollout.ports as Array<{ name?: string; containerPort?: number }>)
          .map(p => `${p.name ?? 'port'} → ${p.containerPort ?? '?'}`)
          .join(', ');
      }
    } catch {
      // Malformed/legacy file - just skip the preview-env summary silently.
    }
  }

  // Where an environment's values come from: its gitops file (Flight), its platform file or the chart defaults (Ground), or the cloud target.
  const whereOf = (e: { name: string; tier: 'ground' | 'flight'; cluster?: string }): string => {
    if (e.tier === 'flight') return `${e.cluster ?? 'same cluster'} · gitops values`;
    if (targetId !== 'k8s-rollout') return targetLabel;
    return configuredEnvs.has(e.name) ? `${ENVS_ROOT}/envs/${e.name}.yaml` : 'chart defaults, no values file yet';
  };

  return (
    <div className={classes.panel}>
      <div className={classes.head}>
        <div className={classes.headLeft}>
          <HangarMark glyph="glidepath" size={18} />
          <Typography className={classes.title}>Glidepath at a glance</Typography>
          {statusNote && (
            <Typography className={cicd.error ? classes.statusNoteError : classes.statusNote}>{statusNote}</Typography>
          )}
        </div>
        <div className={classes.headRight}>
          {!statusNote && (
            <TextLink expanded={expanded} onClick={() => setExpanded(v => !v)}>
              {expanded ? 'Hide details' : 'Show details'}
            </TextLink>
          )}
          <TextLink onClick={goToGlidepath}>Configure in Glidepath →</TextLink>
        </div>
      </div>
      {!statusNote && cicd.data && (
        <div className={classes.chain} aria-label="Environments in promotion order">
          {environments.map((e, i) => (
            <span key={e.name} className={classes.chainItem}>
              {i > 0 && <span className={classes.arrow}>→</span>}
              <span className={classes.chainName}>{e.name}</span>
              <TierChip tier={e.tier} />
            </span>
          ))}
          {environments.length === 0 && <span className={classes.muted}>No environments declared.</span>}
        </div>
      )}
      {expanded && !statusNote && cicd.data && (
        <>
          <div className={classes.grid}>
            <div className={classes.col}>
              <ColumnLabel>Environments</ColumnLabel>
              <div className={classes.envRows}>
                {environments.map(e => (
                  <div key={e.name} className={classes.envRow}>
                    <span className={classes.chainName}>{e.name}</span>
                    <TierChip tier={e.tier} />
                    <span className={classes.mono}>{whereOf(e)}</span>
                    {pipelinesNamingEnv(pipelines, e.name).length === 0 && pipelineEntries.length > 0 && (
                      <span className={classes.strategyWarn} style={{ gridColumn: '3 / -1', marginTop: -4 }}>
                        No pipeline step {e.tier === 'flight' ? 'releases' : 'deploys'} to {e.name}.
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div className={classes.col}>
              <ColumnLabel>Deploy strategy</ColumnLabel>
              <span className={classes.value}>{strategy}</span>
              {strategy === 'deployment' && (
                <span className={classes.strategyWarn}>
                  Every deploy actually provisions an Argo Rollout today, regardless of this setting.
                </span>
              )}
            </div>
            {previewPorts && (
              <div className={classes.col}>
                <ColumnLabel>Preview environments (template)</ColumnLabel>
                <span className={classes.value}>Ports: {previewPorts}</span>
                <span className={classes.strategyWarn}>Image is stamped per-PR by the ArgoCD ApplicationSet, not shown here.</span>
              </div>
            )}
            <div className={classes.col}>
              <ColumnLabel>Ephemeral environments</ColumnLabel>
              <span className={classes.value}>
                Branch-triggered: {ephBranch.enabled ? 'on' : 'off'}
                {ephBranch.enabled && Array.isArray(ephBranch.patterns) && ephBranch.patterns.length > 0
                  ? ` (${(ephBranch.patterns as string[]).join(', ')})`
                  : ''}
              </span>
              <span className={classes.value}>
                PR-label-triggered: {ephPr.enabled ? 'on' : 'off'}
                {ephPr.enabled && Array.isArray(ephPr.labels) && ephPr.labels.length > 0
                  ? ` (${(ephPr.labels as string[]).join(', ')})`
                  : ''}
              </span>
              <span className={classes.value}>TTL: {typeof eph.ttl === 'string' ? eph.ttl : '5d'}</span>
            </div>
          </div>
          {pipelineEntries.length > 0 && (
            <div className={classes.pipelinesList}>
              <ColumnLabel>Configured pipelines</ColumnLabel>
              {pipelineEntries.map(([name, pipeline]) => (
                <PipelineFlowPreview key={name} name={name} pipeline={pipeline as never} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
