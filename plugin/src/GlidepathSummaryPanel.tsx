import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import { load as loadYaml } from 'js-yaml';
import { fontDisplay, fontMono, useHangarTokens, type HangarTokens } from '../brand/tokens';
import { HangarMark } from '../brand/HangarMark';
import { useCicdConfig, usePlatformEnvs, usePlatformFile } from './useConfigData';
import { PipelineFlowPreview } from './PipelineFlowPreview';

// Read-only "what's configured" companion to the Glidepath tab's own editor
// (GlidepathTab.tsx) - fed by the exact same hooks/routes, just rendered
// without any form state, so there's one source of truth for what cicd.yaml
// actually says rather than a second, drifting summary.

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  panel: {
    border: ({ t }) => `1px solid ${t.lineSoft}`,
    borderRadius: 8,
    padding: '14px 18px',
    marginBottom: 20,
    backgroundColor: ({ t }) => t.panel,
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' },
  headLeft: { display: 'flex', alignItems: 'center', gap: 8 },
  title: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 14, color: ({ t }) => t.textHi },
  grid: { display: 'flex', gap: 24, flexWrap: 'wrap' },
  col: { display: 'flex', flexDirection: 'column', gap: 6, minWidth: 180 },
  label: { fontFamily: fontMono, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.4, color: ({ t }) => t.textFaint },
  value: { fontSize: 12.5, color: ({ t }) => t.textHi },
  envChips: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  envChip: {
    fontFamily: fontMono,
    fontSize: 10.5,
    padding: '2px 8px',
    borderRadius: 10,
    border: ({ t }) => `1px solid ${t.lineSoft}`,
    color: ({ t }) => t.textLo,
  },
  pipelinesList: { display: 'flex', flexDirection: 'column', gap: 10 },
  configureLink: {
    fontFamily: fontMono,
    fontSize: 11.5,
    fontWeight: 700,
    color: ({ t }) => t.sky,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    '&:hover': { textDecoration: 'underline' },
  },
  strategyWarn: { fontSize: 10.5, fontStyle: 'italic', color: ({ t }) => t.amberInk },
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
  const lowerEnvironments = Array.isArray(deploy.lowerEnvironments) ? (deploy.lowerEnvironments as string[]) : ['dev'];
  const promotionOrder = Array.isArray(deploy.promotionOrder) ? (deploy.promotionOrder as string[]) : [];
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
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          {!statusNote && (
            <button type="button" className={classes.configureLink} onClick={() => setExpanded(v => !v)}>
              {expanded ? 'hide details' : 'show details'}
            </button>
          )}
          <button type="button" className={classes.configureLink} onClick={goToGlidepath}>
            Configure in Glidepath →
          </button>
        </div>
      </div>
      {expanded && !statusNote && cicd.data && (
        <>
          <div className={classes.grid}>
            <div className={classes.col}>
              <span className={classes.label}>Lower environments</span>
              <div className={classes.envChips}>
                {lowerEnvironments.map(env => (
                  <span key={env} className={classes.envChip}>
                    {env}
                    {configuredEnvs.has(env) ? '' : ' (defaults)'}
                  </span>
                ))}
              </div>
            </div>
            <div className={classes.col}>
              <span className={classes.label}>Promotion order</span>
              <span className={classes.value}>{promotionOrder.length > 0 ? promotionOrder.join(' → ') : '(not set)'}</span>
            </div>
            <div className={classes.col}>
              <span className={classes.label}>Deploy strategy</span>
              <span className={classes.value}>{strategy}</span>
              {strategy === 'deployment' && (
                <span className={classes.strategyWarn}>
                  Every deploy actually provisions an Argo Rollout today, regardless of this setting.
                </span>
              )}
            </div>
            {previewPorts && (
              <div className={classes.col}>
                <span className={classes.label}>Preview env template</span>
                <span className={classes.value}>Ports: {previewPorts}</span>
                <span className={classes.strategyWarn}>Image is stamped per-PR by the ArgoCD ApplicationSet, not shown here.</span>
              </div>
            )}
            <div className={classes.col}>
              <span className={classes.label}>Ephemeral environments</span>
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
              <span className={classes.label}>Configured pipelines</span>
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
