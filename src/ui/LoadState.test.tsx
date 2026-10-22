import { fireEvent, render, screen } from '@testing-library/react';
import { TabError, TabSkeleton } from './LoadState';

describe('TabError (2026-10-22: replaces ResponseErrorPanel)', () => {
  it('says what failed, keeps the raw message behind Details, and offers Retry when given one', () => {
    const retry = jest.fn();
    render(<TabError error={'request failed with 502\nat argoFetch (glidepathProvenance.ts:412)'} what="deployments" onRetry={retry} />);
    expect(screen.getByRole('alert').textContent).toContain("Couldn't load deployments");
    expect(screen.queryByText(/argoFetch/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Details/ }));
    expect(screen.getByText(/argoFetch/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retry).toHaveBeenCalled();
  });

  it('has no Retry without a handler', () => {
    render(<TabError error={new Error('nope')} />);
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });
});

describe('TabSkeleton', () => {
  it('is announced as loading', () => {
    render(<TabSkeleton label="Reading ArgoCD" />);
    expect(screen.getByRole('status', { name: 'Reading ArgoCD' })).toBeTruthy();
  });
});
