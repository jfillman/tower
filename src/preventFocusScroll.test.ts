import { keepAnchored, keepScrollPosition, preventFocusScroll } from './preventFocusScroll';

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

// A scroller whose layout is simulated: the button sits `offset` px below the top of the content, so on screen it is at
// offset - scrollTop. jsdom has no layout, so the geometry the browser would compute is supplied here.
function layout(offset: number, scrollTop: number) {
  const scroller = document.createElement('div');
  scroller.style.overflowY = 'auto';
  Object.defineProperty(scroller, 'scrollHeight', { value: 5000, configurable: true });
  Object.defineProperty(scroller, 'clientHeight', { value: 600, configurable: true });
  const button = document.createElement('button');
  scroller.appendChild(button);
  document.body.appendChild(scroller);
  scroller.scrollTop = scrollTop;
  let off = offset;
  button.getBoundingClientRect = () => ({ top: off - scroller.scrollTop }) as DOMRect;
  return { scroller, button, setOffset: (n: number) => (off = n) };
}

describe('keepAnchored', () => {
  it('keeps the clicked element at the same place on screen when the content above it changes height', async () => {
    const { scroller, button, setOffset } = layout(900, 700); // on screen at 200
    keepAnchored(button, () => {
      setOffset(300); // the content above got shorter: the button moved up the page
      scroller.scrollTop = 0; // and the browser clamped the scroll, which looks like a jump to the top
    });
    await frames(6);
    expect(button.getBoundingClientRect().top).toBe(200);
    scroller.remove();
  });

  it('does nothing when the change does not move the element', async () => {
    const { scroller, button } = layout(900, 700);
    keepAnchored(button, () => undefined);
    await frames(6);
    expect(scroller.scrollTop).toBe(700);
    scroller.remove();
  });

  it('runs the change exactly once and copes with no element', () => {
    const change = jest.fn();
    keepAnchored(null, change);
    expect(change).toHaveBeenCalledTimes(1);
  });

  it('does not touch the scroll when the element has been removed meanwhile', async () => {
    const { scroller, button } = layout(900, 700);
    keepAnchored(button, () => button.remove());
    await frames(6);
    expect(scroller.scrollTop).toBe(700);
    scroller.remove();
  });
});
