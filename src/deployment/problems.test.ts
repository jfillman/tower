import { HINTS, podIssues, warningGroups, type RawEvent, type RawPod } from './problems';

const NOW = Date.parse('2026-10-05T12:00:00Z');
const ago = (min: number) => new Date(NOW - min * 60000).toISOString();

const pod = (name: string, status: RawPod['status'], created = ago(1)): RawPod => ({ metadata: { name, creationTimestamp: created }, status });
const waiting = (reason: string, message = '', extra: object = {}) => ({ name: 'app', restartCount: 0, state: { waiting: { reason, message } }, ...extra });

describe('podIssues', () => {
  it('reads an image pull failure, naming the image, and gives the plain-language next step', () => {
    const [i] = podIssues([pod('a-1', { phase: 'Pending', containerStatuses: [waiting('ImagePullBackOff', 'Back-off pulling image "ghcr.io/o/app:1.2.3"')] })], NOW);
    expect(i.title).toBe('The image cannot be pulled');
    expect(i.detail).toBe('app: Back-off pulling image "ghcr.io/o/app:1.2.3"');
    expect(i.hint).toBe(HINTS.ImagePullBackOff);
  });

  it('treats ErrImagePull and ImagePullBackOff across replicas as one cause listing every pod', () => {
    const issues = podIssues(
      [
        pod('a-1', { containerStatuses: [waiting('ErrImagePull', 'x')] }),
        pod('a-2', { containerStatuses: [waiting('ImagePullBackOff', 'x')] }),
      ],
      NOW,
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].pods).toEqual(['a-1', 'a-2']);
  });

  it('reads a crash loop with its restart count and last exit', () => {
    const [i] = podIssues([pod('a-1', { containerStatuses: [waiting('CrashLoopBackOff', 'back-off 5m0s restarting failed container=app', { restartCount: 7, lastState: { terminated: { reason: 'Error', exitCode: 1 } } })] })], NOW);
    expect(i.detail).toBe('app: back-off 5m0s restarting failed container=app Last exit: Error (exit code 1). Restarted 7 times.');
  });

  it('reports a pod killed for memory once, as the cause, and keeps the crash loop of other pods', () => {
    const oomLoop = waiting('CrashLoopBackOff', 'back-off', { restartCount: 4, lastState: { terminated: { reason: 'OOMKilled', exitCode: 137 } } });
    const issues = podIssues([pod('a-1', { containerStatuses: [oomLoop] }), pod('a-2', { containerStatuses: [waiting('CrashLoopBackOff', 'back-off', { restartCount: 2, lastState: { terminated: { reason: 'Error', exitCode: 1 } } })] })], NOW);
    expect(issues.map(i => [i.key, i.pods])).toEqual([
      ['OOMKilled', ['a-1']],
      ['CrashLoopBackOff', ['a-2']],
    ]);
    expect(issues[0].detail).toMatch(/exceeding its memory limit \(exit code 137\)/);
    // alone, the memory kill is the only issue for that pod
    expect(podIssues([pod('a-1', { containerStatuses: [oomLoop] })], NOW).map(i => i.key)).toEqual(['OOMKilled']);
  });

  it('reads an unschedulable pod with the scheduler\'s own message', () => {
    const [i] = podIssues([pod('a-1', { phase: 'Pending', conditions: [{ type: 'PodScheduled', status: 'False', reason: 'Unschedulable', message: '0/1 nodes are available: 1 Insufficient memory.' }] })], NOW);
    expect(i.title).toBe('A pod cannot be scheduled');
    expect(i.detail).toBe('0/1 nodes are available: 1 Insufficient memory.');
    expect(i.hint).toMatch(/resource requests above what any node offers never schedule/);
  });

  it('reads a missing ConfigMap or Secret', () => {
    const [i] = podIssues([pod('a-1', { containerStatuses: [waiting('CreateContainerConfigError', 'secret "board-mq-user-credentials" not found')] })], NOW);
    expect(i.title).toBe('A container is missing configuration');
    expect(i.detail).toContain('secret "board-mq-user-credentials" not found');
  });

  it('reports ContainerCreating only after a few minutes, never for a normal first pull', () => {
    const creating = (min: number) => pod('a-1', { phase: 'Pending', containerStatuses: [waiting('ContainerCreating')] }, ago(min));
    expect(podIssues([creating(2)], NOW)).toEqual([]);
    const [i] = podIssues([creating(9)], NOW);
    expect(i.detail).toBe('app: still being created after 9 minutes.');
  });

  it('looks at init containers too, and at an evicted pod', () => {
    expect(podIssues([pod('a-1', { initContainerStatuses: [waiting('CrashLoopBackOff', 'x')] })], NOW)[0].key).toBe('CrashLoopBackOff');
    expect(podIssues([pod('a-1', { phase: 'Failed', reason: 'Evicted', message: 'The node was low on resource: memory.' })], NOW)[0].title).toBe('A pod was evicted');
  });

  it('says nothing about healthy pods or pods without a status, and never throws on odd input', () => {
    const healthy = pod('a-1', { phase: 'Running', conditions: [{ type: 'PodScheduled', status: 'True' }], containerStatuses: [{ name: 'app', restartCount: 0, state: {} }] });
    expect(podIssues([healthy, { metadata: { name: 'x' } }, {} as RawPod], NOW)).toEqual([]);
    expect(podIssues([], NOW)).toEqual([]);
  });

  it('puts the cause most worth reading first', () => {
    const issues = podIssues(
      [
        pod('a-1', { phase: 'Pending', conditions: [{ type: 'PodScheduled', status: 'False', message: 'm' }] }),
        pod('a-2', { containerStatuses: [waiting('ImagePullBackOff', 'x')] }),
        pod('a-3', { containerStatuses: [waiting('CrashLoopBackOff', 'x')] }),
      ],
      NOW,
    );
    expect(issues.map(i => i.key)).toEqual(['CrashLoopBackOff', 'ImagePullBackOff', 'Unschedulable']);
  });
});

