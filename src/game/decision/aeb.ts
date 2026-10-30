import { DECISION } from '../../config/balance';
import { requiredDeceleration } from '../control';

export interface AebEvaluation {
  readonly trigger: boolean;
  readonly ttcS: number | null;
  readonly requiredDecelMps2: number;
}

/**
 * AEB 触发：TTC ≤ 1.2 s 或所需减速度 ≥ 6.0 m/s²。
 * 只依据感知净距与相对速度，不读取场景真值。
 */
export function evaluateAeb(
  gapM: number,
  relativeSpeedMps: number,
  egoSpeedMps: number,
): AebEvaluation {
  if (gapM <= 0) {
    return { trigger: true, ttcS: 0, requiredDecelMps2: Number.POSITIVE_INFINITY };
  }
  const ttcS = relativeSpeedMps > 0.1 ? gapM / relativeSpeedMps : null;
  const requiredDecelMps2 = requiredDeceleration(relativeSpeedMps, gapM);
  const trigger =
    egoSpeedMps > 0.5 &&
    (requiredDecelMps2 >= DECISION.aebRequiredDecelMps2 ||
      (ttcS !== null && ttcS <= DECISION.aebTtcS));
  return { trigger, ttcS, requiredDecelMps2 };
}
