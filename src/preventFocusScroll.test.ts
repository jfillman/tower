import { keepScrollPosition, preventFocusScroll } from './preventFocusScroll';

const frames = (n: number) => new Promise<void>(resolve => {
  const step = (left: number) => (left === 0 ? resolve() : requestAnimationFrame(() => step(left - 1)));
  step(n);
});

describe('keepScrollPosition', () => {
  it('puts back an ancestor that the change scrolled to the top', async () => {
    const pane = document.createElement('div');
    const button = document.createElement('button');
    pane.appendChild(button);
    document.body.appendChild(pane);
    pane.scrollTop = 240;
    keepScrollPosition(button, () => {
      pane.scrollTop = 0; // what the re-clamp does when the body below swaps
    });
    await frames(3);
    expect(pane.scrollTop).toBe(240);
    pane.remove();
  });

  it('leaves a scroll position the change did not touch alone, and a user scroll after it', async () => {
    const pane = document.createElement('div');
    const button = document.createElement('button');
    pane.appendChild(button);
    document.body.appendChild(pane);
    pane.scrollTop = 50;
    keepScrollPosition(button, () => undefined);
    await frames(3);
    expect(pane.scrollTop).toBe(50);
    pane.scrollTop = 300; // later, by the user: never overridden
    await frames(2);
    expect(pane.scrollTop).toBe(300);
    pane.remove();
  });

  it('runs the change exactly once', () => {
    const change = jest.fn();
    keepScrollPosition(null, change);
    expect(change).toHaveBeenCalledTimes(1);
  });
});

describe('preventFocusScroll', () => {
  it('cancels the mousedown default (which is what scrolls the page on focus)', () => {
    const e = { preventDefault: jest.fn() };
    preventFocusScroll(e as never);
    expect(e.preventDefault).toHaveBeenCalled();
  });
});
