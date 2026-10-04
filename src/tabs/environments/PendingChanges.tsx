import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import { fontMono, useHangarTokens, type HangarTokens } from '../../brand/tokens';
import type { ChangeLine, EnvDef } from '../../environments/stagedChanges';
import { Chip } from '../../ui';
import { PendingPanel } from '../../ui/PendingPanel';
import { useUi } from '../../ui/styles';

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  section: { borderTop: ({ t }) => `1px solid ${t.line}`, paddingTop: 12 },
  detail: { fontFamily: fontMono, fontSize: 11.5, color: ({ t }) => t.textLo },
  prList: { display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5, marginTop: 8 },
}));

const TONE: Partial<Record<ChangeLine['kind'], 'add' | 'remove'>> = { add: 'add', remove: 'remove' };
const IDLE: Record<'one' | 'several', string> = { one: 'Open pull request', several: 'Open pull requests' };
const BUSY = { launching: 'Requesting environment…', submitting: 'Opening…' };

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
  const files = ['cicd.yaml', ...(deleteFiles.length > 0 ? ['environment values files deleted where they exist'] : [])];
  return (
    <PendingPanel
      lines={changes.map(l => ({ title: l.title, detail: l.detail, tone: TONE[l.kind] }))}
      problems={problems}
      notes={notes}
      emptyText="Nothing staged. Add an environment, reorder, or set a cloud environment's resource, then review here."
      busy={phase !== 'idle'}
      busyLabel={phase === 'idle' ? '' : BUSY[phase]}
      submitLabel={several ? IDLE.several : IDLE.one}
      onDiscard={onDiscard}
      onSubmit={onOpen}
    >
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
    </PendingPanel>
  );
}
