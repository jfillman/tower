import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import Link from '@material-ui/core/Link';
import { fontMono, useHangarTokens, type HangarTokens } from '../../brand/tokens';
import type { SubmittedChange } from '../../environments/submitted';
import { relativeTime } from '../../shared/format';
import { Button, Panel, SectionLabel } from '../../ui';
import { useUi } from '../../ui/styles';

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  panel: { padding: 16, display: 'flex', flexDirection: 'column', gap: 12 },
  record: { display: 'flex', flexDirection: 'column', gap: 4, borderTop: ({ t }) => `1px solid ${t.line}`, paddingTop: 10 },
  title: { fontSize: 13, fontWeight: 600, color: ({ t }) => t.textHi },
  detail: { fontFamily: fontMono, fontSize: 11.5, color: ({ t }) => t.textLo },
  links: { display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 12.5 },
  actions: { display: 'flex', gap: 8 },
}));

/**
 * Pull requests opened from this tab that have not merged yet. They stay until cicd.yaml shows the result, so leaving
 * the tab and coming back (or opening it after the merge) still explains what is going on.
 */
export function SubmittedPanel({
  records,
  onCheck,
  onDismiss,
}: {
  records: SubmittedChange[];
  onCheck: () => void;
  onDismiss: (id: string) => void;
}) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const ui = useUi({ t });
  if (records.length === 0) return null;
  return (
    <Panel className={c.panel} role="region" aria-label="Open pull requests">
      <SectionLabel>Open pull requests</SectionLabel>
      <div className={ui.note}>Waiting for merge. This updates by itself every half minute.</div>
      {records.map(r => (
        <div key={r.id} className={c.record}>
          <span className={c.title}>{r.summary.filter(s => !s.startsWith('Convert the environment list')).join(', ') || 'Change to cicd.yaml'}</span>
          <span className={c.detail}>opened {relativeTime(new Date(r.at).toISOString())}</span>
          <div className={c.links}>
            {Object.entries(r.requests).map(([env, url]) => (
              <Link key={env} href={url} target="_blank" rel="noopener noreferrer">
                {env}: ApplicationEnvironment request
              </Link>
            ))}
            <Link href={r.prUrl} target="_blank" rel="noopener noreferrer">
              cicd.yaml pull request
            </Link>
          </div>
          <div className={c.actions}>
            <Button small onClick={() => onDismiss(r.id)}>
              Dismiss
            </Button>
          </div>
        </div>
      ))}
      <div className={c.actions}>
        <Button small onClick={onCheck}>
          Check again
        </Button>
      </div>
    </Panel>
  );
}
