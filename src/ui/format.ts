/** 单位与格式统一入口：UI 只在这里做显示换算。 */

export function formatSpeed(kmh: number): string {
  return String(Math.max(0, Math.round(kmh)));
}

export function formatDistanceM(meters: number): string {
  return Math.max(0, meters).toFixed(1);
}

export function formatDurationS(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '—';
  }
  return seconds.toFixed(1);
}

/** 预计剩余时间：速度过低时不估算，避免出现无穷大。 */
export function formatEta(remainingMeters: number, speedKmh: number): string {
  if (!Number.isFinite(remainingMeters) || remainingMeters <= 0) {
    return '0.0 s';
  }
  if (!Number.isFinite(speedKmh) || speedKmh < 1) {
    return '—';
  }
  const seconds = remainingMeters / (speedKmh / 3.6);
  return `${seconds.toFixed(1)} s`;
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(Math.max(value, 0), 1);
}
