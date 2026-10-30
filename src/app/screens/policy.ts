import { POLICIES, type PolicyId } from '../../config/policies';
import { STRINGS } from '../../ui/strings';
import { createButton, el } from '../../ui/dom';
import type { ScreenContext, ScreenHandle } from './context';

/** 策略选择：三选一，确认后进入关卡说明。 */
export function createPolicyScreen(ctx: ScreenContext): ScreenHandle {
  const element = el('main', 'screen screen--policy');
  let selected: PolicyId = ctx.state.policyId;

  const header = el('header', 'screen__header');
  header.append(
    createButton(
      STRINGS.policy.back,
      () => {
        ctx.audio.play('click');
        ctx.dispatch({ type: 'backToLevels' });
      },
      { ghost: true, className: 'btn--back' },
    ),
    el('h1', 'screen__title', STRINGS.policy.title),
    el('span', 'screen__spacer', ''),
  );

  const list = el('div', 'policy-list');
  const cards = new Map<PolicyId, HTMLButtonElement>();

  for (const policy of POLICIES) {
    const card = el('button', 'policy-card');
    card.type = 'button';
    card.setAttribute('aria-pressed', String(policy.id === selected));

    const title = el('span', 'policy-card__head');
    title.append(el('strong', 'policy-card__name', policy.name));

    const summary = el('span', 'policy-card__summary', policy.summary);

    const params = el('span', 'policy-card__params');
    params.append(
      el(
        'span',
        'policy-card__param',
        `${STRINGS.policy.headway} ${policy.timeHeadwayS.toFixed(1)} s`,
      ),
      el('span', 'policy-card__param', `${STRINGS.policy.maxSpeed} ${policy.maxSpeedKmh} km/h`),
      el(
        'span',
        'policy-card__param',
        `${STRINGS.policy.reaction} ${policy.reactionTimeS.toFixed(2)} s`,
      ),
    );

    card.append(title, summary, params);
    card.addEventListener('click', () => {
      selected = policy.id;
      ctx.audio.play('click');
      for (const [id, node] of cards) {
        node.setAttribute('aria-pressed', String(id === selected));
      }
      confirmButton.textContent = `${STRINGS.policy.confirm} · ${policy.name}`;
    });

    cards.set(policy.id, card);
    list.append(card);
  }

  const footer = el('footer', 'screen__footer');
  const confirmButton = createButton(
    `${STRINGS.policy.confirm} · ${POLICIES.find((p) => p.id === selected)?.name ?? ''}`,
    () => {
      ctx.audio.play('click');
      ctx.dispatch({ type: 'approvePolicy', policyId: selected });
    },
    { primary: true, className: 'btn--wide' },
  );
  footer.append(el('p', 'screen__hint', STRINGS.policy.manual), confirmButton);

  element.append(header, list, footer);
  return { element, destroy: () => undefined };
}
