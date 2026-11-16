import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { isQueued, toPipelineRunSummary, type RawPipelineRun } from './useTektonPipelineRuns';
import { PipelineRunList, queuedTone } from '../PipelineRunList';
import type { HangarTokens } from '../brand/tokens';
import type { PipelineRunSummary } from './types';

const raw = (spec: Record<string, unknown>, cond?: Record<string, string>): RawPipelineRun =>
  ({ metadata: { name: 'build-1', namespace: 'app-shop-cicd' }, spec, status: cond ? { conditions: [{ type: 'Succeeded', ...cond }] } : {} }) as unknown as RawPipelineRun;

describe('queued runs (PipelineRunPending, the per-repository concurrency limit)', () => {
  it('is queued while spec.status or the condition says PipelineRunPending, and the phase stays running', () => {
    expect(isQueued(raw({ status: 'PipelineRunPending' }, { status: 'Unknown', reason: 'PipelineRunPending' }))).toBe(true);
    expect(isQueued(raw({ status: 'PipelineRunPending' }))).toBe(true);
    expect(isQueued(raw({}, { status: 'Unknown', reason: 'PipelineRunPending' }))).toBe(true);
    const s = toPipelineRunSummary(raw({ status: 'PipelineRunPending' }, { status: 'Unknown', reason: 'PipelineRunPending' }), 'c', new Map());
    expect(s.queued).toBe(true);
    expect(s.phase).toBe('running');
  });
  it('is not queued once started or finished, nor for a run that was never pending', () => {
    expect(isQueued(raw({}, { status: 'Unknown', reason: 'Running' }))).toBe(false);
    expect(isQueued(raw({ status: 'PipelineRunPending' }, { status: 'False', reason: 'Cancelled' }))).toBe(false);
    expect(isQueued(raw({}, { status: 'True', reason: 'Succeeded' }))).toBe(false);
    expect(toPipelineRunSummary(raw({}, { status: 'Unknown', reason: 'Running' }), 'c', new Map()).queued).toBeUndefined();
  });
  it('the tone is a status chip in the waiting colour, not the running one', () => {
    const t = { amberSoft: 'a1', amberLine: 'a2', amberInk: 'a3' } as HangarTokens;
    expect(queuedTone(t)).toMatchObject({ label: 'queued', status: 'warn' });
  });

  const run = (over: Partial<PipelineRunSummary>): PipelineRunSummary =>
    ({ name: 'r', namespace: 'n', cluster: 'c', phase: 'running', startTime: '2026-11-16T10:00:00Z', tasks: [], finallyTasks: [], taskRunsByPipelineTask: {}, params: [], results: [], raw: {}, ...over }) as PipelineRunSummary;
  it('the Pipelines list shows a queued chip, distinct from running, and still offers Cancel', () => {
    render(
      <MemoryRouter>
        <PipelineRunList
          runs={[run({ name: 'waiting', queued: true }), run({ name: 'going' })]}
          onSelect={() => undefined}
          onCancel={() => undefined}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('queued')).toBeTruthy();
    const chips = screen.getAllByText('running').filter(e => e.tagName === 'SPAN' && e.className.includes('status'));
    expect(chips).toHaveLength(1);
    expect(screen.getByText('queued').className).not.toBe(chips[0].className);
    expect(screen.getAllByText('Cancel')).toHaveLength(2);
  });
});
