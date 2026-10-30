/** 全屏与 iOS 主屏幕模式适配。iPhone Safari 不支持网页全屏 API，需从主屏幕启动。 */

interface WebkitDocument extends Document {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => void;
}

interface WebkitElement extends HTMLElement {
  webkitRequestFullscreen?: (options?: FullscreenOptions) => Promise<void> | void;
  webkitRequestFullScreen?: (options?: FullscreenOptions) => Promise<void> | void;
}

interface WebkitNavigator extends Navigator {
  standalone?: boolean;
}

export function isStandaloneDisplay(): boolean {
  try {
    if (window.matchMedia('(display-mode: standalone)').matches) {
      return true;
    }
  } catch {
    // 老旧浏览器不支持 matchMedia 时继续检查 navigator.standalone
  }
  return (navigator as WebkitNavigator).standalone === true;
}

export function isFullscreen(): boolean {
  const doc = document as WebkitDocument;
  return !!(document.fullscreenElement ?? doc.webkitFullscreenElement);
}

export function isIOSDevice(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/** 必须在用户手势中调用；失败时静默降级，不阻断游戏。 */
export function requestGameFullscreen(): void {
  if (isStandaloneDisplay() || isFullscreen()) {
    return;
  }
  const element = document.documentElement as WebkitElement;
  const request = (element.requestFullscreen?.bind(element) ??
    element.webkitRequestFullscreen?.bind(element) ??
    element.webkitRequestFullScreen?.bind(element)) as
    | ((options?: FullscreenOptions) => Promise<void> | void)
    | undefined;
  if (!request) {
    return;
  }
  try {
    const result = request({ navigationUI: 'hide' });
    if (result && typeof result.then === 'function') {
      void result.then(() => lockPortrait()).catch(() => undefined);
    } else {
      window.setTimeout(lockPortrait, 200);
    }
  } catch {
    // iPhone Safari / 浏览器策略拒绝时静默降级
  }
}

/**
 * 在用户第一次触摸/点击/按键时尝试进入全屏。
 * 浏览器要求全屏必须由用户手势触发，无法在页面加载时静默进入。
 */
export function installAutoFullscreen(): () => void {
  if (isStandaloneDisplay()) {
    return () => undefined;
  }
  let done = false;
  const cleanup = (): void => {
    document.removeEventListener('pointerdown', trigger, true);
    document.removeEventListener('keydown', trigger, true);
    document.removeEventListener('touchstart', trigger, true);
  };
  const trigger = (): void => {
    if (done) {
      return;
    }
    done = true;
    requestGameFullscreen();
    cleanup();
  };
  document.addEventListener('pointerdown', trigger, { capture: true });
  document.addEventListener('keydown', trigger, { capture: true });
  document.addEventListener('touchstart', trigger, { capture: true, passive: true });
  return cleanup;
}

/** 进入全屏后尽量锁定竖屏；不支持时保持系统方向。 */
export function lockPortrait(): void {
  const orientation = screen.orientation as
    | (ScreenOrientation & { lock?: (orientation: string) => Promise<void> })
    | undefined;
  if (!orientation || typeof orientation.lock !== 'function') {
    return;
  }
  void orientation.lock('portrait').catch(() => undefined);
}
