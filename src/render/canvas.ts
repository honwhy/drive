import { EGO, RENDER, ROAD } from '../config/balance';
import type { EntityState, PerceptionSnapshot, RiskLevel } from '../types/game';
import type { SimulationSnapshot } from '../game/simulation';
import { curveOffset } from '../game/scenario';

export interface RendererOptions {
  onResize?: (() => void) | undefined;
  sensors?: boolean | undefined;
}

export interface Renderer {
  draw(state: SimulationSnapshot): void;
  setSensors(visible: boolean): void;
  destroy(): void;
}

const COLORS = {
  terrain: '#0e1a27',
  road: '#2a3542',
  shoulder: '#c9d4de',
  laneMark: '#e8eef5',
  egoBody: '#2f6fdc',
  egoGlass: '#b9d4ff',
  egoLight: '#ffd166',
  danger: '#ff6b8a',
  warning: '#f5b94c',
  caution: '#f2c94c',
  safe: '#7fb0ff',
  signalRed: '#ff5a6e',
  signalYellow: '#f5b94c',
  signalGreen: '#63d9a4',
} as const;

const ASSET = {
  ego: '/media/images/vehicles/vehicle-ego.png',
  sedan: '/media/images/vehicles/vehicle-sedan.png',
  suv: '/media/images/vehicles/vehicle-suv.png',
  truck: '/media/images/vehicles/vehicle-truck.png',
  pedestrian: '/media/images/actors/pedestrian-sheet.png',
  cone: '/media/images/props/cone.png',
  barrier: '/media/images/props/barrier.png',
  asphalt: '/media/images/road/road-asphalt-tile.png',
} as const;

const imageCache = new Map<string, HTMLImageElement>();

function image(src: string): HTMLImageElement {
  const cached = imageCache.get(src);
  if (cached) {
    return cached;
  }
  const img = new Image();
  img.src = src;
  imageCache.set(src, img);
  return img;
}

function ready(img: HTMLImageElement): boolean {
  return img.complete && img.naturalWidth > 0;
}

const RISK_COLOR: Readonly<Record<RiskLevel, string>> = {
  safe: COLORS.safe,
  caution: COLORS.caution,
  warning: COLORS.warning,
  danger: COLORS.danger,
};

