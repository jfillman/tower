import { fireEvent, render, screen } from '@testing-library/react';
import { PodsPanel } from './PodsPanel';
import type { EnvironmentSummary } from '../../types';

jest.mock('@backstage/core-plugin-api', () => ({
  ...jest.requireActual('@backstage/core-plugin-api'),
  useApi: () => ({ getBaseUrl: async () => 'http://be', fetch: async () => ({ ok: true, json: async () => ({}) }) }),
}));
jest.mock('./PodRestartControl', () => ({ PodRestartControl: () => null }));

const env = {
  env: 'prod',
  cluster: 'example-prod',
  namespace: 'app-sky-marshall-prod',
  appName: 'sky-marshall',
  pods: [{ name: 'sky-marshall-abc', phase: 'Running', restarts: 0, containers: ['sky-marshall'] }],
  resources: [],
} as unknown as EnvironmentSummary;

describe('PodsPanel: kubectl exec (gap G3)', () => {
  it('never suggests exec on Flight, where the cluster refuses it; points to Debug instead', () => {
    render(<PodsPanel env={env} tier="upper" />);
    expect(screen.queryByRole('button', { name: /copy kubectl exec/ })).toBeNull();
    expect(screen.getByText(/exec is refused on Flight; use Debug/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /copy kubectl logs/ })).toBeTruthy();
  });

  it('keeps it on Ground, labelled for operators', async () => {
    render(<PodsPanel env={env} tier="lower" />);
    fireEvent.mouseOver(screen.getByRole('button', { name: /copy kubectl exec/ }));
    expect((await screen.findByRole('tooltip')).textContent).toContain('Debug records the session');
  });
});
