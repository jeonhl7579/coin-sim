import { describe, expect, it } from 'vitest';
import {
  type Clock,
  createRateLimiter,
  NEXT_SECOND_MARGIN_MS,
  parseRemainingSec,
} from './rateLimit';

function fakeClock(start = 0) {
  let t = start;
  const sleeps: number[] = [];
  const clock: Clock = {
    now: () => t,
    sleep: (ms) => {
      sleeps.push(ms);
      t += ms;
      return Promise.resolve();
    },
  };
  return { clock, sleeps, advance: (ms: number) => (t += ms), now: () => t };
}

describe('createRateLimiter', () => {
  it('요청 시작 간격을 최소 간격 이상으로 둔다', async () => {
    const { clock, now } = fakeClock(10_000);
    const limiter = createRateLimiter(125, clock);
    const starts: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      await limiter.wait();
      starts.push(now());
    }
    expect(starts).toEqual([10_000, 10_125, 10_250, 10_375]);
  });

  it('간격보다 늦게 오면 기다리지 않는다', async () => {
    const f = fakeClock(0);
    const limiter = createRateLimiter(125, f.clock);
    await limiter.wait();
    f.advance(500);
    await limiter.wait();
    expect(f.sleeps).toEqual([]);
  });

  it('pauseUntilNextSecond는 다음 초 경계 + 여유까지 미룬다', async () => {
    const f = fakeClock(10_300);
    const limiter = createRateLimiter(125, f.clock);
    await limiter.wait();
    limiter.pauseUntilNextSecond();
    await limiter.wait();
    expect(f.now()).toBe(11_000 + NEXT_SECOND_MARGIN_MS);
  });
});

describe('parseRemainingSec', () => {
  it('sec 값을 읽는다', () => {
    expect(parseRemainingSec('group=candles; min=600; sec=9')).toBe(9);
    expect(parseRemainingSec('group=default; sec=0')).toBe(0);
  });

  it('없거나 형식이 다르면 undefined', () => {
    expect(parseRemainingSec(null)).toBeUndefined();
    expect(parseRemainingSec('group=candles; min=600')).toBeUndefined();
    expect(parseRemainingSec('group=candles; xsec=3')).toBeUndefined();
  });
});