export function createRenderer(
  canvas: HTMLCanvasElement,
  host: HTMLElement,
  options: RendererOptions = {},
): Renderer {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('当前环境不支持 Canvas 2D');
  }

  let width = 1;
  let height = 1;
  let sensorsVisible = options.sensors ?? true;
  let asphaltPattern: CanvasPattern | null = null;
  const asphalt = image(ASSET.asphalt);
  asphalt.addEventListener('load', () => {
    asphaltPattern = ctx.createPattern(asphalt, 'repeat');
  });
  if (ready(asphalt)) {
    asphaltPattern = ctx.createPattern(asphalt, 'repeat');
  }

  const resize = (): void => {
    const rect = host.getBoundingClientRect();
    width = Math.max(1, Math.round(rect.width));
    height = Math.max(1, Math.round(rect.height));
    const ratio = Math.min(window.devicePixelRatio || 1, RENDER.maxPixelRatio);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    options.onResize?.();
  };

  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();

  const pxPerMeter = ROAD.pixelsPerMeter;
  const egoScreenY = (): number => height * ROAD.egoScreenRatioFromTop;
  const centerX = (): number => width / 2;

  const screenY = (distanceM: number, egoS: number): number =>
    egoScreenY() + (egoS - distanceM) * pxPerMeter;

  const screenX = (lateralM: number, distanceM: number, state: SimulationSnapshot): number => {
    const shift =
      lateralM +
      curveOffset(state.scenario.curve, distanceM) -
      curveOffset(state.scenario.curve, state.ego.s);
    return centerX() + shift * pxPerMeter;
  };

  const roadHalf = (state: SimulationSnapshot): number =>
    (state.scenario.laneCount * state.scenario.laneWidthM) / 2;

  const drawRoad = (state: SimulationSnapshot): void => {
    const egoS = state.ego.s;
    const topS = egoS + (egoScreenY() + 20) / pxPerMeter;
    const bottomS = egoS - (height - egoScreenY() + 20) / pxPerMeter;
    const half = roadHalf(state);

    ctx.fillStyle = COLORS.terrain;
    ctx.fillRect(0, 0, width, height);

    const edgeAt = (s: number): { left: number; right: number } => {
      const shift = curveOffset(state.scenario.curve, s) - curveOffset(state.scenario.curve, egoS);
      const center = centerX() + shift * pxPerMeter;
      return { left: center - half * pxPerMeter, right: center + half * pxPerMeter };
    };

    ctx.beginPath();
    for (let s = topS; s >= bottomS; s -= 4) {
      const edge = edgeAt(s);
      const y = screenY(s, egoS);
      if (s === topS) {
        ctx.moveTo(edge.left, y);
      } else {
        ctx.lineTo(edge.left, y);
      }
    }
    for (let s = bottomS; s <= topS; s += 4) {
      const edge = edgeAt(s);
      ctx.lineTo(edge.right, screenY(s, egoS));
    }
    ctx.closePath();

    ctx.save();
    ctx.clip();
    ctx.fillStyle = COLORS.road;
    ctx.fillRect(0, 0, width, height);
    if (asphaltPattern) {
      ctx.save();
      ctx.translate(0, (egoS * pxPerMeter) % 128);
      ctx.fillStyle = asphaltPattern;
      ctx.fillRect(0, -128, width, height + 256);
      ctx.restore();
    }
    ctx.restore();

    ctx.strokeStyle = COLORS.shoulder;
    ctx.lineWidth = 3;
    for (const side of ['left', 'right'] as const) {
      ctx.beginPath();
      for (let s = topS; s >= bottomS; s -= 4) {
        const edge = edgeAt(s);
        const y = screenY(s, egoS);
        if (s === topS) {
          ctx.moveTo(edge[side], y);
        } else {
          ctx.lineTo(edge[side], y);
        }
      }
      ctx.stroke();
    }

    // 车道虚线：每 9 m 一个周期（3 m 实线 + 6 m 间隔）
    ctx.strokeStyle = COLORS.laneMark;
    ctx.lineWidth = 2;
    const laneCount = state.scenario.laneCount;
    const laneWidth = state.scenario.laneWidthM;
    for (let lane = 1; lane < laneCount; lane += 1) {
      const offset = (lane - laneCount / 2) * laneWidth;
      ctx.beginPath();
      const start = Math.ceil(bottomS / 9) * 9;
      for (let s = start; s <= topS; s += 9) {
        if (Math.floor(s / 9) % 2 !== 0) {
          continue;
        }
        const y1 = screenY(s, egoS);
        const y2 = screenY(s + 3, egoS);
        const shift =
          curveOffset(state.scenario.curve, s) - curveOffset(state.scenario.curve, egoS);
        const x = centerX() + (offset + shift) * pxPerMeter;
        ctx.moveTo(x, y1);
        ctx.lineTo(x, y2);
      }
      ctx.stroke();
    }

    // 停止线与人行横道
    for (const signal of state.signals) {
      const y = screenY(signal.s, egoS);
      if (y < -40 || y > height + 40) {
        continue;
      }
      const edge = edgeAt(signal.s);
      ctx.fillStyle = '#f4f7fb';
      ctx.fillRect(edge.left, y - 2, edge.right - edge.left, 4);

      const shift =
        curveOffset(state.scenario.curve, signal.s) - curveOffset(state.scenario.curve, egoS);
      const center = centerX() + shift * pxPerMeter;
      const poleX = center + half * pxPerMeter + 10;
      ctx.fillStyle = '#1b2430';
      ctx.fillRect(poleX, y - 18, 4, 18);
      ctx.beginPath();
      ctx.arc(poleX + 2, y - 22, 5, 0, Math.PI * 2);
      ctx.fillStyle =
        signal.state === 'red'
          ? COLORS.signalRed
          : signal.state === 'yellow'
            ? COLORS.signalYellow
            : COLORS.signalGreen;
      ctx.fill();
    }

    for (const crosswalk of state.crosswalks) {
      const y = screenY(crosswalk, egoS);
      if (y < -30 || y > height + 30) {
        continue;
      }
      const edge = edgeAt(crosswalk);
      const stripe = 4;
      for (let i = 0; i < 6; i += 1) {
        const sx = edge.left + ((edge.right - edge.left) / 6) * i + 2;
        ctx.fillStyle = 'rgba(244, 247, 251, 0.82)';
        ctx.fillRect(sx, y - 12, stripe, 24);
      }
    }

    // 终点线
    const finishY = screenY(state.scenario.lengthM, egoS);
    if (finishY > -30 && finishY < height + 30) {
      const edge = edgeAt(state.scenario.lengthM);
      const cell = Math.max(8, pxPerMeter * 0.8);
      const count = Math.ceil((edge.right - edge.left) / cell);
      for (let row = 0; row < 2; row += 1) {
        for (let i = 0; i < count; i += 1) {
          ctx.fillStyle = (i + row) % 2 === 0 ? '#f4f7fb' : '#1b2430';
          ctx.fillRect(edge.left + i * cell, finishY - row * cell, cell, cell);
        }
      }
    }
  };

  const drawEntity = (entity: EntityState, state: SimulationSnapshot): void => {
    const y = screenY(entity.s, state.ego.s);
    if (y < -80 || y > height + 80) {
      return;
    }
    const x = screenX(entity.lateralM, entity.s, state);
    const w = entity.widthM * pxPerMeter;
    const l = entity.lengthM * pxPerMeter;

    if (entity.kind === 'vehicle') {
      const src =
        entity.body === 'truck' ? ASSET.truck : entity.body === 'suv' ? ASSET.suv : ASSET.sedan;
      const img = image(src);
      if (entity.crossingDir !== 0) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(entity.crossingDir > 0 ? Math.PI / 2 : -Math.PI / 2);
        if (ready(img)) {
          ctx.drawImage(img, -w / 2, -l / 2, w, l);
        } else {
          ctx.fillStyle = '#8c9bb0';
          ctx.fillRect(-w / 2, -l / 2, w, l);
        }
        ctx.restore();
        return;
      }
      if (ready(img)) {
        ctx.drawImage(img, x - w / 2, y - l / 2, w, l);
      } else {
        ctx.fillStyle = entity.body === 'truck' ? '#8c9bb0' : '#5f8f8c';
        ctx.beginPath();
        ctx.roundRect(x - w / 2, y - l / 2, w, l, 4);
        ctx.fill();
      }
    } else if (entity.kind === 'pedestrian') {
      const img = image(ASSET.pedestrian);
      const frame = Math.floor(state.timeS * 4) % 2;
      if (ready(img)) {
        const fw = img.naturalWidth / 2;
        ctx.drawImage(img, fw * frame, 0, fw, img.naturalHeight, x - 13, y - 22, 26, 44);
      } else {
        ctx.fillStyle = '#f2994a';
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      const img = image(entity.kind === 'construction' ? ASSET.barrier : ASSET.cone);
      if (ready(img)) {
        const drawW = Math.max(w, 14);
        const drawL = Math.max(l, 14);
        ctx.drawImage(img, x - drawW / 2, y - drawL / 2, drawW, drawL);
      } else {
        ctx.fillStyle = entity.kind === 'construction' ? '#f2994a' : '#f2c94c';
        ctx.fillRect(x - w / 2, y - l / 2, w, l);
      }
    }
  };

  const drawSensorLayer = (perception: PerceptionSnapshot, state: SimulationSnapshot): void => {
    if (!sensorsVisible) {
      return;
    }
    const frontY = screenY(state.ego.s + EGO.lengthMeters / 2, state.ego.s);
    const originX = centerX() + state.ego.lateralM * pxPerMeter;

    for (const ray of perception.rays) {
      const angle = (ray.angleDeg * Math.PI) / 180;
      const endX = originX + Math.sin(angle) * ray.distanceM * pxPerMeter;
      const endY = frontY - Math.cos(angle) * ray.distanceM * pxPerMeter;
      ctx.strokeStyle = 'rgba(76, 141, 255, 0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(originX, frontY);
      ctx.lineTo(endX, endY);
      ctx.stroke();

      ctx.fillStyle = 'rgba(230, 237, 247, 0.75)';
      ctx.font = '10px system-ui, sans-serif';
      const labelDistance = Math.min(ray.distanceM, 40);
      const lx = originX + Math.sin(angle) * labelDistance * pxPerMeter + 3;
      const ly = frontY - Math.cos(angle) * labelDistance * pxPerMeter;
      ctx.fillText(`${ray.distanceM.toFixed(1)}m`, lx, ly);
    }

    for (const object of perception.objects) {
      const relativeS = state.ego.s + object.forwardM;
      const x = screenX(state.ego.lateralM + object.lateralM, relativeS, state);
      const y = screenY(relativeS, state.ego.s);
      const w = object.widthM * pxPerMeter;
      const l = object.lengthM * pxPerMeter;
      const color = RISK_COLOR[object.risk];
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x - w / 2 - 2, y - l / 2 - 2, w + 4, l + 4);
      ctx.fillStyle = color;
      ctx.font = '10px system-ui, sans-serif';
      ctx.fillText(`${object.forwardM.toFixed(1)}m`, x + w / 2 + 3, y);
      if (object.risk === 'warning' || object.risk === 'danger') {
        ctx.beginPath();
        ctx.arc(x + w / 2, y - l / 2, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#101c2e';
        ctx.font = 'bold 10px system-ui, sans-serif';
        ctx.fillText('!', x + w / 2 - 2, y - l / 2 + 3);
      }
    }
  };

  const drawEgo = (state: SimulationSnapshot): void => {
    const img = image(ASSET.ego);
    const carW = EGO.widthMeters * pxPerMeter;
    const carL = EGO.lengthMeters * pxPerMeter;
    const x = centerX() + state.ego.lateralM * pxPerMeter - carW / 2;
    const y = egoScreenY() - carL / 2;

    if (ready(img)) {
      ctx.drawImage(img, x, y, carW, carL);
    } else {
      ctx.fillStyle = COLORS.egoBody;
      ctx.beginPath();
      ctx.roundRect(x, y, carW, carL, 6);
      ctx.fill();
      ctx.fillStyle = COLORS.egoGlass;
      ctx.fillRect(x + carW * 0.16, y + carL * 0.12, carW * 0.68, carL * 0.22);
    }

    ctx.fillStyle = COLORS.egoLight;
    ctx.fillRect(x + carW * 0.12, y + 2, carW * 0.16, 3);
    ctx.fillRect(x + carW * 0.72, y + 2, carW * 0.16, 3);

    if (state.braking) {
      ctx.fillStyle = '#ff5a6e';
      ctx.fillRect(x + carW * 0.1, y + carL - 4, carW * 0.2, 3);
      ctx.fillRect(x + carW * 0.7, y + carL - 4, carW * 0.2, 3);
    }

    const turn = state.decision?.reasonCode;
    if (turn === 'laneChangeLeft' || turn === 'laneChangeRight') {
      const left = turn === 'laneChangeLeft';
      ctx.fillStyle = COLORS.egoLight;
      ctx.fillRect(left ? x - 3 : x + carW + 1, y + carL * 0.18, 3, Math.max(6, carL * 0.18));
    }
  };

  return {
    draw(state: SimulationSnapshot): void {
      ctx.clearRect(0, 0, width, height);
      drawRoad(state);
      if (state.perception) {
        drawSensorLayer(state.perception, state);
      }
      for (const entity of state.entities) {
        drawEntity(entity, state);
      }
      drawEgo(state);

      if (state.finished) {
        ctx.fillStyle = 'rgba(6, 12, 22, 0.35)';
        ctx.fillRect(0, 0, width, height);
      }
    },
    setSensors(visible: boolean): void {
      sensorsVisible = visible;
    },
    destroy(): void {
      observer.disconnect();
    },
  };
}
