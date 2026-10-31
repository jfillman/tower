import { useTowerMounts } from '../mounts';
import { PageHeader } from '../ui';

// The Agent tab of an AI workload or AI service: the Autopilot plugin's entity content, mounted (mounts.tsx). Tower
// draws the page frame; what the agent did, its live runs and the questions it asked are the plugin's to show. The
// tab exists only while that plugin is installed (TowerPage's visibleTabs), so the mount is always there.
export function AgentTab() {
  const { agent } = useTowerMounts();
  return (
    <>
      <PageHeader title="Agent" subtitle="What this agent is doing and did: its runs, each call it made through Clearance, and the questions it is waiting on." />
      {agent?.element ?? null}
    </>
  );
}
