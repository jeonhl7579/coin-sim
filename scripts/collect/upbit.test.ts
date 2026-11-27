import { createServer, type IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import type { Clock } from './rateLimit';
import {
  createUpbitClient,
  type FetchLike,
  REQUEST_POLICY,
  UpbitBlockedError,
  UpbitHttpError,
  USER_AGENT,
} from './upbit';

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
  return { clock, sleeps };
}

type Reply = { status: number; body?: unknown; remaining?: string } | Error;

/** 응답을 차례대로 돌려주는 가짜 fetch. 요청 시각과 URL·헤더를 기록한다 */
function fakeFetch(replies: Reply[], clock: Clock) {
  const calls: { url: string; headers: Record<string, string>; at: number }[] = [];
  const fn: FetchLike = (url, init) => {
    calls.push({ url, headers: init.headers, at: clock.now() });
    const reply = replies[calls.length - 1] ?? { status: 200, body: [] };
    if (reply instanceof Error) {
      return Promise.reject(reply);
    }
    const headers =
      reply.remaining === undefined ? undefined : { 'Remaining-Req': reply.remaining };
    return Promise.resolve(
      new Response(JSON.stringify(reply.body ?? null), { status: reply.status, headers }),
    );
  };
  return { fn, calls };
}

function setup(replies: Reply[], start = 0) {
  const { clock, sleeps } = fakeClock(start);
  const { fn, calls } = fakeFetch(replies, clock);
  const client = createUpbitClient({ fetch: fn, clock, baseUrl: 'https://test/v1' });
  return { client, calls, sleeps };
}

describe('createUpbitClient 요청 주소', () => {
  it('마켓 목록은 상세 정보를 포함해 요청한다', async () => {
    const { client, calls } = setup([{ status: 200, body: [{ market: 'KRW-AAA' }] }]);
    expect(await client.fetchMarketList()).toEqual([{ market: 'KRW-AAA' }]);
    expect(calls[0]?.url).toBe('https://test/v1/market/all?is_details=true');
  });

  it('캔들은 60분 단위 200개, to가 있으면 붙인다', async () => {
    const { client, calls } = setup([]);
    await client.fetchCandles('KRW-AAA');
    await client.fetchCandles('KRW-AAA', '2024-01-01T00:00:00Z');
    expect(calls.map((c) => c.url)).toEqual([
      'https://test/v1/candles/minutes/60?market=KRW-AAA&count=200',
      'https://test/v1/candles/minutes/60?market=KRW-AAA&count=200&to=2024-01-01T00%3A00%3A00Z',
    ]);
  });

  it('User-Agent를 보내고 Origin 헤더는 넣지 않는다', async () => {
    const { client, calls } = setup([]);
    await client.fetchMarketList();
    const headers = Object.fromEntries(
      Object.entries(calls[0]?.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
    );
    expect(headers['user-agent']).toBe(USER_AGENT);
    expect(headers).not.toHaveProperty('origin');
  });
});

describe('createUpbitClient 속도 제한과 재시도', () => {
  it('요청 간격은 최소 125ms', async () => {
    const { client, calls } = setup([], 5_000);
    for (let i = 0; i < 3; i += 1) {
      await client.fetchCandles('KRW-AAA');
    }
    expect(calls.map((c) => c.at)).toEqual([5_000, 5_125, 5_250]);
  });

  it('Remaining-Req sec=0이면 다음 요청을 다음 초 뒤로 미룬다', async () => {
    const { client, calls } = setup(
      [{ status: 200, body: [], remaining: 'group=candles; sec=0' }],
      5_300,
    );
    await client.fetchCandles('KRW-AAA');
    await client.fetchCandles('KRW-AAA');
    expect(calls[1]?.at).toBe(6_050);
  });

  it('429면 다음 초까지 기다렸다가 다시 시도한다', async () => {
    const { client, calls } = setup([{ status: 429 }, { status: 200, body: ['ok'] }], 5_300);
    expect(await client.fetchCandles('KRW-AAA')).toEqual(['ok']);
    expect(calls.map((c) => c.at)).toEqual([5_300, 6_050]);
    expect(client.requestCount()).toBe(2);
  });

  it('429가 정해진 횟수를 넘으면 실패', async () => {
    const replies = Array.from({ length: 10 }, () => ({ status: 429 }));
    const { client, calls } = setup(replies);
    const error = await client.fetchCandles('KRW-AAA').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UpbitHttpError);
    expect((error as UpbitHttpError).status).toBe(429);
    expect(calls).toHaveLength(REQUEST_POLICY.maxRateLimited + 1);
  });

  it('418이면 다시 시도하지 않고 차단 예외 (본문 포함)', async () => {
    const { client, calls } = setup([{ status: 418, body: { error: 'blocked 60s' } }]);
    const error = await client.fetchCandles('KRW-AAA').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UpbitBlockedError);
    expect((error as Error).message).toContain('blocked 60s');
    expect(calls).toHaveLength(1);
  });

  it('5xx는 1·2·4초 뒤에 다시 시도한다', async () => {
    const { client, sleeps } = setup([
      { status: 500 },
      { status: 503 },
      { status: 200, body: ['ok'] },
    ]);
    expect(await client.fetchCandles('KRW-AAA')).toEqual(['ok']);
    expect(sleeps.filter((ms) => ms >= 1000)).toEqual([1000, 2000]);
  });

  it('5xx가 재시도 횟수를 넘으면 실패', async () => {
    const replies = Array.from({ length: 10 }, () => ({ status: 502 }));
    const { client, calls } = setup(replies);
    await expect(client.fetchCandles('KRW-AAA')).rejects.toThrow('재시도 3번 후 실패');
    expect(calls).toHaveLength(REQUEST_POLICY.serverErrorDelaysMs.length + 1);
  });

  it('네트워크 오류도 다시 시도한다', async () => {
    const { client, calls } = setup([new TypeError('fetch failed'), { status: 200, body: ['ok'] }]);
    expect(await client.fetchCandles('KRW-AAA')).toEqual(['ok']);
    expect(calls).toHaveLength(2);
  });

  it('404는 다시 시도하지 않는다', async () => {
    const { client, calls } = setup([{ status: 404 }]);
    const error = await client.fetchCandles('KRW-ZZZ').catch((e: unknown) => e);
    expect((error as UpbitHttpError).status).toBe(404);
    expect((error as Error).message).toBe('/candles/minutes/60 요청 실패: HTTP 404');
    expect(calls).toHaveLength(1);
  });
});

describe('실제 Node fetch', () => {
  it('Origin 헤더를 보내지 않는다 (로컬 서버로 확인)', async () => {
    let received: IncomingHttpHeaders | undefined;
    const server = createServer((req, res) => {
      received = req.headers;
      res.setHeader('Content-Type', 'application/json');
      res.end('[]');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const { port } = server.address() as AddressInfo;
      const client = createUpbitClient({ baseUrl: `http://127.0.0.1:${port}/v1` });
      await client.fetchCandles('KRW-AAA');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
    expect(received?.['user-agent']).toBe(USER_AGENT);
    expect(received).not.toHaveProperty('origin');
  });
});
