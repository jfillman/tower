import { useTowerMounts } from '../mounts';
import { PageHeader } from '../ui';

// The Clearance tab of an app: the Clearance plugin's entity content, mounted (mounts.tsx). It shows only where the
// plugin says it has something to say (an agent's scope names this app, or an agent has acted on it); the deployment
// gate's panels arrive with the gate, not as placeholders (design decision 2026-10-31).
export function ClearanceTab() {
  const { clearance } = useTowerMounts();
  return (
    <>
      <PageHeader title="Clearance" subtitle="The agents that may act on this app and what they did to it, as Clearance recorded it." />
      {clearance?.element ?? null}
    </>
  );
}
