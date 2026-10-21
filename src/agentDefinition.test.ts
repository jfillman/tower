import type { Entity } from '@backstage/catalog-model';
import { agentDefinitionRef, triggerLabel } from './agentDefinition';

const entity = (annotations: Record<string, string>): Entity => ({
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: { name: 'delay-digest', annotations },
});

describe('agentDefinitionRef', () => {
  it('reads the annotated path in the entity repo', () => {
    expect(
      agentDefinitionRef(entity({ 'github.com/project-slug': 'o/autopilot', 'hangar.io/agent-definition': 'agents/skyport/delay-digest.yaml' })),
    ).toEqual({ owner: 'o', repo: 'autopilot', path: 'agents/skyport/delay-digest.yaml' });
  });
  it('defaults to agent.yaml, and needs a repo', () => {
    expect(agentDefinitionRef(entity({ 'github.com/project-slug': 'o/agent' }))?.path).toBe('agent.yaml');
    expect(agentDefinitionRef(entity({}))).toBeUndefined();
  });
});

describe('triggerLabel', () => {
  it('says each trigger in words', () => {
    expect(triggerLabel({ type: 'interval', every: '24h' })).toBe('every 24h');
    expect(triggerLabel({ type: 'manual' })).toBe('manual');
    expect(triggerLabel({ type: 'amqp', topic: 'flight.delayed' })).toBe('amqp (topic flight.delayed)');
  });
});
