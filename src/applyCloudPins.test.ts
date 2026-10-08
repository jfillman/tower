import { applyCloudPins, type ReleaseRow } from './useReleaseContext';

const row = (imageTag: string, cells: ReleaseRow['cells']): ReleaseRow => ({ imageTag, cells, introducedAt: '', current: false });

describe('applyCloudPins', () => {
  it('turns the promote offer for an already-pinned image into pinned (smoke-az-fn prod, 2026-10-08)', () => {
    const rows = [row('0.1.0-dac9953', { dev: { status: 'deployed' }, prod: { status: 'promotable', sourceEnv: 'dev' } })];
    const out = applyCloudPins(rows, { prod: '0.1.0-dac9953' });
    expect(out[0].cells.prod.status).toBe('pinned');
    expect(out[0].cells.prod.sourceEnv).toBeUndefined();
    expect(out[0].cells.dev.status).toBe('deployed');
  });
  it('keeps the offer when the pin names another image, or there is no pin', () => {
    const rows = [row('0.1.1-abc1234', { prod: { status: 'promotable', sourceEnv: 'dev' } })];
    expect(applyCloudPins(rows, { prod: '0.1.0-dac9953' })[0].cells.prod.status).toBe('promotable');
    expect(applyCloudPins(rows, {})[0]).toBe(rows[0]);
  });
});
