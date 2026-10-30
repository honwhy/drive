import { getLevel } from '../../config/levels';
import { STRINGS } from '../../ui/strings';
import { createButton, el } from '../../ui/dom';
import type { ScreenContext, ScreenHandle } from './context';

/** 关卡说明：目标、新概念、失败条件；可跳过直接开始。 */
export function createBriefingScreen(ctx: ScreenContext): ScreenHandle {
  const element = el('main', 'screen screen--briefing');
  const level = ctx.state.levelId === null ? undefined : getLevel(ctx.state.levelId);

  if (!level) {
    element.append(el('p', 'screen__hint', '关卡不存在'));
    return { element, destroy: () => undefined };
  }

  const header = el('header', 'screen__header');
  header.append(
    createButton(
      STRINGS.briefing.back,
      () => {
        ctx.audio.play('click');
        ctx.dispatch({ type: 'backToLevels' });
      },
      { ghost: true, className: 'btn--back' },
    ),
    el('h1', 'screen__title', STRINGS.briefing.title),
    el('span', 'screen__spacer', ''),
  );

  const card = el('section', 'briefing');
  card.append(
    el('p', 'briefing__eyebrow', `${level.id} · ${level.name}`),
    el('h2', 'briefing__goal', level.goal),
  );

  const concept = el('div', 'briefing__block');
  concept.append(
    el('h3', 'briefing__label', STRINGS.briefing.concept),
    el('p', 'briefing__text', level.concept),
  );

  const failures = el('div', 'briefing__block');
  failures.append(el('h3', 'briefing__label', STRINGS.briefing.failures));
  const failureList = el('ul', 'briefing__list');
  for (const failure of level.failures) {
    failureList.append(el('li', 'briefing__item', failure));
  }
  failures.append(failureList);

  card.append(concept, failures);
  if (level.manual) {
    card.append(el('p', 'briefing__note', STRINGS.policy.manual));
  }

  const footer = el('footer', 'screen__footer');
  footer.append(
    createButton(
      STRINGS.briefing.skip,
      () => {
        ctx.audio.play('click');
        ctx.dispatch({ type: 'startDriving' });
      },
      { ghost: true },
    ),
    createButton(
      STRINGS.briefing.start,
      () => {
        ctx.audio.play('click');
        ctx.dispatch({ type: 'startDriving' });
      },
      { primary: true },
    ),
  );

  element.append(header, card, footer);
  return { element, destroy: () => undefined };
}
