/** 轻量 DOM 构造助手，避免各屏幕重复样板代码。 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

export function createButton(
  label: string,
  onClick: () => void,
  options: { primary?: boolean; ghost?: boolean; className?: string } = {},
): HTMLButtonElement {
  const button = el('button', 'btn');
  if (options.primary) {
    button.classList.add('btn--primary');
  }
  if (options.ghost) {
    button.classList.add('btn--ghost');
  }
  if (options.className) {
    button.classList.add(options.className);
  }
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}
