import type { Entity } from '@backstage/catalog-model';
import { isTowerService, workloadTypeOf } from './workloadType';

const entity = (spec: Entity['spec'], annotations?: Record<string, string>, tags?: string[]): Entity => ({
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: { name: 'svc', annotations, tags },
  spec,
});

describe('workloadTypeOf', () => {
  it('treats an entity with no marker as a container app', () => {
    expect(workloadTypeOf(entity({ type: 'service' }))).toBe('container');
  });
  it('reads the hangar.io/workload-type annotation', () => {
    expect(workloadTypeOf(entity({ type: 'service' }, { 'hangar.io/workload-type': 'ai' }))).toBe('ai');
  });
  it('reads spec.type ai-agent', () => {
    expect(workloadTypeOf(entity({ type: 'ai-agent' }))).toBe('ai');
  });
  it('ignores an unknown annotation value', () => {
    expect(workloadTypeOf(entity({ type: 'service' }, { 'hangar.io/workload-type': 'other' }))).toBe('container');
  });
});

describe('isTowerService', () => {
  it('shows the four application XR kinds', () => {
    for (const k of ['nodejsapplication', 'springbootapplication', 'pythonapplication', 'goapplication']) {
      expect(isTowerService(entity({ type: 'service' }, undefined, ['cluster:kind-dev', `kind:${k}`]))).toBe(true);
    }
  });
  it('shows AI workloads', () => {
    expect(isTowerService(entity({ type: 'ai-agent' }))).toBe(true);
    expect(isTowerService(entity({ type: 'service' }, { 'hangar.io/workload-type': 'ai' }))).toBe(true);
  });
  it('hides app environments, plumbing XRs, infra XRs and hand-registered Components', () => {
    for (const k of [
      'applicationenvironment',
      'tektoncicd',
      'secretstore',
      'slo',
      'rolloutwatch',
      'redis',
      'infraservice',
    ]) {
      expect(isTowerService(entity({ type: 'service' }, undefined, ['cluster:kind-dev', `kind:${k}`]))).toBe(false);
    }
    expect(isTowerService(entity({ type: 'service' }))).toBe(false);
  });
});
