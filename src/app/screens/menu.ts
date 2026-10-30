import { MAX_LEVEL } from '../../config/levels';
import { POLICIES } from '../../config/policies';
import { STRINGS } from '../../ui/strings';
import { createButton, el } from '../../ui/dom';
import { openModal } from '../../ui/modal';
import type { ScreenContext, ScreenHandle } from './context';

/** 主菜单：开始游戏、关卡选择、策略、帮助、设置。 */
export function createMenuScreen(ctx: ScreenContext): ScreenHandle {
  const element = el('main', 'screen screen--menu');
  element.style.backgroundImage = "url('/media/images/ui/menu-hero.png')";

  const head = el('header', 'menu__head');
  head.append(
    el('p', 'menu__eyebrow', STRINGS.appTitle),
    el('h1', 'menu__title', '观察 AI 如何开车'),
    el('p', 'menu__subtitle', '感知 · 决策 · 接管'),
  );

  const actions = el('div', 'menu__actions');
  const startLevel = Math.min(ctx.progress.unlockedLevel, MAX_LEVEL);

  actions.append(
    createButton(
      STRINGS.menu.start,
      () => {
        ctx.audio.play('click');
        ctx.dispatch({ type: 'selectLevel', levelId: startLevel });
      },
      { primary: true, className: 'btn--wide' },
    ),
    createButton(STRINGS.menu.levels, () => {
      ctx.audio.play('click');
      ctx.dispatch({ type: 'openLevels' });
    }),
    createButton(STRINGS.menu.policy, () => {
      ctx.audio.play('click');
      openPolicyPicker(ctx);
    }),
    createButton(STRINGS.menu.help, () => {
      ctx.audio.play('click');
      ctx.openHelp();
    }),
    createButton(STRINGS.menu.settings, () => {
      ctx.audio.play('click');
      ctx.openSettings();
    }),
  );

  const foot = el('footer', 'menu__foot');
  foot.append(el('p', 'menu__notice', STRINGS.menu.notice));
  if (!ctx.persistent) {
    foot.append(el('p', 'menu__warning', STRINGS.settings.storageWarning));
  }

  element.append(head, actions, foot);
  return { element, destroy: () => undefined };
}

function openPolicyPicker(ctx: ScreenContext): void {
  const lines = POLICIES.map(
    (policy) =>
      `${policy.name} · 跟车 ${policy.timeHeadwayS.toFixed(1)} s · 最高 ${policy.maxSpeedKmh} km/h`,
  );
  lines.push(`当前：${POLICIES.find((p) => p.id === ctx.state.policyId)?.name ?? '普通'}`);

  const close = openModal({
    title: STRINGS.policy.title,
    lines,
    actions: [
      ...POLICIES.map((policy) => ({
        label: policy.name,
        primary: policy.id === ctx.state.policyId,
        onClick: () => {
          ctx.audio.play('click');
          ctx.dispatch({ type: 'setPolicy', policyId: policy.id });
          close();
        },
      })),
      { label: STRINGS.modal.close },
    ],
  });
}
