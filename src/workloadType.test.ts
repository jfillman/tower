import type { Entity } from '@backstage/catalog-model';
import { workloadTypeOf } from './workloadType';

const entity = (spec: Entity['spec'], annotations?: Record<string, string>): Entity => ({
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: { name: 'svc', annotations },
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
