import { STRINGS } from '../ui/strings';

export interface ModalAction {
  readonly label: string;
  readonly primary?: boolean;
  readonly onClick?: (() => void) | undefined;
}

export interface ModalOptions {
  readonly title: string;
  readonly lines?: readonly string[];
  /** 自定义控件（如开关），追加在文本之后 */
  readonly content?: Node;
  readonly actions?: readonly ModalAction[];
}

/** 自定义弹层，替代会阻塞输入的 alert/confirm。 */
export function openModal(options: ModalOptions): () => void {
  const overlay = document.createElement('div');
  overlay.className = 'modal';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', options.title);

  const panel = document.createElement('div');
  panel.className = 'modal__panel';

  const heading = document.createElement('h2');
  heading.className = 'modal__title';
  heading.textContent = options.title;
  panel.append(heading);

  for (const line of options.lines ?? []) {
    const paragraph = document.createElement('p');
    paragraph.className = 'modal__text';
    paragraph.textContent = line;
    panel.append(paragraph);
  }

  if (options.content) {
    panel.append(options.content);
  }

  const actions = document.createElement('div');
  actions.className = 'modal__actions';

  const close = (): void => {
    document.removeEventListener('keydown', onKey);
    overlay.remove();
  };

  const onKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      close();
    }
  };

  const buttons = options.actions ?? [{ label: STRINGS.modal.close }];
  for (const action of buttons) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = action.primary ? 'btn btn--primary' : 'btn';
    button.textContent = action.label;
    button.addEventListener('click', () => {
      action.onClick?.();
      close();
    });
    actions.append(button);
  }

  panel.append(actions);
  overlay.append(panel);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      close();
    }
  });

  document.body.append(overlay);
  document.addEventListener('keydown', onKey);
  overlay.querySelector<HTMLButtonElement>('button')?.focus();

  return close;
}
