import { describe, expect, it } from 'vitest';
import { describeDecision } from '../../src/ui/decisionText';

describe('决策文案映射', () => {
  it('已知状态与原因码映射为中文', () => {
    expect(describeDecision('cruise', 'keepLane')).toEqual({
      state: '巡航',
      reason: '保持车道居中',
    });
    expect(describeDecision('follow', 'followLead')).toEqual({
      state: '跟车',
      reason: '保持安全时距',
    });
  });

  it('未知原因码使用兜底文案，不暴露代码', () => {
    const text = describeDecision('laneChange', 'someFutureCode');
    expect(text.state).toBe('变道');
    expect(text.reason).toBe('保持当前状态');
  });

  it('手动与结束状态可读', () => {
    expect(describeDecision('manual', 'manualControl').state).toBe('手动');
    expect(describeDecision('finished', 'finished').state).toBe('结束');
  });
});
