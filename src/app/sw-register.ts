import { STRINGS } from '../ui/strings';

/**
 * 仅生产环境注册 Service Worker；开发环境不注册，避免缓存干扰热更新。
 * 新版本就绪时给出手动刷新提示，绝不在驾驶中强制刷新。
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) {
    return;
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          if (!installing) {
            return;
          }
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              showUpdateBanner();
            }
          });
        });
      })
      .catch((error: unknown) => {
        console.error('Service Worker 注册失败', error);
      });
  });
}

function showUpdateBanner(): void {
  if (document.querySelector('.update-banner')) {
    return;
  }

  const banner = document.createElement('div');
  banner.className = 'update-banner';
  banner.setAttribute('role', 'status');

  const text = document.createElement('span');
  text.textContent = STRINGS.notice.updateReady;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn btn--small';
  button.textContent = STRINGS.actions.reload;
  button.addEventListener('click', () => {
    window.location.reload();
  });

  banner.append(text, button);
  document.body.append(banner);
}
