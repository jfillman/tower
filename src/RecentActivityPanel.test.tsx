import { fireEvent, render, screen } from '@testing-library/react';
import { RecentActivityPanel, topicMeta } from './RecentActivityPanel';

const n = (id: string, topic: string | undefined, title: string, severity: 'normal' | 'high' = 'normal') =>
  ({
    id,
    user: 'user:default/x',
    created: new Date().toISOString(),
    origin: 'plugin:glidepath',
    payload: { title, description: 'App: sky-marshall', severity, ...(topic ? { topic } : {}) },
  }) as any;

const notifications = [
  n('1', 'rollout', 'Canary analysis skipped on staging', 'high'),
  n('2', 'rolled-back', 'Release rolled back in staging'),
  n('3', 'images', 'Old images cleaned up for sky-marshall'),
  n('4', 'test', 'Test passed'),
  n('5', 'something-new', 'A kind nobody listed yet'),
  n('6', 'build', 'Image built'),
];

const renderPanel = () =>
  render(
    <RecentActivityPanel
      notifications={notifications}
      loading={false}
      goToImage={() => undefined}
      goToRun={() => undefined}
      goToEnv={() => undefined}
      goToTopology={() => undefined}
      pipelineOrder={undefined}
      pipelineRuns={[]}
      deployHistory={undefined}
      onViewAll={() => undefined}
    />,
  );

describe('RecentActivityPanel shows every notification (2026-10-11)', () => {
  it('has a row for every topic, including ones no filter lists', () => {
    renderPanel();
    for (const title of [
      'Canary analysis skipped on staging',
      'Release rolled back in staging',
      'Old images cleaned up for sky-marshall',
      'Test passed',
      'A kind nobody listed yet',
    ]) {
      expect(screen.getAllByText(title, { exact: false }).length).toBeGreaterThan(0);
    }
  });

  it('files rollout actions and rollbacks under Releases, cleanups and tests under Images', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /Releases/ }));
    expect(screen.getAllByText('Canary analysis skipped on staging', { exact: false }).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Release rolled back in staging', { exact: false }).length).toBeGreaterThan(0);
    expect(screen.queryByText('Old images cleaned up for sky-marshall', { exact: false })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Images/ }));
    expect(screen.getAllByText('Old images cleaned up for sky-marshall', { exact: false }).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Test passed', { exact: false }).length).toBeGreaterThan(0);
  });

  it('labels a topic it does not know by its own name', () => {
    expect(topicMeta('something-new').label).toBe('Something new');
    expect(topicMeta(undefined).label).toBe('Notice');
    expect(topicMeta('rollout').label).toBe('Rollout');
  });
});
