import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import { fontMono, useHangarTokens, type HangarTokens } from '../../brand/tokens';
import { relativeTime } from '../../shared/format';
import type { Health } from '../../types';
import type { Preview, PreviewsState } from '../../usePreviews';
import { Chip, HEALTH_LABEL, Panel, SectionLabel, StatusDot } from '../../ui';
import { PrRef } from '../../ui/PrRef';
import { useUi } from '../../ui/styles';

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  stack: { padding: 16, display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 },
  entry: { display: 'flex', flexDirection: 'column', gap: 6, borderTop: ({ t }) => `1px solid ${t.line}`, paddingTop: 10 },
  head: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  health: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: ({ t }) => t.textHi },
  detail: { fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.textLo, overflowWrap: 'anywhere' },
  command: {
    fontFamily: fontMono,
    fontSize: 11,
    color: ({ t }) => t.textHi,
    background: ({ t }) => t.panelAlt,
    padding: '4px 8px',
    borderRadius: 4,
    overflowWrap: 'anywhere',
    userSelect: 'all',
  },
}));

/** Argo CD's health as Tower's five states. Missing means nothing is deployed yet or any more. */
export function previewHealth(h: string): Health {
  switch (h) {
    case 'Healthy':
      return 'healthy';
    case 'Progressing':
      return 'progressing';
    case 'Suspended':
      return 'paused';
    case 'Degraded':
    case 'Missing':
      return 'degraded';
    default:
      return 'unknown';
  }
}

function PreviewRow({ p }: { p: Preview }) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const health = previewHealth(p.health);
  const tag = p.image?.split(':').pop();
  return (
    <div className={c.entry} data-testid="preview">
      <div className={c.head}>
        {p.prUrl ? <PrRef pr={{ url: p.prUrl, title: `PR #${p.pr}` }} size="inline" label="PR" /> : <span>PR #{p.pr}</span>}
        <span className={c.health}>
          <StatusDot health={health} />
          {p.health === 'Missing' ? 'Missing' : HEALTH_LABEL[health]}
        </span>
        <Chip tone={p.sync === 'Synced' ? 'ok' : 'neutral'}>{p.sync}</Chip>
      </div>
      <span className={c.detail}>
        {p.namespace}
        {tag ? ` · ${tag}` : ''} · created {relativeTime(p.createdAt)}
      </span>
      {p.portForward && (
        <code className={c.command} aria-label={`Port-forward to PR ${p.pr}'s preview`}>
          {p.portForward}
        </code>
      )}
    </div>
  );
}

/**
 * The app's preview environments: one per PR labelled `preview`, deployed by the app's pr-envs ApplicationSet into
 * app-<app>-pr-<n>. Read only: adding or removing the label is what starts or ends one. Shown only when there are
 * previews or they could not be read.
 */
export function PreviewsPanel({ state }: { state: PreviewsState }) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const ui = useUi({ t });
  // Like Open PRs: nothing to show, no panel. An app without previews (or before the first read answers) sees none.
  if (state.previews.length === 0 && !state.error) return null;
  return (
    <Panel className={c.stack} role="region" aria-label="Preview environments">
      <SectionLabel>Previews</SectionLabel>
      {state.error && <div className={ui.note}>Previews could not be read: {state.error}</div>}
      {state.previews.map(p => (
        <PreviewRow key={p.application} p={p} />
      ))}
      {state.previews.length > 0 && (
        <div className={ui.note}>A preview ends when its PR closes or the preview label comes off.</div>
      )}
    </Panel>
  );
}