const ev = (over: Partial<RawEvent>): RawEvent => ({ type: 'Warning', reason: 'BackOff', message: 'Back-off restarting failed container', count: 1, lastTimestamp: ago(2), involvedObject: { kind: 'Pod', name: 'a-1' }, ...over });

describe('warningGroups', () => {
  it('keeps only recent Warning events', () => {
    const out = warningGroups([ev({}), ev({ type: 'Normal', reason: 'Pulled' }), ev({ reason: 'Old', lastTimestamp: ago(90) })], NOW);
    expect(out.map(g => g.reason)).toEqual(['BackOff']);
  });

  it('groups a repeating event across pods and sums its count', () => {
    const out = warningGroups(
      [
        ev({ message: 'Back-off pulling image "x" for boarding-api-6b8f7d9c5-x2k4q', involvedObject: { kind: 'Pod', name: 'boarding-api-6b8f7d9c5-x2k4q' }, count: 3, lastTimestamp: ago(5) }),
        ev({ message: 'Back-off pulling image "x" for boarding-api-6b8f7d9c5-m8n7p', involvedObject: { kind: 'Pod', name: 'boarding-api-6b8f7d9c5-m8n7p' }, count: 4, lastTimestamp: ago(1) }),
      ],
      NOW,
    );
    expect(out).toHaveLength(1);
    expect(out[0].count).toBe(7);
    expect(out[0].object).toBe('Pod/boarding-api-6b8f7d9c5-m8n7p'); // the most recent one
  });

  it('attaches a plain-language hint for the reasons it knows, and none for others', () => {
    const out = warningGroups([ev({ reason: 'FailedScheduling', message: '0/1 nodes are available' }), ev({ reason: 'SomethingNew', message: 'm' })], NOW);
    expect(out.find(g => g.reason === 'FailedScheduling')!.hint).toBe(HINTS.FailedScheduling);
    expect(out.find(g => g.reason === 'SomethingNew')!.hint).toBeUndefined();
  });

  it('lists the most recent first, and uses whichever timestamp the event carries', () => {
    const out = warningGroups([ev({ reason: 'A', message: 'a', lastTimestamp: ago(20) }), ev({ reason: 'B', message: 'b', lastTimestamp: undefined, eventTime: ago(3) }), ev({ reason: 'C', message: 'c', lastTimestamp: undefined, metadata: { creationTimestamp: ago(10) } })], NOW);
    expect(out.map(g => g.reason)).toEqual(['B', 'C', 'A']);
  });
});
