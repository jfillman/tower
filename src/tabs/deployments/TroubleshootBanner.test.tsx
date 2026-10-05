import { fireEvent, render, screen, within } from '@testing-library/react';
import { diagnose, TroubleshootBanner } from './TroubleshootBanner';
import type { RawEvent, RawPod } from '../../deployment/problems';
import type { EnvironmentSummary } from '../../types';

jest.mock('../../NamespaceEvents', () => ({ NamespaceEvents: ({ namespace }: { namespace: string }) => <div>all events of {namespace}</div> }));

const env = (over: Partial<EnvironmentSummary> = {}): EnvironmentSummary =>
  ({
    key: 'pre-prod',
    env: 'pre-prod',
    cluster: 'kind-prod',
    namespace: 'app-boarding-api-pre-prod',
    drift: false,
    pods: [],
    services: [],
    resources: [],
    rolloutPhase: 'Progressing',
    argoHealthStatus: 'Progressing',
    argoSyncStatus: 'Synced',
    ...over,
  }) as EnvironmentSummary;

const ago = (min: number) => new Date(Date.now() - min * 60000).toISOString();
const podPulling: RawPod = {
  metadata: { name: 'boarding-api-7d9f-abcde', creationTimestamp: ago(3) },
  status: { phase: 'Pending', containerStatuses: [{ name: 'boarding-api', restartCount: 0, state: { waiting: { reason: 'ImagePullBackOff', message: 'Back-off pulling image "ghcr.io/jfillman/boarding-api:1.1.2"' } } }] },
};
const podUnschedulable: RawPod = {
  metadata: { name: 'boarding-api-7d9f-fghij', creationTimestamp: ago(3) },
  status: { phase: 'Pending', conditions: [{ type: 'PodScheduled', status: 'False', reason: 'Unschedulable', message: '0/1 nodes are available: 1 Insufficient memory.' }] },
};
const warn = (over: Partial<RawEvent>): RawEvent => ({ type: 'Warning', reason: 'FailedCreate', message: 'Error creating: pods "x" is forbidden: exceeded quota', count: 1, lastTimestamp: ago(1), involvedObject: { kind: 'ReplicaSet', name: 'boarding-api-7d9f' }, ...over });

describe('the banner for a deployment that is not coming up', () => {
  it('names the problem with the pods instead of saying the canary is in progress', () => {
    render(<TroubleshootBanner env={env()} currentSteps={undefined} pods={[podPulling]} events={[]} />);
    expect(screen.getAllByText('The image cannot be pulled').length).toBe(2); // the banner's title and the list under it
    expect(screen.getByText('1 pod is affected. What Kubernetes reports, and what to try first, is listed below.')).toBeTruthy();
    expect(screen.queryByText(/Canary rollout in progress/)).toBeNull();
    const details = within(screen.getByLabelText('What Kubernetes reports'));
    expect(details.getByText(/Back-off pulling image "ghcr.io\/jfillman\/boarding-api:1.1.2"/)).toBeTruthy();
    expect(details.getByText(/registry credentials/)).toBeTruthy(); // the next step, in plain words
    expect(details.getByText(/1 pod: boarding-api-7d9f-abcde/)).toBeTruthy();
  });

  it('counts several problems in the title and lists each', () => {
    render(<TroubleshootBanner env={env()} currentSteps={undefined} pods={[podPulling, podUnschedulable]} events={[]} />);
    expect(screen.getByText("2 problems are keeping this environment's pods from running")).toBeTruthy();
    const details = within(screen.getByLabelText('What Kubernetes reports'));
    expect(details.getByText('The image cannot be pulled')).toBeTruthy();
    expect(details.getByText('A pod cannot be scheduled')).toBeTruthy();
    expect(screen.getByText('2 pods are affected. What Kubernetes reports, and what to try first, is listed below.')).toBeTruthy();
    expect(details.getByText('0/1 nodes are available: 1 Insufficient memory.')).toBeTruthy();
  });

  it('does not invent a problem for a healthy rollout, whatever an old pod looks like', () => {
    render(<TroubleshootBanner env={env({ rolloutPhase: 'Healthy', argoHealthStatus: 'Healthy' })} currentSteps={undefined} pods={[podPulling]} events={[]} />);
    expect(screen.getByText('Synced and healthy')).toBeTruthy();
  });

  it('still leads with the Rollout\'s own message when it is Degraded (the pre-prod InvalidSpec case), with the details under it', () => {
    render(
      <TroubleshootBanner
        env={env({ rolloutPhase: 'Degraded', rolloutMessage: 'InvalidSpec: AnalysisTemplate \'pod-health-check\' not found' } as Partial<EnvironmentSummary>)}
        currentSteps={undefined}
        pods={[]}
        events={[warn({ reason: 'FailedCreate' })]}
      />,
    );
    expect(screen.getByText('The canary rollout failed')).toBeTruthy();
    expect(screen.getByText(/AnalysisTemplate 'pod-health-check' not found/)).toBeTruthy();
    expect(screen.getByLabelText('What Kubernetes reports')).toBeTruthy();
  });

  it('explains a ReplicaSet that cannot create pods from the event alone, when there is no pod to inspect', () => {
    render(<TroubleshootBanner env={env()} currentSteps={undefined} pods={[]} events={[warn({})]} />);
    expect(screen.getByText('Kubernetes is warning: FailedCreate')).toBeTruthy();
    expect(screen.getAllByText(/exceeded quota/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/quota, a missing ServiceAccount/).length).toBeGreaterThan(0);
  });

  it('does not treat an old blocking warning as the reason now, and does not escalate probe noise', () => {
    expect(diagnose(env(), undefined, [], [{ reason: 'FailedCreate', message: 'm', object: 'o', count: 1, lastSeen: Date.now() - 20 * 60000 }]).title).not.toMatch(/Kubernetes is warning/);
    expect(diagnose(env(), undefined, [], [{ reason: 'Unhealthy', message: 'Readiness probe failed', object: 'o', count: 3, lastSeen: Date.now() }]).title).not.toMatch(/Kubernetes is warning/);
  });

  it('lists recent warnings with their count and age, five at first, and the rest on request', () => {
    const events = Array.from({ length: 7 }, (_, i) => warn({ reason: `Reason${i}`, message: `message ${i}`, count: i + 1, lastTimestamp: ago(i + 1) }));
    render(<TroubleshootBanner env={env()} currentSteps={undefined} pods={[podPulling]} events={events} />);
    const details = within(screen.getByLabelText('What Kubernetes reports'));
    expect(details.getByText('Warnings in the last 30 minutes')).toBeTruthy();
    expect(details.getByText(/Reason0/)).toBeTruthy();
    expect(details.queryByText(/Reason6/)).toBeNull();
    fireEvent.click(details.getByRole('button', { name: 'Show 2 more' }));
    expect(details.getByText(/Reason6 ×7/)).toBeTruthy();
  });

  it('opens the full event table on request and says nothing extra when everything is fine', () => {
    const { unmount } = render(<TroubleshootBanner env={env()} currentSteps={undefined} pods={[podPulling]} events={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show all events in app-boarding-api-pre-prod' }));
    expect(screen.getByText('all events of app-boarding-api-pre-prod')).toBeTruthy();
    unmount();
    render(<TroubleshootBanner env={env({ rolloutPhase: 'Healthy', argoHealthStatus: 'Healthy' })} currentSteps={undefined} pods={[]} events={[warn({ lastTimestamp: ago(2) })]} />);
    expect(screen.queryByLabelText('What Kubernetes reports')).toBeNull();
  });
});
