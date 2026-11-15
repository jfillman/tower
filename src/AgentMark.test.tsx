import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RunMarkChip, AgentMark } from './AgentMark';
import type { TowerRunMark } from './mounts';

const mark = (over: Partial<TowerRunMark> = {}): TowerRunMark => ({
  pipelineRun: 'gate-api-push-abc',
  agent: 'triage-agent',
  session: 's-42',
  eventId: 'e',
  at: '2026-11-15T00:00:00Z',
  state: 'closed',
  tripped: false,
  ...over,
});
const renderChip = (m: TowerRunMark) =>
  render(
    <MemoryRouter>
      <RunMarkChip mark={m} />
    </MemoryRouter>,
  );

describe('RunMarkChip', () => {
  it('links to the agent run in Autopilot when the session is known, for a finished run', () => {
    renderChip(mark());
    const link = screen.getByRole('link', { name: /triage-agent investigated$/ });
    expect(link.getAttribute('href')).toBe('/autopilot?view=runs&run=s-42');
  });

  it('links the same way for a live run', () => {
    renderChip(mark({ state: 'live' }));
    expect(screen.getByRole('link', { name: /triage-agent investigating$/ }).getAttribute('href')).toBe('/autopilot?view=runs&run=s-42');
  });

  it('encodes the session id in the address', () => {
    renderChip(mark({ session: 'a b&c' }));
    expect(screen.getByRole('link').getAttribute('href')).toBe('/autopilot?view=runs&run=a%20b%26c');
  });

  it('is a plain status chip, not a link or button, without a session id', () => {
    renderChip(mark({ session: '' }));
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('triage-agent investigated')).toBeTruthy();
  });

  it('wears the Autopilot mark, not the Clearance one', () => {
    renderChip(mark());
    expect(screen.getByLabelText('autopilot mark')).toBeTruthy();
    expect(screen.queryByLabelText('clearance mark')).toBeNull();
  });
});

describe('AgentMark', () => {
  it('keeps the Clearance mark: it is about a Clearance receipt', () => {
    render(<AgentMark mark={{ repo: 'o/r', pr: 1, agent: 'triage-agent', at: '2026-11-15T00:00:00Z', verified: true }} />);
    expect(screen.getByLabelText('clearance mark')).toBeTruthy();
  });
});
