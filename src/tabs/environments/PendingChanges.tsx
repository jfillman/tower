import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import { fontMono, useHangarTokens, type HangarTokens } from '../../brand/tokens';
import type { ChangeLine, EnvDef } from '../../environments/stagedChanges';
import { Button, Chip, Panel, SectionLabel } from '../../ui';
import { useUi } from '../../ui/styles';

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  panel: { padding: 16, display: 'flex', flexDirection: 'column', gap: 12, alignSelf: 'start' },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  lines: { display: 'flex', flexDirection: 'column', gap: 12 },
  line: { display: 'flex', flexDirection: 'column', gap: 2 },
  lineTitle: { fontSize: 13, fontWeight: 600, color: ({ t }) => t.textHi },
  detail: { fontFamily: fontMono, fontSize: 11.5, color: ({ t }) => t.textLo },
  plus: { color: ({ t }) => t.good, marginRight: 4 },
  minus: { color: ({ t }) => t.bad, marginRight: 4 },
  section: { borderTop: ({ t }) => `1px solid ${t.line}`, paddingTop: 12 },
  prList: { display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5, marginTop: 8 },
  buttons: { display: 'flex', gap: 8 },
}));

export function PendingChanges({
  changes,
  problems,
  notes,
  flightAdds,
  launched,
  owner,
  appName,
  deleteFiles,
  phase,
  onDiscard,
  onOpen,
}: {
  changes: ChangeLine[];
  problems: string[];
  notes: string[];
  flightAdds: EnvDef[];
  launched: Record<string, string>;
  owner?: string;
  appName?: string;
  deleteFiles: string[];
  phase: 'idle' | 'launching' | 'submitting';
  onDiscard: () => void;
  onOpen: () => void;
}) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const ui = useUi({ t });
  const several = flightAdds.length > 0;
  const idleLabel = several ? 'Open pull requests' : 'Open pull request';
  const busyLabel = { launching: 'Requesting environment…', submitting: 'Opening…' };
  const openLabel = phase === 'idle' ? idleLabel : busyLabel[phase];
  const files = ['cicd.yaml', ...(deleteFiles.length > 0 ? ['environment values files deleted where they exist'] : [])];
  return (
    <Panel accent className={c.panel} aria-label="Pending changes">
      <div className={c.head}>
        <SectionLabel>Pending changes</SectionLabel>
        <Chip tone="flight">{changes.length} staged</Chip>
      </div>
      {changes.length === 0 ? (
        <div className={ui.note}>Nothing staged. Add an environment, reorder, or set a cloud environment&apos;s resource, then review here.</div>
      ) : (
        <>
          <div className={c.lines}>
            {changes.map((l, i) => (
              <div key={`${l.kind}-${l.title}-${i}`} className={c.line}>
                <span className={c.lineTitle}>
                  {l.kind === 'add' && <span className={c.plus}>+</span>}
                  {l.kind === 'remove' && <span className={c.minus}>-</span>}
                  {l.title}
                </span>
                {l.detail && <span className={c.detail}>{l.detail}</span>}
              </div>
            ))}
          </div>
          {problems.map(p => (
            <div key={p} className={ui.problem}>
              {p}
            </div>
          ))}
          <div className={c.section}>
            <span className={ui.columnLabel}>{several ? 'Pull requests this opens, in this order' : 'Pull request this opens'}</span>
            <div className={c.prList}>
              {flightAdds.map((e, i) => (
                <span key={e.name}>
                  <Chip tone="flight">{i + 1}</Chip> <b>tenants repo</b>
                  <br />
                  <span className={c.detail}>
                    ApplicationEnvironment request for {e.name}
                    {launched[e.name] ? ' (already opened)' : ''}
                  </span>
                </span>
              ))}
              <span>
                <Chip tone="ground">{several ? flightAdds.length + 1 : 1}</Chip>{' '}
                <b>
                  {owner}/{appName}
                </b>
                <br />
                <span className={c.detail}>{files.join(', ')}</span>
              </span>
            </div>
          </div>
          {notes.map(n => (
            <div key={n} className={ui.note}>
              {n}
            </div>
          ))}
          <div className={c.buttons}>
            <Button onClick={onDiscard}>Discard all</Button>
            <Button variant="primary" style={{ flex: 1 }} disabled={problems.length > 0 || phase !== 'idle'} onClick={onOpen}>
              {openLabel}
            </Button>
          </div>
        </>
      )}
    </Panel>
  );
}
