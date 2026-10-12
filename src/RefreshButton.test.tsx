import { act, fireEvent, render, screen } from '@testing-library/react';
import { RefreshButton } from './RefreshButton';

describe('RefreshButton', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('answers a click: Refreshing… (no second click), then Refreshed, then back to Refresh', () => {
    const onClick = jest.fn();
    render(<RefreshButton onClick={onClick} />);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    const busy = screen.getByRole('button', { name: 'Refreshing…' }) as HTMLButtonElement;
    expect(busy.disabled).toBe(true);
    act(() => {
      jest.advanceTimersByTime(900);
    });
    expect(screen.getByRole('button', { name: 'Refreshed' })).toBeTruthy();
    act(() => {
      jest.advanceTimersByTime(1500);
    });
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeTruthy();
  });

  it('keeps turning while the caller says it is still busy', () => {
    const { rerender } = render(<RefreshButton onClick={() => {}} busy />);
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(screen.getByRole('button', { name: 'Refreshing…' })).toBeTruthy();
    rerender(<RefreshButton onClick={() => {}} busy={false} />);
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeTruthy();
  });
});
