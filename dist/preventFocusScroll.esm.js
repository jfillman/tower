function preventFocusScroll(e) {
  e.preventDefault();
}
function keepScrollPosition(from, change) {
  const saved = [];
  for (let el = from; el; el = el.parentElement) {
    if (el.scrollTop > 0) saved.push([el, el.scrollTop]);
  }
  saved.push([document.scrollingElement ?? document.documentElement, window.scrollY]);
  change();
  const restore = () => {
    for (const [el, top] of saved) {
      if (el.scrollTop !== top) el.scrollTop = top;
    }
  };
  requestAnimationFrame(() => {
    restore();
    requestAnimationFrame(restore);
  });
}
function scrollPanelIntoView(getEl, delayMs = 120, block = "start") {
  window.setTimeout(() => {
    getEl()?.scrollIntoView({ behavior: "smooth", block });
  }, delayMs);
}
function scrollParent(el) {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const oy = window.getComputedStyle(p).overflowY;
    if ((oy === "auto" || oy === "scroll") && p.scrollHeight > p.clientHeight) return p;
  }
  return document.scrollingElement ?? document.documentElement;
}
function keepAnchored(el, change) {
  const before = el?.getBoundingClientRect().top;
  keepScrollPosition(el, change);
  if (!el || before === void 0) return;
  const settle = () => {
    if (!el.isConnected) return;
    const delta = el.getBoundingClientRect().top - before;
    if (Math.abs(delta) > 1) scrollParent(el).scrollTop += delta;
  };
  requestAnimationFrame(() => {
    requestAnimationFrame(settle);
    requestAnimationFrame(() => requestAnimationFrame(settle));
  });
}

export { keepAnchored, keepScrollPosition, preventFocusScroll, scrollPanelIntoView };
//# sourceMappingURL=preventFocusScroll.esm.js.map
