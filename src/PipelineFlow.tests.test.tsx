import { fireEvent, render, screen } from '@testing-library/react';
import { PipelineFlow, buildSupplyChainStages } from './PipelineFlow';
import type { Attestation, ProvenanceResponse } from './types';

// The Tests step on an image (Glidepath test framework, 2026-10-19): what the drawer says for a verified check ride,
// and that each attested run can be downloaded.
const SLSA = 'https://slsa.dev/provenance/v0.2';
const task = (name: string, results: Record<string, string>) => ({ name, results: Object.entries(results).map(([n, v]) => ({ name: n, value: v })) });
const att = (tasks: unknown[], finishedOn: string): Attestation => ({
  predicateType: SLSA,
  verified: true,
  verificationCode: 'verified',
  transparencyLog: { logIndex: 7 },
  subject: [{ name: 'ghcr.io/o/boarding-api', digest: { sha256: '11f4210b3688aa60fe1ba9dc381888680db97a393501309fafb162dc48d99f31' } }],
  predicate: { metadata: { buildFinishedOn: finishedOn }, buildConfig: { tasks } },
});
const prov: ProvenanceResponse = {
  digest: 'sha256:11f4210b3688aa60fe1ba9dc381888680db97a393501309fafb162dc48d99f31',
  attestations: [
    att([task('build-image', { 'image-digest': 'sha256:11f4' })], '2026-10-19T17:00:00Z'),
    att([task('run-testworkflow', { outcome: 'passed', role: 'test', 'tests-total': '8', 'tests-passed': '8', 'tests-failed': '0', 'tests-skipped': '0', 'workflow-source': 'repo:https://github.com/o/boarding-api@926d566', 'execution-id': 'e0' })], '2026-10-19T17:30:00Z'),
    att([task('run-testworkflow', { outcome: 'passed', role: 'check-ride', 'tests-total': '8', 'tests-passed': '8', 'tests-failed': '0', 'tests-skipped': '0', 'workflow-source': 'argocd:check-rides', 'execution-id': 'e1' })], '2026-10-19T17:40:00Z'),
  ],
};

describe('the Tests step', () => {
  beforeAll(() => {
    // jsdom has no URL.createObjectURL; the download builds a Blob link with it.
    Object.defineProperty(URL, 'createObjectURL', { value: jest.fn(() => 'blob:x'), configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: jest.fn(), configurable: true });
  });

  it('says the check ride passed with its counts, lists both runs, and offers a download for each', () => {
    const stages = buildSupplyChainStages(prov, false);
    expect(stages.find(s => s.id === 'tests')?.status).toBe('done');
    render(<PipelineFlow stages={stages} />);
    fireEvent.click(screen.getByText('Tests'));
    expect(screen.getByText('The check ride passed')).toBeTruthy();
    expect(screen.getByText('8 of 8 ✓')).toBeTruthy();
    expect(screen.getByText(/1 other attested run on this image is listed below/)).toBeTruthy();
    expect(screen.getByText(/check ride · passed · 8 of 8 passed/)).toBeTruthy();
    expect(screen.getByText(/the team's test · passed · 8 of 8 passed/)).toBeTruthy();
    const downloads = screen.getAllByRole('button', { name: /Download/ });
    // One per listed run, plus the step's own "Download test attestation".
    expect(downloads.length).toBe(3);
    fireEvent.click(downloads[0]);
    expect(URL.createObjectURL).toHaveBeenCalled();
  });

  it("is amber with only the team's tests, and says what the gate needs", () => {
    const teamOnly: ProvenanceResponse = { ...prov, attestations: prov.attestations.slice(0, 2) };
    const stages = buildSupplyChainStages(teamOnly, false);
    expect(stages.find(s => s.id === 'tests')?.status).toBe('warn');
    render(<PipelineFlow stages={stages} />);
    fireEvent.click(screen.getByText('Tests'));
    expect(screen.getByText("The team's tests passed; no check ride on this image")).toBeTruthy();
    expect(screen.getByText(/needs the check ride from the shared check-rides repository/)).toBeTruthy();
  });
});
