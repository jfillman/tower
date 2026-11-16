import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LineageLine, flowHref } from './LineageLine';

const CHAIN = '94e8228a-5cdc-4350-914a-d73802e5b296';
const BUILD_TRACE = '98f0963d6bc08cb69e6051852fc528de';
const OWN_TRACE = '11111111111111111111111111111111';

const renderIt = (props: React.ComponentProps<typeof LineageLine>) =>
  render(
    <MemoryRouter initialEntries={['/catalog/default/component/shop/tower?tab=pipelines']}>
      <LineageLine {...props} />
    </MemoryRouter>,
  );

describe('LineageLine (promotion lineage)', () => {
  it('says "<slug> · from <origin slug>" with the origin as an in-app link to that flow in the Pipelines tab', () => {
    renderIt({ slug: 'brave-fox', origin: { chainId: CHAIN, chainSlug: 'ornate-ram' } });
    const line = screen.getByTestId('lineage');
    expect(line.textContent).toBe('brave-fox · fromornate-ram');
    const link = screen.getByRole('link', { name: 'ornate-ram' });
    expect(link.getAttribute('href')).toBe('/catalog/default/component/shop/tower?tab=pipelines&flow=ornate-ram&history=30d');
    expect(link.getAttribute('target')).toBeNull(); // stays in Tower
    expect(flowHref('ornate-ram')).toBe('?tab=pipelines&flow=ornate-ram&history=30d');
  });

  it('names the origin from its chain id when the record carries no slug', () => {
    renderIt({ origin: { chainId: CHAIN } });
    const link = screen.getByRole('link');
    expect(link.textContent).toMatch(/^[a-z]+-[a-z]+$/);
    expect(link.getAttribute('href')).toContain(`flow=${link.textContent}`);
  });

  it('shows nothing when the origin is unknown: lineage is information, not an alert', () => {
    const { container } = renderIt({ slug: 'brave-fox', traceId: OWN_TRACE });
    expect(container.textContent).toBe('');
    expect(screen.queryByTestId('lineage')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('points at the joined trace once, when the promotion is in the build\'s trace', () => {
    renderIt({ slug: 'brave-fox', origin: { chainId: CHAIN, chainSlug: 'ornate-ram', traceId: BUILD_TRACE }, traceId: BUILD_TRACE });
    const text = screen.getByTestId('lineage').textContent!;
    expect(text).toContain(`trace ${BUILD_TRACE}`);
    expect(text).not.toContain('build trace');
    expect(text.split(BUILD_TRACE)).toHaveLength(2);
  });

  it('shows both trace ids when the promotion did not join', () => {
    renderIt({ slug: 'brave-fox', origin: { chainId: CHAIN, chainSlug: 'ornate-ram', traceId: BUILD_TRACE }, traceId: OWN_TRACE });
    const text = screen.getByTestId('lineage').textContent!;
    expect(text).toContain(`trace ${OWN_TRACE}`);
    expect(text).toContain(`build trace ${BUILD_TRACE}`);
  });

  it('shows the build trace alone for a record, which has no trace of its own', () => {
    renderIt({ origin: { chainId: CHAIN, chainSlug: 'ornate-ram', traceId: BUILD_TRACE } });
    expect(screen.getByTestId('lineage').textContent).toContain(`build trace ${BUILD_TRACE}`);
  });
});
