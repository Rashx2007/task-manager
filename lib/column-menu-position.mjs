const clamp = (value, low, high) => Math.min(Math.max(value, low), Math.max(low, high));

export function columnMenuPlacement(anchor, panel, viewportWidth, viewportHeight) {
  const pad = Math.min(8, viewportWidth / 2, viewportHeight / 2);
  const maxWidth = Math.max(0, viewportWidth - pad * 2);
  const maxHeight = Math.max(0, viewportHeight - pad * 2);
  const width = Math.min(panel.width, maxWidth);
  const height = Math.min(panel.height, maxHeight);
  const below = anchor.bottom + 2;
  const above = anchor.top - height - 2;
  const preferredTop = below + height <= viewportHeight - pad ? below
    : above >= pad ? above : below;
  return {
    left: clamp(anchor.right - width, pad, viewportWidth - width - pad),
    top: clamp(preferredTop, pad, viewportHeight - height - pad),
    maxWidth, maxHeight,
  };
}

// The portal is fixed to the viewport, not to the horizontally scrolling table.
export function trackColumnMenu(panel, anchor, view) {
  if (!panel || !anchor) return () => {};
  const update = () => {
    const limit = columnMenuPlacement(anchor.getBoundingClientRect(), { width: 0, height: 0 }, view.innerWidth, view.innerHeight);
    panel.style.minWidth = '0px';
    panel.style.width = '300px';
    panel.style.maxWidth = `${limit.maxWidth}px`;
    panel.style.maxHeight = `${limit.maxHeight}px`;
    panel.style.boxSizing = 'border-box';
    panel.style.overflowY = 'auto';
    panel.style.overflowX = 'hidden';
    const position = columnMenuPlacement(anchor.getBoundingClientRect(), panel.getBoundingClientRect(), view.innerWidth, view.innerHeight);
    panel.style.left = `${position.left}px`;
    panel.style.top = `${position.top}px`;
    panel.style.right = 'auto';
  };
  update();
  view.addEventListener('resize', update);
  view.addEventListener('scroll', update, true);
  const observer = view.ResizeObserver ? new view.ResizeObserver(update) : null;
  observer?.observe(panel);
  return () => {
    view.removeEventListener('resize', update);
    view.removeEventListener('scroll', update, true);
    observer?.disconnect();
  };
}
