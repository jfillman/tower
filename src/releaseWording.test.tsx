import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PromoteDialog } from './PromoteDialog';
import { ReleaseChangelog } from './ReleaseChangelog';
import { ReleaseSignoffPanel } from './ReleaseSignoffPanel';
import type { EnvironmentSummary } from './types';

// Release names on builds (a build that shipped to Flight is a release) and the summary that moved from the human
// context into the draft.

const env = (e: string, image: string) =>
  ({ key: `kind-prod/${e}`, appName: 'bags', cluster: 'kind-prod', env: e, image }) as unknown as EnvironmentSummary;
const promote = { loading: false, promote: jest.fn(), reset: jest.fn() } as any;
const names = (byTag: [string, string][], next = 'IRONWOOD') => ({ byTag: new Map(byTag), next, index: [] });

describe('PromoteDialog', () => {
  it('names a build that already is a release', () => {
    render(
      <MemoryRouter>
        <PromoteDialog
          target={{ source: env('staging', 'ghcr.io/o/bags:1.1.4-9d3dcde'), target: env('pre-prod', '') }}
          onClose={jest.fn()}
          promote={promote}
          targetIsLower={false}
          onConfirm={jest.fn()}
          names={names([['1.1.4-9d3dcde', 'HAZEL']])}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('HAZEL')).toBeTruthy();
    expect(screen.queryByText(/becomes the release/)).toBeNull();
  });

  it('says which release an unnamed build becomes in Flight', () => {
    render(
      <MemoryRouter>
        <PromoteDialog
          target={{ source: env('dev', 'ghcr.io/o/bags:1.1.5-abcdef1'), target: env('staging', '') }}
          onClose={jest.fn()}
          promote={promote}
          targetIsLower={false}
          onConfirm={jest.fn()}
          names={names([['1.1.4-9d3dcde', 'HAZEL']])}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText(/this build becomes the release IRONWOOD/)).toBeTruthy();
  });
});

describe('the release summary', () => {
  it('leads the release notes, and a summary added after release is labelled as such', () => {
    render(
      <ReleaseSignoffPanel
        release={{ summary: 'Reprints bag tags at the gate.', notes: { added: ['Reprint'] } }}
        loading={false}
        addedAfter={{ summary: 'Old summary', risk: 'low' }}
      />,
    );
    expect(screen.getByText('Reprints bag tags at the gate.')).toBeTruthy();
    expect(screen.getByText('Summary (added after release)')).toBeTruthy();
  });

  it('shows in the changelog', () => {
    render(
      <ReleaseChangelog
        onBack={jest.fn()}
        names={{
          byTag: new Map([['1.0.0-aaaaaaa', 'ASPEN']]),
          next: 'BIRCH',
          index: [{ imageTag: '1.0.0-aaaaaaa', env: 'prod', generatedAt: '2026-10-01T00:00:00Z', store: 'gitops', summary: 'First cut.' }],
        }}
      />,
    );
    expect(screen.getByText('First cut.')).toBeTruthy();
    expect(screen.queryByText('No notes were written for this release.')).toBeNull();
  });
});
