// Center inside the visible part of a scroll/clip region, not a wide table's full width.
export function visibleLoadingCenter(element, view) {
  const rect = element.getBoundingClientRect();
  if (!rect.width) return null;
  let left = Math.max(rect.left, view.visualViewport?.offsetLeft || 0);
  let right = Math.min(rect.right, (view.visualViewport?.offsetLeft || 0) + (view.visualViewport?.width || view.innerWidth));
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    const style = view.getComputedStyle(parent);
    if (!['auto', 'scroll', 'hidden', 'clip', 'overlay'].includes(style.overflowX)) continue;
    const bounds = parent.getBoundingClientRect();
    const scale = parent.offsetWidth ? bounds.width / parent.offsetWidth : 1;
    const contentLeft = bounds.left + (parent.clientLeft || 0) * scale;
    const contentRight = contentLeft + parent.clientWidth * scale;
    left = Math.max(left, contentLeft); right = Math.min(right, contentRight);
  }
  if (right <= left) return null;
  const scale = element.offsetWidth ? rect.width / element.offsetWidth : 1;
  return ((left + right) / 2 - rect.left) / scale;
}

export function trackLoadingCenter(element, view) {
  if (!element) return () => {};
  const update = () => {
    const center = visibleLoadingCenter(element, view);
    element.style.setProperty('--loading-center-x', center == null ? '50%' : `${center}px`);
    element.style.visibility = center == null ? 'hidden' : '';
  };
  update();
  view.addEventListener('resize', update);
  view.addEventListener('scroll', update, true);
  view.visualViewport?.addEventListener('resize', update);
  view.visualViewport?.addEventListener('scroll', update);
  const observer = view.ResizeObserver ? new view.ResizeObserver(update) : null;
  for (let node = element; node; node = node.parentElement) observer?.observe(node);
  return () => {
    view.removeEventListener('resize', update);
    view.removeEventListener('scroll', update, true);
    view.visualViewport?.removeEventListener('resize', update);
    view.visualViewport?.removeEventListener('scroll', update);
    observer?.disconnect();
  };
}
