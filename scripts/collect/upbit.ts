// 업비트 시세 조회 REST API 요청 (data-spec 2.1). 키 없이 쓴다.
// Origin 헤더를 보내면 한도가 10초당 1회로 줄어들므로 보내지 않는다.

import { type Clock, createRateLimiter, parseRemainingSec, systemClock } from './rateLimit';

export const UPBIT_API = 'https://api.upbit.com/v1';
export const USER_AGENT = 'coin-sim-collector';
export const CANDLE_PAGE_SIZE = 200;

/** 재시도와 속도 [임시값] 시범 수집 결과를 보고 조정한다 (data-spec 2.7) */
export const REQUEST_POLICY = {
  /** 초당 8회 (한도 10회에 여유) */
  minIntervalMs: 125,
  /** 429를 이 횟수보다 많이 받으면 그 요청은 실패 */
  maxRateLimited: 5,
  /** 5xx·네트워크 오류 때 다시 시도하기 전 대기. 길이 = 재시도 횟수 */
  serverErrorDelaysMs: [1000, 2000, 4000],
} as const;

export type FetchLike = (
  url: string,
  init: { headers: Record<string, string> },
) => Promise<Response>;

export class UpbitHttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'UpbitHttpError';
    this.status = status;
  }
}

/** 418: 요청이 쌓여 차단됨. 전체 수집을 멈춘다 */
export class UpbitBlockedError extends UpbitHttpError {
  constructor(message: string) {
    super(418, message);
    this.name = 'UpbitBlockedError';
  }
}

export interface UpbitClientOptions {
  fetch?: FetchLike;
  baseUrl?: string;
  clock?: Clock;
}

export interface UpbitClient {
  /** 전체 마켓 목록 (유의 종목 정보 포함). 형식 검사는 markets.ts가 한다 */
  fetchMarketList(): Promise<unknown>;
  /** 1시간 캔들 최대 200개. to가 있으면 그 시각 이전(미포함). 형식 검사는 candles.ts가 한다 */
  fetchCandles(market: string, to?: string): Promise<unknown>;
  /** 지금까지 보낸 요청 수 (재시도 포함) */
  requestCount(): number;
}

const HEADERS = { Accept: 'application/json', 'User-Agent': USER_AGENT };

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createUpbitClient(options: UpbitClientOptions = {}): UpbitClient {
  const fetchFn = options.fetch ?? fetch;
  const baseUrl = options.baseUrl ?? UPBIT_API;
  const clock = options.clock ?? systemClock;
  const limiter = createRateLimiter(REQUEST_POLICY.minIntervalMs, clock);
  let requests = 0;

  async function getJson(path: string): Promise<unknown> {
    // 로그에는 경로만 남긴다. 요청 헤더는 남기지 않는다 (conventions 9장)
    const name = path.split('?')[0] ?? path;
    let rateLimited = 0;
    let serverErrors = 0;

    async function retryAfterServerError(reason: string): Promise<void> {
      const delay = REQUEST_POLICY.serverErrorDelaysMs[serverErrors];
      if (delay === undefined) {
        throw new Error(`${name} ${reason}: 재시도 ${serverErrors}번 후 실패`);
      }
      serverErrors += 1;
      await clock.sleep(delay);
    }

    for (;;) {
      await limiter.wait();
      requests += 1;
      let res: Response;
      try {
        res = await fetchFn(`${baseUrl}${path}`, { headers: { ...HEADERS } });
      } catch (error) {
        await retryAfterServerError(`네트워크 오류(${describe(error)})`);
        continue;
      }

      if (parseRemainingSec(res.headers.get('remaining-req')) === 0) {
        limiter.pauseUntilNextSecond();
      }
      if (res.ok) {
        return res.json();
      }
      if (res.status === 418) {
        // 본문에 차단 시간 안내가 있다 (data-spec 부록 A #1)
        const body = (await res.text()).slice(0, 300);
        throw new UpbitBlockedError(`${name} 요청 차단(HTTP 418): ${body}`);
      }
      await res.body?.cancel();
      if (res.status === 429) {
        rateLimited += 1;
        if (rateLimited > REQUEST_POLICY.maxRateLimited) {
          throw new UpbitHttpError(429, `${name} 요청 실패: HTTP 429가 ${rateLimited}번`);
        }
        limiter.pauseUntilNextSecond();
        continue;
      }
      if (res.status >= 500) {
        await retryAfterServerError(`HTTP ${res.status}`);
        continue;
      }
      throw new UpbitHttpError(res.status, `${name} 요청 실패: HTTP ${res.status}`);
    }
  }

  return {
    fetchMarketList: () => getJson('/market/all?is_details=true'),
    fetchCandles: (market, to) => {
      const params = new URLSearchParams({ market, count: String(CANDLE_PAGE_SIZE) });
      if (to !== undefined) {
        params.set('to', to);
      }
      return getJson(`/candles/minutes/60?${params.toString()}`);
    },
    requestCount: () => requests,
  };
}
