import { render, screen } from '@testing-library/react';
import { PreviewsPanel, previewHealth } from './PreviewsPanel';
import type { Preview } from '../../usePreviews';

// boarding-api-pr-55 as glidepath-api lists it (2026-11-01).
const p = (over: Partial<Preview> = {}): Preview => ({
  pr: 55,
  prUrl: 'https://github.com/jfillman/boarding-api/pull/55',
  application: 'boarding-api-pr-55',
  namespace: 'app-boarding-api-pr-55',
  image: 'ghcr.io/jfillman/boarding-api-pr:a516f39785a9',
  headSha: 'a516f39785a9393fc6d1c6820e093c4944501369',
  sync: 'Synced',
  health: 'Healthy',
  createdAt: '2026-10-26T21:38:47Z',
  service: 'boarding-api',
  port: 8080,
  portForward: 'kubectl port-forward -n app-boarding-api-pr-55 svc/boarding-api 8080:8080',
  ...over,
});

describe('PreviewsPanel', () => {
  it('shows each preview: its PR, health, sync, where it runs and how to reach it', () => {
    render(<PreviewsPanel state={{ loading: false, previews: [p(), p({ pr: 12, application: 'boarding-api-pr-12', health: 'Progressing', sync: 'OutOfSync', portForward: undefined })] }} />);
    const rows = screen.getAllByTestId('preview');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Healthy');
    expect(rows[0].textContent).toContain('Synced');
    expect(rows[0].textContent).toContain('app-boarding-api-pr-55 · a516f39785a9');
    expect(screen.getByLabelText("Port-forward to PR 55's preview").textContent).toBe(
      'kubectl port-forward -n app-boarding-api-pr-55 svc/boarding-api 8080:8080',
    );
    expect(rows[1].textContent).toContain('Progressing');
    expect(rows[1].textContent).toContain('OutOfSync');
    expect(screen.queryByLabelText("Port-forward to PR 12's preview")).toBeNull();
    expect(screen.getByText(/ends when its PR closes/)).toBeTruthy();
  });

  it('says how to get one when there are none, and why when they cannot be read', () => {
    const { rerender } = render(<PreviewsPanel state={{ loading: false, previews: [] }} />);
    expect(screen.getByText(/Label a pull request/)).toBeTruthy();
    rerender(<PreviewsPanel state={{ loading: false, previews: [], error: 'glidepath-api 502' }} />);
    expect(screen.getByText(/could not be read: glidepath-api 502/)).toBeTruthy();
    expect(screen.queryByText(/Label a pull request/)).toBeNull();
  });

  it("maps Argo CD's health onto Tower's", () => {
    expect(['Healthy', 'Progressing', 'Suspended', 'Degraded', 'Missing', 'Unknown'].map(previewHealth)).toEqual([
      'healthy', 'progressing', 'paused', 'degraded', 'degraded', 'unknown',
    ]);
  });
});
