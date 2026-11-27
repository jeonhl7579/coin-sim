// 요청 속도 제한 (data-spec 2.1, D-55). 시계와 대기는 주입받아 테스트에서 실제로 기다리지 않는다.

export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/** 다음 초 경계로 미룰 때 더하는 여유 [임시값] */
export const NEXT_SECOND_MARGIN_MS = 50;

export interface RateLimiter {
  /** 다음 요청을 보내도 될 때까지 기다린다 */
  wait(): Promise<void>;
  /** 다음 요청을 다음 초 경계 뒤로 미룬다 (429, Remaining-Req sec=0) */
  pauseUntilNextSecond(): void;
}

/** 요청 시작 간격을 minIntervalMs 이상으로 둔다. 초당 8회면 125ms. */
export function createRateLimiter(minIntervalMs: number, clock: Clock): RateLimiter {
  let nextAllowed = 0;
  return {
    async wait() {
      const now = clock.now();
      const start = Math.max(now, nextAllowed);
      if (start > now) {
        await clock.sleep(start - now);
      }
      nextAllowed = start + minIntervalMs;
    },
    pauseUntilNextSecond() {
      const nextSecond = Math.floor(clock.now() / 1000) * 1000 + 1000 + NEXT_SECOND_MARGIN_MS;
      nextAllowed = Math.max(nextAllowed, nextSecond);
    },
  };
}

/** `Remaining-Req: group=candles; min=600; sec=9`에서 sec를 읽는다. 없거나 형식이 다르면 undefined. */
export function parseRemainingSec(header: string | null): number | undefined {
  if (header === null) {
    return undefined;
  }
  const match = /(?:^|;)\s*sec=(\d+)\s*(?:;|$)/.exec(header);
  return match?.[1] === undefined ? undefined : Number(match[1]);
}
