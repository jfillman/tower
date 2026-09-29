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

export { keepScrollPosition, preventFocusScroll, scrollPanelIntoView };
//# sourceMappingURL=preventFocusScroll.esm.js.map
