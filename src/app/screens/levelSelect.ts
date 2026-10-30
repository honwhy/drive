import { LEVELS, MAX_LEVEL } from '../../config/levels';
import { STRINGS } from '../../ui/strings';
import { createButton, el } from '../../ui/dom';
import { bestOf, isLevelUnlocked } from '../progress';
import type { ScreenContext, ScreenHandle } from './context';

/** 关卡选择：7 张卡片，展示目标、最佳与锁定状态。 */
export function createLevelSelectScreen(ctx: ScreenContext): ScreenHandle {
  const element = el('main', 'screen screen--levels');

  const header = el('header', 'screen__header');
  header.append(
    createButton(
      STRINGS.levelSelect.back,
      () => {
        ctx.audio.play('click');
        ctx.dispatch({ type: 'home' });
      },
      { ghost: true, className: 'btn--back' },
    ),
    el('h1', 'screen__title', STRINGS.levelSelect.title),
    el('span', 'screen__spacer', ''),
  );

  const list = el('div', 'level-list');
  for (const level of LEVELS) {
    const unlocked = isLevelUnlocked(ctx.progress, level.id);
    const best = bestOf(ctx.progress, level.id);

    const card = el('button', 'level-card');
    card.type = 'button';
    card.disabled = !unlocked;
    card.dataset['level'] = String(level.id);

    const thumb = el('span', 'level-card__thumb');
    const index = level.id - 1;
    thumb.style.backgroundPosition = `0 ${(index / (LEVELS.length - 1)) * 100}%`;

    const body = el('span', 'level-card__body');
    body.append(
      el('strong', 'level-card__name', `${level.id} · ${level.name}`),
      el('span', 'level-card__goal', level.goal),
    );

    const meta = el('span', 'level-card__meta');
    if (unlocked) {
      if (best) {
        meta.textContent = `${STRINGS.levelSelect.best} ${best.score} · ★ ${best.stars}`;
      } else {
        meta.textContent = STRINGS.levelSelect.noBest;
      }
    } else {
      meta.textContent = `${STRINGS.levelSelect.locked} · ${STRINGS.levelSelect.unlockHint}`;
    }

    card.append(thumb, body, meta);
    card.addEventListener('click', () => {
      if (!isLevelUnlocked(ctx.progress, level.id)) {
        return;
      }
      ctx.audio.play('click');
      ctx.dispatch({ type: 'selectLevel', levelId: level.id });
    });

    list.append(card);
  }

  const footer = el('footer', 'screen__footer');
  footer.append(
    el(
      'p',
      'screen__hint',
      `已解锁 ${Math.min(ctx.progress.unlockedLevel, MAX_LEVEL)} / ${MAX_LEVEL} 关`,
    ),
  );

  element.append(header, list, footer);
  return { element, destroy: () => undefined };
}
