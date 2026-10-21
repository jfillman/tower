import { useEffect, useState } from 'react';
import type { Entity } from '@backstage/catalog-model';
import { discoveryApiRef, fetchApiRef, useApi } from '@backstage/core-plugin-api';
import { Chip, EmptyNote, Fact, FactGrid, Hint, Panel, Section, TextLink } from './ui';

// An Autopilot agent's definition (the autopilot repo's agents/*.yaml shape), shown on an AI workload's Overview. The
// catalog Component names its file with hangar.io/agent-definition, a path in its own repo; without the annotation it
// is agent.yaml at the root. The backend's /agent-definition route reads only those paths.

export const AGENT_DEFINITION_ANNOTATION = 'hangar.io/agent-definition';

export interface AgentDefinitionView {
  path: string;
  url: string;
  name: string;
  shape: 'task' | 'session' | 'service' | 'scheduled' | 'event' | 'team';
  identity?: { type?: string; serviceAccount?: string };
  tierCeiling?: string;
  tools: string[];
  apis: string[];
  models: string[];
  network?: string;
  compute?: string;
  limits: Record<string, number>;
  image?: string;
  framework?: string;
  sandbox?: string;
  triggers: Array<Record<string, unknown>>;
}

/** Where the entity's definition is: its repo (project-slug) and the annotated path, else agent.yaml. */
export function agentDefinitionRef(entity: Entity | undefined): { owner: string; repo: string; path: string } | undefined {
  const [owner, repo] = entity?.metadata.annotations?.['github.com/project-slug']?.split('/') ?? [];
  if (!owner || !repo) return undefined;
  return { owner, repo, path: entity?.metadata.annotations?.[AGENT_DEFINITION_ANNOTATION]?.trim() || 'agent.yaml' };
}

const SHAPE_LABEL: Record<AgentDefinitionView['shape'], string> = {
  task: 'Task: one run per request',
  session: 'Session: a person chats with it',
  service: 'Service: long-running',
  scheduled: 'Scheduled',
  event: 'Event: runs when an event arrives',
  team: 'Team: plans and delegates to child runs',
};

/** A trigger in words: `{ type: interval, every: 24h }` reads "every 24h". */
export function triggerLabel(t: Record<string, unknown>): string {
  const type = String(t.type ?? 'unknown');
  if (type === 'interval' && t.every) return `every ${String(t.every)}`;
  if (type === 'cron' && t.schedule) return `cron ${String(t.schedule)}`;
  const rest = Object.entries(t)
    .filter(([k]) => k !== 'type')
    .map(([k, v]) => `${k} ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`);
  return rest.length ? `${type} (${rest.join(', ')})` : type;
}

const LIMIT_LABEL: Record<string, string> = {
  ttlMinutes: 'Run time (min)',
  toolCalls: 'Tool calls',
  githubCalls: 'GitHub calls',
  openPrs: 'Open PRs',
  modelTokens: 'Model tokens',
  children: 'Child runs',
};

export function useAgentDefinition(ref: { owner: string; repo: string; path: string } | undefined) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState<{ loading: boolean; data?: AgentDefinitionView; error?: string; missing?: boolean }>({
    loading: Boolean(ref),
  });
  const key = ref ? `${ref.owner}/${ref.repo}/${ref.path}` : '';
  useEffect(() => {
    if (!ref) {
      setState({ loading: false });
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const base = await discoveryApi.getBaseUrl('glidepath');
        const res = await fetchApi.fetch(`${base}/agent-definition?${new URLSearchParams(ref)}`);
        const body = await res.json().catch(() => undefined);
        if (cancelled) return;
        if (res.status === 404) setState({ loading: false, missing: true });
        else if (!res.ok) setState({ loading: false, error: body?.error ?? `${res.status} ${res.statusText}` });
        else setState({ loading: false, data: body as AgentDefinitionView });
      } catch (e) {
        if (!cancelled) setState({ loading: false, error: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, discoveryApi, fetchApi]); // eslint-disable-line react-hooks/exhaustive-deps
  return state;
}

export function AgentDefinitionPanel({ entity }: { entity: Entity }) {
  const ref = agentDefinitionRef(entity);
  const { loading, data, error, missing } = useAgentDefinition(ref);
  let body;
  if (!ref) body = <EmptyNote>This agent's catalog entry names no GitHub repo, so Tower cannot find its definition.</EmptyNote>;
  else if (loading) body = <EmptyNote>Reading {ref.path}…</EmptyNote>;
  else if (missing)
    body = (
      <EmptyNote>
        No {ref.path} in {ref.owner}/{ref.repo}. Point the {AGENT_DEFINITION_ANNOTATION} annotation at the agent's file
        (agent.yaml or agents/&lt;name&gt;.yaml).
      </EmptyNote>
    );
  else if (error || !data) body = <EmptyNote>Could not read {ref.path}: {error}</EmptyNote>;
  else
    body = (
      <>
        <FactGrid>
          <Fact label="Shape">{SHAPE_LABEL[data.shape]}</Fact>
          <Fact label="Identity">
            {data.identity?.type ?? '—'}
            {data.identity?.serviceAccount ? ` · ${data.identity.serviceAccount}` : ''}
          </Fact>
          <Fact label="Tier ceiling">{data.tierCeiling ?? '—'}</Fact>
          <Fact label="Models">{data.models.join(', ') || '—'}</Fact>
          <Fact label="Network">{data.network ?? '—'}</Fact>
          <Fact label="Compute">{data.compute ?? '—'}</Fact>
          <Fact label="Framework">{[data.framework, data.sandbox && `${data.sandbox} sandbox`].filter(Boolean).join(' · ') || '—'}</Fact>
          <Fact label="Triggers">{data.triggers.map(triggerLabel).join(', ') || '—'}</Fact>
          <Fact label="Definition">
            <TextLink href={data.url}>{data.path} ↗</TextLink>
          </Fact>
        </FactGrid>
        <Hint>Tools it may call, through Clearance</Hint>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {data.tools.length ? data.tools.map(tool => <Chip key={tool}>{tool}</Chip>) : <EmptyNote>None</EmptyNote>}
        </div>
        {data.apis.length > 0 && (
          <>
            <Hint>Service APIs it may reach</Hint>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {data.apis.map(api => (
                <Chip key={api} tone="sky">
                  {api}
                </Chip>
              ))}
            </div>
          </>
        )}
        {Object.keys(data.limits).length > 0 && (
          <FactGrid>
            {Object.entries(data.limits).map(([k, v]) => (
              <Fact key={k} label={LIMIT_LABEL[k] ?? k}>
                {v.toLocaleString()}
              </Fact>
            ))}
          </FactGrid>
        )}
      </>
    );
  return (
    <Section title="Agent">
      <Panel>{body}</Panel>
    </Section>
  );
}
