import { makeStyles } from '@material-ui/core/styles';
import { HangarMark } from './brand/HangarMark';
import { formatDateTime, relativeTime } from './shared/format';
import type { TowerAgentState, TowerPrMark } from './mounts';
import { Chip, StatusChip, Tooltip } from './ui';

// The small Clearance marks (design board T1: "the same data in other tabs, small marks, no new screens") and the
// Services list's agent chips (board T0). Both read what a mount reported (mounts.tsx); Tower draws, never fetches.

const useStyles = makeStyles(() => ({
  mark: { display: 'inline-flex', alignItems: 'center', gap: 4, verticalAlign: 'middle' },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
}));

/** "This PR (or the build of its branch) is an agent's, through Clearance": the glyph and the agent's name. */
export function AgentMark({ mark, what = 'pr', className }: { mark: TowerPrMark; what?: 'pr' | 'build'; className?: string }) {
  const c = useStyles();
  const receipt = mark.verified ? 'receipt verified by Clearance' : 'receipt recorded, not verified';
  const title =
    what === 'pr'
      ? `Opened by ${mark.agent} through Clearance · ${receipt} · ${formatDateTime(mark.at)}`
      : `Builds the branch of PR #${mark.pr}, opened by ${mark.agent} through Clearance · ${receipt}`;
  return (
    <Tooltip title={title}>
      <span className={`${c.mark} ${className ?? ''}`}>
        <Chip tone="sky" className={c.mark}>
          <HangarMark glyph="clearance" size={12} />
          {mark.agent}
        </Chip>
      </span>
    </Tooltip>
  );
}

/** An agent's row of chips on the Services list: shape, live state, what waits on a person, what it acts on. */
export function AgentStateChips({ state }: { state: TowerAgentState }) {
  const c = useStyles();
  let live: JSX.Element | null = null;
  if (state.tripped > 0) live = <StatusChip tone="warn" dot>frozen · breaker tripped</StatusChip>;
  else if (state.live > 0) {
    live = (
      <StatusChip tone="info" dot>
        {state.live === 1 && state.lastRun ? `running · ${relativeTime(state.lastRun.at)}` : `${state.live} live`}
      </StatusChip>
    );
  } else if (state.lastRun) {
    live = (
      <StatusChip tone={state.lastRun.state === 'closed' ? 'ok' : 'neutral'}>
        last run {state.lastRun.state === 'closed' ? 'ok' : state.lastRun.state} · {relativeTime(state.lastRun.at)}
      </StatusChip>
    );
  }
  const trigger = state.triggers.find(x => x !== 'manual');
  return (
    <div className={c.chips}>
      <Chip>{trigger ?? state.kind}</Chip>
      {live}
      {state.waiting > 0 && (
        <StatusChip tone="warn">
          {state.waiting} request{state.waiting === 1 ? '' : 's'} waiting
        </StatusChip>
      )}
      {state.actsOn.length > 0 && (
        <Tooltip title={state.actsOn.join(', ')}>
          <span>
            <Chip>acts on {state.actsOn.slice(0, 2).join(', ')}{state.actsOn.length > 2 ? ` +${state.actsOn.length - 2}` : ''}</Chip>
          </span>
        </Tooltip>
      )}
    </div>
  );
}

/** An app's chip on the Services list: how many agents' definitions name it. */
export function ActingAgentsChip({ agents }: { agents: TowerAgentState[] }) {
  if (agents.length === 0) return null;
  return (
    <Tooltip title={agents.map(a => a.name).join(', ')}>
      <span>
        <Chip>
          {agents.length} agent{agents.length === 1 ? '' : 's'} can act
        </Chip>
      </span>
    </Tooltip>
  );
}
